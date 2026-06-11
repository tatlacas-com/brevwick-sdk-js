import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  Brevwick,
  BrevwickConfig,
  ProjectConfig,
  SubmitResult,
} from '@tatlacas/brevwick-sdk';

const install = vi.fn();
const uninstall = vi.fn();
const submit = vi.fn();
const captureScreenshot = vi.fn();
const getConfig = vi.fn();
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

import { BwFeedbackButtonComponent } from '../components/feedback-button.component';
import { provideBrevwick } from '../provide-brevwick';

/**
 * Builds a structurally-complete `Brevwick` mock. The phase-bus listener the
 * service registers needs `_internal.bus.on/off` to exist; otherwise the
 * service silently skips subscription. Tests that don't drive phase events
 * still benefit from a no-op bus so the registration path is exercised.
 */
const makeInstance = (): Brevwick => {
  const listeners = new Set<(payload: unknown) => void>();
  const bus = {
    on: (_: string, l: (payload: unknown) => void) => listeners.add(l),
    off: (_: string, l: (payload: unknown) => void) => listeners.delete(l),
    emit: (payload: unknown) => listeners.forEach((l) => l(payload)),
  };
  return {
    install,
    uninstall,
    submit,
    captureScreenshot,
    getConfig,
    _internal: { bus },
  } as unknown as Brevwick;
};

beforeEach(() => {
  vi.clearAllMocks();
  createBrevwick.mockReturnValue(makeInstance());
  // Default: no project config — AI toggle stays hidden across the suite.
  // Tests that need the toggle override this with their own resolved value.
  getConfig.mockResolvedValue(null);
});

/**
 * Internal-shape escape hatch used by the tests. Mirrors the canonical
 * Angular pattern of casting through a narrow interface to drive
 * `protected` signals — keeps the component's public surface honest while
 * letting specs poke at the state without simulating every DOM event.
 */
interface ComponentInternals {
  open: { set: (v: boolean) => void };
  draft: { set: (v: string) => void };
  expected: { set: (v: string) => void };
  actual: { set: (v: string) => void };
  showExtras: { set: (v: boolean) => void };
  files: { set: (v: ReadonlyArray<{ id: number; file: File }>) => void };
  projectConfig: {
    set: (v: { status: string; config: ProjectConfig | null }) => void;
  };
  reducedMotion: { set: (v: boolean) => void };
  useAi: { set: (v: boolean) => void };
  lastSubmittedInput: { set: (v: unknown) => void };
  doSubmit: () => Promise<void>;
  onRetryClick: () => Promise<void>;
  toggleAi: () => void;
  relativeTime: (ms: number | undefined) => string;
  size: (bytes: number) => string;
}

const internals = (cmp: BwFeedbackButtonComponent): ComponentInternals =>
  cmp as unknown as ComponentInternals;

