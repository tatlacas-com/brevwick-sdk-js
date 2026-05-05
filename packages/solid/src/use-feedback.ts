import {
  createSignal,
  onCleanup,
  onMount,
  useContext,
  type Accessor,
} from 'solid-js';
import type {
  FeedbackInput,
  SubmitError,
  SubmitResult,
} from '@tatlacas/brevwick-sdk';
import { BrevwickContext } from './provider';
import { getPhaseBus, type PhaseEvent } from './internal-bridge';

/**
 * Submission lifecycle surfaced by {@link useFeedback}.
 *
 * - `idle` — nothing in-flight.
 * - `submitting` — a `submit()` call is pending.
 * - `success` — the last `submit()` resolved with `{ ok: true }`.
 * - `error` — the last `submit()` resolved with `{ ok: false }`.
 */
export type FeedbackStatus = 'idle' | 'submitting' | 'success' | 'error';

/**
 * Submit-pipeline phase the UI can render staged status against. Driven
 * by the SDK's internal `phase` bus event:
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
 * Return value of {@link useFeedback}. Mirrors the React adapter: `submit` is
 * a plain async function; `status`/`phase`/`error` are Solid `Accessor`s so
 * consumers wire them straight into JSX (`{status() === 'submitting' && ...}`).
 */
export interface UseFeedbackResult {
  /** Submit feedback. Returns the same tagged union the core SDK returns. */
  submit: (input: FeedbackInput) => Promise<SubmitResult>;
  /** Capture a DOM screenshot via the core SDK (dynamic import). */
  captureScreenshot: () => Promise<Blob>;
  /**
   * Current submission status. Reactive accessor.
   *
   * Status is **per `useFeedback()` call** (each call creates an independent
   * signal), not global. Two components consuming the hook each track their
   * own lifecycle — calling `submit()` on one will not flip `status()` on the
   * other. Hoist a shared signal into your own context if a single status
   * across the app is required.
   */
  status: Accessor<FeedbackStatus>;
  /**
   * Current submit-pipeline phase. Advances on the SDK's internal phase
   * bus event so adapter UIs can render staged-status rows in step with
   * the actual pipeline boundaries (compose → redact → ingest).
   */
  phase: Accessor<FeedbackPhase>;
  /**
   * Tagged error from the last failed `submit()`. `null` until a submit
   * resolves with `{ ok: false }` or rejects (chunk-load failure surfaces
   * as `{ code: 'INGEST_RETRY_EXHAUSTED', message: <Error.message> }`).
   * Cleared back to `null` on the next `submit()` or `reset()`.
   */
  error: Accessor<SubmitError | null>;
  /**
   * Re-run the most recent `submit()` with the same input. No-op when no
   * submit has been attempted yet. Returns the same tagged-union result
   * the underlying `submit()` would.
   */
  retry: () => Promise<SubmitResult | undefined>;
  /** Reset `status` + `phase` back to `'idle'` and clear `error`. */
  reset: () => void;
}

const PHASE_EVENT_TO_NEXT_PHASE: Record<PhaseEvent['phase'], FeedbackPhase> = {
  'capturing-done': 'sanitising',
  'sanitising-done': 'formatting',
  sent: 'sent',
};

/**
 * Solid hook that exposes the Brevwick submission primitives against the
 * instance supplied by the nearest {@link BrevwickProvider}.
 *
 * Throws synchronously when called outside a provider. The returned `submit`
 * and `captureScreenshot` functions both **reject** with an `Error` if they
 * are invoked before the SDK has hydrated on the client (rare; consumers
 * usually gate the FAB behind `Show when={isClient}` so this only surfaces if
 * the calls run from a route loader or top-level module side-effect). Both
 * paths surface the missing-SDK error asymmetry-free as a rejected promise.
 */
