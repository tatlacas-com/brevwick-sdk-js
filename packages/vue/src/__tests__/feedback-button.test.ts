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

  // Screenshot UI is disabled in v1 of the Vue widget — the composable's
  // captureScreenshot() is exposed but no trigger button renders. Mirrors
  // PR #111's `.skip` convention so the scenarios stay visible while we
  // wait for the Vue region-overlay port.
  it.skip('attaches a screenshot via captureScreenshot and renders a chip', () => {
    void captureScreenshot;
  });
  it.skip('derives the screenshot attachment extension from its MIME type', () => {
    void captureScreenshot;
  });
  it.skip('surfaces an error when captureScreenshot rejects', () => {
    void captureScreenshot;
  });
  it.skip('region-overlay confirm full crops to the viewport rectangle', () => {
    void captureScreenshot;
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
        payload: { description: 'Broken', console_errors: [], network_calls: [] },
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
});
