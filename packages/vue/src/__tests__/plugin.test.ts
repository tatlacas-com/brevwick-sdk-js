import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp, defineComponent, h, inject } from 'vue';
import type { Brevwick, BrevwickConfig } from '@tatlacas/brevwick-sdk';

const install = vi.fn();
const uninstall = vi.fn();
const submit = vi.fn();
const captureScreenshot = vi.fn();
const createBrevwick = vi.fn<(config: BrevwickConfig) => Brevwick>();

vi.mock('@tatlacas/brevwick-sdk', async () => {
  const actual = await vi.importActual<typeof import('@tatlacas/brevwick-sdk')>(
    '@tatlacas/brevwick-sdk',
  );
  return {
    ...actual,
    createBrevwick: (config: BrevwickConfig) => createBrevwick(config),
  };
});

import { BrevwickPlugin, BREVWICK_INJECTION_KEY } from '../plugin';
import { useFeedback } from '../composables/use-feedback';

const makeInstance = (): Brevwick =>
  ({
    install,
    uninstall,
    submit,
    captureScreenshot,
  }) as unknown as Brevwick;

afterEach(() => {
  vi.clearAllMocks();
  document.body.innerHTML = '';
});

describe('BrevwickPlugin', () => {
  it('creates the SDK and provides it to descendants on app.use()', async () => {
    createBrevwick.mockReturnValueOnce(makeInstance());

    let resolved: Brevwick | null | undefined;
    const Probe = defineComponent({
      setup() {
        resolved = inject(BREVWICK_INJECTION_KEY, undefined);
      },
      render: () => h('div'),
    });

    const host = document.createElement('div');
    document.body.appendChild(host);
    const app = createApp({ render: () => h(Probe) });
    app.use(BrevwickPlugin, { projectKey: 'pk_test_plugin' });
    app.mount(host);

    expect(createBrevwick).toHaveBeenCalledTimes(1);
    expect(install).toHaveBeenCalledTimes(1);
    expect(resolved).toBeDefined();
    expect(resolved).not.toBeNull();

    app.unmount();
    expect(uninstall).toHaveBeenCalledTimes(1);
  });

  it('useFeedback resolves the SDK provided by the plugin', async () => {
    createBrevwick.mockReturnValueOnce(makeInstance());

    let api: ReturnType<typeof useFeedback> | undefined;
    const Probe = defineComponent({
      setup() {
        api = useFeedback();
      },
      render: () => h('div'),
    });

    const host = document.createElement('div');
    document.body.appendChild(host);
    const app = createApp({ render: () => h(Probe) });
    app.use(BrevwickPlugin, { projectKey: 'pk_test_resolve' });
    app.mount(host);

    expect(api).toBeDefined();
    expect(api!.status.value).toBe('idle');
    submit.mockResolvedValueOnce({ ok: true, issue_id: 'rep_1' });
    const result = await api!.submit({ description: 'hi' });
    expect(result).toEqual({ ok: true, issue_id: 'rep_1' });
    expect(api!.status.value).toBe('success');

    app.unmount();
  });

  it('useFeedback throws when called outside the plugin', () => {
    expect(() => {
      const Probe = defineComponent({
        setup() {
          useFeedback();
        },
        render: () => h('div'),
      });
      const app = createApp({ render: () => h(Probe) });
      const host = document.createElement('div');
      document.body.appendChild(host);
      app.mount(host);
    }).toThrow(/BrevwickPlugin/);
  });

  it('app.unmount() releases the SDK listeners', () => {
    createBrevwick.mockReturnValueOnce(makeInstance());

    const Probe = defineComponent({
      setup() {
        useFeedback();
      },
      render: () => h('div'),
    });
    const host = document.createElement('div');
    document.body.appendChild(host);
    const app = createApp({ render: () => h(Probe) });
    app.use(BrevwickPlugin, { projectKey: 'pk_test_unmount' });
    app.mount(host);

    expect(install).toHaveBeenCalledTimes(1);
    expect(uninstall).not.toHaveBeenCalled();
    app.unmount();
    expect(uninstall).toHaveBeenCalledTimes(1);
  });
});
