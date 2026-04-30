import { inject, ref, type Ref } from 'vue';
import type { FeedbackInput, SubmitResult } from '@tatlacas/brevwick-sdk';
import { BREVWICK_INJECTION_KEY } from '../plugin';

/**
 * Submission lifecycle surfaced by {@link useFeedback}. Mirrors the React
 * adapter so consumers porting between frameworks see identical state names.
 */
export type FeedbackStatus = 'idle' | 'submitting' | 'success' | 'error';

export interface UseFeedbackResult {
  /** Submit feedback. Returns the same tagged union the core SDK returns. */
  submit: (input: FeedbackInput) => Promise<SubmitResult>;
  /** Capture a DOM screenshot via the core SDK (dynamic import). */
  captureScreenshot: () => Promise<Blob>;
  /** Current submission status. Reactive `Ref` — read with `.value` or in templates. */
  status: Ref<FeedbackStatus>;
  /** Reset `status` back to `'idle'`. Does not cancel an in-flight submit. */
  reset: () => void;
}

/**
 * Composable that exposes the Brevwick submission primitives against the
 * SDK instance supplied by {@link BrevwickPlugin}.
 *
 * Throws synchronously when called outside the plugin context (or on the
 * server before client hydration). Call from `<script setup>` or any other
 * place a composable is valid; the inject lookup is read once and the
 * returned `submit` / `captureScreenshot` close over the resolved instance.
 */
export function useFeedback(): UseFeedbackResult {
  const sdk = inject(BREVWICK_INJECTION_KEY, undefined);
  if (sdk === undefined) {
    throw new Error(
      'useFeedback() called outside BrevwickPlugin. Did you forget `app.use(BrevwickPlugin, config)`?',
    );
  }
  if (sdk === null) {
    // The plugin install ran on the server (no `window`) and provided the
    // sentinel `null`. The SDK is browser-only, so the composable cannot
    // function in this context — surface a distinguishable error.
    throw new Error(
      'useFeedback() invoked during SSR. Move the call into `onMounted` or a client-only component.',
    );
  }

  const status = ref<FeedbackStatus>('idle');

  const submit = async (input: FeedbackInput): Promise<SubmitResult> => {
    status.value = 'submitting';
    try {
      const result = await sdk.submit(input);
      status.value = result.ok ? 'success' : 'error';
      return result;
    } catch (error) {
      // `submit` only rejects when the lazy submit chunk fails to load
      // (deploy mismatch / offline). Flip status so the UI is unstuck,
      // then rethrow so callers can distinguish environmental from
      // ingest-level failures.
      status.value = 'error';
      throw error;
    }
  };

  const captureScreenshot = (): Promise<Blob> => sdk.captureScreenshot();

  const reset = (): void => {
    status.value = 'idle';
  };

  return { submit, captureScreenshot, status, reset };
}
