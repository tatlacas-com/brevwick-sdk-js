import { setContext, getContext, onDestroy } from 'svelte';
import { writable, type Readable } from 'svelte/store';
import {
  createBrevwick,
  type Brevwick,
  type BrevwickConfig,
  type FeedbackInput,
  type ProjectConfig,
  type SubmitError,
  type SubmitResult,
} from '@tatlacas/brevwick-sdk';

/**
 * Module-private context key. Symbol identity isolates the context from
 * unrelated `setContext` calls in the same component tree (e.g. SvelteKit's
 * own context primitives) and prevents string-based collisions.
 */
const BREVWICK_KEY = Symbol('brevwick');

/**
 * Internal context value carried by {@link setBrevwickContext}. The SDK
 * instance is `null` during SSR — `getFeedback` consumers detect that at
 * call time and throw a clear error rather than silently no-op.
 */
interface BrevwickContextValue {
  sdk: Brevwick | null;
}

/**
 * Submission lifecycle surfaced by {@link getFeedback}.
 *
 * - `idle` — nothing in-flight.
 * - `submitting` — a `submit()` call is pending.
 * - `success` — the last `submit()` resolved with `{ ok: true }`.
 * - `error` — the last `submit()` resolved with `{ ok: false }` or threw.
 */
export type FeedbackStatus = 'idle' | 'submitting' | 'success' | 'error';

/**
 * Submit-pipeline phase the UI can render staged status against. Mirrors
 * the React adapter's `FeedbackPhase`. Driven by the SDK's internal
 * `phase` bus event:
 *
 * - `idle` — initial state and after `reset()`.
 * - `capturing` — `submit()` has been called but no phase event has fired yet.
 * - `sanitising` — `capturing-done` event arrived (payload composed).
 * - `formatting` — `sanitising-done` event arrived (redact complete; the
 *   ingest POST is in flight). UIs gate any "Formatting with AI" affordance
 *   on this phase plus the project's `ai_enabled` flag.
 * - `sent` — `sent` event arrived after a 2xx ingest response.
 * - `error` — `submit()` resolved with `{ ok: false }` or rejected.
 */
export type FeedbackPhase =
  | 'idle'
  | 'capturing'
  | 'sanitising'
  | 'formatting'
  | 'sent'
  | 'error';

/**
 * Submit-pipeline progress events. Mirrors `PhaseEvent` in the SDK's
 * `core/internal.ts`. Replicated here (rather than imported) because the
 * SDK intentionally does not export the internal surface from its package
 * root — the Svelte adapter reaches the bus through the `_internal`
 * backdoor and types the listener locally.
 */
type PhaseEvent =
  | { phase: 'capturing-done' }
  | { phase: 'sanitising-done' }
  | { phase: 'sent'; aiEnabled: boolean };

interface PhaseBus {
  on(event: 'phase', listener: (payload: PhaseEvent) => void): void;
  off(event: 'phase', listener: (payload: PhaseEvent) => void): void;
}

const PHASE_EVENT_TO_NEXT_PHASE: Record<PhaseEvent['phase'], FeedbackPhase> = {
  'capturing-done': 'sanitising',
  'sanitising-done': 'formatting',
  sent: 'sent',
};

/**
 * Resolve the internal phase bus from a `Brevwick` instance, or return
 * `null` if the runtime shape doesn't match. Mirrors the React adapter's
 * structural probe. Internal — not part of the public Svelte surface.
 */
function getPhaseBus(brevwick: Brevwick): PhaseBus | null {
  const internal = (brevwick as unknown as Record<string, unknown>)._internal;
  if (!internal || typeof internal !== 'object') return null;
  const bus = (internal as { bus?: unknown }).bus;
  if (!bus || typeof bus !== 'object') return null;
  const candidate = bus as { on?: unknown; off?: unknown };
  if (typeof candidate.on !== 'function' || typeof candidate.off !== 'function')
    return null;
  return bus as PhaseBus;
}

/**
 * Return value of {@link getFeedback}. Mirrors the React adapter's
 * `useFeedback()` shape — `submit`, `captureScreenshot`, `status`,
 * `phase`, `error`, `retry`, `reset` — with reactive primitives exposed
 * as Svelte `Readable` stores so templates can `$status` / `$phase` /
 * `$error` them idiomatically.
 */
export interface FeedbackHandle {
  /** Submit feedback. Returns the same tagged union the core SDK returns. */
  submit: (input: FeedbackInput) => Promise<SubmitResult>;
  /**
   * Re-run the most recent `submit()` with the same input. Resolves to
   * `undefined` if no submit has been attempted yet.
   */
  retry: () => Promise<SubmitResult | undefined>;
  /** Capture a DOM screenshot via the core SDK (dynamic import). */
  captureScreenshot: () => Promise<Blob>;
  /**
   * Lazy project-config fetch via the core SDK. The SDK caches per
   * session; the adapter does not memoise further. Returns `null` when
   * the network fetch fails.
   */
  getConfig: () => Promise<ProjectConfig | null>;
  /** Current submission status as a Svelte readable store. */
  status: Readable<FeedbackStatus>;
  /**
   * Current submit-pipeline phase as a Svelte readable store. Advances
   * on the SDK's internal phase bus events so adapter UIs can render
   * staged-status rows in step with the actual pipeline boundaries.
   */
  phase: Readable<FeedbackPhase>;
  /**
   * Tagged error from the last failed `submit()`. `null` until a submit
   * resolves with `{ ok: false }` or rejects (chunk-load failure surfaces
   * as `{ code: 'INGEST_RETRY_EXHAUSTED', message: <Error.message> }`).
   * Cleared back to `null` on the next `submit()` or `reset()`.
   */
  error: Readable<SubmitError | null>;
  /** Reset `status` + `phase` back to `'idle'` and clear `error`. */
  reset: () => void;
}

