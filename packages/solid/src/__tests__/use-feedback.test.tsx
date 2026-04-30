import { render } from '@solidjs/testing-library';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type {
  Brevwick,
  BrevwickConfig,
  FeedbackInput,
  SubmitResult,
} from '@tatlacas/brevwick-sdk';
import type { JSX } from 'solid-js';

const submit = vi.fn<(input: FeedbackInput) => Promise<SubmitResult>>();
const captureScreenshot = vi.fn<() => Promise<Blob>>();
const install = vi.fn();
const uninstall = vi.fn();

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
      }) as unknown as Brevwick,
  };
});

import { BrevwickProvider } from '../provider';
import { useFeedback, type UseFeedbackResult } from '../use-feedback';

afterEach(() => {
  vi.clearAllMocks();
});

/**
 * Mount the hook inside a real provider and surface its return value through
 * a ref-style callback so the test can drive it imperatively. Solid has no
 * `renderHook` analogue — this trampoline is the canonical pattern from the
 * @solidjs/testing-library docs.
 */
function mountHook(): UseFeedbackResult {
  let captured: UseFeedbackResult | undefined;
  const Capture = (): JSX.Element => {
    captured = useFeedback();
    return null;
  };
  render(() => (
    <BrevwickProvider config={{ projectKey: 'pk_test_hook' }}>
      <Capture />
    </BrevwickProvider>
  ));
  if (!captured) throw new Error('useFeedback did not run');
  return captured;
}

describe('useFeedback', () => {
  it('transitions idle → submitting → success and returns the SubmitResult', async () => {
    submit.mockResolvedValueOnce({ ok: true, issue_id: 'rep_123' });

    const hook = mountHook();
    expect(hook.status()).toBe('idle');

    const returned = await hook.submit({ description: 'broken' });
    expect(returned).toEqual({ ok: true, issue_id: 'rep_123' });
    expect(hook.status()).toBe('success');

    hook.reset();
    expect(hook.status()).toBe('idle');
  });

  it('transitions to error on failure', async () => {
    submit.mockResolvedValueOnce({
      ok: false,
      error: { code: 'INGEST_REJECTED', message: 'nope' },
    });
    const hook = mountHook();
    await hook.submit({ description: 'x' });
    expect(hook.status()).toBe('error');
  });

  it('captureScreenshot passes through to the SDK', async () => {
    const blob = new Blob(['png'], { type: 'image/png' });
    captureScreenshot.mockResolvedValueOnce(blob);
    const hook = mountHook();
    await expect(hook.captureScreenshot()).resolves.toBe(blob);
    expect(captureScreenshot).toHaveBeenCalledTimes(1);
  });

  it('flips status to error and rethrows when submit() rejects', async () => {
    const chunkLoadError = new Error('chunk load failed');
    submit.mockRejectedValueOnce(chunkLoadError);
    const hook = mountHook();
    await expect(hook.submit({ description: 'x' })).rejects.toBe(
      chunkLoadError,
    );
    expect(hook.status()).toBe('error');
  });

  it('throws when used outside a provider', () => {
    const Crash = (): JSX.Element => {
      useFeedback();
      return null;
    };
    expect(() => render(() => <Crash />)).toThrow(/BrevwickProvider/);
  });
});
