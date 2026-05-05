import { afterEach, describe, expect, it, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { defineComponent, h } from 'vue';
import type { Brevwick, BrevwickConfig } from '@tatlacas/brevwick-sdk';

/**
 * Adapter-level redaction guard. The Vue adapter is a thin pass-through to
 * the core SDK — the redaction itself lives in `@tatlacas/brevwick-sdk`'s
 * `submit` pipeline. This test asserts that the adapter does not bypass it:
 * every payload that leaves a `<FeedbackButton>` submit lands on the SDK's
 * `submit()` method exactly as the user composed it (no parallel pathway,
 * no plain HTTP call from the Vue layer). The SDK's own redaction tests
 * cover the actual scrubbing.
 */

const sdkSubmit = vi.fn();
const captureScreenshot = vi.fn();
const getConfig = vi.fn().mockResolvedValue(null);
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
        submit: sdkSubmit,
        captureScreenshot,
        getConfig,
      }) as unknown as Brevwick,
  };
});

import { BrevwickPlugin } from '../plugin';
import { FeedbackButton } from '../components/feedback-button';
import { useFeedback } from '../composables/use-feedback';

afterEach(() => {
  vi.clearAllMocks();
});

describe('adapter does not bypass core redaction', () => {
  it('FeedbackButton routes every submit through sdk.submit (no parallel network path)', async () => {
    sdkSubmit.mockResolvedValueOnce({ ok: true, issue_id: 'rep_red' });
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    const Host = defineComponent({
      render: () => h(FeedbackButton),
    });
    const wrapper = mount(Host, {
      global: {
        plugins: [[BrevwickPlugin, { projectKey: 'pk_test_red' }]],
      },
      attachTo: document.body,
    });

    await wrapper.find('button.brw-fab').trigger('click');
    await flushPromises();
    await wrapper
      .find('textarea.brw-composer-input')
      .setValue('Bearer abc.def — token in body');
    await wrapper.find('button.brw-send-btn').trigger('click');
    await flushPromises();

    expect(sdkSubmit).toHaveBeenCalledTimes(1);
    // The adapter must never make its own network call — the SDK owns the
    // redaction pipeline and the wire format.
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it('useFeedback().submit forwards exactly the supplied input to sdk.submit', async () => {
    sdkSubmit.mockResolvedValueOnce({ ok: true, issue_id: 'rep_passthrough' });

    let api: ReturnType<typeof useFeedback> | undefined;
    const Probe = defineComponent({
      setup() {
        api = useFeedback();
        return () => h('div');
      },
    });
    mount(Probe, {
      global: {
        plugins: [[BrevwickPlugin, { projectKey: 'pk_test_passthrough' }]],
      },
    });

    const input = {
      title: 'X',
      description: 'Authorization: Bearer s3cret',
      expected: 'no token',
      actual: 'token leaked',
    };
    await api!.submit(input);

    expect(sdkSubmit).toHaveBeenCalledWith(input);
  });
});
