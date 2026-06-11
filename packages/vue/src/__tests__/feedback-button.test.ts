import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type MockInstance,
} from 'vitest';
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils';
import { defineComponent, h } from 'vue';
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

/**
 * In-memory mirror of the SDK's internal phase bus. The Vue composable
 * subscribes to this via the `_internal` backdoor (see
 * `src/internal/internal-bridge.ts`), so the test mock stamps a structurally
 * compatible bus on the `Brevwick` instance and the suite drives phase
 * events through `phaseBus.emit(...)`.
 */
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
        getConfig,
        _internal: { bus: phaseBus },
      }) as unknown as Brevwick,
  };
});

import { BrevwickPlugin } from '../plugin';
import { FeedbackButton } from '../components/feedback-button';

beforeEach(() => {
  // Default getConfig returns null so the AI toggle stays hidden unless a
  // specific test opts into the choice-allowed config shape.
  getConfig.mockResolvedValue(null);
});

afterEach(() => {
  vi.clearAllMocks();
  document.body.innerHTML = '';
  phaseListeners.clear();
});

const onSubmitSpy = vi.fn();

afterEach(() => {
  onSubmitSpy.mockReset();
});

const mountFab = (props: Record<string, unknown> = {}): VueWrapper<unknown> => {
  const Host = defineComponent({
    render: () => h(FeedbackButton, { onSubmit: onSubmitSpy, ...props }),
  });
  return mount(Host, {
    global: {
      plugins: [[BrevwickPlugin, { projectKey: 'pk_test_fab' }]],
    },
    attachTo: document.body,
  });
};

async function openPanel(wrapper: VueWrapper<unknown>): Promise<void> {
  await wrapper.find('button.brw-fab').trigger('click');
  // Flush the getConfig() microtask so the projectConfig state settles
  // before the test reads it.
  await flushPromises();
}

function getComposer(wrapper: VueWrapper<unknown>): HTMLTextAreaElement {
  return wrapper.find('textarea.brw-composer-input')
    .element as HTMLTextAreaElement;
}

async function typeDraft(
  wrapper: VueWrapper<unknown>,
  text: string,
): Promise<void> {
  await wrapper.find('textarea.brw-composer-input').setValue(text);
}

async function clickSend(wrapper: VueWrapper<unknown>): Promise<void> {
  await wrapper.find('button.brw-send-btn').trigger('click');
  await flushPromises();
}

function findByText(
  wrapper: VueWrapper<unknown>,
  selector: string,
  text: string,
) {
  return wrapper.findAll(selector).find((node) => node.text() === text);
}

/**
 * Drive the screenshot button through the region-capture overlay the way
 * the pre-#111 tests expected "click screenshot → blob in composer" to
 * work. Post-restore, the button opens an overlay and the user picks
 * between a region crop and a full-page capture — here we take the latter
 * path, which is the closest analogue to the historical behaviour.
 */
async function captureFullPage(wrapper: VueWrapper<unknown>): Promise<void> {
  await wrapper
    .find('button[aria-label="Capture screenshot of this page"]')
    .trigger('click');
  await findByText(
    wrapper,
    '[data-testid="brw-region-overlay"] button',
    'Capture full page',
  )!.trigger('click');
  await flushPromises();
}