describe('BwFeedbackButtonComponent', () => {
  // ── Render gates ─────────────────────────────────────────────────────────

  it('renders a FAB on first paint with the default label', () => {
    TestBed.configureTestingModule({
      imports: [BwFeedbackButtonComponent],
      providers: [provideBrevwick({ projectKey: 'pk_test_fab' })],
    });
    const fixture = TestBed.createComponent(BwFeedbackButtonComponent);
    fixture.detectChanges();
    const button = fixture.nativeElement.querySelector(
      'button.brw-fab',
    ) as HTMLButtonElement | null;
    expect(button).not.toBeNull();
    expect(button?.textContent?.trim()).toContain('Feedback');
    expect(button?.getAttribute('data-brevwick-skip')).not.toBeNull();
    // Zero-config default changed in vNEXT: right-edge vertical tab, not
    // the legacy bottom-right bubble.
    expect(button?.classList.contains('brw-fab--tab')).toBe(true);
    expect(button?.classList.contains('brw-fab-r')).toBe(true);
    expect(button?.getAttribute('data-brw-variant')).toBe('tab');
  });

  it('renders nothing when [hidden] is set', () => {
    TestBed.configureTestingModule({
      imports: [BwFeedbackButtonComponent],
      providers: [provideBrevwick({ projectKey: 'pk_test_hidden' })],
    });
    const fixture = TestBed.createComponent(BwFeedbackButtonComponent);
    fixture.componentRef.setInput('hidden', true);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('button.brw-fab')).toBeNull();
  });

  it('forwards the theme input to data-brw-theme on FAB and panel', () => {
    TestBed.configureTestingModule({
      imports: [BwFeedbackButtonComponent],
      providers: [provideBrevwick({ projectKey: 'pk_test_theme' })],
    });
    const fixture = TestBed.createComponent(BwFeedbackButtonComponent);
    fixture.componentRef.setInput('theme', 'dark');
    fixture.detectChanges();
    const fab = fixture.nativeElement.querySelector(
      'button.brw-fab',
    ) as HTMLButtonElement;
    expect(fab.getAttribute('data-brw-theme')).toBe('dark');
    fab.click();
    fixture.detectChanges();
    const panel = fixture.nativeElement.querySelector('.brw-panel');
    expect(panel?.getAttribute('data-brw-theme')).toBe('dark');
  });

  // ── Open / minimize / discard ────────────────────────────────────────────

  it('opens the panel + greeting bubble when the FAB is clicked', () => {
    TestBed.configureTestingModule({
      imports: [BwFeedbackButtonComponent],
      providers: [provideBrevwick({ projectKey: 'pk_test_open' })],
    });
    const fixture = TestBed.createComponent(BwFeedbackButtonComponent);
    fixture.detectChanges();
    (
      fixture.nativeElement.querySelector('button.brw-fab') as HTMLButtonElement
    ).click();
    fixture.detectChanges();
    const panel = fixture.nativeElement.querySelector('.brw-panel');
    expect(panel).not.toBeNull();
    const greeting = fixture.nativeElement.querySelector(
      '.brw-bubble--assistant',
    );
    expect(greeting?.textContent).toContain('Tell us');
    const composer = fixture.nativeElement.querySelector('.brw-composer-input');
    expect(composer).not.toBeNull();
  });

  it('shows discard confirm when the user closes a panel with content', () => {
    TestBed.configureTestingModule({
      imports: [BwFeedbackButtonComponent],
      providers: [provideBrevwick({ projectKey: 'pk_test_discard' })],
    });
    const fixture = TestBed.createComponent(BwFeedbackButtonComponent);
    fixture.detectChanges();
    const cmp = fixture.componentInstance;
    (
      fixture.nativeElement.querySelector('button.brw-fab') as HTMLButtonElement
    ).click();
    internals(cmp).draft.set('half-typed');
    fixture.detectChanges();
    const closeBtn = fixture.nativeElement.querySelector(
      '.brw-icon-btn[aria-label="Close"]',
    ) as HTMLButtonElement;
    closeBtn.click();
    fixture.detectChanges();
    const confirm = fixture.nativeElement.querySelector('.brw-confirm');
    expect(confirm).not.toBeNull();
    expect(confirm?.textContent).toContain('Discard your feedback');
  });

  it('keeps draft + closes panel when the user clicks Minimize', () => {
    TestBed.configureTestingModule({
      imports: [BwFeedbackButtonComponent],
      providers: [provideBrevwick({ projectKey: 'pk_test_minimize' })],
    });
    const fixture = TestBed.createComponent(BwFeedbackButtonComponent);
    fixture.detectChanges();
    const cmp = fixture.componentInstance;
    (
      fixture.nativeElement.querySelector('button.brw-fab') as HTMLButtonElement
    ).click();
    internals(cmp).draft.set('keep me');
    fixture.detectChanges();
    const minBtn = fixture.nativeElement.querySelector(
      '.brw-icon-btn[aria-label="Minimize"]',
    ) as HTMLButtonElement;
    minBtn.click();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.brw-panel')).toBeNull();
    // Re-open: draft should still be there.
    (
      fixture.nativeElement.querySelector('button.brw-fab') as HTMLButtonElement
    ).click();
    fixture.detectChanges();
    const composer = fixture.nativeElement.querySelector(
      '.brw-composer-input',
    ) as HTMLTextAreaElement;
    expect(composer.value).toBe('keep me');
  });

  // ── Composer state + canSend ─────────────────────────────────────────────

  it('send button stays disabled while the draft is empty', () => {
    TestBed.configureTestingModule({
      imports: [BwFeedbackButtonComponent],
      providers: [provideBrevwick({ projectKey: 'pk_test_disabled' })],
    });
    const fixture = TestBed.createComponent(BwFeedbackButtonComponent);
    fixture.detectChanges();
    (
      fixture.nativeElement.querySelector('button.brw-fab') as HTMLButtonElement
    ).click();
    fixture.detectChanges();
    const send = fixture.nativeElement.querySelector(
      '.brw-send-btn',
    ) as HTMLButtonElement;
    expect(send.disabled).toBe(true);
  });

  it('Enter triggers submit; Shift+Enter does not', async () => {
    submit.mockResolvedValueOnce({ ok: true, issue_id: 'kbd-1' });
    TestBed.configureTestingModule({
      imports: [BwFeedbackButtonComponent],
      providers: [provideBrevwick({ projectKey: 'pk_test_enter' })],
    });
    const fixture = TestBed.createComponent(BwFeedbackButtonComponent);
    fixture.detectChanges();
    const cmp = fixture.componentInstance;
    (
      fixture.nativeElement.querySelector('button.brw-fab') as HTMLButtonElement
    ).click();
    internals(cmp).draft.set('hello world');
    fixture.detectChanges();
    const composer = fixture.nativeElement.querySelector(
      '.brw-composer-input',
    ) as HTMLTextAreaElement;

    // Shift+Enter is not consumed — does not call submit.
    composer.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', shiftKey: true }),
    );
    expect(submit).not.toHaveBeenCalled();

    // Plain Enter — submit fires.
    composer.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    // Yield for the async submit chain to flush before asserting.
    await Promise.resolve();
    await Promise.resolve();
    expect(submit).toHaveBeenCalledTimes(1);
  });

  // ── Submit semantics: title/description split + raw body fix ─────────────

  it('submit derives title from first line and sends raw description (PR #111)', async () => {
    submit.mockResolvedValueOnce({ ok: true, issue_id: 'cmp-1' });
    TestBed.configureTestingModule({
      imports: [BwFeedbackButtonComponent],
      providers: [provideBrevwick({ projectKey: 'pk_test_emit' })],
    });
    const fixture = TestBed.createComponent(BwFeedbackButtonComponent);
    fixture.detectChanges();
    const cmp = fixture.componentInstance;
    const events: unknown[] = [];
    cmp.submit.subscribe((e) => events.push(e));
    // Leading whitespace + multi-line: title is the first non-empty line
    // trimmed; description is the **raw** draft (PR #111 contract).
    const raw = '  Bug header\n\n   indented body\nline 3   ';
    internals(cmp).draft.set(raw);
    await internals(cmp).doSubmit();
    expect(submit).toHaveBeenCalledTimes(1);
    expect(submit.mock.calls[0]![0]).toMatchObject({
      title: 'Bug header',
      description: raw,
    });
    expect(events).toEqual([{ ok: true, issue_id: 'cmp-1' }]);
  });

  it('rolls expected/actual + files into the payload', async () => {
    submit.mockResolvedValueOnce({ ok: true, issue_id: 'cmp-extra' });
    TestBed.configureTestingModule({
      imports: [BwFeedbackButtonComponent],
      providers: [provideBrevwick({ projectKey: 'pk_test_extra' })],
    });
    const fixture = TestBed.createComponent(BwFeedbackButtonComponent);
    fixture.detectChanges();
    const cmp = fixture.componentInstance;
    const file = new File(['hello'], 'log.txt', { type: 'text/plain' });
    internals(cmp).draft.set('A bug');
    internals(cmp).expected.set('it works');
    internals(cmp).actual.set('it crashes');
    internals(cmp).files.set([{ id: 1, file }]);
    await internals(cmp).doSubmit();
    expect(submit).toHaveBeenCalledTimes(1);
    const payload = submit.mock.calls[0]![0] as Record<string, unknown>;
    expect(payload).toMatchObject({
      title: 'A bug',
      description: 'A bug',
      expected: 'it works',
      actual: 'it crashes',
    });
    expect(Array.isArray(payload['attachments'])).toBe(true);
    expect((payload['attachments'] as unknown[]).length).toBe(1);
  });

  it('clears composer + appends user + assistant bubbles on success', async () => {
    submit.mockResolvedValueOnce({ ok: true, issue_id: 'success-1' });
    TestBed.configureTestingModule({
      imports: [BwFeedbackButtonComponent],
      providers: [provideBrevwick({ projectKey: 'pk_test_success' })],
    });
    const fixture = TestBed.createComponent(BwFeedbackButtonComponent);
    fixture.detectChanges();
    const cmp = fixture.componentInstance;
    (
      fixture.nativeElement.querySelector('button.brw-fab') as HTMLButtonElement
    ).click();
    internals(cmp).draft.set('the bug');
    await internals(cmp).doSubmit();
    fixture.detectChanges();
    const userBubble = fixture.nativeElement.querySelector(
      '.brw-bubble--user',
    ) as HTMLElement;
    expect(userBubble.textContent?.trim()).toBe('the bug');
    const assistantBubbles = fixture.nativeElement.querySelectorAll(
      '.brw-bubble--assistant',
    );
    // Greeting + receipt = 2 assistant bubbles.
    expect(assistantBubbles.length).toBe(2);
    const receipt = fixture.nativeElement.querySelector('.brw-bubble--receipt');
    expect(receipt?.textContent).toContain('Issue sent');
    // Composer cleared.
    const composer = fixture.nativeElement.querySelector(
      '.brw-composer-input',
    ) as HTMLTextAreaElement;
    expect(composer.value).toBe('');
  });

  // ── Retry contract ───────────────────────────────────────────────────────

  it('retry replays the last submitted input', async () => {
    // First call fails; second (retry) succeeds.
    submit.mockResolvedValueOnce({
      ok: false,
      error: { code: 'INGEST_REJECTED', message: 'first failed' },
    });
    submit.mockResolvedValueOnce({ ok: true, issue_id: 'retry-ok' });
    TestBed.configureTestingModule({
      imports: [BwFeedbackButtonComponent],
      providers: [provideBrevwick({ projectKey: 'pk_test_retry' })],
    });
    const fixture = TestBed.createComponent(BwFeedbackButtonComponent);
    fixture.detectChanges();
    const cmp = fixture.componentInstance;
    internals(cmp).draft.set('original');
    await internals(cmp).doSubmit();
    fixture.detectChanges();
    const retryRow = fixture.nativeElement.querySelector(
      '[data-brw-row="error"]',
    ) as HTMLElement;
    expect(retryRow).not.toBeNull();
    expect(retryRow.getAttribute('data-brw-error-code')).toBe(
      'INGEST_REJECTED',
    );
    await internals(cmp).onRetryClick();
    expect(submit).toHaveBeenCalledTimes(2);
    expect(submit.mock.calls[1]![0]).toEqual(submit.mock.calls[0]![0]);
  });

  // ── AI-toggle render policy matrix ───────────────────────────────────────

  it('AI toggle stays hidden when project config is not ready', () => {
    TestBed.configureTestingModule({
      imports: [BwFeedbackButtonComponent],
      providers: [provideBrevwick({ projectKey: 'pk_test_no_ai' })],
    });
    const fixture = TestBed.createComponent(BwFeedbackButtonComponent);
    fixture.detectChanges();
    (
      fixture.nativeElement.querySelector('button.brw-fab') as HTMLButtonElement
    ).click();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.brw-aitoggle')).toBeNull();
  });

  it('AI toggle renders when ai_enabled + ai_submitter_choice_allowed are true', async () => {
    getConfig.mockResolvedValueOnce({
      ai_enabled: true,
      ai_submitter_choice_allowed: true,
    });
    TestBed.configureTestingModule({
      imports: [BwFeedbackButtonComponent],
      providers: [provideBrevwick({ projectKey: 'pk_test_ai_on' })],
    });
    const fixture = TestBed.createComponent(BwFeedbackButtonComponent);
    fixture.detectChanges();
    (
      fixture.nativeElement.querySelector('button.brw-fab') as HTMLButtonElement
    ).click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const toggle = fixture.nativeElement.querySelector(
      '.brw-aitoggle',
    ) as HTMLButtonElement | null;
    expect(toggle).not.toBeNull();
    expect(toggle?.getAttribute('aria-checked')).toBe('true');
  });

  it('AI toggle hidden when admin disabled submitter choice', async () => {
    getConfig.mockResolvedValueOnce({
      ai_enabled: true,
      ai_submitter_choice_allowed: false,
    });
    TestBed.configureTestingModule({
      imports: [BwFeedbackButtonComponent],
      providers: [provideBrevwick({ projectKey: 'pk_test_ai_forced' })],
    });
    const fixture = TestBed.createComponent(BwFeedbackButtonComponent);
    fixture.detectChanges();
    (
      fixture.nativeElement.querySelector('button.brw-fab') as HTMLButtonElement
    ).click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.brw-aitoggle')).toBeNull();
  });

  it('use_ai is included in the payload only when the toggle is shown', async () => {
    submit.mockResolvedValue({ ok: true, issue_id: 'ai-p' });
    TestBed.configureTestingModule({
      imports: [BwFeedbackButtonComponent],
      providers: [provideBrevwick({ projectKey: 'pk_test_ai_payload' })],
    });
    const fixture = TestBed.createComponent(BwFeedbackButtonComponent);
    fixture.detectChanges();
    const cmp = fixture.componentInstance;
    // Toggle visible: payload carries use_ai.
    internals(cmp).projectConfig.set({
      status: 'ready',
      config: { ai_enabled: true, ai_submitter_choice_allowed: true },
    });
    internals(cmp).draft.set('with ai');
    internals(cmp).useAi.set(false);
    await internals(cmp).doSubmit();
    expect(submit.mock.calls[0]![0]).toMatchObject({ use_ai: false });
    // Toggle hidden again: no use_ai key on the next submit. Note we don't
    // open the panel, so the lazy-config effect never fires and the manual
    // signal set wins.
    internals(cmp).projectConfig.set({ status: 'idle', config: null });
    internals(cmp).draft.set('without ai');
    await internals(cmp).doSubmit();
    expect(submit.mock.calls[1]![0]).not.toHaveProperty('use_ai');
  });

  // ── Phase-driven status rows ─────────────────────────────────────────────

  it('renders the captured status row from the sanitising phase onwards', () => {
    TestBed.configureTestingModule({
      imports: [BwFeedbackButtonComponent],
      providers: [provideBrevwick({ projectKey: 'pk_test_phase' })],
    });
    const fixture = TestBed.createComponent(BwFeedbackButtonComponent);
    fixture.detectChanges();
    const cmp = fixture.componentInstance;
    (
      fixture.nativeElement.querySelector('button.brw-fab') as HTMLButtonElement
    ).click();
    // Reach the SDK's internal bus through the mock and emit the phase
    // events the React adapter would react to. The service translates
    // each event into a phase signal change which drives the rows.
    const sdk = createBrevwick.mock.results[0]!.value as unknown as {
      _internal: { bus: { emit: (payload: unknown) => void } };
    };
    sdk._internal.bus.emit({ phase: 'capturing-done' });
    fixture.detectChanges();
    expect(
      fixture.nativeElement.querySelector('[data-brw-row="captured"]'),
    ).not.toBeNull();
    sdk._internal.bus.emit({ phase: 'sanitising-done' });
    fixture.detectChanges();
    expect(
      fixture.nativeElement.querySelector('[data-brw-row="sanitised"]'),
    ).not.toBeNull();
    void cmp;
  });

  it('formatting row shows only when AI is enabled', async () => {
    getConfig.mockResolvedValueOnce({
      ai_enabled: true,
      ai_submitter_choice_allowed: false,
    });
    TestBed.configureTestingModule({
      imports: [BwFeedbackButtonComponent],
      providers: [provideBrevwick({ projectKey: 'pk_test_fmt' })],
    });
    const fixture = TestBed.createComponent(BwFeedbackButtonComponent);
    fixture.detectChanges();
    (
      fixture.nativeElement.querySelector('button.brw-fab') as HTMLButtonElement
    ).click();
    fixture.detectChanges();
    await fixture.whenStable();
    const sdk = createBrevwick.mock.results[0]!.value as unknown as {
      _internal: { bus: { emit: (payload: unknown) => void } };
    };
    sdk._internal.bus.emit({ phase: 'sanitising-done' });
    fixture.detectChanges();
    expect(
      fixture.nativeElement.querySelector('[data-brw-row="formatting"]'),
    ).not.toBeNull();
  });

  it('reduced-motion collapses the row stagger to 0 ms', () => {
    TestBed.configureTestingModule({
      imports: [BwFeedbackButtonComponent],
      providers: [provideBrevwick({ projectKey: 'pk_test_rm' })],
    });
    const fixture = TestBed.createComponent(BwFeedbackButtonComponent);
    fixture.detectChanges();
    const cmp = fixture.componentInstance;
    internals(cmp).reducedMotion.set(true);
    (
      fixture.nativeElement.querySelector('button.brw-fab') as HTMLButtonElement
    ).click();
    const sdk = createBrevwick.mock.results[0]!.value as unknown as {
      _internal: { bus: { emit: (payload: unknown) => void } };
    };
    sdk._internal.bus.emit({ phase: 'sanitising-done' });
    fixture.detectChanges();
    const row = fixture.nativeElement.querySelector(
      '[data-brw-row="sanitised"]',
    ) as HTMLElement;
    expect(row).not.toBeNull();
    expect(row.style.animationDelay).toBe('0ms');
  });

  // ── Async safety ─────────────────────────────────────────────────────────

  it('does not emit submit on a destroyed view', async () => {
    let resolve!: (value: SubmitResult) => void;
    submit.mockImplementationOnce(
      () => new Promise<SubmitResult>((r) => (resolve = r)),
    );
    TestBed.configureTestingModule({
      imports: [BwFeedbackButtonComponent],
      providers: [provideBrevwick({ projectKey: 'pk_test_destroy' })],
    });
    const fixture = TestBed.createComponent(BwFeedbackButtonComponent);
    fixture.detectChanges();
    const cmp = fixture.componentInstance;
    const events: unknown[] = [];
    cmp.submit.subscribe((e) => events.push(e));
    internals(cmp).draft.set('inflight');
    const inflight = internals(cmp).doSubmit();
    fixture.destroy();
    resolve({ ok: true, issue_id: 'late' });
    await inflight;
    expect(events).toEqual([]);
  });

  // ── File attach cap ──────────────────────────────────────────────────────

  it('attachment chip + file cap disables the file button at MAX_ATTACHMENTS', () => {
    TestBed.configureTestingModule({
      imports: [BwFeedbackButtonComponent],
      providers: [provideBrevwick({ projectKey: 'pk_test_cap' })],
    });
    const fixture = TestBed.createComponent(BwFeedbackButtonComponent);
    fixture.detectChanges();
    const cmp = fixture.componentInstance;
    (
      fixture.nativeElement.querySelector('button.brw-fab') as HTMLButtonElement
    ).click();
    internals(cmp).files.set([
      { id: 1, file: new File(['a'], '1.txt') },
      { id: 2, file: new File(['a'], '2.txt') },
      { id: 3, file: new File(['a'], '3.txt') },
      { id: 4, file: new File(['a'], '4.txt') },
      { id: 5, file: new File(['a'], '5.txt') },
    ]);
    fixture.detectChanges();
    const chips = fixture.nativeElement.querySelectorAll('.brw-chip');
    expect(chips.length).toBe(5);
    const fileInput = fixture.nativeElement.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement;
    expect(fileInput.disabled).toBe(true);
    expect(fileInput.getAttribute('aria-label')).toContain('Maximum 5');
  });

  // ── Composer events ──────────────────────────────────────────────────────

  it('typing into the composer mutates the draft signal and unlocks Send', () => {
    TestBed.configureTestingModule({
      imports: [BwFeedbackButtonComponent],
      providers: [provideBrevwick({ projectKey: 'pk_test_typing' })],
    });
    const fixture = TestBed.createComponent(BwFeedbackButtonComponent);
    fixture.detectChanges();
    (
      fixture.nativeElement.querySelector('button.brw-fab') as HTMLButtonElement
    ).click();
    fixture.detectChanges();
    const composer = fixture.nativeElement.querySelector(
      '.brw-composer-input',
    ) as HTMLTextAreaElement;
    const send = fixture.nativeElement.querySelector(
      '.brw-send-btn',
    ) as HTMLButtonElement;
    expect(send.disabled).toBe(true);
    composer.value = 'live typing';
    composer.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(send.disabled).toBe(false);
  });

  it('Send button click triggers a submit', async () => {
    submit.mockResolvedValueOnce({ ok: true, issue_id: 'send-click' });
    TestBed.configureTestingModule({
      imports: [BwFeedbackButtonComponent],
      providers: [provideBrevwick({ projectKey: 'pk_test_send_click' })],
    });
    const fixture = TestBed.createComponent(BwFeedbackButtonComponent);
    fixture.detectChanges();
    const cmp = fixture.componentInstance;
    (
      fixture.nativeElement.querySelector('button.brw-fab') as HTMLButtonElement
    ).click();
    internals(cmp).draft.set('clicked submit');
    fixture.detectChanges();
    const sendBtn = fixture.nativeElement.querySelector(
      '.brw-send-btn',
    ) as HTMLButtonElement;
    sendBtn.click();
    await Promise.resolve();
    await Promise.resolve();
    expect(submit).toHaveBeenCalledTimes(1);
  });

  // ── Discard / cancel-close paths ─────────────────────────────────────────

  it('cancel button on discard confirm preserves the draft', () => {
    TestBed.configureTestingModule({
      imports: [BwFeedbackButtonComponent],
      providers: [provideBrevwick({ projectKey: 'pk_test_cancel' })],
    });
    const fixture = TestBed.createComponent(BwFeedbackButtonComponent);
    fixture.detectChanges();
    const cmp = fixture.componentInstance;
    (
      fixture.nativeElement.querySelector('button.brw-fab') as HTMLButtonElement
    ).click();
    internals(cmp).draft.set('keep this');
    fixture.detectChanges();
    (
      fixture.nativeElement.querySelector(
        '.brw-icon-btn[aria-label="Close"]',
      ) as HTMLButtonElement
    ).click();
    fixture.detectChanges();
    // The "Keep" button is the first .brw-btn (non-primary) in the confirm.
    const keep = fixture.nativeElement.querySelector(
      '.brw-confirm .brw-btn:not(.brw-btn-primary)',
    ) as HTMLButtonElement;
    keep.click();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.brw-confirm')).toBeNull();
    const composer = fixture.nativeElement.querySelector(
      '.brw-composer-input',
    ) as HTMLTextAreaElement;
    expect(composer.value).toBe('keep this');
  });

  it('Discard button on confirm clears state and closes the panel', () => {
    TestBed.configureTestingModule({
      imports: [BwFeedbackButtonComponent],
      providers: [provideBrevwick({ projectKey: 'pk_test_discard_btn' })],
    });
    const fixture = TestBed.createComponent(BwFeedbackButtonComponent);
    fixture.detectChanges();
    const cmp = fixture.componentInstance;
    (
      fixture.nativeElement.querySelector('button.brw-fab') as HTMLButtonElement
    ).click();
    internals(cmp).draft.set('toss me');
    fixture.detectChanges();
    (
      fixture.nativeElement.querySelector(
        '.brw-icon-btn[aria-label="Close"]',
      ) as HTMLButtonElement
    ).click();
    fixture.detectChanges();
    const discard = fixture.nativeElement.querySelector(
      '.brw-confirm .brw-btn-primary',
    ) as HTMLButtonElement;
    discard.click();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.brw-panel')).toBeNull();
    // Re-open: draft should be empty.
    (
      fixture.nativeElement.querySelector('button.brw-fab') as HTMLButtonElement
    ).click();
    fixture.detectChanges();
    const composer = fixture.nativeElement.querySelector(
      '.brw-composer-input',
    ) as HTMLTextAreaElement;
    expect(composer.value).toBe('');
  });

  it('close on an empty panel skips the discard confirm', () => {
    TestBed.configureTestingModule({
      imports: [BwFeedbackButtonComponent],
      providers: [provideBrevwick({ projectKey: 'pk_test_close_empty' })],
    });
    const fixture = TestBed.createComponent(BwFeedbackButtonComponent);
    fixture.detectChanges();
    (
      fixture.nativeElement.querySelector('button.brw-fab') as HTMLButtonElement
    ).click();
    fixture.detectChanges();
    (
      fixture.nativeElement.querySelector(
        '.brw-icon-btn[aria-label="Close"]',
      ) as HTMLButtonElement
    ).click();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.brw-panel')).toBeNull();
  });

  // ── Disclosure toggle ────────────────────────────────────────────────────

  it('toggling the disclosure reveals expected/actual textareas', () => {
    TestBed.configureTestingModule({
      imports: [BwFeedbackButtonComponent],
      providers: [provideBrevwick({ projectKey: 'pk_test_disc' })],
    });
    const fixture = TestBed.createComponent(BwFeedbackButtonComponent);
    fixture.detectChanges();
    (
      fixture.nativeElement.querySelector('button.brw-fab') as HTMLButtonElement
    ).click();
    fixture.detectChanges();
    const trigger = fixture.nativeElement.querySelector(
      '.brw-disclosure',
    ) as HTMLButtonElement;
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    trigger.click();
    fixture.detectChanges();
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    const inputs = fixture.nativeElement.querySelectorAll(
      '.brw-disclosure-input',
    );
    expect(inputs.length).toBe(2);
  });

  // ── File events: input change + remove chip ──────────────────────────────

  it('file input change appends file chips up to the cap', () => {
    TestBed.configureTestingModule({
      imports: [BwFeedbackButtonComponent],
      providers: [provideBrevwick({ projectKey: 'pk_test_file_change' })],
    });
    const fixture = TestBed.createComponent(BwFeedbackButtonComponent);
    fixture.detectChanges();
    (
      fixture.nativeElement.querySelector('button.brw-fab') as HTMLButtonElement
    ).click();
    fixture.detectChanges();
    const input = fixture.nativeElement.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement;
    const file = new File(['x'], 'attached.txt', { type: 'text/plain' });
    Object.defineProperty(input, 'files', {
      value: {
        length: 1,
        item: (i: number) => (i === 0 ? file : null),
        0: file,
      } as unknown as FileList,
      configurable: true,
    });
    input.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    const chips = fixture.nativeElement.querySelectorAll('.brw-chip');
    expect(chips.length).toBe(1);
  });

  it('removing a chip drops it from the list', () => {
    TestBed.configureTestingModule({
      imports: [BwFeedbackButtonComponent],
      providers: [provideBrevwick({ projectKey: 'pk_test_remove_chip' })],
    });
    const fixture = TestBed.createComponent(BwFeedbackButtonComponent);
    fixture.detectChanges();
    const cmp = fixture.componentInstance;
    (
      fixture.nativeElement.querySelector('button.brw-fab') as HTMLButtonElement
    ).click();
    internals(cmp).files.set([
      { id: 1, file: new File(['x'], 'a.txt') },
      { id: 2, file: new File(['x'], 'b.txt') },
    ]);
    fixture.detectChanges();
    const removes = fixture.nativeElement.querySelectorAll('.brw-chip-remove');
    expect(removes.length).toBe(2);
    (removes[0] as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelectorAll('.brw-chip').length).toBe(1);
  });

  // ── AI toggle keyboard activation ────────────────────────────────────────

  it('Space on the AI toggle flips the signal; other keys are no-ops', async () => {
    getConfig.mockResolvedValueOnce({
      ai_enabled: true,
      ai_submitter_choice_allowed: true,
    });
    TestBed.configureTestingModule({
      imports: [BwFeedbackButtonComponent],
      providers: [provideBrevwick({ projectKey: 'pk_test_ai_kbd' })],
    });
    const fixture = TestBed.createComponent(BwFeedbackButtonComponent);
    fixture.detectChanges();
    (
      fixture.nativeElement.querySelector('button.brw-fab') as HTMLButtonElement
    ).click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const toggle = fixture.nativeElement.querySelector(
      '.brw-aitoggle',
    ) as HTMLButtonElement;
    expect(toggle.getAttribute('aria-checked')).toBe('true');
    toggle.dispatchEvent(new KeyboardEvent('keydown', { key: ' ' }));
    fixture.detectChanges();
    expect(toggle.getAttribute('aria-checked')).toBe('false');
    // Non-Space key: no-op.
    toggle.dispatchEvent(new KeyboardEvent('keydown', { key: 'a' }));
    fixture.detectChanges();
    expect(toggle.getAttribute('aria-checked')).toBe('false');
  });

  // ── Validation ───────────────────────────────────────────────────────────

  it('whitespace-only draft does not trigger submit and shows the inline error', async () => {
    TestBed.configureTestingModule({
      imports: [BwFeedbackButtonComponent],
      providers: [provideBrevwick({ projectKey: 'pk_test_validate' })],
    });
    const fixture = TestBed.createComponent(BwFeedbackButtonComponent);
    fixture.detectChanges();
    const cmp = fixture.componentInstance;
    (
      fixture.nativeElement.querySelector('button.brw-fab') as HTMLButtonElement
    ).click();
    internals(cmp).draft.set('   \n  ');
    await internals(cmp).doSubmit();
    fixture.detectChanges();
    expect(submit).not.toHaveBeenCalled();
    const err = fixture.nativeElement.querySelector('.brw-error[role="alert"]');
    expect(err?.textContent).toContain('Please describe what happened');
  });

  // ── Footer ───────────────────────────────────────────────────────────────

  it('footer renders the package version', () => {
    TestBed.configureTestingModule({
      imports: [BwFeedbackButtonComponent],
      providers: [provideBrevwick({ projectKey: 'pk_test_footer' })],
    });
    const fixture = TestBed.createComponent(BwFeedbackButtonComponent);
    fixture.detectChanges();
    (
      fixture.nativeElement.querySelector('button.brw-fab') as HTMLButtonElement
    ).click();
    fixture.detectChanges();
    const link = fixture.nativeElement.querySelector(
      '.brw-panel-footer-link',
    ) as HTMLAnchorElement;
    expect(link).not.toBeNull();
    expect(link.textContent).toContain('Brevwick v');
    expect(link.href).toContain('https://brevwick.dev');
  });

  // ── Format helpers ───────────────────────────────────────────────────────

  it('relativeTime covers the minute / hour / day branches', () => {
    TestBed.configureTestingModule({
      imports: [BwFeedbackButtonComponent],
      providers: [provideBrevwick({ projectKey: 'pk_test_relative' })],
    });
    const fixture = TestBed.createComponent(BwFeedbackButtonComponent);
    fixture.detectChanges();
    const rt = internals(fixture.componentInstance).relativeTime;
    const now = Date.now();
    expect(rt(undefined)).toBe('just now');
    expect(rt(now)).toBe('just now');
    expect(rt(now - 5 * 60_000)).toBe('5 min ago');
    expect(rt(now - 3 * 60 * 60_000)).toBe('3 hr ago');
    expect(rt(now - 2 * 24 * 60 * 60_000)).toBe('2 d ago');
  });

  it('size formats bytes / kB / MB', () => {
    TestBed.configureTestingModule({
      imports: [BwFeedbackButtonComponent],
      providers: [provideBrevwick({ projectKey: 'pk_test_size' })],
    });
    const fixture = TestBed.createComponent(BwFeedbackButtonComponent);
    fixture.detectChanges();
    const fmt = internals(fixture.componentInstance).size;
    expect(fmt(512)).toBe('512 B');
    expect(fmt(2048)).toBe('2.0 kB');
    expect(fmt(2 * 1024 * 1024)).toBe('2.0 MB');
  });

  // ── matchMedia paths ─────────────────────────────────────────────────────

  it('reduced-motion modern path: change event flips the signal', () => {
    type ChangeListener = (e: MediaQueryListEvent) => void;
    let captured: ChangeListener | null = null;
    const mql = {
      matches: false,
      media: '(prefers-reduced-motion: reduce)',
      addEventListener: (_: string, cb: ChangeListener) => {
        captured = cb;
      },
      removeEventListener: vi.fn(),
    } as unknown as MediaQueryList;
    const original = window.matchMedia;
    window.matchMedia = (() => mql) as typeof window.matchMedia;
    try {
      TestBed.configureTestingModule({
        imports: [BwFeedbackButtonComponent],
        providers: [provideBrevwick({ projectKey: 'pk_test_rm_modern' })],
      });
      const fixture = TestBed.createComponent(BwFeedbackButtonComponent);
      fixture.detectChanges();
      const cmp = fixture.componentInstance;
      // Default: reducedMotion mirrors mql.matches (false).
      expect(captured).not.toBeNull();
      // Fire a synthetic change event — onChange should set reducedMotion=true.
      captured!({ matches: true } as MediaQueryListEvent);
      fixture.detectChanges();
      // Open + drive a phase event so we can read the stagger off a row.
      (
        fixture.nativeElement.querySelector(
          'button.brw-fab',
        ) as HTMLButtonElement
      ).click();
      const sdk = createBrevwick.mock.results[0]!.value as unknown as {
        _internal: { bus: { emit: (payload: unknown) => void } };
      };
      sdk._internal.bus.emit({ phase: 'sanitising-done' });
      fixture.detectChanges();
      const row = fixture.nativeElement.querySelector(
        '[data-brw-row="sanitised"]',
      ) as HTMLElement;
      expect(row.style.animationDelay).toBe('0ms');
      void cmp;
    } finally {
      window.matchMedia = original;
    }
  });

  it('reduced-motion legacy path: addListener fallback registers + cleans up', () => {
    type ChangeListener = (e: MediaQueryListEvent) => void;
    let captured: ChangeListener | null = null;
    const removeListener = vi.fn();
    // Build an mql that ONLY exposes the legacy addListener / removeListener
    // pair — no addEventListener — so the component's else-if branch fires.
    const mql = {
      matches: true,
      media: '(prefers-reduced-motion: reduce)',
      addListener: (cb: ChangeListener) => {
        captured = cb;
      },
      removeListener,
    } as unknown as MediaQueryList;
    const original = window.matchMedia;
    window.matchMedia = (() => mql) as typeof window.matchMedia;
    try {
      TestBed.configureTestingModule({
        imports: [BwFeedbackButtonComponent],
        providers: [provideBrevwick({ projectKey: 'pk_test_rm_legacy' })],
      });
      const fixture = TestBed.createComponent(BwFeedbackButtonComponent);
      fixture.detectChanges();
      expect(captured).not.toBeNull();
      // Destroying the fixture should run the destroyRef.onDestroy callback
      // which in turn calls removeListener with the same handler we registered.
      fixture.destroy();
      expect(removeListener).toHaveBeenCalledTimes(1);
      expect(removeListener.mock.calls[0]![0]).toBe(captured);
    } finally {
      window.matchMedia = original;
    }
  });

  // ── Composer autogrow effect ─────────────────────────────────────────────

  it('composer autogrow effect early-returns until the textarea mounts', () => {
    // The full autogrow body (`renderer.setStyle` round-trip) only runs once
    // the viewChild signal resolves to a real `ElementRef`. Vitest + happy-dom
    // do not flush the viewChild query result reliably across CD passes, so we
    // assert what we *can* deterministically observe: the effect runs at all,
    // it sees a falsy ref on first paint, and it does not throw when the panel
    // opens. The covered branch is the early-return guard at the top.
    TestBed.configureTestingModule({
      imports: [BwFeedbackButtonComponent],
      providers: [provideBrevwick({ projectKey: 'pk_test_autogrow' })],
    });
    const fixture = TestBed.createComponent(BwFeedbackButtonComponent);
    fixture.detectChanges();
    const cmp = fixture.componentInstance;
    (
      fixture.nativeElement.querySelector('button.brw-fab') as HTMLButtonElement
    ).click();
    fixture.detectChanges();
    // Mutating draft must not throw even when the viewChild ref is unresolved.
    expect(() => internals(cmp).draft.set('two\nlines')).not.toThrow();
    fixture.detectChanges();
  });

  // ── Project config promise resolution ────────────────────────────────────

  it('project config success path runs the .then handler after the promise settles', async () => {
    getConfig.mockResolvedValueOnce({
      ai_enabled: true,
      ai_submitter_choice_allowed: true,
    });
    TestBed.configureTestingModule({
      imports: [BwFeedbackButtonComponent],
      providers: [provideBrevwick({ projectKey: 'pk_test_cfg_ok' })],
    });
    const fixture = TestBed.createComponent(BwFeedbackButtonComponent);
    fixture.detectChanges();
    (
      fixture.nativeElement.querySelector('button.brw-fab') as HTMLButtonElement
    ).click();
    fixture.detectChanges();
    // Drain microtasks so the resolved getConfig promise's .then fires.
    await fixture.whenStable();
    expect(getConfig).toHaveBeenCalledTimes(1);
  });

  it('project config catch path runs the .catch handler after a fetch rejection', async () => {
    getConfig.mockRejectedValueOnce(new Error('network down'));
    TestBed.configureTestingModule({
      imports: [BwFeedbackButtonComponent],
      providers: [provideBrevwick({ projectKey: 'pk_test_cfg_err' })],
    });
    const fixture = TestBed.createComponent(BwFeedbackButtonComponent);
    fixture.detectChanges();
    (
      fixture.nativeElement.querySelector('button.brw-fab') as HTMLButtonElement
    ).click();
    fixture.detectChanges();
    await fixture.whenStable();
    expect(getConfig).toHaveBeenCalledTimes(1);
  });

  // ── doSubmit / onRetryClick error catch paths ────────────────────────────

  it('doSubmit re-opens the panel after a chunk-load rejection', async () => {
    submit.mockRejectedValueOnce(new Error('chunk load failed'));
    TestBed.configureTestingModule({
      imports: [BwFeedbackButtonComponent],
      providers: [provideBrevwick({ projectKey: 'pk_test_submit_throw' })],
    });
    const fixture = TestBed.createComponent(BwFeedbackButtonComponent);
    fixture.detectChanges();
    const cmp = fixture.componentInstance;
    (
      fixture.nativeElement.querySelector('button.brw-fab') as HTMLButtonElement
    ).click();
    fixture.detectChanges();
    internals(cmp).draft.set('boom');
    // Minimise mid-submit so we can prove doSubmit pops the panel back open
    // through the catch branch.
    (
      fixture.nativeElement.querySelector(
        '.brw-icon-btn[aria-label="Minimize"]',
      ) as HTMLButtonElement
    ).click();
    fixture.detectChanges();
    await internals(cmp).doSubmit();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.brw-panel')).not.toBeNull();
  });

  it('onRetryClick re-opens the panel after a chunk-load rejection', async () => {
    submit.mockResolvedValueOnce({
      ok: false,
      error: { code: 'INGEST_REJECTED', message: 'first failed' },
    });
    submit.mockRejectedValueOnce(new Error('chunk load failed on retry'));
    TestBed.configureTestingModule({
      imports: [BwFeedbackButtonComponent],
      providers: [provideBrevwick({ projectKey: 'pk_test_retry_throw' })],
    });
    const fixture = TestBed.createComponent(BwFeedbackButtonComponent);
    fixture.detectChanges();
    const cmp = fixture.componentInstance;
    (
      fixture.nativeElement.querySelector('button.brw-fab') as HTMLButtonElement
    ).click();
    fixture.detectChanges();
    internals(cmp).draft.set('first attempt');
    await internals(cmp).doSubmit();
    fixture.detectChanges();
    // Minimise so we can prove onRetryClick pops the panel back open through
    // the catch branch.
    (
      fixture.nativeElement.querySelector(
        '.brw-icon-btn[aria-label="Minimize"]',
      ) as HTMLButtonElement
    ).click();
    fixture.detectChanges();
    await internals(cmp).onRetryClick();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.brw-panel')).not.toBeNull();
  });

  it('onRetryClick is a no-op when no submit has been attempted', async () => {
    TestBed.configureTestingModule({
      imports: [BwFeedbackButtonComponent],
      providers: [provideBrevwick({ projectKey: 'pk_test_retry_noop' })],
    });
    const fixture = TestBed.createComponent(BwFeedbackButtonComponent);
    fixture.detectChanges();
    const cmp = fixture.componentInstance;
    await internals(cmp).onRetryClick();
    expect(submit).not.toHaveBeenCalled();
  });

  // ── Toggle while open routes through minimize ────────────────────────────

  it('clicking the FAB while the panel is open routes through minimize', () => {
    TestBed.configureTestingModule({
      imports: [BwFeedbackButtonComponent],
      providers: [provideBrevwick({ projectKey: 'pk_test_toggle_close' })],
    });
    const fixture = TestBed.createComponent(BwFeedbackButtonComponent);
    fixture.detectChanges();
    const fab = fixture.nativeElement.querySelector(
      'button.brw-fab',
    ) as HTMLButtonElement;
    fab.click();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.brw-panel')).not.toBeNull();
    fab.click();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.brw-panel')).toBeNull();
  });
});

