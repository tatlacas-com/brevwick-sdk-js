import { afterEach, describe, expect, it, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { defineComponent, h } from 'vue';
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
import { FeedbackButton } from '../components/feedback-button';

afterEach(() => {
  vi.clearAllMocks();
  document.body.innerHTML = '';
});

const mountFab = (props: Record<string, unknown> = {}) => {
  const Host = defineComponent({
    render: () => h(FeedbackButton, props),
  });
  return mount(Host, {
    global: {
      plugins: [[BrevwickPlugin, { projectKey: 'pk_test_fab' }]],
    },
    attachTo: document.body,
  });
};

describe('FeedbackButton', () => {
  it('renders a FAB and opens the panel on click', async () => {
    const wrapper = mountFab();
    const fab = wrapper.find('button.brw-fab');
    expect(fab.exists()).toBe(true);
    expect(wrapper.find('.brw-panel').exists()).toBe(false);

    await fab.trigger('click');
    expect(wrapper.find('.brw-panel').exists()).toBe(true);
  });

  it('hidden=true renders nothing', () => {
    const wrapper = mountFab({ hidden: true });
    expect(wrapper.find('button.brw-fab').exists()).toBe(false);
  });

  it('captures a screenshot when the screenshot button is clicked', async () => {
    URL.createObjectURL = vi.fn(() => 'blob:fake-url');
    URL.revokeObjectURL = vi.fn();
    const blob = new Blob(['png'], { type: 'image/png' });
    captureScreenshot.mockResolvedValueOnce(blob);

    const wrapper = mountFab();
    await wrapper.find('button.brw-fab').trigger('click');

    const screenshotBtn = wrapper
      .findAll('button.brw-btn')
      .find((b) => b.text().toLowerCase().includes('screenshot'));
    expect(screenshotBtn).toBeDefined();
    await screenshotBtn!.trigger('click');
    await flushPromises();

    expect(captureScreenshot).toHaveBeenCalledTimes(1);
    expect(wrapper.find('.brw-chip img').exists()).toBe(true);
  });

  it('submits via the SDK and shows the success message', async () => {
    submit.mockResolvedValueOnce({ ok: true, issue_id: 'rep_99' });

    const onSubmitSpy = vi.fn();
    const wrapper = mountFab({ onSubmit: onSubmitSpy });
    await wrapper.find('button.brw-fab').trigger('click');

    const textarea = wrapper.find('textarea.brw-textarea');
    await textarea.setValue('Checkout hangs after second click');

    const sendBtn = wrapper
      .findAll('button.brw-btn')
      .find((b) => b.text().toLowerCase().includes('send'));
    expect(sendBtn).toBeDefined();
    await sendBtn!.trigger('click');
    await flushPromises();

    expect(submit).toHaveBeenCalledTimes(1);
    expect(submit.mock.calls[0]![0]).toMatchObject({
      title: 'Checkout hangs after second click',
      description: 'Checkout hangs after second click',
    });
    expect(onSubmitSpy).toHaveBeenCalledWith({
      ok: true,
      issue_id: 'rep_99',
    });
    expect(wrapper.find('.brw-success').exists()).toBe(true);
  });

  it('surfaces a submit error in the alert region', async () => {
    submit.mockResolvedValueOnce({
      ok: false,
      error: { code: 'INGEST_REJECTED', message: 'project disabled' },
    });
    const wrapper = mountFab();
    await wrapper.find('button.brw-fab').trigger('click');
    await wrapper.find('textarea.brw-textarea').setValue('something');
    const sendBtn = wrapper
      .findAll('button.brw-btn')
      .find((b) => b.text().toLowerCase().includes('send'));
    await sendBtn!.trigger('click');
    await flushPromises();
    const alert = wrapper.find('[role="alert"]');
    expect(alert.exists()).toBe(true);
    expect(alert.text()).toContain('project disabled');
  });

  it('refuses to submit an empty draft', async () => {
    const wrapper = mountFab();
    await wrapper.find('button.brw-fab').trigger('click');
    // Draft is empty — Send should be disabled, so no submit() call lands.
    const sendBtn = wrapper
      .findAll('button.brw-btn')
      .find((b) => b.text().toLowerCase().includes('send'));
    expect((sendBtn!.element as HTMLButtonElement).disabled).toBe(true);
    expect(submit).not.toHaveBeenCalled();
  });
});
