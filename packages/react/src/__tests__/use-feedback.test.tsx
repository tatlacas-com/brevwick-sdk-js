import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Brevwick, BrevwickConfig, SubmitResult } from 'brevwick-sdk';
import type { ReactNode } from 'react';

const submit = vi.fn<(input: unknown) => Promise<SubmitResult>>();
const captureScreenshot = vi.fn<() => Promise<Blob>>();
const install = vi.fn();
const uninstall = vi.fn();

vi.mock('brevwick-sdk', async () => {
  const actual =
    await vi.importActual<typeof import('brevwick-sdk')>('brevwick-sdk');
  return {
    ...actual,
    createBrevwick: (_config: BrevwickConfig) =>
      ({
        install,
        uninstall,
        submit,
        captureScreenshot,
      }) as unknown as Brevwick,
  };
});

import { BrevwickProvider } from '../provider';
import { useFeedback } from '../use-feedback';

const wrapper = ({ children }: { children: ReactNode }) => (
  <BrevwickProvider config={{ projectKey: 'pk_test_hook' }}>
    {children}
  </BrevwickProvider>
);

afterEach(() => {
  vi.clearAllMocks();
});

describe('useFeedback', () => {
  it('transitions idle → submitting → success and returns the SubmitResult', async () => {
    submit.mockResolvedValueOnce({ ok: true, issue_id: 'rep_123' });

    const { result } = renderHook(() => useFeedback(), { wrapper });
    expect(result.current.status).toBe('idle');

    let returned: SubmitResult | undefined;
    await act(async () => {
      returned = await result.current.submit({ description: 'broken' });
    });

    expect(returned).toEqual({ ok: true, issue_id: 'rep_123' });
    expect(result.current.status).toBe('success');

    act(() => {
      result.current.reset();
    });
    expect(result.current.status).toBe('idle');
  });

  it('transitions to error on failure', async () => {
    submit.mockResolvedValueOnce({
      ok: false,
      error: { code: 'INGEST_REJECTED', message: 'nope' },
    });
    const { result } = renderHook(() => useFeedback(), { wrapper });
    await act(async () => {
      await result.current.submit({ description: 'x' });
    });
    expect(result.current.status).toBe('error');
  });

  it('captureScreenshot passes through to the SDK', async () => {
    const blob = new Blob(['png'], { type: 'image/png' });
    captureScreenshot.mockResolvedValueOnce(blob);
    const { result } = renderHook(() => useFeedback(), { wrapper });
    await expect(result.current.captureScreenshot()).resolves.toBe(blob);
    expect(captureScreenshot).toHaveBeenCalledTimes(1);
  });

  it('throws when used outside a provider', () => {
    expect(() => renderHook(() => useFeedback())).toThrow(/BrevwickProvider/);
  });

  it('flips status to error and rethrows when submit() rejects', async () => {
    const chunkLoadError = new Error('chunk load failed');
    submit.mockRejectedValueOnce(chunkLoadError);
    const { result } = renderHook(() => useFeedback(), { wrapper });
    await act(async () => {
      await expect(result.current.submit({ description: 'x' })).rejects.toBe(
        chunkLoadError,
      );
    });
    expect(result.current.status).toBe('error');
  });
});