/**
 * Provides a `Brevwick` SDK instance to descendant components via Svelte's
 * context API. Call this exactly once near the root of your tree — typically
 * the top-level `+layout.svelte` (SvelteKit) or `App.svelte` (Svelte SPA).
 *
 * Returns the underlying SDK instance for advanced consumers (e.g. building
 * a custom UI alongside `<FeedbackButton>`), or `null` during SSR. The SDK
 * is installed (`install()`) eagerly in the browser so console / network /
 * route rings begin capturing as soon as the layout mounts.
 *
 * SSR-safe: when `window` is undefined the function records a `null` SDK in
 * context and skips `createBrevwick` entirely. `<FeedbackButton>` and
 * `getFeedback()` consumers handle the SSR no-op cleanly.
 */
export function setBrevwickContext(config: BrevwickConfig): Brevwick | null {
  let sdk: Brevwick | null = null;
  if (typeof window !== 'undefined') {
    sdk = createBrevwick(config);
    sdk.install();
    // Detach console / network / route rings when the host component is
    // destroyed (HMR, SPA navigation, test cleanup) so listener queues do
    // not grow monotonically. Mirrors the React provider's lifecycle pairing.
    onDestroy(() => {
      sdk?.uninstall();
    });
  }
  setContext<BrevwickContextValue>(BREVWICK_KEY, { sdk });
  return sdk;
}

/**
 * Returns the imperative submission primitives bound to the nearest
 * {@link setBrevwickContext} ancestor. Throws synchronously when called
 * outside of one — the message points at the most likely fix
 * (`+layout.svelte`).
 *
 * Each call returns a fresh handle with its own `status` / `phase` /
 * `error` stores, mirroring `useFeedback()` in React: a custom UI
 * component owns its own lifecycle independent of any sibling
 * `<FeedbackButton>` on the same page.
 *
 * Must be called during component initialisation (the same constraint
 * Svelte places on `getContext`); cache the returned handle in a script
 * variable rather than calling it from inside `onMount` or an event
 * handler. The phase-bus subscription is detached automatically when
 * the calling component is destroyed.
 */
export function getFeedback(): FeedbackHandle {
  const ctx = getContext<BrevwickContextValue | undefined>(BREVWICK_KEY);
  if (!ctx) {
    throw new Error(
      'getFeedback() called outside setBrevwickContext. Did you forget to call setBrevwickContext(config) in your root +layout.svelte / App.svelte?',
    );
  }

  const status = writable<FeedbackStatus>('idle');
  const phase = writable<FeedbackPhase>('idle');
  const error = writable<SubmitError | null>(null);

  // Snapshot of the input passed to the most recent `submit()` so `retry()`
  // can re-run the exact same payload without forcing the caller to hold
  // it for us. Cleared on `reset()`.
  let lastInput: FeedbackInput | null = null;

  // Wire the SDK's internal phase bus into the local store so the widget
  // can render staged-status rows. Listener lifetime is bound to the
  // calling component via Svelte's onDestroy — the same lifecycle the
  // React adapter uses through its useEffect cleanup. Bus access via the
  // structural _internal probe stays defence-in-depth: a non-conformant
  // mock simply produces no phase events (status still works).
  if (ctx.sdk) {
    const bus = getPhaseBus(ctx.sdk);
    if (bus) {
      const onPhase = (event: PhaseEvent): void => {
        phase.set(PHASE_EVENT_TO_NEXT_PHASE[event.phase]);
      };
      bus.on('phase', onPhase);
      onDestroy(() => {
        bus.off('phase', onPhase);
      });
    }
  }

  const requireSdk = (): Brevwick => {
    if (!ctx.sdk) {
      throw new Error(
        'Brevwick SDK was not initialised — setBrevwickContext ran in a server / non-browser environment, or before `window` was available. Call submit / captureScreenshot from onMount or an event handler.',
      );
    }
    return ctx.sdk;
  };

  const runSubmit = async (input: FeedbackInput): Promise<SubmitResult> => {
    const sdk = requireSdk();
    lastInput = input;
    status.set('submitting');
    phase.set('capturing');
    error.set(null);
    try {
      const result = await sdk.submit(input);
      if (result.ok) {
        status.set('success');
      } else {
        status.set('error');
        phase.set('error');
        error.set(result.error);
      }
      return result;
    } catch (err) {
      // `sdk.submit` only rejects when the lazy submit chunk itself fails
      // to load (deploy mismatch / offline). Flip to 'error' so the UI
      // isn't stuck on 'submitting', then rethrow so callers can
      // distinguish an environmental failure from an ingest-level one.
      status.set('error');
      phase.set('error');
      error.set({
        code: 'INGEST_RETRY_EXHAUSTED',
        message: err instanceof Error ? err.message : String(err),
      });
      throw err;
    }
  };

  return {
    status: { subscribe: status.subscribe },
    phase: { subscribe: phase.subscribe },
    error: { subscribe: error.subscribe },
    reset: () => {
      status.set('idle');
      phase.set('idle');
      error.set(null);
      lastInput = null;
    },
    submit: (input: FeedbackInput): Promise<SubmitResult> => runSubmit(input),
    retry: async (): Promise<SubmitResult | undefined> => {
      if (!lastInput) return undefined;
      return runSubmit(lastInput);
    },
    captureScreenshot: (): Promise<Blob> => requireSdk().captureScreenshot(),
    getConfig: (): Promise<ProjectConfig | null> => requireSdk().getConfig(),
  };
}