export function useFeedback(): UseFeedbackResult {
  const ctx = useContext(BrevwickContext);
  if (!ctx) {
    throw new Error(
      'useFeedback() must be used inside <BrevwickProvider>. Wrap your app or test with <BrevwickProvider config={...}>.',
    );
  }

  const [status, setStatus] = createSignal<FeedbackStatus>('idle');
  const [phase, setPhase] = createSignal<FeedbackPhase>('idle');
  const [error, setError] = createSignal<SubmitError | null>(null);
  // Snapshot of the input passed to the most recent `submit()` so `retry()`
  // can re-run the exact same payload without forcing the caller to hold
  // it for us. Cleared on `reset()`.
  let lastInput: FeedbackInput | null = null;
  // Whether the bus listener should write into state. Flipped to false on
  // unmount so an in-flight submit that resolves after teardown can't
  // setState on a stale tree.
  let alive = true;

  // Subscribe to the SDK's phase bus once the provider has hydrated. The
  // Solid context's `brevwick` accessor flips from `null` → SDK on the
  // client mount; we register / unregister inside `onMount` + `onCleanup`
  // so the listener never fires post-teardown.
  onMount(() => {
    const sdk = ctx.brevwick();
    if (!sdk) return;
    const bus = getPhaseBus(sdk);
    if (!bus) return;
    const onPhase = (event: PhaseEvent): void => {
      if (!alive) return;
      setPhase(PHASE_EVENT_TO_NEXT_PHASE[event.phase]);
    };
    bus.on('phase', onPhase);
    onCleanup(() => {
      bus.off('phase', onPhase);
    });
  });

  onCleanup(() => {
    alive = false;
  });

  // Resolve the SDK lazily on each call. Callers can mount `<FeedbackButton>`
  // unconditionally — the button's onClick handler runs only after hydration,
  // by which point the accessor is guaranteed populated.
  const requireSdk = () => {
    const sdk = ctx.brevwick();
    if (!sdk) {
      throw new Error(
        'Brevwick SDK is not yet initialised — useFeedback() was called before BrevwickProvider hydrated on the client.',
      );
    }
    return sdk;
  };

  const runSubmit = async (input: FeedbackInput): Promise<SubmitResult> => {
    let sdk;
    try {
      sdk = requireSdk();
    } catch (err) {
      setStatus('error');
      setPhase('error');
      throw err;
    }
    lastInput = input;
    setStatus('submitting');
    setPhase('capturing');
    setError(null);
    try {
      const result = await sdk.submit(input);
      if (!alive) return result;
      if (result.ok) {
        setStatus('success');
      } else {
        setStatus('error');
        setPhase('error');
        setError(result.error);
      }
      return result;
    } catch (err) {
      // `sdk.submit` only rejects when the lazy submit chunk itself fails to
      // load (deploy mismatch / offline). Flip to 'error' so the UI is not
      // wedged on 'submitting', then rethrow so callers can distinguish an
      // environmental failure from an ingest-level one.
      if (alive) {
        setStatus('error');
        setPhase('error');
        setError({
          code: 'INGEST_RETRY_EXHAUSTED',
          message: err instanceof Error ? err.message : String(err),
        });
      }
      throw err;
    }
  };

  const submit = (input: FeedbackInput): Promise<SubmitResult> =>
    runSubmit(input);

  const retry = async (): Promise<SubmitResult | undefined> => {
    if (!lastInput) return undefined;
    return runSubmit(lastInput);
  };

  // Try/catch so a missing-SDK throw from `requireSdk()` surfaces as a
  // rejected promise — same shape as `submit()`. Without this guard, a
  // pre-hydration call would throw synchronously from a function whose
  // return type is `Promise<Blob>`, and `try/catch (await ...)` consumers
  // would miss it. Kept as a non-`async` arrow to avoid the helper-emission
  // overhead an `async` wrapper would add.
  const captureScreenshot = (): Promise<Blob> => {
    try {
      return requireSdk().captureScreenshot();
    } catch (err) {
      return Promise.reject(err);
    }
  };

  const reset = (): void => {
    setStatus('idle');
    setPhase('idle');
    setError(null);
    lastInput = null;
  };

  return {
    submit,
    captureScreenshot,
    status,
    phase,
    error,
    retry,
    reset,
  };
}
