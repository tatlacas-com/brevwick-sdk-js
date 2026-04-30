import { createSignal, useContext, type Accessor } from 'solid-js';
import type { FeedbackInput, SubmitResult } from '@tatlacas/brevwick-sdk';
import { BrevwickContext } from './provider';

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
 * Return value of {@link useFeedback}. Mirrors the React adapter: `submit` is
 * a plain async function; `status` is a Solid `Accessor` so consumers wire it
 * straight into JSX (`{status() === 'submitting' && ...}`).
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
  /** Reset `status` back to `'idle'`. Does not cancel an in-flight submit. */
  reset: () => void;
}

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

  const submit = async (input: FeedbackInput): Promise<SubmitResult> => {
    // Resolve the SDK before flipping status so a pre-hydration call still
    // surfaces an `'error'` end state rather than getting stuck on
    // `'submitting'`. The status transition lands inside the same async
    // boundary as the await, keeping `(input) => Promise<SubmitResult>` the
    // single observable surface.
    let sdk;
    try {
      sdk = requireSdk();
    } catch (error) {
      setStatus('error');
      throw error;
    }
    setStatus('submitting');
    try {
      const result = await sdk.submit(input);
      setStatus(result.ok ? 'success' : 'error');
      return result;
    } catch (error) {
      // `sdk.submit` only rejects when the lazy submit chunk itself fails to
      // load (deploy mismatch / offline). Flip to 'error' so the UI is not
      // wedged on 'submitting', then rethrow so callers can distinguish an
      // environmental failure from an ingest-level one.
      setStatus('error');
      throw error;
    }
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
    } catch (error) {
      return Promise.reject(error);
    }
  };

  const reset = (): void => {
    setStatus('idle');
  };

  return { submit, captureScreenshot, status, reset };
}