describe('<FeedbackButton>', () => {
  it('renders an anchored panel with data-brevwick-skip on FAB and panel', async () => {
    const wrapper = mountFab();
    const fab = wrapper.find('button.brw-fab');
    expect(fab.exists()).toBe(true);
    expect(fab.attributes('data-brevwick-skip')).toBe('');
    expect(fab.classes()).toContain('brw-fab');
    expect(wrapper.find('.brw-panel').exists()).toBe(false);

    await openPanel(wrapper);

    const dialog = wrapper.find('[role="dialog"]');
    expect(dialog.exists()).toBe(true);
    expect(dialog.attributes('data-brevwick-skip')).toBe('');
    expect(dialog.classes()).toContain('brw-panel');
    expect(dialog.classes()).toContain('brw-panel-br');
    expect(dialog.text()).toContain('Send feedback');
    expect(dialog.text()).toContain("Hi! Tell us what's happening");
  });

  it('renders a Brevwick credit footer linking to brevwick.dev on open', async () => {
    const wrapper = mountFab();
    await openPanel(wrapper);

    const link = wrapper.find('.brw-panel-footer-link');
    expect(link.exists()).toBe(true);
    expect(link.attributes('href')).toBe('https://brevwick.dev');
    expect(link.attributes('target')).toBe('_blank');
    const rel = link.attributes('rel') ?? '';
    expect(rel).toMatch(/noopener/);
    expect(rel).toMatch(/noreferrer/);
    expect(link.text()).toMatch(/^Brevwick v/);
  });

  it('hidden=true renders nothing', () => {
    const wrapper = mountFab({ hidden: true });
    expect(wrapper.find('button.brw-fab').exists()).toBe(false);
  });

  it('applies the bottom-left position class to FAB and panel', async () => {
    const wrapper = mountFab({ position: 'bottom-left' });
    const fab = wrapper.find('button.brw-fab');
    expect(fab.classes()).toContain('brw-fab-bl');
    expect(fab.classes()).not.toContain('brw-fab-br');
    await openPanel(wrapper);
    const dialog = wrapper.find('[role="dialog"]');
    expect(dialog.classes()).toContain('brw-panel-bl');
    expect(dialog.classes()).not.toContain('brw-panel-br');
  });

  it('Enter submits, Shift+Enter does not (newline preserved)', async () => {
    submit.mockResolvedValueOnce({ ok: true, issue_id: 'rep_enter' });
    const wrapper = mountFab();
    await openPanel(wrapper);
    const textareaWrap = wrapper.find('textarea.brw-composer-input');
    await textareaWrap.setValue('line one\nline two');
    await textareaWrap.trigger('keydown', { key: 'Enter', shiftKey: true });
    expect(submit).not.toHaveBeenCalled();

    await textareaWrap.trigger('keydown', { key: 'Enter' });
    await flushPromises();

    expect(submit).toHaveBeenCalledTimes(1);
    const input = submit.mock.calls[0]![0] as {
      description: string;
      title: string;
    };
    expect(input.description).toBe('line one\nline two');
    expect(input.title).toBe('line one');
  });

  it('Enter+Ctrl/Meta/Alt does not submit (reserved for platform shortcuts)', async () => {
    const wrapper = mountFab();
    await openPanel(wrapper);
    await typeDraft(wrapper, 'modifier guard');
    const textareaWrap = wrapper.find('textarea.brw-composer-input');

    await textareaWrap.trigger('keydown', { key: 'Enter', ctrlKey: true });
    await textareaWrap.trigger('keydown', { key: 'Enter', metaKey: true });
    await textareaWrap.trigger('keydown', { key: 'Enter', altKey: true });
    expect(submit).not.toHaveBeenCalled();

    submit.mockResolvedValueOnce({ ok: true, issue_id: 'rep_mod' });
    await textareaWrap.trigger('keydown', { key: 'Enter' });
    await flushPromises();
    expect(submit).toHaveBeenCalledTimes(1);
  });

  it('submit appends user + assistant bubbles and keeps composer active', async () => {
    submit.mockResolvedValueOnce({ ok: true, issue_id: 'rep_ok' });
    const wrapper = mountFab();
    await openPanel(wrapper);
    await typeDraft(wrapper, 'Broken flow');
    await clickSend(wrapper);

    expect(onSubmitSpy).toHaveBeenCalledWith({ ok: true, issue_id: 'rep_ok' });
    expect(wrapper.find('[role="dialog"]').exists()).toBe(true);
    expect(wrapper.text()).toContain('Broken flow');
    expect(wrapper.text()).toMatch(/thanks — your issue is on its way/i);
    expect(wrapper.text()).toMatch(/issue sent/i);
    // Composer survives the submit, draft cleared.
    const composer = getComposer(wrapper);
    expect(composer.disabled).toBe(false);
    expect(composer.value).toBe('');
  });

  it('typing into the composer does not append a bubble to the thread', async () => {
    const wrapper = mountFab();
    await openPanel(wrapper);
    const log = wrapper.find('[role="log"]');
    expect(log.findAll('.brw-bubble')).toHaveLength(1);
    await typeDraft(wrapper, 'still drafting…');
    expect(log.findAll('.brw-bubble')).toHaveLength(1);
    expect(log.text()).not.toContain('still drafting');
    expect(log.text()).toContain("Hi! Tell us what's happening");
  });

  it('Send is disabled when the composer is empty', async () => {
    const wrapper = mountFab();
    await openPanel(wrapper);
    const sendBtn = wrapper.find('button.brw-send-btn');
    expect((sendBtn.element as HTMLButtonElement).disabled).toBe(true);
    await sendBtn.trigger('click');
    expect(submit).not.toHaveBeenCalled();
  });

  it('surfaces an inline error and keeps the panel open on failure', async () => {
    submit.mockResolvedValueOnce({
      ok: false,
      error: { code: 'INGEST_REJECTED', message: 'quota exceeded' },
    });
    const wrapper = mountFab();
    await openPanel(wrapper);
    await typeDraft(wrapper, 'Broken flow');
    await clickSend(wrapper);

    const errorRow = wrapper.find('[data-brw-row="error"]');
    expect(errorRow.exists()).toBe(true);
    expect(errorRow.text()).toContain('quota exceeded');
    expect(wrapper.find('[role="dialog"]').exists()).toBe(true);
  });

  it('invokes onSubmit with the { ok: false, error } shape on failure', async () => {
    const failure: SubmitResult = {
      ok: false,
      error: { code: 'INGEST_REJECTED', message: 'nope' },
    };
    submit.mockResolvedValueOnce(failure);
    const wrapper = mountFab();
    await openPanel(wrapper);
    await typeDraft(wrapper, 'x');
    await clickSend(wrapper);
    expect(onSubmitSpy).toHaveBeenCalledWith(failure);
  });

  it('surfaces a recovery row when submit() rejects (chunk load failure)', async () => {
    submit.mockRejectedValueOnce(new Error('chunk load failed'));
    const wrapper = mountFab();
    await openPanel(wrapper);
    await typeDraft(wrapper, 'oops');
    await clickSend(wrapper);

    const errorRow = wrapper.find('[data-brw-row="error"]');
    expect(errorRow.exists()).toBe(true);
    expect(errorRow.text()).toContain('chunk load failed');
    expect(errorRow.attributes('data-brw-error-code')).toBe(
      'INGEST_RETRY_EXHAUSTED',
    );
    expect(wrapper.find('[role="dialog"]').exists()).toBe(true);
  });

  it('Submit clears the input synchronously and pushes a user bubble on the same tick', async () => {
    // Park submit on a never-resolving promise so we can observe the
    // pre-await state — the same #74 contract React uses.
    submit.mockReturnValueOnce(new Promise<SubmitResult>(() => undefined));
    const wrapper = mountFab();
    await openPanel(wrapper);
    await typeDraft(wrapper, 'synchronous-send-test');
    // No flushPromises here — the visible state BEFORE the async submit
    // microtask resolves must already be correct.
    await wrapper.find('button.brw-send-btn').trigger('click');

    expect(getComposer(wrapper).value).toBe('');
    const log = wrapper.find('[role="log"]');
    expect(log.text()).toContain('synchronous-send-test');
  });

  it('retry replays the last submitted input without re-typing', async () => {
    submit.mockRejectedValueOnce(new Error('ingest down'));
    const wrapper = mountFab();
    await openPanel(wrapper);
    await typeDraft(wrapper, 'will fail');
    await clickSend(wrapper);

    const errorRow = wrapper.find('[data-brw-row="error"]');
    expect(errorRow.exists()).toBe(true);
    expect(errorRow.text()).toContain('ingest down');
    expect(getComposer(wrapper).value).toBe('');

    submit.mockResolvedValueOnce({ ok: true, issue_id: 'rep_retry' });
    await wrapper.find('.brw-status-row-retry').trigger('click');
    await flushPromises();

    expect(submit).toHaveBeenCalledTimes(2);
    expect(
      (submit.mock.calls[1]![0] as { description: string }).description,
    ).toBe('will fail');
    expect(wrapper.text()).toMatch(/thanks — your issue is on its way/i);
  });

  it('close when clean dismisses immediately and clears state', async () => {
    const wrapper = mountFab();
    await openPanel(wrapper);
    await wrapper.find('button[aria-label="Close"]').trigger('click');
    expect(wrapper.find('[role="dialog"]').exists()).toBe(false);
    await openPanel(wrapper);
    expect(getComposer(wrapper).value).toBe('');
  });

  it('close when dirty shows discard confirm; Discard clears, Keep preserves', async () => {
    const wrapper = mountFab();
    await openPanel(wrapper);
    await typeDraft(wrapper, 'draft-content');
    await wrapper.find('button[aria-label="Close"]').trigger('click');

    expect(wrapper.find('[role="dialog"]').exists()).toBe(true);
    const confirm = wrapper.find('.brw-confirm');
    expect(confirm.exists()).toBe(true);
    expect(confirm.attributes('aria-label')).toMatch(/discard draft/i);
    // Keep → confirm disappears, draft remains.
    await confirm
      .findAll('button')
      .find((b) => b.text() === 'Keep')!
      .trigger('click');
    expect(wrapper.find('.brw-confirm').exists()).toBe(false);
    expect(getComposer(wrapper).value).toBe('draft-content');

    // Close again → Discard → panel closes and reopens empty.
    await wrapper.find('button[aria-label="Close"]').trigger('click');
    await wrapper
      .find('.brw-confirm')
      .findAll('button')
      .find((b) => b.text() === 'Discard')!
      .trigger('click');
    expect(wrapper.find('[role="dialog"]').exists()).toBe(false);
    await openPanel(wrapper);
    expect(getComposer(wrapper).value).toBe('');
  });

  it('expected/actual are hidden by default and revealed via disclosure', async () => {
    const wrapper = mountFab();
    await openPanel(wrapper);
    expect(wrapper.find('textarea[aria-label="Expected"]').exists()).toBe(
      false,
    );
    await wrapper.find('.brw-disclosure').trigger('click');
    expect(wrapper.find('textarea[aria-label="Expected"]').exists()).toBe(true);
    expect(wrapper.find('textarea[aria-label="Actual"]').exists()).toBe(true);
  });

  it('passes expected/actual into the submit payload when filled', async () => {
    submit.mockResolvedValueOnce({ ok: true, issue_id: 'rep_ea' });
    const wrapper = mountFab();
    await openPanel(wrapper);
    await typeDraft(wrapper, 'bug');
    await wrapper.find('.brw-disclosure').trigger('click');
    await wrapper
      .find('textarea[aria-label="Expected"]')
      .setValue('happy path');
    await wrapper.find('textarea[aria-label="Actual"]').setValue('crash');
    await clickSend(wrapper);
    expect(submit).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'bug',
        description: 'bug',
        expected: 'happy path',
        actual: 'crash',
      }),
    );
  });

  it('omits expected/actual from the payload when the disclosure stays closed', async () => {
    submit.mockResolvedValueOnce({ ok: true, issue_id: 'rep_no_ea' });
    const wrapper = mountFab();
    await openPanel(wrapper);
    await typeDraft(wrapper, 'just description');
    await clickSend(wrapper);
    const input = submit.mock.calls[0]![0] as Record<string, unknown>;
    expect(input.expected).toBeUndefined();
    expect(input.actual).toBeUndefined();
  });

  it('attaches files via the paperclip input and sends them as attachments', async () => {
    submit.mockResolvedValueOnce({ ok: true, issue_id: 'rep_files' });
    const wrapper = mountFab();
    await openPanel(wrapper);
    const fileInput = wrapper.find('input[type="file"]')
      .element as HTMLInputElement;
    const a = new File(['hello'], 'log.txt', { type: 'text/plain' });
    const dt = new DataTransfer();
    dt.items.add(a);
    Object.defineProperty(fileInput, 'files', { value: dt.files });
    await wrapper.find('input[type="file"]').trigger('change');
    expect(wrapper.find('.brw-chip').exists()).toBe(true);

    await typeDraft(wrapper, 'with file');
    await clickSend(wrapper);
    const submitted = submit.mock.calls[0]![0] as {
      attachments: Array<{ filename: string }>;
    };
    expect(submitted.attachments).toHaveLength(1);
    expect(submitted.attachments[0]!.filename).toBe('log.txt');
  });

  it('greeting invites a screenshot now that the capture button is back', async () => {
    // Pins the full greeting copy: the screenshot-restore decision requires
    // "…A screenshot helps if you have one." whenever the capture button is
    // present. The prefix-only assertions elsewhere would not catch a
    // regression back to the short button-less greeting.
    const wrapper = mountFab();
    await openPanel(wrapper);
    expect(wrapper.find('[role="log"]').text()).toContain(
      "Hi! Tell us what's happening. A screenshot helps if you have one.",
    );
  });

  it('attaches a screenshot via captureScreenshot and renders a chip', async () => {
    const blob = new Blob(['x'], { type: 'image/png' });
    captureScreenshot.mockResolvedValueOnce(blob);
    const wrapper = mountFab();
    await openPanel(wrapper);

    await captureFullPage(wrapper);
    expect(captureScreenshot).toHaveBeenCalledTimes(1);
    expect(
      wrapper.find('button[aria-label="Remove screenshot"]').exists(),
    ).toBe(true);
  });

  it('derives the screenshot attachment extension from its MIME type', async () => {
    const blob = new Blob(['x'], { type: 'image/webp' });
    captureScreenshot.mockResolvedValueOnce(blob);
    submit.mockResolvedValueOnce({ ok: true, issue_id: 'rep_ext' });
    const wrapper = mountFab();
    await openPanel(wrapper);
    await captureFullPage(wrapper);
    await typeDraft(wrapper, 'with screenshot');
    await clickSend(wrapper);

    const input = submit.mock.calls[0]![0] as {
      attachments: Array<{ blob: Blob; filename: string }>;
    };
    expect(input.attachments[0]!.filename).toBe('screenshot.webp');
  });

  it('surfaces an error when captureScreenshot rejects', async () => {
    captureScreenshot.mockRejectedValueOnce(new Error('canvas tainted'));
    const wrapper = mountFab();
    await openPanel(wrapper);

    await captureFullPage(wrapper);

    const alert = wrapper.find('.brw-error[role="alert"]');
    expect(alert.exists()).toBe(true);
    expect(alert.text()).toContain('canvas tainted');
    // Failure must never produce a chip — and Send stays usable.
    expect(
      wrapper.find('button[aria-label="Remove screenshot"]').exists(),
    ).toBe(false);
    await typeDraft(wrapper, 'still sendable');
    expect(
      (wrapper.find('button.brw-send-btn').element as HTMLButtonElement)
        .disabled,
    ).toBe(false);
  });

  it('falls back to a generic alert when captureScreenshot rejects with a non-Error', async () => {
    captureScreenshot.mockRejectedValueOnce('tainted');
    const wrapper = mountFab();
    await openPanel(wrapper);
    await captureFullPage(wrapper);

    const alert = wrapper.find('.brw-error[role="alert"]');
    expect(alert.exists()).toBe(true);
    expect(alert.text()).toContain('Screenshot capture failed');
  });

  it('defaults the attachment extension to webp when the blob carries no MIME type', async () => {
    captureScreenshot.mockResolvedValueOnce(new Blob(['raw'], { type: '' }));
    submit.mockResolvedValueOnce({ ok: true, issue_id: 'rep_untyped' });
    const wrapper = mountFab();
    await openPanel(wrapper);
    await captureFullPage(wrapper);
    await typeDraft(wrapper, 'untyped blob');
    await clickSend(wrapper);

    const input = submit.mock.calls[0]![0] as {
      attachments: Array<{ blob: Blob; filename: string }>;
    };
    expect(input.attachments[0]!.filename).toBe('screenshot.webp');
  });

  it('region-overlay confirm full crops to the viewport rectangle', async () => {
    // "Capture full page" must pass the *uncropped* blob through to the
    // composer — the viewport rectangle is what `captureScreenshot()`
    // already returns, so no canvas crop may run in this path.
    const fullBlob = new Blob(['uncropped'], { type: 'image/webp' });
    captureScreenshot.mockResolvedValueOnce(fullBlob);
    submit.mockResolvedValueOnce({ ok: true, issue_id: 'rep_full' });
    const wrapper = mountFab();
    await openPanel(wrapper);
    await captureFullPage(wrapper);
    await typeDraft(wrapper, 'full cap');
    await clickSend(wrapper);

    const input = submit.mock.calls[0]![0] as {
      attachments: Array<{ blob: Blob; filename: string }>;
    };
    // Extension derives from the MIME of the full-page blob — proves no
    // canvas re-encode happened in the full-page path.
    expect(input.attachments[0]!.filename).toBe('screenshot.webp');
    expect(input.attachments[0]!.blob).toBe(fullBlob);
  });

  it('revokes the screenshot object URL on unmount', async () => {
    const blob = new Blob(['x'], { type: 'image/png' });
    captureScreenshot.mockResolvedValueOnce(blob);
    const createObjectURL = vi
      .spyOn(URL, 'createObjectURL')
      .mockReturnValue('blob:unmount-test');
    const revokeObjectURL = vi
      .spyOn(URL, 'revokeObjectURL')
      .mockImplementation(() => undefined);
    try {
      const wrapper = mountFab();
      await openPanel(wrapper);
      await captureFullPage(wrapper);
      expect(createObjectURL).toHaveBeenCalled();

      wrapper.unmount();
      expect(revokeObjectURL).toHaveBeenCalledWith('blob:unmount-test');
    } finally {
      createObjectURL.mockRestore();
      revokeObjectURL.mockRestore();
    }
  });
});