/**
 * Launcher presentation (variant + position). Pins the full resolution
 * table: explicit `variant` always wins, `position` contributes only its
 * horizontal side to a mismatched variant, and a legacy corner without a
 * variant keeps the bubble. The zero-config default — right-edge tab —
 * is asserted in the main describe block above.
 */
describe('BwFeedbackButtonComponent — launcher presentation (variant + position)', () => {
  interface PresentationInputs {
    variant?: 'bubble' | 'tab';
    position?: 'right' | 'left' | 'bottom-right' | 'bottom-left';
    compact?: boolean;
    offset?: number;
    label?: string;
  }

  const mountFab = (inputs: PresentationInputs = {}) => {
    TestBed.configureTestingModule({
      imports: [BwFeedbackButtonComponent],
      providers: [provideBrevwick({ projectKey: 'pk_test_presentation' })],
    });
    const fixture = TestBed.createComponent(BwFeedbackButtonComponent);
    for (const [key, value] of Object.entries(inputs)) {
      fixture.componentRef.setInput(key, value);
    }
    fixture.detectChanges();
    const fab = fixture.nativeElement.querySelector(
      'button.brw-fab',
    ) as HTMLButtonElement;
    return { fixture, fab };
  };

  it('keeps the bubble at bottom-left for a legacy corner position (no variant)', () => {
    // Legacy compat: an explicit corner without a `variant` must keep the
    // pre-vNEXT presentation — the bubble at that corner, not a tab.
    const { fixture, fab } = mountFab({ position: 'bottom-left' });
    expect(fab.classList.contains('brw-fab--bubble')).toBe(true);
    expect(fab.classList.contains('brw-fab-bl')).toBe(true);
    expect(fab.classList.contains('brw-fab-br')).toBe(false);
    expect(fab.getAttribute('data-brw-variant')).toBe('bubble');
    fab.click();
    fixture.detectChanges();
    const panel = fixture.nativeElement.querySelector('.brw-panel') as Element;
    expect(panel.classList.contains('brw-panel-bl')).toBe(true);
    expect(panel.classList.contains('brw-panel-br')).toBe(false);
  });

  it('keeps the bubble at bottom-right for a legacy corner position (no variant)', () => {
    const { fixture, fab } = mountFab({ position: 'bottom-right' });
    expect(fab.classList.contains('brw-fab--bubble')).toBe(true);
    expect(fab.classList.contains('brw-fab-br')).toBe(true);
    expect(fab.classList.contains('brw-fab-bl')).toBe(false);
    expect(fab.getAttribute('data-brw-variant')).toBe('bubble');
    fab.click();
    fixture.detectChanges();
    const panel = fixture.nativeElement.querySelector('.brw-panel') as Element;
    expect(panel.classList.contains('brw-panel-br')).toBe(true);
  });

  it('variant="bubble" without a position renders the bottom-right bubble', () => {
    const { fab } = mountFab({ variant: 'bubble' });
    expect(fab.classList.contains('brw-fab--bubble')).toBe(true);
    expect(fab.classList.contains('brw-fab-br')).toBe(true);
    expect(fab.getAttribute('data-brw-variant')).toBe('bubble');
  });

  it('position="left" renders the tab on the left edge', () => {
    const { fab } = mountFab({ position: 'left' });
    expect(fab.classList.contains('brw-fab--tab')).toBe(true);
    expect(fab.classList.contains('brw-fab-l')).toBe(true);
    expect(fab.getAttribute('data-brw-variant')).toBe('tab');
  });

  it('position="right" renders the tab on the right edge', () => {
    const { fab } = mountFab({ position: 'right' });
    expect(fab.classList.contains('brw-fab--tab')).toBe(true);
    expect(fab.classList.contains('brw-fab-r')).toBe(true);
  });

  it('variant="tab" + corner position keeps the tab and takes only the horizontal side', () => {
    // Conflict rule: variant wins; 'bottom-left' contributes only 'left'.
    const { fab } = mountFab({ variant: 'tab', position: 'bottom-left' });
    expect(fab.classList.contains('brw-fab--tab')).toBe(true);
    expect(fab.classList.contains('brw-fab-l')).toBe(true);
    expect(fab.classList.contains('brw-fab-bl')).toBe(false);
  });

  it('variant="tab" + position="bottom-right" resolves to the right-edge tab', () => {
    const { fab } = mountFab({ variant: 'tab', position: 'bottom-right' });
    expect(fab.classList.contains('brw-fab--tab')).toBe(true);
    expect(fab.classList.contains('brw-fab-r')).toBe(true);
  });

  it('variant="bubble" + position="left" renders the bubble at the bottom-left corner', () => {
    const { fab } = mountFab({ variant: 'bubble', position: 'left' });
    expect(fab.classList.contains('brw-fab--bubble')).toBe(true);
    expect(fab.classList.contains('brw-fab-bl')).toBe(true);
  });

  it('variant="bubble" + position="right" renders the bubble at the bottom-right corner', () => {
    const { fab } = mountFab({ variant: 'bubble', position: 'right' });
    expect(fab.classList.contains('brw-fab--bubble')).toBe(true);
    expect(fab.classList.contains('brw-fab-br')).toBe(true);
  });

  it('left-edge tab opens the panel anchored bottom-left', () => {
    const { fixture, fab } = mountFab({ position: 'left' });
    fab.click();
    fixture.detectChanges();
    const panel = fixture.nativeElement.querySelector('.brw-panel') as Element;
    expect(panel.classList.contains('brw-panel-bl')).toBe(true);
    expect(panel.classList.contains('brw-panel-br')).toBe(false);
  });

  it('compact drops the visible label and promotes the label to aria-label', () => {
    const { fixture, fab } = mountFab({
      compact: true,
      label: 'Report a bug',
    });
    expect(fab.classList.contains('brw-fab--compact')).toBe(true);
    // The label text must not render — compact is icon-only.
    expect(fab.querySelector('.brw-fab-label')).toBeNull();
    expect(fab.textContent?.trim()).toBe('');
    expect(fab.getAttribute('aria-label')).toBe('Report a bug');
    void fixture;
  });

  it('compact with the default label falls back to aria-label="Feedback"', () => {
    const { fab } = mountFab({ compact: true });
    expect(fab.getAttribute('aria-label')).toBe('Feedback');
    expect(fab.querySelector('.brw-fab-label')).toBeNull();
  });

  it('non-compact keeps aria-label="Open feedback form" and the visible label span', () => {
    const { fab } = mountFab({ label: 'Report a bug' });
    expect(fab.getAttribute('aria-label')).toBe('Open feedback form');
    const labelSpan = fab.querySelector('.brw-fab-label');
    expect(labelSpan).not.toBeNull();
    expect(labelSpan?.textContent).toBe('Report a bug');
  });

  it('offset sets --brw-fab-tab-offset inline on the tab only when non-zero', () => {
    const { fab } = mountFab({ offset: 120 });
    expect(fab.style.getPropertyValue('--brw-fab-tab-offset')).toBe('120px');
  });

  it('offset=0 sets no inline custom property on the tab', () => {
    const { fab } = mountFab({ offset: 0 });
    expect(fab.style.getPropertyValue('--brw-fab-tab-offset')).toBe('');
  });

  it('offset is ignored for the bubble (no inline custom property)', () => {
    const { fab } = mountFab({ variant: 'bubble', offset: 120 });
    expect(fab.style.getPropertyValue('--brw-fab-tab-offset')).toBe('');
  });

  it('emitted stylesheet declares the vertical tab + keeps the launcher chrome contract', () => {
    // ViewEncapsulation.None — the component's stylesheet is injected into
    // document.head verbatim when the component renders.
    mountFab();
    const css = Array.from(document.head.querySelectorAll('style'))
      .map((style) => style.textContent ?? '')
      .join('\n');
    // Tab geometry: writing-mode flips the inline axis vertical.
    expect(css).toMatch(/\.brw-fab--tab\s*\{[^}]*writing-mode:\s*vertical-rl/);
    // Shared launcher chrome keeps the max-ish stacking contract.
    expect(css).toMatch(/\.brw-fab\s*\{[^}]*z-index:\s*2147483000/);
    // Bubble keeps the legacy pill geometry under its own class.
    expect(css).toMatch(/\.brw-fab--bubble\s*\{[^}]*border-radius:\s*999px/);
    // Reduced-motion still disables the launcher transition for both variants.
    expect(css).toMatch(
      /prefers-reduced-motion[\s\S]*?\.brw-fab\s*\{[^}]*transition:\s*none/,
    );
  });
});

