import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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

// ─── Screenshot capture surface (ported from the React adapter's restore) ───

type Fixture = ComponentFixture<BwFeedbackButtonComponent>;

function setup(projectKey: string): Fixture {
  TestBed.configureTestingModule({
    imports: [BwFeedbackButtonComponent],
    providers: [provideBrevwick({ projectKey })],
  });
  const fixture = TestBed.createComponent(BwFeedbackButtonComponent);
  fixture.detectChanges();
  return fixture;
}

function openPanel(fixture: Fixture): void {
  (
    fixture.nativeElement.querySelector('button.brw-fab') as HTMLButtonElement
  ).click();
  fixture.detectChanges();
}

function q<T extends Element>(fixture: Fixture, selector: string): T | null {
  return fixture.nativeElement.querySelector(selector) as T | null;
}

/** Find a button by its exact trimmed text content (the region overlay's
 *  Cancel / Capture full page / Capture controls carry no aria-labels). */
function btnByText(fixture: Fixture, text: string): HTMLButtonElement | null {
  return (
    (
      Array.from(
        fixture.nativeElement.querySelectorAll('button'),
      ) as HTMLButtonElement[]
    ).find((b) => b.textContent?.trim() === text) ?? null
  );
}

function screenshotButton(fixture: Fixture): HTMLButtonElement | null {
  // First icon button inside the composer shell — its aria-label mutates
  // across idle / capturing / at-cap states, so query positionally.
  return q<HTMLButtonElement>(
    fixture,
    '.brw-composer-shell > button.brw-icon-btn',
  );
}

function overlay(fixture: Fixture): HTMLElement | null {
  return q<HTMLElement>(fixture, '[data-testid="brw-region-overlay"]');
}

function previewDialog(fixture: Fixture): HTMLElement | null {
  return q<HTMLElement>(fixture, '[data-testid="brw-preview-dialog"]');
}

/** Flush the capture pipeline's microtask chain (captureScreenshot resolve →
 *  optional crop → signal updates) and re-render. */
async function flush(fixture: Fixture): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
  fixture.detectChanges();
}

function openOverlay(fixture: Fixture): void {
  screenshotButton(fixture)!.click();
  fixture.detectChanges();
}

/** Open the region overlay and run a "Capture full page" round trip. */
async function captureFullPage(fixture: Fixture): Promise<void> {
  openOverlay(fixture);
  btnByText(fixture, 'Capture full page')!.click();
  fixture.detectChanges();
  await flush(fixture);
}

function pointerEvent(
  type: string,
  init: { x: number; y: number; button?: number },
): PointerEvent {
  return new PointerEvent(type, {
    bubbles: true,
    cancelable: true,
    clientX: init.x,
    clientY: init.y,
    button: init.button ?? 0,
    pointerId: 1,
  });
}

function drag(
  fixture: Fixture,
  from: { x: number; y: number },
  to: { x: number; y: number },
): void {
  const layer = overlay(fixture)!;
  layer.dispatchEvent(pointerEvent('pointerdown', from));
  layer.dispatchEvent(pointerEvent('pointermove', to));
  layer.dispatchEvent(pointerEvent('pointerup', to));
  fixture.detectChanges();
}

function setDraft(fixture: Fixture, text: string): void {
  internals(fixture.componentInstance).draft.set(text);
  fixture.detectChanges();
}

