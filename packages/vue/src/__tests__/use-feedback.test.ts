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

type PhaseEventPayload =
  | { phase: 'capturing-done' }
  | { phase: 'sanitising-done' }
  | { phase: 'sent'; aiEnabled: boolean };
const phaseListeners = new Set<(p: PhaseEventPayload) => void>();
const phaseBus = {
  on: (event: 'phase', listener: (p: PhaseEventPayload) => void) => {
    void event;
    phaseListeners.add(listener);
  },
  off: (event: 'phase', listener: (p: PhaseEventPayload) => void) => {
    void event;
    phaseListeners.delete(listener);
  },
  emit: (event: 'phase', payload: PhaseEventPayload) => {
    void event;
    for (const listener of [...phaseListeners]) listener(payload);
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
        _internal: { bus: phaseBus },
      }) as unknown as Brevwick,
  };
});

import { BrevwickPlugin, BREVWICK_INJECTION_KEY } from '../plugin';
import { useFeedback } from '../composables/use-feedback';

afterEach(() => {
  vi.clearAllMocks();
  document.body.innerHTML = '';
  phaseListeners.clear();
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

  it('phase advances on bus events from idle → capturing → sanitising → formatting', async () => {
    submit.mockReturnValueOnce(new Promise<SubmitResult>(() => undefined));
    const { api, app } = mountWithPlugin(() => undefined);
    expect(api.phase.value).toBe('idle');
    void api.submit({ description: 'phase-walk' });
    // submit() flips phase to 'capturing' synchronously.
    expect(api.phase.value).toBe('capturing');

    phaseBus.emit('phase', { phase: 'capturing-done' });
    expect(api.phase.value).toBe('sanitising');
    phaseBus.emit('phase', { phase: 'sanitising-done' });
    expect(api.phase.value).toBe('formatting');
    phaseBus.emit('phase', { phase: 'sent', aiEnabled: false });
    expect(api.phase.value).toBe('sent');

    app.unmount();
  });

  it('records the SubmitError when submit returns ok: false', async () => {
    submit.mockResolvedValueOnce({
      ok: false,
      error: { code: 'INGEST_REJECTED', message: 'project disabled' },
    });
    const { api, app } = mountWithPlugin(() => undefined);
    await api.submit({ description: 'fail' });
    expect(api.phase.value).toBe('error');
    expect(api.error.value).toEqual({
      code: 'INGEST_REJECTED',
      message: 'project disabled',
    });
    app.unmount();
  });

  it('records a synthetic SubmitError on chunk-load failure', async () => {
    submit.mockRejectedValueOnce(new Error('chunk load failed'));
    const { api, app } = mountWithPlugin(() => undefined);
    await expect(api.submit({ description: 'x' })).rejects.toThrow(
      /chunk load/,
    );
    expect(api.error.value).toEqual({
      code: 'INGEST_RETRY_EXHAUSTED',
      message: 'chunk load failed',
    });
    app.unmount();
  });

  it('retry replays the last submitted input', async () => {
    submit.mockResolvedValueOnce({
      ok: false,
      error: { code: 'INGEST_REJECTED', message: 'first try' },
    });
    const { api, app } = mountWithPlugin(() => undefined);
    await api.submit({ description: 'will retry', title: 'will retry' });
    submit.mockResolvedValueOnce({ ok: true, issue_id: 'rep_retry' });
    const result = await api.retry();
    expect(result).toEqual({ ok: true, issue_id: 'rep_retry' });
    expect(submit).toHaveBeenCalledTimes(2);
    expect(submit.mock.calls[1]![0]).toEqual({
      description: 'will retry',
      title: 'will retry',
    });
    app.unmount();
  });

  it('retry resolves to undefined when no submit has been attempted', async () => {
    const { api, app } = mountWithPlugin(() => undefined);
    await expect(api.retry()).resolves.toBeUndefined();
    expect(submit).not.toHaveBeenCalled();
    app.unmount();
  });

  it('reset clears phase + error and forgets the last input', async () => {
    submit.mockResolvedValueOnce({
      ok: false,
      error: { code: 'INGEST_REJECTED', message: 'nope' },
    });
    const { api, app } = mountWithPlugin(() => undefined);
    await api.submit({ description: 'x' });
    expect(api.phase.value).toBe('error');
    expect(api.error.value).not.toBeNull();
    api.reset();
    expect(api.phase.value).toBe('idle');
    expect(api.error.value).toBeNull();
    expect(api.status.value).toBe('idle');
    await expect(api.retry()).resolves.toBeUndefined();
    app.unmount();
  });

  it('throws a distinguishable SSR error when the plugin provided null', () => {
    // Simulate the SSR install path: the plugin runs server-side, finds no
    // `window`, and provides the sentinel `null` so a misuse from a
    // non-onMounted code path surfaces a clear error instead of a generic
    // "called outside plugin" message.
    expect(() => {
      const Probe = defineComponent({
        setup() {
          useFeedback();
          return () => h('div');
        },
      });
      const host = document.createElement('div');
      document.body.appendChild(host);
      const app = createApp({ render: () => h(Probe) });
      app.provide(BREVWICK_INJECTION_KEY, null);
      app.mount(host);
    }).toThrow(/SSR/);
  });
});