describe('BwFeedbackButtonComponent — debug raw payload (config.debug)', () => {
  const COPY_SELECTOR = 'button[data-brw-copy-raw]';

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
    TestBed.configureTestingModule({
      imports: [BwFeedbackButtonComponent],
      providers: [provideBrevwick({ projectKey: 'pk_test_dbg' })],
    });
    const fixture = TestBed.createComponent(BwFeedbackButtonComponent);
    fixture.detectChanges();
    const cmp = fixture.componentInstance;
    internals(cmp).open.set(true);
    internals(cmp).draft.set('Broken');
    await internals(cmp).doSubmit();
    fixture.detectChanges();

    const copyBtn = fixture.nativeElement.querySelector(
      COPY_SELECTOR,
    ) as HTMLButtonElement | null;
    expect(copyBtn).not.toBeNull();
    expect(copyBtn!.textContent?.trim()).toBe('Copy raw payload');
  });

  it('omits the copy-raw button when the result has no debug payload', async () => {
    submit.mockResolvedValueOnce({ ok: true, issue_id: 'rep_nodbg' });
    TestBed.configureTestingModule({
      imports: [BwFeedbackButtonComponent],
      providers: [provideBrevwick({ projectKey: 'pk_test_nodbg' })],
    });
    const fixture = TestBed.createComponent(BwFeedbackButtonComponent);
    fixture.detectChanges();
    const cmp = fixture.componentInstance;
    internals(cmp).open.set(true);
    internals(cmp).draft.set('Broken');
    await internals(cmp).doSubmit();
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector(COPY_SELECTOR)).toBeNull();
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
    TestBed.configureTestingModule({
      imports: [BwFeedbackButtonComponent],
      providers: [provideBrevwick({ projectKey: 'pk_test_copy' })],
    });
    const fixture = TestBed.createComponent(BwFeedbackButtonComponent);
    fixture.detectChanges();
    const cmp = fixture.componentInstance;
    internals(cmp).open.set(true);
    internals(cmp).draft.set('Broken');
    await internals(cmp).doSubmit();
    fixture.detectChanges();

    const copyBtn = fixture.nativeElement.querySelector(
      COPY_SELECTOR,
    ) as HTMLButtonElement;
    copyBtn.click();
    await Promise.resolve();
    await Promise.resolve();
    fixture.detectChanges();

    expect(writeText).toHaveBeenCalledWith(JSON.stringify(payload, null, 2));
    expect(
      (
        fixture.nativeElement.querySelector(COPY_SELECTOR) as HTMLButtonElement
      ).textContent?.trim(),
    ).toBe('Copied!');
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
    TestBed.configureTestingModule({
      imports: [BwFeedbackButtonComponent],
      providers: [provideBrevwick({ projectKey: 'pk_test_noclip' })],
    });
    const fixture = TestBed.createComponent(BwFeedbackButtonComponent);
    fixture.detectChanges();
    const cmp = fixture.componentInstance;
    internals(cmp).open.set(true);
    internals(cmp).draft.set('Broken');
    await internals(cmp).doSubmit();
    fixture.detectChanges();

    const copyBtn = fixture.nativeElement.querySelector(
      COPY_SELECTOR,
    ) as HTMLButtonElement;
    copyBtn.click();
    fixture.detectChanges();
    // No throw, label unchanged.
    expect(copyBtn.textContent?.trim()).toBe('Copy raw payload');
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
    TestBed.configureTestingModule({
      imports: [BwFeedbackButtonComponent],
      providers: [provideBrevwick({ projectKey: 'pk_test_rej' })],
    });
    const fixture = TestBed.createComponent(BwFeedbackButtonComponent);
    fixture.detectChanges();
    const cmp = fixture.componentInstance;
    internals(cmp).open.set(true);
    internals(cmp).draft.set('Broken');
    await internals(cmp).doSubmit();
    fixture.detectChanges();

    const copyBtn = fixture.nativeElement.querySelector(
      COPY_SELECTOR,
    ) as HTMLButtonElement;
    copyBtn.click();
    await Promise.resolve();
    await Promise.resolve();
    fixture.detectChanges();
    expect(writeText).toHaveBeenCalled();
    expect(copyBtn.textContent?.trim()).toBe('Copy raw payload');
  });
});
