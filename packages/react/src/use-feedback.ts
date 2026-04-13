'use client';

import { useCallback, useState } from 'react';
import type { FeedbackInput, SubmitResult } from 'brevwick-sdk';
import { useBrevwickInternal } from './context';

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
 * Return value of {@link useFeedback}. See the SDK SDD § 12 for the contract.
 */
export interface UseFeedbackResult {
  /** Submit feedback. Returns the same tagged union the core SDK returns. */
  submit: (input: FeedbackInput) => Promise<SubmitResult>;
  /** Capture a DOM screenshot via the core SDK (dynamic import). */
  captureScreenshot: () => Promise<Blob>;
  /** Current submission status. */
  status: FeedbackStatus;
  /** Reset `status` back to `'idle'`. Does not cancel an in-flight submit. */
  reset: () => void;
}

/**
 * React hook that exposes the Brevwick submission primitives against the
 * instance supplied by the nearest {@link BrevwickProvider}.
 *
 * Throws synchronously on mount when rendered outside a provider.
 */
export function useFeedback(): UseFeedbackResult {
  const { brevwick } = useBrevwickInternal();
  const [status, setStatus] = useState<FeedbackStatus>('idle');

  const submit = useCallback(
    async (input: FeedbackInput): Promise<SubmitResult> => {
      setStatus('submitting');
      const result = await brevwick.submit(input);
      setStatus(result.ok ? 'success' : 'error');
      return result;
    },
    [brevwick],
  );

  const captureScreenshot = useCallback(
    (): Promise<Blob> => brevwick.captureScreenshot(),
    [brevwick],
  );

  const reset = useCallback(() => {
    setStatus('idle');
  }, []);

  return { submit, captureScreenshot, status, reset };
}
