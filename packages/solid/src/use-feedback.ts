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
  /** Current submission status. Reactive accessor. */
  status: Accessor<FeedbackStatus>;
  /** Reset `status` back to `'idle'`. Does not cancel an in-flight submit. */
  reset: () => void;
}

/**
 * Solid hook that exposes the Brevwick submission primitives against the
 * instance supplied by the nearest {@link BrevwickProvider}.
 *
 * Throws synchronously when called outside a provider. Throws when the SDK
 * has not yet hydrated on the client (rare; consumers usually gate the FAB
 * behind a `Show` so this only surfaces if `submit()` is called from a route
 * loader or top-level module side-effect).
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
    const sdk = requireSdk();
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

  const captureScreenshot = (): Promise<Blob> =>
    requireSdk().captureScreenshot();

  const reset = (): void => {
    setStatus('idle');
  };

  return { submit, captureScreenshot, status, reset };
}
