import { setContext, getContext } from 'svelte';
import { writable, type Readable } from 'svelte/store';
import {
  createBrevwick,
  type Brevwick,
  type BrevwickConfig,
  type FeedbackInput,
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
 * Return value of {@link getFeedback}. Mirrors the React adapter's
 * `useFeedback()` shape — `submit`, `captureScreenshot`, `status`, `reset` —
 * with `status` exposed as a Svelte `Readable` store so templates can
 * `$status` it idiomatically.
 */
export interface FeedbackHandle {
  /** Submit feedback. Returns the same tagged union the core SDK returns. */
  submit: (input: FeedbackInput) => Promise<SubmitResult>;
  /** Capture a DOM screenshot via the core SDK (dynamic import). */
  captureScreenshot: () => Promise<Blob>;
  /** Current submission status as a Svelte readable store. */
  status: Readable<FeedbackStatus>;
  /** Reset `status` back to `'idle'`. Does not cancel an in-flight submit. */
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
 * Each call returns a fresh handle with its own `status` store, mirroring
 * `useFeedback()` in React: a custom UI component owns its own status
 * lifecycle independent of any sibling `<FeedbackButton>` on the same page.
 *
 * Must be called during component initialisation (the same constraint
 * Svelte places on `getContext`); cache the returned handle in a script
 * variable rather than calling it from inside `onMount` or an event
 * handler.
 */
export function getFeedback(): FeedbackHandle {
  const ctx = getContext<BrevwickContextValue | undefined>(BREVWICK_KEY);
  if (!ctx) {
    throw new Error(
      'getFeedback() called outside setBrevwickContext. Did you forget to call setBrevwickContext(config) in your root +layout.svelte / App.svelte?',
    );
  }

  const status = writable<FeedbackStatus>('idle');

  const requireSdk = (): Brevwick => {
    if (!ctx.sdk) {
      throw new Error(
        'Brevwick SDK is unavailable during SSR. Call submit / captureScreenshot from onMount or an event handler.',
      );
    }
    return ctx.sdk;
  };

  return {
    status: { subscribe: status.subscribe },
    reset: () => status.set('idle'),
    submit: async (input: FeedbackInput): Promise<SubmitResult> => {
      const sdk = requireSdk();
      status.set('submitting');
      try {
        const result = await sdk.submit(input);
        status.set(result.ok ? 'success' : 'error');
        return result;
      } catch (error) {
        status.set('error');
        throw error;
      }
    },
    captureScreenshot: (): Promise<Blob> => requireSdk().captureScreenshot(),
  };
}
