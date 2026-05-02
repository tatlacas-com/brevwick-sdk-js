// Use the `/pure` entry to skip RNTL's automatic `expect.extend(matchers)`
// and `afterEach(cleanup)` registration: the hook tests cover state
// transitions, not visual matchers, and Vitest's `expect` global is not
// available at module-load time when the auto-register would run.
import { act, renderHook } from '@testing-library/react-native/pure';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type {
  Brevwick,
  BrevwickConfig,
  FeedbackInput,
  SubmitResult,
} from '@tatlacas/brevwick-sdk';
import type { ReactNode } from 'react';

const submit = vi.fn<(input: FeedbackInput) => Promise<SubmitResult>>();
const captureScreenshot = vi.fn<() => Promise<Blob>>();
const install = vi.fn();
const uninstall = vi.fn();

// Tiny phase-bus stand-in: matches the structural shape `getPhaseBus`
// expects (`_internal.bus.{on,off}` with an `on`-then-`off` pair). Each
// test reaches in via `bus.emit('phase', ...)` to drive phase transitions.
type PhaseListener = (payload: { phase: string; aiEnabled?: boolean }) => void;
const bus = {
  listeners: new Set<PhaseListener>(),
  on(_event: 'phase', listener: PhaseListener): void {
    this.listeners.add(listener);
  },
  off(_event: 'phase', listener: PhaseListener): void {
    this.listeners.delete(listener);
  },
  emit(_event: 'phase', payload: { phase: string; aiEnabled?: boolean }): void {
    for (const listener of this.listeners) listener(payload);
  },
  reset(): void {
    this.listeners.clear();
  },
};

