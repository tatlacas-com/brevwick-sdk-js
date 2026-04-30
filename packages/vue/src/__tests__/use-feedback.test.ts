import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp, defineComponent, h } from 'vue';
import type {
  Brevwick,
  BrevwickConfig,
  SubmitResult,
} from '@tatlacas/brevwick-sdk';

const submit = vi.fn<(input: unknown) => Promise<SubmitResult>>();
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

import { BrevwickPlugin } from '../plugin';
import { useFeedback } from '../composables/use-feedback';

afterEach(() => {
  vi.clearAllMocks();
  document.body.innerHTML = '';
});

const mountWithPlugin = (
  setupFn: () => unknown,
): {
  app: ReturnType<typeof createApp>;
  api: ReturnType<typeof useFeedback>;
} => {
  let api: ReturnType<typeof useFeedback> | undefined;
  const Probe = defineComponent({
    setup() {
      api = useFeedback();
      setupFn();
      return () => h('div');
    },
  });
  const host = document.createElement('div');
  document.body.appendChild(host);
  const app = createApp({ render: () => h(Probe) });
  app.use(BrevwickPlugin, { projectKey: 'pk_test_use' });
  app.mount(host);
  return { app, api: api! };
};

describe('useFeedback', () => {
  it('transitions idle → submitting → success on resolved submit', async () => {
    submit.mockResolvedValueOnce({ ok: true, issue_id: 'rep_42' });

    const { api, app } = mountWithPlugin(() => undefined);
    expect(api.status.value).toBe('idle');

    const result = await api.submit({ description: 'broken' });
    expect(result).toEqual({ ok: true, issue_id: 'rep_42' });
    expect(api.status.value).toBe('success');

    api.reset();
    expect(api.status.value).toBe('idle');

    app.unmount();
  });

  it('transitions to error when submit returns ok: false', async () => {
    submit.mockResolvedValueOnce({
      ok: false,
      error: { code: 'INGEST_REJECTED', message: 'nope' },
    });
    const { api, app } = mountWithPlugin(() => undefined);
    await api.submit({ description: 'x' });
    expect(api.status.value).toBe('error');
    app.unmount();
  });

  it('flips to error and rethrows on lazy-chunk load failure', async () => {
    const chunkError = new Error('chunk load failed');
    submit.mockRejectedValueOnce(chunkError);
    const { api, app } = mountWithPlugin(() => undefined);
    await expect(api.submit({ description: 'x' })).rejects.toBe(chunkError);
    expect(api.status.value).toBe('error');
    app.unmount();
  });

  it('captureScreenshot delegates to the SDK', async () => {
    const blob = new Blob(['png'], { type: 'image/png' });
    captureScreenshot.mockResolvedValueOnce(blob);
    const { api, app } = mountWithPlugin(() => undefined);
    await expect(api.captureScreenshot()).resolves.toBe(blob);
    expect(captureScreenshot).toHaveBeenCalledTimes(1);
    app.unmount();
  });
});
