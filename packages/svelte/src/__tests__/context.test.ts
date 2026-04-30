import { render, act } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  Brevwick,
  BrevwickConfig,
  ProjectConfig,
  SubmitResult,
} from '@tatlacas/brevwick-sdk';

const submit = vi.fn<(input: unknown) => Promise<SubmitResult>>();
const captureScreenshot = vi.fn<() => Promise<Blob>>();
const getConfig = vi.fn<() => Promise<ProjectConfig | null>>();
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
        getConfig,
      }) as unknown as Brevwick,
  };
});

import Provider from './fixtures/Provider.svelte';
import Consumer from './fixtures/Consumer.svelte';
import ProviderConsumer from './fixtures/ProviderConsumer.svelte';
import { getFeedback, type FeedbackHandle } from '../lib/context';

beforeEach(() => {
  install.mockReset();
  uninstall.mockReset();
  submit.mockReset();
  captureScreenshot.mockReset();
  getConfig.mockReset();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('setBrevwickContext', () => {
  it('returns a non-null SDK in the browser and installs rings eagerly', () => {
    const captured: { sdk: unknown } = { sdk: undefined };
    render(Provider, {
      props: {
        config: { projectKey: 'pk_test_ctx1234567890ab' },
        onSdk: (sdk: unknown) => {
          captured.sdk = sdk;
        },
      },
    });
    expect(captured.sdk).not.toBeNull();
    expect(install).toHaveBeenCalledTimes(1);
  });

  it('calls sdk.uninstall() when the provider component is destroyed', async () => {
    const { unmount } = render(Provider, {
      props: {
        config: { projectKey: 'pk_test_ctx_destroy' },
        onSdk: () => undefined,
      },
    });

    expect(install).toHaveBeenCalledTimes(1);
    expect(uninstall).not.toHaveBeenCalled();

    await act(async () => {
      unmount();
    });

    expect(uninstall).toHaveBeenCalledTimes(1);
  });
});

describe('getFeedback outside setBrevwickContext', () => {
  it('throws synchronously when no parent setBrevwickContext is in scope', () => {
    expect(() =>
      render(Consumer, {
        props: { onHandle: () => undefined },
      }),
    ).toThrow(/setBrevwickContext/);
  });

  it('throws when called outside any Svelte component init', () => {
    // Direct call outside a Svelte component's init scope: Svelte's
    // getContext throws (no current_component), or our own check throws
    // when context is undefined. Either way the symptom is consistent.
    expect(() => getFeedback()).toThrow();
  });
});

describe('Provider + Consumer round-trip', () => {
  it('Consumer reads handle from Provider context and submit transitions status', async () => {
    submit.mockResolvedValueOnce({ ok: true, issue_id: 'i_42' });

    let handle!: FeedbackHandle;
    const { getByTestId } = render(ProviderConsumer, {
      props: {
        config: { projectKey: 'pk_test_ctx' } satisfies BrevwickConfig,
        onHandle: (h: FeedbackHandle) => {
          handle = h;
        },
      },
    });

    expect(getByTestId('status').textContent).toBe('idle');

    let resolved: SubmitResult | null = null;
    await act(async () => {
      resolved = await handle.submit({ description: 'broken' });
    });

    expect(submit).toHaveBeenCalledWith({ description: 'broken' });
    expect(resolved).toEqual({ ok: true, issue_id: 'i_42' });
    expect(getByTestId('status').textContent).toBe('success');

    handle.reset();
    await act(async () => undefined);
    expect(getByTestId('status').textContent).toBe('idle');
  });

  it('flips status to error when submit resolves with ok:false', async () => {
    submit.mockResolvedValueOnce({
      ok: false,
      error: { code: 'INGEST_REJECTED', message: 'quota' },
    });

    let handle!: FeedbackHandle;
    const { getByTestId } = render(ProviderConsumer, {
      props: {
        config: { projectKey: 'pk_test_ctx' } satisfies BrevwickConfig,
        onHandle: (h: FeedbackHandle) => {
          handle = h;
        },
      },
    });

    await act(async () => {
      await handle.submit({ description: 'oops' });
    });

    expect(getByTestId('status').textContent).toBe('error');
  });

  it('flips status to error and rethrows when submit throws', async () => {
    submit.mockRejectedValueOnce(new Error('chunk-load failure'));

    let handle!: FeedbackHandle;
    const { getByTestId } = render(ProviderConsumer, {
      props: {
        config: { projectKey: 'pk_test_ctx' } satisfies BrevwickConfig,
        onHandle: (h: FeedbackHandle) => {
          handle = h;
        },
      },
    });

    await act(async () => {
      await expect(handle.submit({ description: 'x' })).rejects.toThrow(
        /chunk-load failure/,
      );
    });

    expect(getByTestId('status').textContent).toBe('error');
  });
});
