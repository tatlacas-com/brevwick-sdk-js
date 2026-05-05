import { getCurrentInstance, inject, onUnmounted, ref, type Ref } from 'vue';
import type {
  FeedbackInput,
  SubmitError,
  SubmitResult,
} from '@tatlacas/brevwick-sdk';
import { BREVWICK_INJECTION_KEY } from '../plugin';
import { getPhaseBus, type PhaseEvent } from '../internal/internal-bridge';

/**
 * Submission lifecycle surfaced by {@link useFeedback}. Held for backward
 * compatibility with callers that already discriminate on this field; new
 * UI work should branch on {@link FeedbackPhase} instead.
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

export interface UseFeedbackResult {
  /** Submit feedback. Returns the same tagged union the core SDK returns. */
  submit: (input: FeedbackInput) => Promise<SubmitResult>;
  /** Capture a DOM screenshot via the core SDK (dynamic import). */
  captureScreenshot: () => Promise<Blob>;
  /** Current submission status. Reactive `Ref` — read with `.value` or in templates. */
  status: Ref<FeedbackStatus>;
  /**
   * Current submit-pipeline phase. Reactive `Ref` — advances on the SDK's
   * internal phase bus event so adapter UIs can render staged-status rows
   * in step with the actual pipeline boundaries (compose → redact → ingest).
   */
  phase: Ref<FeedbackPhase>;
  /**
   * Tagged error from the last failed `submit()`. `null` until a submit
   * resolves with `{ ok: false }` or rejects (chunk-load failure surfaces
   * as `{ code: 'INGEST_RETRY_EXHAUSTED', message: <Error.message> }`).
   * Cleared back to `null` on the next `submit()` or `reset()`.
   */
  error: Ref<SubmitError | null>;
  /**
   * Re-run the most recent `submit()` with the same input. Resolves to
   * `undefined` when no submit has been attempted yet. Returns the same
   * tagged-union result the underlying `submit()` would otherwise.
   */
  retry: () => Promise<SubmitResult | undefined>;
  /** Reset `status` + `phase` back to `'idle'` and clear `error`. Does not cancel an in-flight submit. */
  reset: () => void;
}

const PHASE_EVENT_TO_NEXT_PHASE: Record<PhaseEvent['phase'], FeedbackPhase> = {
  'capturing-done': 'sanitising',
  'sanitising-done': 'formatting',
  sent: 'sent',
};

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
  const phase = ref<FeedbackPhase>('idle');
  const error = ref<SubmitError | null>(null);
  // Snapshot of the input passed to the most recent `submit()` so `retry()`
  // can re-run the exact same payload without forcing the caller to hold
  // it for us. Cleared on `reset()`.
  let lastInput: FeedbackInput | null = null;
  // Whether the bus listener should write into state. Flipped to false on
  // unmount so an in-flight submit that resolves after teardown can't
  // mutate the ref on a torn-down tree.
  let alive = true;

  const bus = getPhaseBus(sdk);
  if (bus) {
    const onPhase = (event: PhaseEvent): void => {
      if (!alive) return;
      phase.value = PHASE_EVENT_TO_NEXT_PHASE[event.phase];
    };
    bus.on('phase', onPhase);
    // Only register the unmount hook when called inside a component
    // setup() — composables can also be invoked from a plain Vue app
    // root probe (see use-feedback.test.ts). When there is no current
    // instance the listener stays bound for the SDK lifetime, which is
    // safe because the SDK itself owns the bus.
    if (getCurrentInstance()) {
      onUnmounted(() => {
        alive = false;
        bus.off('phase', onPhase);
      });
    }
  }

  const runSubmit = async (input: FeedbackInput): Promise<SubmitResult> => {
    lastInput = input;
    status.value = 'submitting';
    phase.value = 'capturing';
    error.value = null;
    try {
      const result = await sdk.submit(input);
      if (!alive) return result;
      if (result.ok) {
        status.value = 'success';
      } else {
        status.value = 'error';
        phase.value = 'error';
        error.value = result.error;
      }
      return result;
    } catch (err) {
      // `sdk.submit` only rejects when the lazy submit chunk itself fails
      // to load (deploy mismatch / offline). Flip status so the UI is
      // unstuck, then rethrow so callers can distinguish environmental
      // from ingest-level failures.
      if (alive) {
        status.value = 'error';
        phase.value = 'error';
        error.value = {
          code: 'INGEST_RETRY_EXHAUSTED',
          message: err instanceof Error ? err.message : String(err),
        };
      }
      throw err;
    }
  };

  const submit = (input: FeedbackInput): Promise<SubmitResult> =>
    runSubmit(input);

  const retry = async (): Promise<SubmitResult | undefined> => {
    if (lastInput === null) return undefined;
    return runSubmit(lastInput);
  };

  const captureScreenshot = (): Promise<Blob> => sdk.captureScreenshot();

  const reset = (): void => {
    status.value = 'idle';
    phase.value = 'idle';
    error.value = null;
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