/**
 * Install a test double for the canvas crop pipeline so the overlay's
 * confirm-region path can resolve under happy-dom (which provides no
 * functional 2D context, `toBlob`, or image loader). Captures the
 * `drawImage` source/dest args so a test can assert the crop math matches
 * the dragged rectangle × devicePixelRatio. Mirrors the React suite's stub.
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
  delete (globalThis as { OffscreenCanvas?: unknown }).OffscreenCanvas;

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

describe('BwFeedbackButtonComponent — screenshot capture', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('greeting invites a screenshot now that the capture button is present', () => {
    // Pins the full greeting copy: the screenshot-restore decision requires
    // "…A screenshot helps if you have one." whenever the capture button is
    // present. Prefix-only assertions elsewhere would not catch a regression
    // back to a short button-less greeting.
    const fixture = setup('pk_test_ss_greeting');
    openPanel(fixture);
    const greeting = q<HTMLElement>(fixture, '.brw-bubble--assistant');
    expect(greeting?.textContent?.trim()).toBe(
      "Hi! Tell us what's happening. A screenshot helps if you have one.",
    );
  });

  it('composer renders the screenshot button inside the single composer shell', () => {
    const fixture = setup('pk_test_ss_shell');
    openPanel(fixture);
    const shells = fixture.nativeElement.querySelectorAll(
      '.brw-composer-shell',
    );
    expect(shells.length).toBe(1);
    const shell = shells[0] as HTMLElement;
    const btn = screenshotButton(fixture)!;
    expect(btn.getAttribute('aria-label')).toBe(
      'Capture screenshot of this page',
    );
    expect(shell.contains(btn)).toBe(true);
    expect(shell.contains(q(fixture, 'input[type="file"]')!)).toBe(true);
    expect(shell.contains(q(fixture, '.brw-composer-input')!)).toBe(true);
    expect(shell.contains(q(fixture, '.brw-send-btn')!)).toBe(true);
  });

  it('attaches a screenshot via captureScreenshot and renders a thumbnail chip', async () => {
    captureScreenshot.mockResolvedValueOnce(
      new Blob(['x'], { type: 'image/png' }),
    );
    const fixture = setup('pk_test_ss_attach');
    openPanel(fixture);
    await captureFullPage(fixture);
    expect(captureScreenshot).toHaveBeenCalledTimes(1);
    const chip = q<HTMLElement>(fixture, '.brw-chip');
    expect(chip).not.toBeNull();
    expect(chip?.textContent).toContain('screenshot');
    expect(
      q(fixture, '.brw-chip-remove[aria-label="Remove screenshot"]'),
    ).not.toBeNull();
    expect(q(fixture, '.brw-chip-preview-btn img')).not.toBeNull();
  });

  it('derives the screenshot attachment extension from its MIME type', async () => {
    captureScreenshot.mockResolvedValueOnce(
      new Blob(['x'], { type: 'image/webp' }),
    );
    submit.mockResolvedValueOnce({ ok: true, issue_id: 'rep_ext' });
    const fixture = setup('pk_test_ss_ext');
    openPanel(fixture);
    await captureFullPage(fixture);
    setDraft(fixture, 'with webp screenshot');
    await internals(fixture.componentInstance).doSubmit();
    const input = submit.mock.calls[0]![0] as {
      attachments: Array<{ blob: Blob; filename: string }>;
    };
    expect(input.attachments).toHaveLength(1);
    expect(input.attachments[0]!.filename).toBe('screenshot.webp');
  });

  it('surfaces an error in the panel when captureScreenshot rejects (never blocks submission)', async () => {
    captureScreenshot.mockRejectedValueOnce(new Error('canvas tainted'));
    const fixture = setup('pk_test_ss_err');
    openPanel(fixture);
    await captureFullPage(fixture);
    const alert = q<HTMLElement>(fixture, '.brw-error[role="alert"]');
    expect(alert?.textContent).toContain('canvas tainted');
    // No chip landed.
    expect(q(fixture, '.brw-chip')).toBeNull();
    // Send re-enables immediately — a capture failure must never block
    // submission.
    setDraft(fixture, 'still sendable');
    expect(q<HTMLButtonElement>(fixture, '.brw-send-btn')!.disabled).toBe(
      false,
    );
  });

  it('falls back to a generic alert when captureScreenshot rejects with a non-Error', async () => {
    captureScreenshot.mockRejectedValueOnce('tainted');
    const fixture = setup('pk_test_ss_err_nonerror');
    openPanel(fixture);
    await captureFullPage(fixture);
    const alert = q<HTMLElement>(fixture, '.brw-error[role="alert"]');
    expect(alert?.textContent).toContain('Screenshot capture failed');
    expect(q(fixture, '.brw-chip')).toBeNull();
  });

  it('quietly drops a null capture (non-browser platform guard) without chip or alert', async () => {
    // The Angular service resolves null on non-browser platforms. The guard
    // is unreachable from a real click (the button only exists in the DOM)
    // but must stay a silent no-op rather than crash on `null` blob access.
    captureScreenshot.mockResolvedValueOnce(null);
    const fixture = setup('pk_test_ss_null');
    openPanel(fixture);
    await captureFullPage(fixture);
    expect(captureScreenshot).toHaveBeenCalledTimes(1);
    expect(q(fixture, '.brw-chip')).toBeNull();
    expect(q(fixture, '.brw-error[role="alert"]')).toBeNull();
    // The capturing flag still resets — the button is usable again.
    expect(screenshotButton(fixture)!.disabled).toBe(false);
  });

  it('defaults the attachment extension to webp when the blob carries no MIME type', async () => {
    captureScreenshot.mockResolvedValueOnce(new Blob(['raw'], { type: '' }));
    submit.mockResolvedValueOnce({ ok: true, issue_id: 'rep_untyped' });
    const fixture = setup('pk_test_ss_untyped');
    openPanel(fixture);
    await captureFullPage(fixture);
    setDraft(fixture, 'untyped blob');
    await internals(fixture.componentInstance).doSubmit();
    const input = submit.mock.calls[0]![0] as {
      attachments: Array<{ blob: Blob; filename: string }>;
    };
    expect(input.attachments[0]!.filename).toBe('screenshot.webp');
  });

  it('minimize preserves draft and screenshot attachments across reopen', async () => {
    captureScreenshot.mockResolvedValueOnce(
      new Blob(['x'], { type: 'image/png' }),
    );
    const fixture = setup('pk_test_ss_min');
    openPanel(fixture);
    setDraft(fixture, 'draft to keep');
    await captureFullPage(fixture);
    q<HTMLButtonElement>(
      fixture,
      '.brw-icon-btn[aria-label="Minimize"]',
    )!.click();
    fixture.detectChanges();
    expect(q(fixture, '.brw-panel')).toBeNull();
    openPanel(fixture);
    expect(q<HTMLTextAreaElement>(fixture, '.brw-composer-input')!.value).toBe(
      'draft to keep',
    );
    expect(q(fixture, '.brw-chip-preview-btn')).not.toBeNull();
  });

  it('revokes the screenshot object URL on destroy', async () => {
    captureScreenshot.mockResolvedValueOnce(
      new Blob(['x'], { type: 'image/png' }),
    );
    const createObjectURL = vi
      .spyOn(URL, 'createObjectURL')
      .mockReturnValue('blob:brw-test-1');
    const revokeObjectURL = vi
      .spyOn(URL, 'revokeObjectURL')
      .mockImplementation(() => undefined);
    try {
      const fixture = setup('pk_test_ss_revoke');
      openPanel(fixture);
      await captureFullPage(fixture);
      expect(createObjectURL).toHaveBeenCalledTimes(1);
      fixture.destroy();
      expect(revokeObjectURL).toHaveBeenCalledWith('blob:brw-test-1');
    } finally {
      createObjectURL.mockRestore();
      revokeObjectURL.mockRestore();
    }
  });

  it('discarding the draft revokes the screenshot object URLs', async () => {
    captureScreenshot.mockResolvedValueOnce(
      new Blob(['x'], { type: 'image/png' }),
    );
    const createObjectURL = vi
      .spyOn(URL, 'createObjectURL')
      .mockReturnValue('blob:brw-discard-1');
    const revokeObjectURL = vi
      .spyOn(URL, 'revokeObjectURL')
      .mockImplementation(() => undefined);
    try {
      const fixture = setup('pk_test_ss_discard');
      openPanel(fixture);
      await captureFullPage(fixture);
      q<HTMLButtonElement>(
        fixture,
        '.brw-icon-btn[aria-label="Close"]',
      )!.click();
      fixture.detectChanges();
      btnByText(fixture, 'Discard')!.click();
      fixture.detectChanges();
      expect(revokeObjectURL).toHaveBeenCalledWith('blob:brw-discard-1');
    } finally {
      createObjectURL.mockRestore();
      revokeObjectURL.mockRestore();
    }
  });

  it('disables composer send + screenshot + file controls while submitting', async () => {
    let release: (r: SubmitResult) => void = () => undefined;
    submit.mockReturnValueOnce(
      new Promise<SubmitResult>((resolve) => {
        release = resolve;
      }),
    );
    const fixture = setup('pk_test_ss_submitting');
    openPanel(fixture);
    setDraft(fixture, 'in flight');
    const inflight = internals(fixture.componentInstance).doSubmit();
    fixture.detectChanges();
    expect(q<HTMLButtonElement>(fixture, '.brw-send-btn')!.disabled).toBe(true);
    expect(screenshotButton(fixture)!.disabled).toBe(true);
    expect(q<HTMLInputElement>(fixture, 'input[type="file"]')!.disabled).toBe(
      true,
    );
    release({ ok: true, issue_id: 'rep_inflight' });
    await inflight;
  });
});

describe('BwFeedbackButtonComponent — multi-screenshot + preview', () => {
  it('keeps both captures (no replace) and disambiguates filenames on submit', async () => {
    captureScreenshot.mockResolvedValueOnce(
      new Blob(['1'], { type: 'image/png' }),
    );
    captureScreenshot.mockResolvedValueOnce(
      new Blob(['2'], { type: 'image/webp' }),
    );
    submit.mockResolvedValueOnce({ ok: true, issue_id: 'rep_multi' });
    const fixture = setup('pk_test_ss_multi');
    openPanel(fixture);
    await captureFullPage(fixture);
    await captureFullPage(fixture);
    expect(
      q(fixture, '.brw-chip-remove[aria-label="Remove screenshot 1"]'),
    ).not.toBeNull();
    expect(
      q(fixture, '.brw-chip-remove[aria-label="Remove screenshot 2"]'),
    ).not.toBeNull();
    setDraft(fixture, 'two screenshots');
    await internals(fixture.componentInstance).doSubmit();
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
    const fixture = setup('pk_test_ss_cap');
    openPanel(fixture);
    for (let i = 0; i < 5; i++) await captureFullPage(fixture);
    expect(fixture.nativeElement.querySelectorAll('.brw-chip').length).toBe(5);
    const btn = screenshotButton(fixture)!;
    expect(btn.disabled).toBe(true);
    expect(btn.getAttribute('aria-label')).toBe(
      'Maximum 5 attachments reached',
    );
    expect(captureScreenshot).toHaveBeenCalledTimes(5);
  });

  it('shows a "Capturing screenshot…" bubble between region close and the chip render', async () => {
    let release: (b: Blob) => void = () => undefined;
    captureScreenshot.mockReturnValueOnce(
      new Promise<Blob>((resolve) => {
        release = resolve;
      }),
    );
    const fixture = setup('pk_test_ss_loading');
    openPanel(fixture);
    openOverlay(fixture);
    btnByText(fixture, 'Capture full page')!.click();
    fixture.detectChanges();
    // Capture is still pending — bubble + spinner visible, no chip yet.
    const bubbles = Array.from(
      fixture.nativeElement.querySelectorAll('.brw-bubble--assistant'),
    ) as HTMLElement[];
    const loading = bubbles.find((b) =>
      b.textContent?.includes('Capturing screenshot'),
    );
    expect(loading).not.toBeUndefined();
    expect(loading?.querySelector('.brw-spinner')).not.toBeNull();
    expect(q(fixture, '.brw-chip')).toBeNull();
    release(new Blob(['x'], { type: 'image/png' }));
    await flush(fixture);
    expect(q(fixture, '.brw-chip')).not.toBeNull();
    expect(fixture.nativeElement.textContent).not.toContain(
      'Capturing screenshot',
    );
  });

  it('disables the screenshot button while a capture is in flight', async () => {
    let release: (b: Blob) => void = () => undefined;
    captureScreenshot.mockReturnValueOnce(
      new Promise<Blob>((resolve) => {
        release = resolve;
      }),
    );
    const fixture = setup('pk_test_ss_inflight');
    openPanel(fixture);
    openOverlay(fixture);
    btnByText(fixture, 'Capture full page')!.click();
    fixture.detectChanges();
    const btn = screenshotButton(fixture)!;
    expect(btn.disabled).toBe(true);
    expect(btn.getAttribute('aria-label')).toBe('Capturing screenshot…');
    release(new Blob(['x'], { type: 'image/png' }));
    await flush(fixture);
    expect(screenshotButton(fixture)!.disabled).toBe(false);
    expect(screenshotButton(fixture)!.getAttribute('aria-label')).toBe(
      'Capture screenshot of this page',
    );
  });

  it('blocks Enter-to-send while a capture is in flight (no submit without the pending screenshot)', async () => {
    let release: (b: Blob) => void = () => undefined;
    captureScreenshot.mockReturnValueOnce(
      new Promise<Blob>((resolve) => {
        release = resolve;
      }),
    );
    const fixture = setup('pk_test_ss_enter_guard');
    openPanel(fixture);
    setDraft(fixture, 'partial draft');
    openOverlay(fixture);
    btnByText(fixture, 'Capture full page')!.click();
    fixture.detectChanges();
    // Send button disabled while Capture is in flight; the Enter path is
    // independently guarded inside doSubmit so the keyboard can't race
    // past the disabled-button protection.
    expect(q<HTMLButtonElement>(fixture, '.brw-send-btn')!.disabled).toBe(true);
    q<HTMLTextAreaElement>(fixture, '.brw-composer-input')!.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter' }),
    );
    await Promise.resolve();
    await Promise.resolve();
    expect(submit).not.toHaveBeenCalled();
    release(new Blob(['x'], { type: 'image/png' }));
    await flush(fixture);
    expect(q<HTMLButtonElement>(fixture, '.brw-send-btn')!.disabled).toBe(
      false,
    );
  });

  it('surfaces an error when a capture lands after the cap was reached', async () => {
    captureScreenshot.mockResolvedValueOnce(
      new Blob(['1'], { type: 'image/png' }),
    );
    let releaseSecond: (b: Blob) => void = () => undefined;
    captureScreenshot.mockReturnValueOnce(
      new Promise<Blob>((resolve) => {
        releaseSecond = resolve;
      }),
    );
    const fixture = setup('pk_test_ss_stale_cap');
    openPanel(fixture);
    await captureFullPage(fixture);
    // Kick off capture #2 (still pending).
    openOverlay(fixture);
    btnByText(fixture, 'Capture full page')!.click();
    fixture.detectChanges();
    // Fill the remaining 4 slots with files while capture #2 is in flight.
    internals(fixture.componentInstance).files.set([
      { id: 1, file: new File(['f'], 'f0.png') },
      { id: 2, file: new File(['f'], 'f1.png') },
      { id: 3, file: new File(['f'], 'f2.png') },
      { id: 4, file: new File(['f'], 'f3.png') },
    ]);
    fixture.detectChanges();
    // Resolve capture #2 — performCapture's post-await cap guard rejects the
    // stale capture and surfaces the alert instead of attaching a 6th chip.
    releaseSecond(new Blob(['2'], { type: 'image/png' }));
    await flush(fixture);
    const alert = q<HTMLElement>(fixture, '.brw-error[role="alert"]');
    expect(alert?.textContent).toContain('Maximum 5 attachments reached');
    expect(fixture.nativeElement.querySelectorAll('.brw-chip').length).toBe(5);
    expect(
      fixture.nativeElement.querySelectorAll('.brw-chip-preview-btn').length,
    ).toBe(1);
  });

  it('tapping a screenshot thumbnail opens a preview dialog with the captured image', async () => {
    captureScreenshot.mockResolvedValueOnce(
      new Blob(['x'], { type: 'image/png' }),
    );
    const createObjectURL = vi
      .spyOn(URL, 'createObjectURL')
      .mockReturnValue('blob:mock-preview');
    const revokeObjectURL = vi
      .spyOn(URL, 'revokeObjectURL')
      .mockImplementation(() => undefined);
    try {
      const fixture = setup('pk_test_ss_preview');
      openPanel(fixture);
      await captureFullPage(fixture);
      q<HTMLButtonElement>(
        fixture,
        '.brw-chip-preview-btn[aria-label="Preview screenshot"]',
      )!.click();
      fixture.detectChanges();
      const dialog = previewDialog(fixture);
      expect(dialog).not.toBeNull();
      const img = dialog!.querySelector(
        'img[alt="Captured screenshot"]',
      ) as HTMLImageElement;
      expect(img.getAttribute('src')).toBe('blob:mock-preview');
      q<HTMLButtonElement>(
        fixture,
        'button[aria-label="Close preview"]',
      )!.click();
      fixture.detectChanges();
      expect(previewDialog(fixture)).toBeNull();
    } finally {
      createObjectURL.mockRestore();
      revokeObjectURL.mockRestore();
    }
  });

  it('Esc dismisses the preview dialog without removing the screenshot', async () => {
    captureScreenshot.mockResolvedValueOnce(
      new Blob(['x'], { type: 'image/png' }),
    );
    const fixture = setup('pk_test_ss_preview_esc');
    openPanel(fixture);
    await captureFullPage(fixture);
    q<HTMLButtonElement>(fixture, '.brw-chip-preview-btn')!.click();
    fixture.detectChanges();
    previewDialog(fixture)!.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
    );
    fixture.detectChanges();
    expect(previewDialog(fixture)).toBeNull();
    // Chip survives the Esc — the screenshot is still attached.
    expect(q(fixture, '.brw-chip-preview-btn')).not.toBeNull();
  });

  // Regression (Copilot PR #158): the preview dialog wires Escape via its own
  // `(keydown)` handler but never received focus on open — focus stayed on the
  // underlying chip button, so a real keyboard Escape never reached
  // `onPreviewKeydown` and keyboard users could not dismiss the preview. The
  // fix registers the `#previewLayerEl` viewChild and focuses it on open
  // (mirroring the region overlay). Assert focus lands on the dialog root.
  it('moves focus to the preview dialog on open so Escape reaches the keydown handler', async () => {
    captureScreenshot.mockResolvedValueOnce(
      new Blob(['x'], { type: 'image/png' }),
    );
    const focusCalls: EventTarget[] = [];
    const originalFocus = HTMLElement.prototype.focus;
    const focusSpy = vi
      .spyOn(HTMLElement.prototype, 'focus')
      .mockImplementation(function (this: HTMLElement, ...args: unknown[]) {
        focusCalls.push(this);
        return (originalFocus as (...a: unknown[]) => void).apply(this, args);
      });
    try {
      const fixture = setup('pk_test_ss_preview_focus');
      openPanel(fixture);
      await captureFullPage(fixture);
      q<HTMLButtonElement>(fixture, '.brw-chip-preview-btn')!.click();
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();
      const dialog = previewDialog(fixture)!;
      expect(dialog).not.toBeNull();
      // The focus effect fired on the preview layer root — without it Escape
      // would never reach onPreviewKeydown from the chip button.
      expect(focusCalls).toContain(dialog);
    } finally {
      focusSpy.mockRestore();
    }
  });

  it('non-Escape keys on the preview dialog leave it open', async () => {
    captureScreenshot.mockResolvedValueOnce(
      new Blob(['x'], { type: 'image/png' }),
    );
    const fixture = setup('pk_test_ss_preview_other_key');
    openPanel(fixture);
    await captureFullPage(fixture);
    q<HTMLButtonElement>(fixture, '.brw-chip-preview-btn')!.click();
    fixture.detectChanges();
    previewDialog(fixture)!.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }),
    );
    fixture.detectChanges();
    expect(previewDialog(fixture)).not.toBeNull();
  });

  it('clicking the chip × does not open the preview dialog', async () => {
    captureScreenshot.mockResolvedValueOnce(
      new Blob(['x'], { type: 'image/png' }),
    );
    const fixture = setup('pk_test_ss_remove_no_preview');
    openPanel(fixture);
    await captureFullPage(fixture);
    q<HTMLButtonElement>(
      fixture,
      '.brw-chip-remove[aria-label="Remove screenshot"]',
    )!.click();
    fixture.detectChanges();
    expect(previewDialog(fixture)).toBeNull();
    expect(q(fixture, '.brw-chip-preview-btn')).toBeNull();
  });

  it('removing a screenshot while its preview is open closes the dialog', async () => {
    captureScreenshot.mockResolvedValueOnce(
      new Blob(['1'], { type: 'image/png' }),
    );
    captureScreenshot.mockResolvedValueOnce(
      new Blob(['2'], { type: 'image/png' }),
    );
    const fixture = setup('pk_test_ss_preview_remove');
    openPanel(fixture);
    await captureFullPage(fixture);
    await captureFullPage(fixture);
    q<HTMLButtonElement>(
      fixture,
      '.brw-chip-preview-btn[aria-label="Preview screenshot 2"]',
    )!.click();
    fixture.detectChanges();
    expect(previewDialog(fixture)).not.toBeNull();
    q<HTMLButtonElement>(
      fixture,
      '.brw-chip-remove[aria-label="Remove screenshot 2"]',
    )!.click();
    fixture.detectChanges();
    expect(previewDialog(fixture)).toBeNull();
  });
});

describe('BwFeedbackButtonComponent — region capture overlay', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('click on the screenshot button opens the overlay with skip + testid markers', () => {
    const fixture = setup('pk_test_ro_open');
    openPanel(fixture);
    openOverlay(fixture);
    const layer = overlay(fixture)!;
    expect(layer).not.toBeNull();
    // `data-testid` is a test-only hook; the SDK's capture scrub reads
    // `data-brevwick-skip`, which must be present on the layer, the
    // backdrop, and the controls strip.
    expect(layer.hasAttribute('data-brevwick-skip')).toBe(true);
    expect(layer.getAttribute('aria-label')).toBe('Select screenshot region');
    expect(
      q(fixture, '.brw-region-backdrop')!.hasAttribute('data-brevwick-skip'),
    ).toBe(true);
    expect(
      q(fixture, '.brw-region-controls')!.hasAttribute('data-brevwick-skip'),
    ).toBe(true);
  });

  it('renders a visually-hidden heading so the announcement matches the React overlay', () => {
    const fixture = setup('pk_test_ro_title');
    openPanel(fixture);
    openOverlay(fixture);
    const title = overlay(fixture)!.querySelector('h2.brw-sr-only');
    expect(title?.textContent?.trim()).toBe('Select screenshot region');
  });

  // Regression (Copilot PR #158, parity with the preview-dialog focus fix):
  // the region overlay must receive focus on open via `brwFocusOnInit` so its
  // `(keydown)` Escape/Enter handler works without an extra Tab — focus left
  // on the underlying screenshot button never reaches `onRegionKeydown`.
  it('moves focus to the region overlay on open so its keydown handler works', () => {
    const focusCalls: EventTarget[] = [];
    const originalFocus = HTMLElement.prototype.focus;
    const focusSpy = vi
      .spyOn(HTMLElement.prototype, 'focus')
      .mockImplementation(function (this: HTMLElement, ...args: unknown[]) {
        focusCalls.push(this);
        return (originalFocus as (...a: unknown[]) => void).apply(this, args);
      });
    try {
      const fixture = setup('pk_test_ro_focus');
      openPanel(fixture);
      openOverlay(fixture);
      const layer = overlay(fixture)!;
      expect(layer).not.toBeNull();
      expect(focusCalls).toContain(layer);
    } finally {
      focusSpy.mockRestore();
    }
  });

  it('propagates the theme input to the region overlay layer', () => {
    const fixture = setup('pk_test_ro_theme');
    fixture.componentRef.setInput('theme', 'dark');
    fixture.detectChanges();
    openPanel(fixture);
    openOverlay(fixture);
    expect(overlay(fixture)!.getAttribute('data-brw-theme')).toBe('dark');
  });

  it('Escape dismisses the overlay and leaves the main panel open', () => {
    const fixture = setup('pk_test_ro_esc');
    openPanel(fixture);
    openOverlay(fixture);
    overlay(fixture)!.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
    );
    fixture.detectChanges();
    expect(overlay(fixture)).toBeNull();
    expect(q(fixture, '.brw-panel')).not.toBeNull();
    expect(q(fixture, '.brw-composer-input')).not.toBeNull();
  });

  it('hides the feedback panel while the region overlay is open and restores it on cancel', () => {
    const fixture = setup('pk_test_ro_hidden');
    openPanel(fixture);
    const panel = q<HTMLElement>(fixture, '.brw-panel')!;
    expect(panel.className).not.toMatch(/brw-panel-hidden/);
    openOverlay(fixture);
    expect(panel.className).toMatch(/brw-panel-hidden/);
    btnByText(fixture, 'Cancel')!.click();
    fixture.detectChanges();
    expect(overlay(fixture)).toBeNull();
    expect(panel.className).not.toMatch(/brw-panel-hidden/);
  });

  it('preserves the composer draft across an open/cancel of the region overlay', () => {
    const fixture = setup('pk_test_ro_draft');
    openPanel(fixture);
    setDraft(fixture, 'regression repro for issue 49');
    openOverlay(fixture);
    btnByText(fixture, 'Cancel')!.click();
    fixture.detectChanges();
    expect(q<HTMLTextAreaElement>(fixture, '.brw-composer-input')!.value).toBe(
      'regression repro for issue 49',
    );
  });

  it('keeps the panel hidden through a "Capture full page" round-trip', async () => {
    captureScreenshot.mockResolvedValueOnce(
      new Blob(['full'], { type: 'image/webp' }),
    );
    const fixture = setup('pk_test_ro_roundtrip');
    openPanel(fixture);
    const panel = q<HTMLElement>(fixture, '.brw-panel')!;
    openOverlay(fixture);
    expect(panel.className).toMatch(/brw-panel-hidden/);
    btnByText(fixture, 'Capture full page')!.click();
    fixture.detectChanges();
    // Overlay closes synchronously; panel is visible again while the capture
    // resolves; the chip lands afterwards.
    expect(overlay(fixture)).toBeNull();
    expect(panel.className).not.toMatch(/brw-panel-hidden/);
    await flush(fixture);
    expect(q(fixture, '.brw-chip-preview-btn')).not.toBeNull();
  });

  it('pointer drag produces a visible selection rectangle sized to the drag', () => {
    const fixture = setup('pk_test_ro_drag');
    openPanel(fixture);
    openOverlay(fixture);
    drag(fixture, { x: 30, y: 40 }, { x: 230, y: 140 });
    const rect = q<HTMLElement>(
      fixture,
      '[data-testid="brw-region-selection"]',
    )!;
    expect(rect.style.left).toBe('30px');
    expect(rect.style.top).toBe('40px');
    expect(rect.style.width).toBe('200px');
    expect(rect.style.height).toBe('100px');
  });

  it('drag produces the same rectangle regardless of direction (upward drag)', () => {
    const fixture = setup('pk_test_ro_updrag');
    openPanel(fixture);
    openOverlay(fixture);
    // Dragging bottom-right → top-left should still anchor the rect's
    // x/y at the minimum corner.
    drag(fixture, { x: 200, y: 180 }, { x: 50, y: 60 });
    const rect = q<HTMLElement>(
      fixture,
      '[data-testid="brw-region-selection"]',
    )!;
    expect(rect.style.left).toBe('50px');
    expect(rect.style.top).toBe('60px');
    expect(rect.style.width).toBe('150px');
    expect(rect.style.height).toBe('120px');
  });

  it('confirm region crops the captured blob to the selection dimensions', async () => {
    const stub = installCropStub();
    try {
      captureScreenshot.mockResolvedValueOnce(
        new Blob(['full'], { type: 'image/webp' }),
      );
      // Pin dpr so the crop math is deterministic under the test.
      vi.stubGlobal('devicePixelRatio', 2);
      const fixture = setup('pk_test_ro_crop');
      openPanel(fixture);
      openOverlay(fixture);
      drag(fixture, { x: 10, y: 20 }, { x: 210, y: 120 });
      btnByText(fixture, 'Capture')!.click();
      fixture.detectChanges();
      await flush(fixture);
      expect(captureScreenshot).toHaveBeenCalledTimes(1);
      expect(q(fixture, '.brw-chip-preview-btn')).not.toBeNull();
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
      stub.restore();
    }
  });

  it('pointerdown bubbled from control buttons does not reset the drag selection', async () => {
    // Regression mirrored from the React adapter: pointerdown on the Cancel /
    // Capture / Capture-full-page buttons bubbles up to the overlay's
    // pointerdown handler. Without the `target !== currentTarget` guard, the
    // bubbled event reinitialises the drag to a zero-size rect and the
    // subsequent click hits the degenerate-shake path instead of cropping.
    const stub = installCropStub();
    try {
      captureScreenshot.mockResolvedValueOnce(
        new Blob(['full'], { type: 'image/webp' }),
      );
      vi.stubGlobal('devicePixelRatio', 1);
      const fixture = setup('pk_test_ro_bubble');
      openPanel(fixture);
      openOverlay(fixture);
      drag(fixture, { x: 30, y: 40 }, { x: 230, y: 140 });
      // Simulate the real-browser input sequence when the user clicks the
      // Capture button: pointerdown → pointerup → click, each bubbling.
      const captureBtn = btnByText(fixture, 'Capture')!;
      captureBtn.dispatchEvent(pointerEvent('pointerdown', { x: 400, y: 400 }));
      captureBtn.dispatchEvent(pointerEvent('pointerup', { x: 400, y: 400 }));
      captureBtn.click();
      fixture.detectChanges();
      await flush(fixture);
      expect(captureScreenshot).toHaveBeenCalledTimes(1);
      // Crop args reflect the original 200×100 drag, not a zero-size
      // restart at (400, 400).
      expect(stub.drawImageArgs).toHaveLength(1);
      const [, sx, sy, sw, sh] = stub.drawImageArgs[0]!;
      expect([sx, sy, sw, sh]).toEqual([30, 40, 200, 100]);
    } finally {
      stub.restore();
    }
  });

  it('"Capture full page" passes the uncropped blob through to the composer', async () => {
    const fullBlob = new Blob(['uncropped'], { type: 'image/webp' });
    captureScreenshot.mockResolvedValueOnce(fullBlob);
    submit.mockResolvedValueOnce({ ok: true, issue_id: 'rep_full' });
    const fixture = setup('pk_test_ro_full');
    openPanel(fixture);
    await captureFullPage(fixture);
    setDraft(fixture, 'full cap');
    await internals(fixture.componentInstance).doSubmit();
    const input = submit.mock.calls[0]![0] as {
      attachments: Array<{ blob: Blob; filename: string }>;
    };
    // Extension derives from the MIME of the full-page blob — and blob
    // identity proves no canvas crop happened in the full-page path.
    expect(input.attachments[0]!.filename).toBe('screenshot.webp');
    expect(input.attachments[0]!.blob).toBe(fullBlob);
  });

  it('degenerate selection on Capture shakes and does not invoke captureScreenshot', () => {
    const fixture = setup('pk_test_ro_degenerate');
    openPanel(fixture);
    openOverlay(fixture);
    // A 1×1 drag — below the REGION_MIN_SIDE_PX threshold.
    drag(fixture, { x: 50, y: 50 }, { x: 51, y: 51 });
    btnByText(fixture, 'Capture')!.click();
    fixture.detectChanges();
    expect(captureScreenshot).not.toHaveBeenCalled();
    const layer = overlay(fixture);
    expect(layer).not.toBeNull();
    expect(layer!.className).toMatch(/brw-region-shake/);
  });

  it('degenerate selection on Enter → overlay stays open, no capture', () => {
    const fixture = setup('pk_test_ro_degenerate_enter');
    openPanel(fixture);
    openOverlay(fixture);
    drag(fixture, { x: 100, y: 100 }, { x: 101, y: 101 });
    overlay(fixture)!.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }),
    );
    fixture.detectChanges();
    expect(captureScreenshot).not.toHaveBeenCalled();
    expect(overlay(fixture)).not.toBeNull();
  });

  it('overlay is removed before captureScreenshot resolves (capture sees no overlay chrome)', async () => {
    let resolveCapture: (b: Blob) => void = () => undefined;
    captureScreenshot.mockReturnValueOnce(
      new Promise<Blob>((resolve) => {
        resolveCapture = resolve;
      }),
    );
    const fixture = setup('pk_test_ro_teardown');
    openPanel(fixture);
    openOverlay(fixture);
    expect(overlay(fixture)).not.toBeNull();
    btnByText(fixture, 'Capture full page')!.click();
    fixture.detectChanges();
    // The capture promise is still pending — by now the overlay must already
    // be torn down so its transparent layer cannot bleed into the captured
    // page.
    expect(overlay(fixture)).toBeNull();
    resolveCapture(new Blob(['done'], { type: 'image/webp' }));
    await flush(fixture);
    expect(q(fixture, '.brw-chip-preview-btn')).not.toBeNull();
  });

  it('Cancel button closes the overlay without capture', () => {
    const fixture = setup('pk_test_ro_cancel');
    openPanel(fixture);
    openOverlay(fixture);
    btnByText(fixture, 'Cancel')!.click();
    fixture.detectChanges();
    expect(overlay(fixture)).toBeNull();
    expect(captureScreenshot).not.toHaveBeenCalled();
  });

  it('Enter while Cancel has focus closes the overlay (does not confirm region)', () => {
    const fixture = setup('pk_test_ro_enter_cancel');
    openPanel(fixture);
    openOverlay(fixture);
    // Build a non-degenerate selection: if Enter wrongly bubbled into the
    // overlay-level confirm, this would trigger a region capture (and we'd
    // see captureScreenshot invoked) rather than the Cancel click.
    drag(fixture, { x: 20, y: 30 }, { x: 220, y: 230 });
    const cancelBtn = btnByText(fixture, 'Cancel')!;
    cancelBtn.focus();
    // keydown targets the focused button and bubbles to the overlay root —
    // the guard must NOT preventDefault / confirm. The click simulates the
    // native Enter→click activation happy-dom doesn't synthesize.
    cancelBtn.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }),
    );
    cancelBtn.click();
    fixture.detectChanges();
    expect(overlay(fixture)).toBeNull();
    expect(captureScreenshot).not.toHaveBeenCalled();
  });

  it('Enter while Capture-full-page has focus runs the full-page capture', async () => {
    const fullBlob = new Blob(['uncropped-enter'], { type: 'image/webp' });
    captureScreenshot.mockResolvedValueOnce(fullBlob);
    submit.mockResolvedValueOnce({ ok: true, issue_id: 'rep_enter_full' });
    const fixture = setup('pk_test_ro_enter_full');
    openPanel(fixture);
    openOverlay(fixture);
    // Drag a non-degenerate selection to prove the region path is NOT the
    // one that fires (if Enter leaked to the overlay handler, the region
    // would crop rather than the full-page blob passing through).
    drag(fixture, { x: 20, y: 30 }, { x: 220, y: 230 });
    const fullBtn = btnByText(fixture, 'Capture full page')!;
    fullBtn.focus();
    fullBtn.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }),
    );
    fullBtn.click();
    fixture.detectChanges();
    await flush(fixture);
    expect(overlay(fixture)).toBeNull();
    expect(captureScreenshot).toHaveBeenCalledTimes(1);
    setDraft(fixture, 'enter full cap');
    await internals(fixture.componentInstance).doSubmit();
    const input = submit.mock.calls[0]![0] as {
      attachments: Array<{ blob: Blob; filename: string }>;
    };
    // Blob identity confirms no crop happened — the full-page path was taken.
    expect(input.attachments[0]!.blob).toBe(fullBlob);
  });

  it('re-opening the overlay starts from a clean slate (no stale selection)', () => {
    const fixture = setup('pk_test_ro_clean');
    openPanel(fixture);
    openOverlay(fixture);
    drag(fixture, { x: 30, y: 40 }, { x: 230, y: 140 });
    expect(q(fixture, '[data-testid="brw-region-selection"]')).not.toBeNull();
    btnByText(fixture, 'Cancel')!.click();
    fixture.detectChanges();
    openOverlay(fixture);
    expect(q(fixture, '[data-testid="brw-region-selection"]')).toBeNull();
  });

  it('non-primary-button pointerdown and dragless move/up never start a selection', () => {
    const fixture = setup('pk_test_ro_pointer_guards');
    openPanel(fixture);
    openOverlay(fixture);
    const layer = overlay(fixture)!;
    // Right-click directly on the overlay layer is ignored.
    layer.dispatchEvent(pointerEvent('pointerdown', { x: 5, y: 5, button: 2 }));
    // Move/up without an active drag are no-ops, not crashes.
    layer.dispatchEvent(pointerEvent('pointermove', { x: 80, y: 90 }));
    layer.dispatchEvent(pointerEvent('pointerup', { x: 80, y: 90 }));
    fixture.detectChanges();
    expect(q(fixture, '[data-testid="brw-region-selection"]')).toBeNull();
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
      const fixture = setup('pk_test_ro_enter_ok');
      openPanel(fixture);
      openOverlay(fixture);
      const layer = overlay(fixture)!;
      drag(fixture, { x: 10, y: 20 }, { x: 210, y: 120 });

      // Keys other than Enter/Escape are ignored by the overlay handler.
      layer.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'a', bubbles: true }),
      );
      fixture.detectChanges();
      expect(captureScreenshot).not.toHaveBeenCalled();
      expect(overlay(fixture)).not.toBeNull();

      layer.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }),
      );
      fixture.detectChanges();
      await flush(fixture);

      expect(captureScreenshot).toHaveBeenCalledTimes(1);
      expect(overlay(fixture)).toBeNull();
      expect(stub.drawImageArgs).toHaveLength(1);
      expect(q(fixture, '.brw-chip-preview-btn')).not.toBeNull();
    } finally {
      stub.restore();
      vi.unstubAllGlobals();
    }
  });

  it('rapid-fire degenerate confirms replace the shake timer; the shake settles after 320 ms', async () => {
    const fixture = setup('pk_test_ro_shake_settle');
    openPanel(fixture);
    openOverlay(fixture);
    const capture = btnByText(fixture, 'Capture')!;
    capture.click();
    fixture.detectChanges();
    expect(overlay(fixture)!.className).toContain('brw-region-shake');
    // Second degenerate confirm while the settle timer is pending —
    // replaces (clears) the in-flight timer instead of stacking.
    capture.click();
    fixture.detectChanges();
    expect(overlay(fixture)!.className).toContain('brw-region-shake');

    // The replaced timer fires once, ~320 ms later, and clears the shake.
    await new Promise((resolve) => setTimeout(resolve, 350));
    fixture.detectChanges();
    expect(overlay(fixture)).not.toBeNull();
    expect(overlay(fixture)!.className).not.toContain('brw-region-shake');
    expect(captureScreenshot).not.toHaveBeenCalled();
  });

  // Coverage for the `OffscreenCanvas` branch of `cropToRegion`. The main
  // crop test forces the `<canvas>` fallback (happy-dom's stock
  // `OffscreenCanvas`, where present, has no `convertToBlob`). This test
  // installs a minimal `OffscreenCanvas` shim with `getContext('2d')` +
  // `convertToBlob` and confirms the crop blob lands in the composer.
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
      const fixture = setup('pk_test_ro_offscreen');
      openPanel(fixture);
      openOverlay(fixture);
      drag(fixture, { x: 10, y: 20 }, { x: 210, y: 120 });
      btnByText(fixture, 'Capture')!.click();
      fixture.detectChanges();
      await flush(fixture);

      expect(q(fixture, '.brw-chip-preview-btn')).not.toBeNull();
      // Crop ran on the OffscreenCanvas stub with DPR-scaled source args.
      expect(drawImageCalls).toHaveLength(1);
      const [, sx, sy, sw, sh, , , dw, dh] = drawImageCalls[0]!;
      expect([sx, sy, sw, sh]).toEqual([20, 40, 400, 200]);
      expect([dw, dh]).toEqual([200, 100]);

      // The convertToBlob output (image/png) is what rides the submit —
      // not the <canvas> fallback.
      setDraft(fixture, 'offscreen crop');
      await internals(fixture.componentInstance).doSubmit();
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
  // OffscreenCanvas.prototype` guard routes to the `<canvas>.toBlob` fallback.
  // The partial OffscreenCanvas must never be constructed and the delivered
  // blob is the canvas output (`cropped:…`).
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
      const fixture = setup('pk_test_ro_offscreen_partial');
      openPanel(fixture);
      openOverlay(fixture);
      drag(fixture, { x: 10, y: 20 }, { x: 210, y: 120 });
      btnByText(fixture, 'Capture')!.click();
      fixture.detectChanges();
      await flush(fixture);

      expect(q(fixture, '.brw-chip-preview-btn')).not.toBeNull();
      // The partial OffscreenCanvas was skipped on the missing convertToBlob.
      expect(offscreenConstructed).toBe(false);
      expect(stub.drawImageArgs).toHaveLength(1);
      setDraft(fixture, 'fallback crop');
      await internals(fixture.componentInstance).doSubmit();
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