/**
 * Mirrors the React adapter's multi-screenshot + preview block (issues
 * #56/#57): array attachment shape, the combined cap, the in-thread
 * capturing bubble, and the tap-to-preview dialog wiring.
 */
describe('<FeedbackButton> — multi-screenshot + preview', () => {
  it('keeps both captures (no replace) and disambiguates filenames on submit', async () => {
    const first = new Blob(['1'], { type: 'image/png' });
    const second = new Blob(['2'], { type: 'image/webp' });
    captureScreenshot.mockResolvedValueOnce(first);
    captureScreenshot.mockResolvedValueOnce(second);
    submit.mockResolvedValueOnce({ ok: true, issue_id: 'rep_multi' });
    const wrapper = mountFab();
    await openPanel(wrapper);

    await captureFullPage(wrapper);
    await captureFullPage(wrapper);

    expect(
      wrapper.find('button[aria-label="Remove screenshot 1"]').exists(),
    ).toBe(true);
    expect(
      wrapper.find('button[aria-label="Remove screenshot 2"]').exists(),
    ).toBe(true);

    await typeDraft(wrapper, 'two screenshots');
    await clickSend(wrapper);
    const input = submit.mock.calls[0]![0] as {
      attachments: Array<{ blob: Blob; filename: string }>;
    };
    expect(input.attachments).toHaveLength(2);
    expect(input.attachments[0]!.filename).toBe('screenshot-1.png');
    expect(input.attachments[1]!.filename).toBe('screenshot-2.webp');
  });

  it('disables the screenshot button once the combined attachment cap (5) is hit', async () => {
    for (let i = 0; i < 5; i++) {
      captureScreenshot.mockResolvedValueOnce(
        new Blob([String(i)], { type: 'image/png' }),
      );
    }
    const wrapper = mountFab();
    await openPanel(wrapper);
    for (let i = 0; i < 5; i++) await captureFullPage(wrapper);

    expect(
      wrapper.findAll('button[aria-label^="Remove screenshot"]'),
    ).toHaveLength(5);
    const screenshotBtn = wrapper.find(
      'button[aria-label="Maximum 5 attachments reached"]',
    );
    expect(screenshotBtn.exists()).toBe(true);
    expect((screenshotBtn.element as HTMLButtonElement).disabled).toBe(true);
    expect(captureScreenshot).toHaveBeenCalledTimes(5);
  });

  it('shows a "Capturing screenshot…" indicator between region close and the chip render', async () => {
    let release: (b: Blob) => void = () => undefined;
    captureScreenshot.mockReturnValueOnce(
      new Promise<Blob>((resolve) => {
        release = resolve;
      }),
    );
    const wrapper = mountFab();
    await openPanel(wrapper);
    await wrapper
      .find('button[aria-label="Capture screenshot of this page"]')
      .trigger('click');
    await findByText(
      wrapper,
      '[data-testid="brw-region-overlay"] button',
      'Capture full page',
    )!.trigger('click');

    // Capture is still pending — bubble + spinner should be visible.
    expect(wrapper.find('[role="log"]').text()).toContain(
      'Capturing screenshot…',
    );
    expect(
      wrapper.find('button[aria-label="Remove screenshot"]').exists(),
    ).toBe(false);
    // The screenshot button is disabled and announces why.
    const capturingBtn = wrapper.find(
      'button[aria-label="Capturing screenshot…"]',
    );
    expect((capturingBtn.element as HTMLButtonElement).disabled).toBe(true);

    release(new Blob(['x'], { type: 'image/png' }));
    await flushPromises();
    expect(
      wrapper.find('button[aria-label="Remove screenshot"]').exists(),
    ).toBe(true);
    expect(wrapper.find('[role="log"]').text()).not.toContain(
      'Capturing screenshot…',
    );
    expect(
      wrapper
        .find('button[aria-label="Capture screenshot of this page"]')
        .exists(),
    ).toBe(true);
  });

  it('blocks Enter-to-send while a capture is in flight (no submit without the pending screenshot)', async () => {
    let release: (b: Blob) => void = () => undefined;
    captureScreenshot.mockReturnValueOnce(
      new Promise<Blob>((resolve) => {
        release = resolve;
      }),
    );
    const wrapper = mountFab();
    await openPanel(wrapper);
    await typeDraft(wrapper, 'partial draft');
    await wrapper
      .find('button[aria-label="Capture screenshot of this page"]')
      .trigger('click');
    await findByText(
      wrapper,
      '[data-testid="brw-region-overlay"] button',
      'Capture full page',
    )!.trigger('click');

    // Send button is disabled because Capture is in flight; Enter-to-send
    // is independently guarded inside doSubmit so the keyboard path can't
    // race past the disabled-button protection.
    expect(
      (wrapper.find('button.brw-send-btn').element as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    getComposer(wrapper).dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }),
    );
    expect(submit).not.toHaveBeenCalled();

    release(new Blob(['x'], { type: 'image/png' }));
    await flushPromises();
    // After capture resolves, Send re-enables — the guard only fires while
    // `capturing` is true.
    expect(
      (wrapper.find('button.brw-send-btn').element as HTMLButtonElement)
        .disabled,
    ).toBe(false);
  });

  it('surfaces an error when a capture lands after the cap was reached', async () => {
    // Hit the defence-in-depth branch in performCapture by gating the
    // second capture on a pending promise, then filling the remaining cap
    // slots with files while it is in flight.
    const first = new Blob(['1'], { type: 'image/png' });
    captureScreenshot.mockResolvedValueOnce(first);
    let releaseSecond: (b: Blob) => void = () => undefined;
    captureScreenshot.mockReturnValueOnce(
      new Promise<Blob>((resolve) => {
        releaseSecond = resolve;
      }),
    );
    const wrapper = mountFab();
    await openPanel(wrapper);
    await captureFullPage(wrapper);

    // Kick off capture #2 (still pending).
    await wrapper
      .find('button[aria-label="Capture screenshot of this page"]')
      .trigger('click');
    await findByText(
      wrapper,
      '[data-testid="brw-region-overlay"] button',
      'Capture full page',
    )!.trigger('click');

    // Fill the remaining 4 slots with files while capture #2 is in flight.
    // The input is disabled (capture in flight), so dispatch the change
    // event natively — DOM disabled-ness doesn't block programmatic
    // dispatch, which is exactly the race this guard defends against.
    const fileInput = wrapper.find('input[type="file"]')
      .element as HTMLInputElement;
    const dt = new DataTransfer();
    for (let i = 0; i < 4; i++) {
      dt.items.add(new File(['f'], `f${i}.png`, { type: 'image/png' }));
    }
    Object.defineProperty(fileInput, 'files', { value: dt.files });
    fileInput.dispatchEvent(new Event('change', { bubbles: true }));
    await flushPromises();

    // Resolve capture #2 — performCapture's cap guard rejects the new
    // capture and surfaces the error message.
    releaseSecond(new Blob(['2'], { type: 'image/png' }));
    await flushPromises();

    const alert = wrapper.find('.brw-error[role="alert"]');
    expect(alert.exists()).toBe(true);
    expect(alert.text()).toContain('Maximum 5 attachments reached');
    // Only the first screenshot survived — the stale capture was dropped.
    expect(
      wrapper.findAll('button[aria-label^="Remove screenshot"]'),
    ).toHaveLength(1);
  });

  it('tapping a screenshot thumbnail opens a preview dialog with the captured image', async () => {
    const blob = new Blob(['x'], { type: 'image/png' });
    captureScreenshot.mockResolvedValueOnce(blob);
    const createObjectURL = vi
      .spyOn(URL, 'createObjectURL')
      .mockReturnValue('blob:mock-preview');
    const revokeObjectURL = vi
      .spyOn(URL, 'revokeObjectURL')
      .mockImplementation(() => undefined);
    try {
      const wrapper = mountFab();
      await openPanel(wrapper);
      await captureFullPage(wrapper);

      await wrapper
        .find('button[aria-label="Preview screenshot"]')
        .trigger('click');
      const preview = wrapper.find('[data-testid="brw-preview-dialog"]');
      expect(preview.exists()).toBe(true);
      const img = preview.find('img[alt="Captured screenshot"]');
      expect(img.exists()).toBe(true);
      expect(img.attributes('src')).toBe('blob:mock-preview');

      await preview.find('button[aria-label="Close preview"]').trigger('click');
      expect(wrapper.find('[data-testid="brw-preview-dialog"]').exists()).toBe(
        false,
      );
    } finally {
      createObjectURL.mockRestore();
      revokeObjectURL.mockRestore();
    }
  });

  it('Esc dismisses the preview dialog without removing the screenshot', async () => {
    const blob = new Blob(['x'], { type: 'image/png' });
    captureScreenshot.mockResolvedValueOnce(blob);
    const wrapper = mountFab();
    await openPanel(wrapper);
    await captureFullPage(wrapper);

    await wrapper
      .find('button[aria-label="Preview screenshot"]')
      .trigger('click');
    await wrapper
      .find('[data-testid="brw-preview-dialog"]')
      .trigger('keydown', { key: 'Escape' });
    expect(wrapper.find('[data-testid="brw-preview-dialog"]').exists()).toBe(
      false,
    );
    // Chip survives the Esc — Esc on the preview must not bubble up into
    // the panel's own close handling. The chip's preview-button is the
    // canonical "screenshot is still attached" probe.
    expect(
      wrapper.find('button[aria-label="Preview screenshot"]').exists(),
    ).toBe(true);
  });

  it('non-Escape keys on the preview dialog leave it open', async () => {
    const blob = new Blob(['x'], { type: 'image/png' });
    captureScreenshot.mockResolvedValueOnce(blob);
    const wrapper = mountFab();
    await openPanel(wrapper);
    await captureFullPage(wrapper);

    await wrapper
      .find('button[aria-label="Preview screenshot"]')
      .trigger('click');
    await wrapper
      .find('[data-testid="brw-preview-dialog"]')
      .trigger('keydown', { key: 'Enter' });
    expect(wrapper.find('[data-testid="brw-preview-dialog"]').exists()).toBe(
      true,
    );
  });

  it('clicking the chip × does not open the preview dialog', async () => {
    const blob = new Blob(['x'], { type: 'image/png' });
    captureScreenshot.mockResolvedValueOnce(blob);
    const wrapper = mountFab();
    await openPanel(wrapper);
    await captureFullPage(wrapper);

    await wrapper
      .find('button[aria-label="Remove screenshot"]')
      .trigger('click');
    expect(wrapper.find('[data-testid="brw-preview-dialog"]').exists()).toBe(
      false,
    );
    expect(
      wrapper.find('button[aria-label="Preview screenshot"]').exists(),
    ).toBe(false);
  });

  it('removing a screenshot while its preview is open closes the dialog', async () => {
    const first = new Blob(['1'], { type: 'image/png' });
    const second = new Blob(['2'], { type: 'image/png' });
    captureScreenshot.mockResolvedValueOnce(first);
    captureScreenshot.mockResolvedValueOnce(second);
    const wrapper = mountFab();
    await openPanel(wrapper);
    await captureFullPage(wrapper);
    await captureFullPage(wrapper);

    await wrapper
      .find('button[aria-label="Preview screenshot 2"]')
      .trigger('click');
    expect(wrapper.find('[data-testid="brw-preview-dialog"]').exists()).toBe(
      true,
    );

    await wrapper
      .find('button[aria-label="Remove screenshot 2"]')
      .trigger('click');
    expect(wrapper.find('[data-testid="brw-preview-dialog"]').exists()).toBe(
      false,
    );
  });
});

