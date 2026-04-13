'use client';

import { useCallback, useState } from 'react';
import type { FeedbackInput, SubmitResult } from 'brevwick-sdk';
import { useBrevwickInternal } from './context';

export type FeedbackStatus = 'idle' | 'submitting' | 'success' | 'error';

export interface UseFeedbackResult {
  submit: (input: FeedbackInput) => Promise<SubmitResult>;
  captureScreenshot: () => Promise<Blob>;
  status: FeedbackStatus;
  reset: () => void;
}

export function useFeedback(): UseFeedbackResult {
  const { brevwick } = useBrevwickInternal();
  const [status, setStatus] = useState<FeedbackStatus>('idle');

  const submit = useCallback(
    async (input: FeedbackInput): Promise<SubmitResult> => {
      if (!brevwick) {
        const error: SubmitResult = {
          ok: false,
          error: {
            code: 'INGEST_REJECTED',
            message: 'Brevwick instance is not available.',
          },
        };
        setStatus('error');
        return error;
      }
      setStatus('submitting');
      const result = await brevwick.submit(input);
      setStatus(result.ok ? 'success' : 'error');
      return result;
    },
    [brevwick],
  );

  const captureScreenshot = useCallback(async (): Promise<Blob> => {
    if (!brevwick) {
      throw new Error('Brevwick instance is not available.');
    }
    return brevwick.captureScreenshot();
  }, [brevwick]);

  const reset = useCallback(() => {
    setStatus('idle');
  }, []);

  return { submit, captureScreenshot, status, reset };
}