vi.mock('@tatlacas/brevwick-sdk', async () => {
  const actual = await vi.importActual<typeof import('@tatlacas/brevwick-sdk')>(
    '@tatlacas/brevwick-sdk',
  );
  return {
    ...actual,
    createBrevwick: (_config: BrevwickConfig) =>
      ({
        install,
        uninstall,
        submit,
        captureScreenshot,
        // The adapter reaches into `_internal.bus` via `getPhaseBus` —
        // mirror that shape so phase-event subscriptions work in tests
        // without pulling the real core.
        _internal: { bus },
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
  bus.reset();
});

describe('useFeedback', () => {
  it('transitions idle → submitting → success and returns the SubmitResult', async () => {
    submit.mockResolvedValueOnce({ ok: true, issue_id: 'rep_123' });

    const { result } = renderHook(() => useFeedback(), { wrapper });
    expect(result.current.status).toBe('idle');
    expect(result.current.phase).toBe('idle');
    expect(result.current.error).toBeNull();

    let returned: SubmitResult | undefined;
    await act(async () => {
      returned = await result.current.submit({ description: 'broken' });
    });

    expect(returned).toEqual({ ok: true, issue_id: 'rep_123' });
    expect(result.current.status).toBe('success');
    expect(result.current.error).toBeNull();
  });

  it('transitions to error and surfaces the SubmitError on ingest rejection', async () => {
    submit.mockResolvedValueOnce({
      ok: false,
      error: { code: 'INGEST_REJECTED', message: 'nope' },
    });
    const { result } = renderHook(() => useFeedback(), { wrapper });
    await act(async () => {
      await result.current.submit({ description: 'x' });
    });
    expect(result.current.status).toBe('error');
    expect(result.current.phase).toBe('error');
    expect(result.current.error).toEqual({
      code: 'INGEST_REJECTED',
      message: 'nope',
    });
  });

  it('advances `phase` on each phase-bus event', async () => {
    // Resolve on a deferred so the test can interleave bus events between
    // the `submit()` call and its resolution — exactly how the SDK fires
    // them in production.
    let resolveSubmit!: (value: SubmitResult) => void;
    submit.mockImplementationOnce(
      () =>
        new Promise<SubmitResult>((resolve) => {
          resolveSubmit = resolve;
        }),
    );

    const { result } = renderHook(() => useFeedback(), { wrapper });

    let pending!: Promise<SubmitResult>;
    act(() => {
      pending = result.current.submit({ description: 'x' });
    });
    expect(result.current.status).toBe('submitting');
    expect(result.current.phase).toBe('capturing');

    act(() => bus.emit('phase', { phase: 'capturing-done' }));
    expect(result.current.phase).toBe('sanitising');

    act(() => bus.emit('phase', { phase: 'sanitising-done' }));
    expect(result.current.phase).toBe('formatting');

    act(() => bus.emit('phase', { phase: 'sent', aiEnabled: false }));
    expect(result.current.phase).toBe('sent');

    await act(async () => {
      resolveSubmit({ ok: true, issue_id: 'rep_phase' });
      await pending;
    });
    expect(result.current.status).toBe('success');
  });

  it('retry() re-runs the most recent submit input', async () => {
    submit
      .mockResolvedValueOnce({
        ok: false,
        error: { code: 'INGEST_REJECTED', message: 'first attempt failed' },
      })
      .mockResolvedValueOnce({ ok: true, issue_id: 'rep_retry' });

    const { result } = renderHook(() => useFeedback(), { wrapper });
    const input: FeedbackInput = { description: 'flaky' };

    await act(async () => {
      await result.current.submit(input);
    });
    expect(result.current.status).toBe('error');

    let retried: SubmitResult | undefined;
    await act(async () => {
      retried = await result.current.retry();
    });
    expect(retried).toEqual({ ok: true, issue_id: 'rep_retry' });
    expect(result.current.status).toBe('success');
    // The exact same input must be threaded into the second call —
    // consumers rely on retry() to be transparent to submit-side state.
    expect(submit).toHaveBeenNthCalledWith(2, input);
  });

  it('retry() with no prior submit resolves to undefined', async () => {
    const { result } = renderHook(() => useFeedback(), { wrapper });
    let returned: SubmitResult | undefined = {
      ok: true,
      issue_id: 'placeholder',
    };
    await act(async () => {
      returned = await result.current.retry();
    });
    expect(returned).toBeUndefined();
    expect(submit).not.toHaveBeenCalled();
  });

  it('reset() returns status, phase, and error to idle', async () => {
    submit.mockResolvedValueOnce({
      ok: false,
      error: { code: 'INGEST_REJECTED', message: 'nope' },
    });
    const { result } = renderHook(() => useFeedback(), { wrapper });
    await act(async () => {
      await result.current.submit({ description: 'x' });
    });
    expect(result.current.status).toBe('error');

    act(() => result.current.reset());
    expect(result.current.status).toBe('idle');
    expect(result.current.phase).toBe('idle');
    expect(result.current.error).toBeNull();

    // After reset, retry() has no prior input snapshot to replay.
    let retried: SubmitResult | undefined = {
      ok: true,
      issue_id: 'placeholder',
    };
    await act(async () => {
      retried = await result.current.retry();
    });
    expect(retried).toBeUndefined();
  });

  it('captureScreenshot passes through to the SDK', async () => {
    const blob = new Blob(['png'], { type: 'image/png' });
    captureScreenshot.mockResolvedValueOnce(blob);
    const { result } = renderHook(() => useFeedback(), { wrapper });
    await expect(result.current.captureScreenshot()).resolves.toBe(blob);
    expect(captureScreenshot).toHaveBeenCalledTimes(1);
  });

  it('throws synchronously when used outside a provider', () => {
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
    expect(result.current.phase).toBe('error');
    expect(result.current.error).toEqual({
      code: 'INGEST_RETRY_EXHAUSTED',
      message: 'chunk load failed',
    });
  });

  it('coerces non-Error rejections into a string message', async () => {
    // `submit` only rejects on a chunk-load failure; in that path the SDK
    // throws an Error. But the hook also handles an ill-behaved consumer
    // that throws a non-Error value — surface it as a string-coerced
    // message rather than `[object Object]` or `undefined`.
    submit.mockRejectedValueOnce('boom');
    const { result } = renderHook(() => useFeedback(), { wrapper });
    await act(async () => {
      await expect(result.current.submit({ description: 'x' })).rejects.toBe(
        'boom',
      );
    });
    expect(result.current.error).toEqual({
      code: 'INGEST_RETRY_EXHAUSTED',
      message: 'boom',
    });
  });

  it('unsubscribes from the phase bus on unmount', () => {
    // Drives the cleanup branch in `useFeedback`'s phase-bus useEffect:
    // without an unmount path covered, the off() listener and the
    // aliveRef flip both go untested.
    const { unmount } = renderHook(() => useFeedback(), { wrapper });
    expect(bus.listeners.size).toBe(1);
    unmount();
    expect(bus.listeners.size).toBe(0);
  });

  it('does not setState after unmount when an in-flight submit resolves', async () => {
    // Closes the `aliveRef.current` branch in `runSubmit`'s success path:
    // a submit kicked off before unmount must be allowed to settle without
    // touching the unmounted hook's state.
    let resolveSubmit!: (value: SubmitResult) => void;
    submit.mockImplementationOnce(
      () =>
        new Promise<SubmitResult>((resolve) => {
          resolveSubmit = resolve;
        }),
    );

    const { result, unmount } = renderHook(() => useFeedback(), { wrapper });

    let pending!: Promise<SubmitResult>;
    act(() => {
      pending = result.current.submit({ description: 'late' });
    });
    expect(result.current.status).toBe('submitting');

    // Tear down before the submit resolves. The aliveRef flip in the
    // useEffect cleanup must prevent the post-await success branch from
    // calling setStatus on a stale tree.
    unmount();

    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    await act(async () => {
      resolveSubmit({ ok: true, issue_id: 'rep_late' });
      // Awaiting the original promise from outside `act` is the realistic
      // caller shape — an event handler that survives unmount.
      await pending;
    });
    expect(errorSpy).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});