describe('<FeedbackButton> — region capture overlay', () => {
  /**
   * Install a test double for the canvas crop pipeline so the overlay's
   * confirm-region path can resolve under happy-dom (which provides no
   * functional 2D context, `toBlob`, or image loader). Captures the
   * `drawImage` source/dest args so a test can assert the crop math
   * matches the dragged rectangle × devicePixelRatio.
   */
  function installCropStub(): {
    drawImageArgs: unknown[][];
    restore: () => void;
  } {
    const drawImageArgs: unknown[][] = [];
    const originalImageSrc = Object.getOwnPropertyDescriptor(
      HTMLImageElement.prototype,
      'src',
    );
    Object.defineProperty(HTMLImageElement.prototype, 'src', {
      configurable: true,
      get() {
        return (this as { _brwSrc?: string })._brwSrc ?? '';
      },
      set(value: string) {
        (this as { _brwSrc?: string })._brwSrc = value;
        queueMicrotask(() => {
          const self = this as HTMLImageElement & {
            onload?: ((ev: Event) => void) | null;
          };
          self.onload?.(new Event('load'));
        });
      },
    });

    const originalGetContext = HTMLCanvasElement.prototype.getContext;
    (HTMLCanvasElement.prototype as { getContext: unknown }).getContext =
      function getContextStub(kind: string) {
        if (kind !== '2d') return null;
        return {
          drawImage: (...args: unknown[]) => {
            drawImageArgs.push(args);
          },
        };
      };

    const originalToBlob = HTMLCanvasElement.prototype.toBlob;
    HTMLCanvasElement.prototype.toBlob = function toBlobStub(
      this: HTMLCanvasElement,
      cb: BlobCallback,
      type?: string,
    ) {
      const blob = new Blob([`cropped:${this.width}x${this.height}`], {
        type: type ?? 'image/png',
      });
      queueMicrotask(() => cb(blob));
    };

    // Force the non-OffscreenCanvas branch — happy-dom's OffscreenCanvas,
    // where present, lacks convertToBlob and would break the crop.
    const originalOffscreen = (globalThis as { OffscreenCanvas?: unknown })
      .OffscreenCanvas;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (globalThis as any).OffscreenCanvas;

    return {
      drawImageArgs,
      restore: () => {
        if (originalImageSrc) {
          Object.defineProperty(
            HTMLImageElement.prototype,
            'src',
            originalImageSrc,
          );
        }
        HTMLCanvasElement.prototype.getContext = originalGetContext;
        HTMLCanvasElement.prototype.toBlob = originalToBlob;
        if (originalOffscreen !== undefined) {
          (globalThis as { OffscreenCanvas?: unknown }).OffscreenCanvas =
            originalOffscreen;
        }
      },
    };
  }

  async function openOverlay(wrapper: VueWrapper<unknown>): Promise<void> {
    await openPanel(wrapper);
    await wrapper
      .find('button[aria-label="Capture screenshot of this page"]')
      .trigger('click');
  }

  function getOverlay(wrapper: VueWrapper<unknown>) {
    return wrapper.find('[data-testid="brw-region-overlay"]');
  }

  async function drag(
    wrapper: VueWrapper<unknown>,
    from: { x: number; y: number },
    to: { x: number; y: number },
  ): Promise<void> {
    const overlay = getOverlay(wrapper);
    await overlay.trigger('pointerdown', {
      clientX: from.x,
      clientY: from.y,
      pointerId: 1,
      button: 0,
    });
    await overlay.trigger('pointermove', {
      clientX: to.x,
      clientY: to.y,
      pointerId: 1,
    });
    await overlay.trigger('pointerup', {
      clientX: to.x,
      clientY: to.y,
      pointerId: 1,
    });
  }

  it('click on the screenshot button opens the overlay and hides (not unmounts) the panel', async () => {
    const wrapper = mountFab();
    await openOverlay(wrapper);

    const overlay = getOverlay(wrapper);
    expect(overlay.exists()).toBe(true);
    expect(overlay.attributes('data-brevwick-skip')).toBe('');
    expect(overlay.attributes('aria-label')).toBe('Select screenshot region');
    // Panel stays mounted (state preserved) but is visually hidden so the
    // user can select a region over content the panel would cover (#49).
    const panel = wrapper.find('[role="dialog"].brw-panel');
    expect(panel.exists()).toBe(true);
    expect(panel.classes()).toContain('brw-panel-hidden');
  });

  it('Escape dismisses the overlay, restores the panel, and preserves the draft', async () => {
    const wrapper = mountFab();
    await openPanel(wrapper);
    await typeDraft(wrapper, 'draft survives overlay');
    await wrapper
      .find('button[aria-label="Capture screenshot of this page"]')
      .trigger('click');
    expect(getOverlay(wrapper).exists()).toBe(true);

    await getOverlay(wrapper).trigger('keydown', { key: 'Escape' });
    expect(getOverlay(wrapper).exists()).toBe(false);
    const panel = wrapper.find('[role="dialog"].brw-panel');
    expect(panel.classes()).not.toContain('brw-panel-hidden');
    expect(getComposer(wrapper).value).toBe('draft survives overlay');
    expect(captureScreenshot).not.toHaveBeenCalled();
  });

  it('Cancel closes the overlay without capture', async () => {
    const wrapper = mountFab();
    await openOverlay(wrapper);
    await findByText(
      wrapper,
      '[data-testid="brw-region-overlay"] button',
      'Cancel',
    )!.trigger('click');
    expect(getOverlay(wrapper).exists()).toBe(false);
    expect(captureScreenshot).not.toHaveBeenCalled();
  });

  it('pointer drag produces a visible selection rectangle sized to the drag', async () => {
    const wrapper = mountFab();
    await openOverlay(wrapper);
    await drag(wrapper, { x: 10, y: 20 }, { x: 210, y: 120 });

    const selection = wrapper.find('[data-testid="brw-region-selection"]');
    expect(selection.exists()).toBe(true);
    const style = (selection.element as HTMLElement).style;
    expect(style.left).toBe('10px');
    expect(style.top).toBe('20px');
    expect(style.width).toBe('200px');
    expect(style.height).toBe('100px');
  });

  it('drag produces the same rectangle regardless of direction (upward drag)', async () => {
    const wrapper = mountFab();
    await openOverlay(wrapper);
    await drag(wrapper, { x: 210, y: 120 }, { x: 10, y: 20 });

    const style = (
      wrapper.find('[data-testid="brw-region-selection"]')
        .element as HTMLElement
    ).style;
    expect(style.left).toBe('10px');
    expect(style.top).toBe('20px');
    expect(style.width).toBe('200px');
    expect(style.height).toBe('100px');
  });

  it('degenerate selection on Capture shakes and does not invoke captureScreenshot', async () => {
    const wrapper = mountFab();
    await openOverlay(wrapper);
    // A click without a drag (no selection at all) is the degenerate case.
    await findByText(
      wrapper,
      '[data-testid="brw-region-overlay"] button',
      'Capture',
    )!.trigger('click');

    expect(getOverlay(wrapper).classes()).toContain('brw-region-shake');
    expect(getOverlay(wrapper).exists()).toBe(true);
    expect(captureScreenshot).not.toHaveBeenCalled();
  });

  it('confirm region crops the captured blob to the selection dimensions', async () => {
    const stub = installCropStub();
    try {
      const fullBlob = new Blob(['full'], { type: 'image/webp' });
      captureScreenshot.mockResolvedValueOnce(fullBlob);
      // Pin dpr so the crop math is deterministic under the test.
      vi.stubGlobal('devicePixelRatio', 2);
      const wrapper = mountFab();
      await openOverlay(wrapper);
      await drag(wrapper, { x: 10, y: 20 }, { x: 210, y: 120 });
      await findByText(
        wrapper,
        '[data-testid="brw-region-overlay"] button',
        'Capture',
      )!.trigger('click');
      await flushPromises();

      expect(
        wrapper.find('button[aria-label="Remove screenshot"]').exists(),
      ).toBe(true);
      expect(captureScreenshot).toHaveBeenCalledTimes(1);
      // Crop call: drawImage(img, sx=dpr*x, sy=dpr*y, sw=dpr*w, sh=dpr*h, 0, 0, w, h)
      expect(stub.drawImageArgs).toHaveLength(1);
      const [, sx, sy, sw, sh, dx, dy, dw, dh] = stub.drawImageArgs[0]!;
      expect(sx).toBe(20); // 10 * dpr
      expect(sy).toBe(40); // 20 * dpr
      expect(sw).toBe(400); // 200 * dpr
      expect(sh).toBe(200); // 100 * dpr
      expect(dx).toBe(0);
      expect(dy).toBe(0);
      expect(dw).toBe(200);
      expect(dh).toBe(100);
    } finally {
      vi.unstubAllGlobals();
      stub.restore();
    }
  });

  it('keeps the panel hidden through a "Capture full page" round-trip until the capture lands', async () => {
    let release: (b: Blob) => void = () => undefined;
    captureScreenshot.mockReturnValueOnce(
      new Promise<Blob>((resolve) => {
        release = resolve;
      }),
    );
    const wrapper = mountFab();
    await openOverlay(wrapper);
    await findByText(
      wrapper,
      '[data-testid="brw-region-overlay"] button',
      'Capture full page',
    )!.trigger('click');

    // Overlay unmounts immediately so the in-flight capture can't snapshot
    // its chrome; the panel is visible again while the capture resolves.
    expect(getOverlay(wrapper).exists()).toBe(false);
    expect(wrapper.find('[role="dialog"].brw-panel').classes()).not.toContain(
      'brw-panel-hidden',
    );

    release(new Blob(['x'], { type: 'image/png' }));
    await flushPromises();
    expect(
      wrapper.find('button[aria-label="Remove screenshot"]').exists(),
    ).toBe(true);
  });

  it('every overlay node carries data-brevwick-skip so a capture never sees overlay chrome', async () => {
    const wrapper = mountFab();
    await openOverlay(wrapper);
    const overlay = getOverlay(wrapper);
    expect(overlay.attributes('data-brevwick-skip')).toBe('');
    expect(
      overlay.find('.brw-region-controls').attributes('data-brevwick-skip'),
    ).toBe('');
  });

  it('Enter on the overlay root confirms a valid region selection', async () => {
    const stub = installCropStub();
    try {
      captureScreenshot.mockResolvedValueOnce(
        new Blob(['full'], { type: 'image/webp' }),
      );
      // Unset DPR (legacy engines) exercises the `|| 1` fallback in the
      // crop math.
      vi.stubGlobal('devicePixelRatio', undefined);
      const wrapper = mountFab();
      await openOverlay(wrapper);
      await drag(wrapper, { x: 10, y: 20 }, { x: 210, y: 120 });

      // Keys other than Enter, and Enter bubbled up from an overlay control,
      // must not run the region-confirm path.
      await getOverlay(wrapper).trigger('keydown', { key: 'a' });
      await findByText(
        wrapper,
        '[data-testid="brw-region-overlay"] button',
        'Cancel',
      )!.trigger('keydown', { key: 'Enter' });
      expect(captureScreenshot).not.toHaveBeenCalled();
      expect(getOverlay(wrapper).exists()).toBe(true);

      await getOverlay(wrapper).trigger('keydown', { key: 'Enter' });
      await flushPromises();

      // The overlay closed and the cropped capture landed as a chip — the
      // keyboard path is equivalent to clicking Capture.
      expect(getOverlay(wrapper).exists()).toBe(false);
      expect(captureScreenshot).toHaveBeenCalledTimes(1);
      expect(stub.drawImageArgs).toHaveLength(1);
      expect(
        wrapper.find('button[aria-label="Remove screenshot"]').exists(),
      ).toBe(true);
    } finally {
      vi.unstubAllGlobals();
      stub.restore();
    }
  });

  it('rapid-fire degenerate confirms replace the shake timer; the shake settles after 320 ms', async () => {
    const wrapper = mountFab();
    await openOverlay(wrapper);
    vi.useFakeTimers();
    try {
      const capture = findByText(
        wrapper,
        '[data-testid="brw-region-overlay"] button',
        'Capture',
      )!;
      await capture.trigger('click');
      expect(getOverlay(wrapper).classes()).toContain('brw-region-shake');
      // Second degenerate confirm while the settle timer is pending —
      // replaces (clears) the in-flight timer instead of stacking.
      await capture.trigger('click');
      expect(getOverlay(wrapper).classes()).toContain('brw-region-shake');
      expect(vi.getTimerCount()).toBe(1);

      vi.advanceTimersByTime(320);
      await wrapper.vm.$nextTick();
      expect(getOverlay(wrapper).classes()).not.toContain('brw-region-shake');
      // Overlay survives the shake; capture was never invoked.
      expect(getOverlay(wrapper).exists()).toBe(true);
      expect(captureScreenshot).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('pointerdown on overlay children or with a non-primary button never starts a drag', async () => {
    const wrapper = mountFab();
    await openOverlay(wrapper);
    const overlay = getOverlay(wrapper);

    // Bubbled pointerdown from the controls strip (target !== currentTarget).
    await overlay.find('.brw-region-controls').trigger('pointerdown', {
      clientX: 5,
      clientY: 5,
      pointerId: 1,
      button: 0,
    });
    // Right-click directly on the overlay layer.
    await overlay.trigger('pointerdown', {
      clientX: 5,
      clientY: 5,
      pointerId: 1,
      button: 2,
    });
    // Move/up without an active drag are no-ops, not crashes.
    await overlay.trigger('pointermove', {
      clientX: 80,
      clientY: 90,
      pointerId: 1,
    });
    await overlay.trigger('pointerup', {
      clientX: 80,
      clientY: 90,
      pointerId: 1,
    });

    expect(wrapper.find('[data-testid="brw-region-selection"]').exists()).toBe(
      false,
    );
  });

  it('uses OffscreenCanvas for the crop when available and delivers its convertToBlob output', async () => {
    const originalImageSrc = Object.getOwnPropertyDescriptor(
      HTMLImageElement.prototype,
      'src',
    );
    Object.defineProperty(HTMLImageElement.prototype, 'src', {
      configurable: true,
      get() {
        return (this as { _brwSrc?: string })._brwSrc ?? '';
      },
      set(value: string) {
        (this as { _brwSrc?: string })._brwSrc = value;
        queueMicrotask(() => {
          const self = this as HTMLImageElement & {
            onload?: ((ev: Event) => void) | null;
          };
          self.onload?.(new Event('load'));
        });
      },
    });

    const drawImageCalls: unknown[][] = [];
    class OffscreenCanvasStub {
      public readonly width: number;
      public readonly height: number;
      constructor(width: number, height: number) {
        this.width = width;
        this.height = height;
      }
      getContext(
        kind: string,
      ): { drawImage: (...args: unknown[]) => void } | null {
        if (kind !== '2d') return null;
        return {
          drawImage: (...args: unknown[]) => {
            drawImageCalls.push(args);
          },
        };
      }
      convertToBlob(options: { type: string }): Promise<Blob> {
        return Promise.resolve(
          new Blob([`offscreen:${this.width}x${this.height}`], {
            type: options.type,
          }),
        );
      }
    }

    const originalOffscreen = (globalThis as { OffscreenCanvas?: unknown })
      .OffscreenCanvas;
    (globalThis as { OffscreenCanvas?: unknown }).OffscreenCanvas =
      OffscreenCanvasStub;

    try {
      captureScreenshot.mockResolvedValueOnce(
        new Blob(['full'], { type: 'image/webp' }),
      );
      submit.mockResolvedValueOnce({ ok: true, issue_id: 'rep_offscreen' });
      vi.stubGlobal('devicePixelRatio', 2);
      const wrapper = mountFab();
      await openOverlay(wrapper);
      await drag(wrapper, { x: 10, y: 20 }, { x: 210, y: 120 });
      await findByText(
        wrapper,
        '[data-testid="brw-region-overlay"] button',
        'Capture',
      )!.trigger('click');
      await flushPromises();

      expect(
        wrapper.find('button[aria-label="Remove screenshot"]').exists(),
      ).toBe(true);
      // Crop ran on the OffscreenCanvas stub with DPR-scaled source args.
      expect(drawImageCalls).toHaveLength(1);
      const [, sx, sy, sw, sh, , , dw, dh] = drawImageCalls[0]!;
      expect([sx, sy, sw, sh]).toEqual([20, 40, 400, 200]);
      expect([dw, dh]).toEqual([200, 100]);
      // The convertToBlob output (image/png) is what rides the submit —
      // not the <canvas> fallback.
      await typeDraft(wrapper, 'offscreen crop');
      await clickSend(wrapper);
      const input = submit.mock.calls[0]![0] as {
        attachments: Array<{ blob: Blob; filename: string }>;
      };
      expect(input.attachments[0]!.filename).toBe('screenshot.png');
      const text = await input.attachments[0]!.blob.text();
      expect(text).toBe('offscreen:200x100');
    } finally {
      vi.unstubAllGlobals();
      if (originalImageSrc) {
        Object.defineProperty(
          HTMLImageElement.prototype,
          'src',
          originalImageSrc,
        );
      }
      if (originalOffscreen !== undefined) {
        (globalThis as { OffscreenCanvas?: unknown }).OffscreenCanvas =
          originalOffscreen;
      } else {
        delete (globalThis as { OffscreenCanvas?: unknown }).OffscreenCanvas;
      }
    }
  });

  // Regression for the OffscreenCanvas feature-detect (Copilot PR #158):
  // some environments expose `OffscreenCanvas` without `convertToBlob`.
  // Gating on presence alone threw there; the `'convertToBlob' in
  // OffscreenCanvas.prototype` guard routes to the `<canvas>.toBlob`
  // fallback instead. The partial OffscreenCanvas must never be constructed
  // and the delivered blob is the canvas output (`cropped:…`).
  it('falls back to <canvas>.toBlob when OffscreenCanvas lacks convertToBlob', async () => {
    const stub = installCropStub();
    let offscreenConstructed = false;
    class OffscreenCanvasNoConvert {
      constructor() {
        offscreenConstructed = true;
      }
      getContext(): null {
        return null;
      }
    }
    const originalOffscreen = (globalThis as { OffscreenCanvas?: unknown })
      .OffscreenCanvas;
    (globalThis as { OffscreenCanvas?: unknown }).OffscreenCanvas =
      OffscreenCanvasNoConvert;
    try {
      captureScreenshot.mockResolvedValueOnce(
        new Blob(['full'], { type: 'image/webp' }),
      );
      submit.mockResolvedValueOnce({ ok: true, issue_id: 'rep_fallback' });
      vi.stubGlobal('devicePixelRatio', 2);
      const wrapper = mountFab();
      await openOverlay(wrapper);
      await drag(wrapper, { x: 10, y: 20 }, { x: 210, y: 120 });
      await findByText(
        wrapper,
        '[data-testid="brw-region-overlay"] button',
        'Capture',
      )!.trigger('click');
      await flushPromises();

      expect(
        wrapper.find('button[aria-label="Remove screenshot"]').exists(),
      ).toBe(true);
      // The partial OffscreenCanvas was skipped on the missing convertToBlob.
      expect(offscreenConstructed).toBe(false);
      expect(stub.drawImageArgs).toHaveLength(1);
      await typeDraft(wrapper, 'fallback crop');
      await clickSend(wrapper);
      const input = submit.mock.calls[0]![0] as {
        attachments: Array<{ blob: Blob; filename: string }>;
      };
      expect(input.attachments[0]!.filename).toBe('screenshot.png');
      const text = await input.attachments[0]!.blob.text();
      expect(text).toBe('cropped:200x100');
    } finally {
      vi.unstubAllGlobals();
      if (originalOffscreen !== undefined) {
        (globalThis as { OffscreenCanvas?: unknown }).OffscreenCanvas =
          originalOffscreen;
      } else {
        delete (globalThis as { OffscreenCanvas?: unknown }).OffscreenCanvas;
      }
      stub.restore();
    }
  });
});

describe('<FeedbackButton> — Use AI toggle', () => {
  function queryAiToggle(wrapper: VueWrapper<unknown>): HTMLElement | null {
    const el = wrapper.find(
      'button[role="switch"][aria-label="Format with AI"]',
    );
    return el.exists() ? (el.element as HTMLElement) : null;
  }

  it('does not fetch config on mount — only on first panel open', async () => {
    getConfig.mockResolvedValue({
      ai_enabled: true,
      ai_submitter_choice_allowed: true,
    });
    const wrapper = mountFab();
    expect(getConfig).not.toHaveBeenCalled();
    await openPanel(wrapper);
    expect(getConfig).toHaveBeenCalledTimes(1);
  });

  it('only fetches once across multiple opens (cache reused)', async () => {
    getConfig.mockResolvedValue({
      ai_enabled: true,
      ai_submitter_choice_allowed: true,
    });
    const wrapper = mountFab();
    await openPanel(wrapper);
    expect(getConfig).toHaveBeenCalledTimes(1);

    await wrapper.find('button[aria-label="Minimize"]').trigger('click');
    expect(wrapper.find('[role="dialog"]').exists()).toBe(false);

    await openPanel(wrapper);
    expect(getConfig).toHaveBeenCalledTimes(1);
  });

  it('hides the toggle when ai_enabled=false and omits use_ai', async () => {
    getConfig.mockResolvedValue({
      ai_enabled: false,
      ai_submitter_choice_allowed: true,
    });
    submit.mockResolvedValueOnce({ ok: true, issue_id: 'rep_disabled' });
    const wrapper = mountFab();
    await openPanel(wrapper);
    expect(queryAiToggle(wrapper)).toBeNull();
    await typeDraft(wrapper, 'hi');
    await clickSend(wrapper);
    const input = submit.mock.calls[0]![0] as Record<string, unknown>;
    expect('use_ai' in input).toBe(false);
  });

  it('hides the toggle when choice is not allowed and omits use_ai', async () => {
    getConfig.mockResolvedValue({
      ai_enabled: true,
      ai_submitter_choice_allowed: false,
    });
    submit.mockResolvedValueOnce({ ok: true, issue_id: 'rep_forced' });
    const wrapper = mountFab();
    await openPanel(wrapper);
    expect(queryAiToggle(wrapper)).toBeNull();
    await typeDraft(wrapper, 'admin-forced');
    await clickSend(wrapper);
    const input = submit.mock.calls[0]![0] as Record<string, unknown>;
    expect('use_ai' in input).toBe(false);
  });

  it('renders the toggle default-on when ai_enabled + choice_allowed; payload carries use_ai=true', async () => {
    getConfig.mockResolvedValue({
      ai_enabled: true,
      ai_submitter_choice_allowed: true,
    });
    submit.mockResolvedValueOnce({ ok: true, issue_id: 'rep_choice_on' });
    const wrapper = mountFab();
    await openPanel(wrapper);
    const toggle = queryAiToggle(wrapper);
    expect(toggle).not.toBeNull();
    expect(toggle?.getAttribute('aria-checked')).toBe('true');
    expect(toggle?.className).toMatch(/brw-aitoggle--on/);
    await typeDraft(wrapper, 'with ai');
    await clickSend(wrapper);
    const input = submit.mock.calls[0]![0] as Record<string, unknown>;
    expect(input.use_ai).toBe(true);
  });

  it('click flips the toggle off and payload carries use_ai=false', async () => {
    getConfig.mockResolvedValue({
      ai_enabled: true,
      ai_submitter_choice_allowed: true,
    });
    submit.mockResolvedValueOnce({ ok: true, issue_id: 'rep_choice_off' });
    const wrapper = mountFab();
    await openPanel(wrapper);
    const toggleWrap = wrapper.find(
      'button[role="switch"][aria-label="Format with AI"]',
    );
    await toggleWrap.trigger('click');
    expect(toggleWrap.attributes('aria-checked')).toBe('false');
    expect(toggleWrap.classes()).not.toContain('brw-aitoggle--on');

    await typeDraft(wrapper, 'without ai');
    await clickSend(wrapper);
    const input = submit.mock.calls[0]![0] as Record<string, unknown>;
    expect(input.use_ai).toBe(false);
  });

  it('Space toggles when focused (keyboard a11y)', async () => {
    getConfig.mockResolvedValue({
      ai_enabled: true,
      ai_submitter_choice_allowed: true,
    });
    const wrapper = mountFab();
    await openPanel(wrapper);
    const toggle = wrapper.find(
      'button[role="switch"][aria-label="Format with AI"]',
    );
    await toggle.trigger('keydown', { key: ' ' });
    expect(toggle.attributes('aria-checked')).toBe('false');
    await toggle.trigger('keydown', { key: ' ' });
    expect(toggle.attributes('aria-checked')).toBe('true');
  });

  it('config fetch resolves to null → widget still works, no toggle, use_ai omitted', async () => {
    getConfig.mockResolvedValue(null);
    submit.mockResolvedValueOnce({ ok: true, issue_id: 'rep_null_cfg' });
    const wrapper = mountFab();
    await openPanel(wrapper);
    expect(queryAiToggle(wrapper)).toBeNull();
    await typeDraft(wrapper, 'fallback');
    await clickSend(wrapper);
    const input = submit.mock.calls[0]![0] as Record<string, unknown>;
    expect('use_ai' in input).toBe(false);
  });

  it('config fetch rejects → no toggle, submit still works and omits use_ai', async () => {
    getConfig.mockRejectedValueOnce(new Error('cfg boom'));
    submit.mockResolvedValueOnce({ ok: true, issue_id: 'rep_cfg_err' });
    const wrapper = mountFab();
    await openPanel(wrapper);
    expect(queryAiToggle(wrapper)).toBeNull();
    await typeDraft(wrapper, 'cfg error path');
    await clickSend(wrapper);
    const input = submit.mock.calls[0]![0] as Record<string, unknown>;
    expect('use_ai' in input).toBe(false);
  });
});

/**
 * Phase-driven staged-status rows (#74). The bus-emitted phase events drive
 * a 3-row cascade (Captured → Sanitised → Formatting with AI). Failure
 * collapses the in-progress row to a red retry row covering every
 * SubmitErrorCode.
 */
describe('<FeedbackButton> staged-status UX (#74)', () => {
  function parkSubmit(): void {
    submit.mockReturnValueOnce(new Promise<SubmitResult>(() => undefined));
  }

  function getStatusRow(
    wrapper: VueWrapper<unknown>,
    name: 'captured' | 'sanitised' | 'formatting' | 'error',
  ): HTMLElement | null {
    const el = wrapper.find(`[data-brw-row="${name}"]`);
    return el.exists() ? (el.element as HTMLElement) : null;
  }

  it('Three staged rows render in order as phase events arrive', async () => {
    parkSubmit();
    getConfig.mockResolvedValue({
      ai_enabled: true,
      ai_submitter_choice_allowed: false,
    });
    const wrapper = mountFab();
    await openPanel(wrapper);
    await typeDraft(wrapper, 'staged-rows-test');
    await wrapper.find('button.brw-send-btn').trigger('click');
    await flushPromises();

    expect(getStatusRow(wrapper, 'captured')).toBeNull();
    expect(getStatusRow(wrapper, 'sanitised')).toBeNull();
    expect(getStatusRow(wrapper, 'formatting')).toBeNull();

    phaseBus.emit('phase', { phase: 'capturing-done' });
    await flushPromises();
    expect(getStatusRow(wrapper, 'captured')).not.toBeNull();
    expect(getStatusRow(wrapper, 'sanitised')).toBeNull();
    expect(getStatusRow(wrapper, 'formatting')).toBeNull();

    phaseBus.emit('phase', { phase: 'sanitising-done' });
    await flushPromises();
    expect(getStatusRow(wrapper, 'captured')).not.toBeNull();
    expect(getStatusRow(wrapper, 'sanitised')).not.toBeNull();
    expect(getStatusRow(wrapper, 'formatting')).not.toBeNull();
  });

  it('AI row is suppressed when getConfig().ai_enabled === false', async () => {
    parkSubmit();
    getConfig.mockResolvedValue({
      ai_enabled: false,
      ai_submitter_choice_allowed: false,
    });
    const wrapper = mountFab();
    await openPanel(wrapper);
    expect(getConfig).toHaveBeenCalled();

    await typeDraft(wrapper, 'non-ai-project');
    await wrapper.find('button.brw-send-btn').trigger('click');
    await flushPromises();
    phaseBus.emit('phase', { phase: 'capturing-done' });
    phaseBus.emit('phase', { phase: 'sanitising-done' });
    await flushPromises();

    expect(getStatusRow(wrapper, 'captured')).not.toBeNull();
    expect(getStatusRow(wrapper, 'sanitised')).not.toBeNull();
    expect(getStatusRow(wrapper, 'formatting')).toBeNull();
  });

  it('Reduced motion renders all rows with 0 ms transition delay (no stagger)', async () => {
    // happy-dom always exposes window.matchMedia, but guard against the
    // off-chance a future runtime swap drops it. The TS narrowing means we
    // don't touch the spy when there's nothing to spy on.
    let mqSpy: MockInstance | undefined;
    if (
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function'
    ) {
      mqSpy = vi.spyOn(window, 'matchMedia').mockImplementation(
        (query: string) =>
          ({
            matches: query.includes('prefers-reduced-motion'),
            media: query,
            onchange: null,
            addListener: () => undefined,
            removeListener: () => undefined,
            addEventListener: () => undefined,
            removeEventListener: () => undefined,
            dispatchEvent: () => false,
          }) as unknown as MediaQueryList,
      );
    }
    try {
      parkSubmit();
      getConfig.mockResolvedValue({
        ai_enabled: true,
        ai_submitter_choice_allowed: false,
      });
      const wrapper = mountFab();
      await openPanel(wrapper);
      await typeDraft(wrapper, 'reduced-motion-test');
      await wrapper.find('button.brw-send-btn').trigger('click');
      await flushPromises();
      phaseBus.emit('phase', { phase: 'capturing-done' });
      phaseBus.emit('phase', { phase: 'sanitising-done' });
      await flushPromises();

      const rows = document.querySelectorAll<HTMLElement>('[data-brw-row]');
      expect(rows.length).toBeGreaterThan(0);
      for (const row of rows) {
        expect(row.style.animationDelay).toBe('0ms');
      }
    } finally {
      mqSpy?.mockRestore();
    }
  });

  it.each([
    'ATTACHMENT_UPLOAD_FAILED',
    'INGEST_REJECTED',
    'INGEST_RETRY_EXHAUSTED',
    'INGEST_TIMEOUT',
    'INGEST_INVALID_RESPONSE',
  ] as const)(
    'renders a red retry row with the verbatim message + working Retry CTA on %s',
    async (code) => {
      const message = `synthetic-${code}-message`;
      submit.mockResolvedValueOnce({
        ok: false,
        error: { code, message },
      });
      const wrapper = mountFab();
      await openPanel(wrapper);
      await typeDraft(wrapper, `failure-${code}`);
      await clickSend(wrapper);

      const row = getStatusRow(wrapper, 'error');
      expect(row).not.toBeNull();
      expect(row?.getAttribute('role')).toBe('alert');
      expect(row?.getAttribute('data-brw-error-code')).toBe(code);
      expect(row?.textContent).toContain(message);

      submit.mockResolvedValueOnce({
        ok: true,
        issue_id: `rep_retry_${code}`,
      });
      await wrapper.find('.brw-status-row-retry').trigger('click');
      await flushPromises();
      expect(submit).toHaveBeenCalledTimes(2);
      expect(
        (submit.mock.calls[1]![0] as { description: string }).description,
      ).toBe(`failure-${code}`);
    },
  );
});

describe('<FeedbackButton> — debug raw payload (config.debug)', () => {
  it('renders a copy-raw button on the sent bubble when the result carries debug.payload', async () => {
    submit.mockResolvedValueOnce({
      ok: true,
      issue_id: 'rep_dbg',
      debug: {
        payload: {
          description: 'Broken',
          console_errors: [],
          network_calls: [],
        },
      },
    });
    const wrapper = mountFab();
    await openPanel(wrapper);
    await typeDraft(wrapper, 'Broken');
    await clickSend(wrapper);

    const copyBtn = wrapper.find('button[data-brw-copy-raw]');
    expect(copyBtn.exists()).toBe(true);
    expect(copyBtn.text()).toBe('Copy raw payload');
  });

  it('omits the copy-raw button when the result has no debug payload', async () => {
    submit.mockResolvedValueOnce({ ok: true, issue_id: 'rep_nodbg' });
    const wrapper = mountFab();
    await openPanel(wrapper);
    await typeDraft(wrapper, 'Broken');
    await clickSend(wrapper);

    expect(wrapper.text()).toContain('Broken');
    expect(wrapper.find('button[data-brw-copy-raw]').exists()).toBe(false);
  });

  it('copies the pretty-printed payload to the clipboard and flips to "Copied!"', async () => {
    const writeText = vi
      .fn<(text: string) => Promise<void>>()
      .mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    });
    const payload = {
      description: 'Broken',
      console_errors: [{ level: 'error', message: 'boom' }],
    };
    submit.mockResolvedValueOnce({
      ok: true,
      issue_id: 'rep_copy',
      debug: { payload },
    });
    const wrapper = mountFab();
    await openPanel(wrapper);
    await typeDraft(wrapper, 'Broken');
    await clickSend(wrapper);

    await wrapper.find('button[data-brw-copy-raw]').trigger('click');
    await flushPromises();

    expect(writeText).toHaveBeenCalledWith(JSON.stringify(payload, null, 2));
    expect(wrapper.find('button[data-brw-copy-raw]').text()).toBe('Copied!');
  });

  it('is a no-op when the clipboard API is unavailable', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      value: undefined,
      configurable: true,
    });
    submit.mockResolvedValueOnce({
      ok: true,
      issue_id: 'rep_noclip',
      debug: { payload: { description: 'Broken' } },
    });
    const wrapper = mountFab();
    await openPanel(wrapper);
    await typeDraft(wrapper, 'Broken');
    await clickSend(wrapper);

    const btn = wrapper.find('button[data-brw-copy-raw]');
    await btn.trigger('click');
    await flushPromises();
    // No throw, label unchanged.
    expect(wrapper.find('button[data-brw-copy-raw]').text()).toBe(
      'Copy raw payload',
    );
  });

  it('recovers when the clipboard write is rejected', async () => {
    const writeText = vi
      .fn<(text: string) => Promise<void>>()
      .mockRejectedValue(new Error('denied'));
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    });
    submit.mockResolvedValueOnce({
      ok: true,
      issue_id: 'rep_rej',
      debug: { payload: { description: 'Broken' } },
    });
    const wrapper = mountFab();
    await openPanel(wrapper);
    await typeDraft(wrapper, 'Broken');
    await clickSend(wrapper);

    await wrapper.find('button[data-brw-copy-raw]').trigger('click');
    await flushPromises();
    expect(writeText).toHaveBeenCalled();
    expect(wrapper.find('button[data-brw-copy-raw]').text()).toBe(
      'Copy raw payload',
    );
  });
});
