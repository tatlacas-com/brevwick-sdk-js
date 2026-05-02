import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  FeedbackInput,
  SubmitError,
  SubmitResult,
} from '@tatlacas/brevwick-sdk';
import { useBrevwick } from './context';
import { getPhaseBus, type PhaseEvent } from './internal-bridge';

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

/**
 * Return value of {@link useFeedback}. Structurally identical to
 * `@tatlacas/brevwick-react`'s `UseFeedbackResult` so consumers can switch
 * adapters without changing call sites.
 */
export interface UseFeedbackResult {
  /** Submit feedback. Returns the same tagged union the core SDK returns. */
  submit: (input: FeedbackInput) => Promise<SubmitResult>;
  /** Capture a screenshot via the core SDK. RN-specific capture lands in #86. */
  captureScreenshot: () => Promise<Blob>;
  /** Current submission status. */
  status: FeedbackStatus;
  /**
   * Current submit-pipeline phase. Advances on the SDK's internal phase
   * bus event so adapter UIs can render staged-status rows in step with
   * the actual pipeline boundaries (compose → redact → ingest).
   */
  phase: FeedbackPhase;
  /**
   * Tagged error from the last failed `submit()`. `null` until a submit
   * resolves with `{ ok: false }` or rejects (chunk-load failure surfaces
   * as `{ code: 'INGEST_RETRY_EXHAUSTED', message: <Error.message> }`).
   * Cleared back to `null` on the next `submit()` or `reset()`.
   */
  error: SubmitError | null;
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
 * React Native hook that exposes the Brevwick submission primitives against
 * the instance supplied by the nearest {@link BrevwickProvider}.
 *
 * Throws synchronously on render when used outside a provider — same
 * contract as `@tatlacas/brevwick-react`.
 */
export function useFeedback(): UseFeedbackResult {
  const brevwick = useBrevwick();
  const [status, setStatus] = useState<FeedbackStatus>('idle');
  const [phase, setPhase] = useState<FeedbackPhase>('idle');
  const [error, setError] = useState<SubmitError | null>(null);
  // Snapshot of the input passed to the most recent `submit()` so `retry()`
  // can re-run the exact same payload without forcing the caller to hold
  // it for us. Cleared on `reset()`.
  const lastInputRef = useRef<FeedbackInput | null>(null);
  // Whether the bus listener should write into state. Flipped to false on
  // unmount so an in-flight submit that resolves after teardown can't
  // setState on a stale tree.
  const aliveRef = useRef(true);

  useEffect(() => {
    aliveRef.current = true;
    const bus = getPhaseBus(brevwick);
    if (!bus) return;
    const onPhase = (event: PhaseEvent): void => {
      if (!aliveRef.current) return;
      setPhase(PHASE_EVENT_TO_NEXT_PHASE[event.phase]);
    };
    bus.on('phase', onPhase);
    return () => {
      aliveRef.current = false;
      bus.off('phase', onPhase);
    };
  }, [brevwick]);

  const runSubmit = useCallback(
    async (input: FeedbackInput): Promise<SubmitResult> => {
      lastInputRef.current = input;
      setStatus('submitting');
      setPhase('capturing');
      setError(null);
      try {
        const result = await brevwick.submit(input);
        if (!aliveRef.current) return result;
        if (result.ok) {
          setStatus('success');
        } else {
          setStatus('error');
          setPhase('error');
          setError(result.error);
        }
        return result;
      } catch (err) {
        // `brevwick.submit` only rejects when the lazy submit chunk itself
        // fails to load (deploy mismatch / offline). Flip to 'error' so the
        // UI isn't stuck on 'submitting', then rethrow so callers can
        // distinguish an environmental failure from an ingest-level one.
        if (aliveRef.current) {
          setStatus('error');
          setPhase('error');
          setError({
            code: 'INGEST_RETRY_EXHAUSTED',
            message: err instanceof Error ? err.message : String(err),
          });
        }
        throw err;
      }
    },
    [brevwick],
  );

  const submit = useCallback(
    (input: FeedbackInput): Promise<SubmitResult> => runSubmit(input),
    [runSubmit],
  );

  const retry = useCallback(async (): Promise<SubmitResult | undefined> => {
    const last = lastInputRef.current;
    if (!last) return undefined;
    return runSubmit(last);
  }, [runSubmit]);

  const captureScreenshot = useCallback(
    (): Promise<Blob> => brevwick.captureScreenshot(),
    [brevwick],
  );

  const reset = useCallback(() => {
    setStatus('idle');
    setPhase('idle');
    setError(null);
    lastInputRef.current = null;
  }, []);

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
