import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  Brevwick,
  BrevwickConfig,
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

const makeInstance = (): Brevwick =>
  ({
    install,
    uninstall,
    submit,
    captureScreenshot,
    getConfig,
  }) as unknown as Brevwick;

beforeEach(() => {
  vi.clearAllMocks();
  createBrevwick.mockReturnValue(makeInstance());
});

describe('BwFeedbackButtonComponent', () => {
  it('renders a FAB on first paint with the default label', () => {
    TestBed.configureTestingModule({
      imports: [BwFeedbackButtonComponent],
      providers: [provideBrevwick({ projectKey: 'pk_test_fab' })],
    });
    const fixture = TestBed.createComponent(BwFeedbackButtonComponent);
    fixture.detectChanges();
    const button = fixture.nativeElement.querySelector(
      'button.bw-fab',
    ) as HTMLButtonElement | null;
    expect(button).not.toBeNull();
    expect(button?.textContent?.trim()).toBe('Feedback');
  });

  it('renders nothing when [hidden] is set', () => {
    TestBed.configureTestingModule({
      imports: [BwFeedbackButtonComponent],
      providers: [provideBrevwick({ projectKey: 'pk_test_hidden' })],
    });
    const fixture = TestBed.createComponent(BwFeedbackButtonComponent);
    fixture.componentRef.setInput('hidden', true);
    fixture.detectChanges();
    const button = fixture.nativeElement.querySelector('button.bw-fab');
    expect(button).toBeNull();
  });

  it('opens a panel when the FAB is clicked', () => {
    TestBed.configureTestingModule({
      imports: [BwFeedbackButtonComponent],
      providers: [provideBrevwick({ projectKey: 'pk_test_open' })],
    });
    const fixture = TestBed.createComponent(BwFeedbackButtonComponent);
    fixture.detectChanges();
    const fab = fixture.nativeElement.querySelector(
      'button.bw-fab',
    ) as HTMLButtonElement;
    fab.click();
    fixture.detectChanges();
    const panel = fixture.nativeElement.querySelector('.bw-panel');
    expect(panel).not.toBeNull();
    const textarea = fixture.nativeElement.querySelector(
      'textarea.bw-input',
    ) as HTMLTextAreaElement;
    expect(textarea).not.toBeNull();
  });

  it('submit button stays disabled while the draft is empty', () => {
    TestBed.configureTestingModule({
      imports: [BwFeedbackButtonComponent],
      providers: [provideBrevwick({ projectKey: 'pk_test_disabled' })],
    });
    const fixture = TestBed.createComponent(BwFeedbackButtonComponent);
    fixture.detectChanges();
    (
      fixture.nativeElement.querySelector('button.bw-fab') as HTMLButtonElement
    ).click();
    fixture.detectChanges();
    const sendBtn = fixture.nativeElement.querySelector(
      'button.bw-btn--primary',
    ) as HTMLButtonElement;
    expect(sendBtn.disabled).toBe(true);
  });

  it('submit() emits the SubmitResult and clears the draft on success', async () => {
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

    // Open + drive the draft signal directly, then invoke the protected
    // submit handler. Casting through a narrow test-only interface is the
    // canonical Angular-test escape hatch for protected members — the
    // specs use the same pattern to seed the `draft` signal.
    const internals = cmp as unknown as {
      draft: { set: (v: string) => void };
      onSubmitClick: () => Promise<void>;
    };
    internals.draft.set('A bug');
    await internals.onSubmitClick();

    expect(submit).toHaveBeenCalledTimes(1);
    expect(submit.mock.calls[0]![0]).toMatchObject({
      title: 'A bug',
      description: 'A bug',
    });
    expect(events).toEqual([{ ok: true, issue_id: 'cmp-1' }]);
  });

  it('surfaces the SDK error message when submit fails', async () => {
    submit.mockResolvedValueOnce({
      ok: false,
      error: { code: 'INGEST_REJECTED', message: 'Quota exceeded' },
    });
    TestBed.configureTestingModule({
      imports: [BwFeedbackButtonComponent],
      providers: [provideBrevwick({ projectKey: 'pk_test_err' })],
    });
    const fixture = TestBed.createComponent(BwFeedbackButtonComponent);
    fixture.detectChanges();
    const cmp = fixture.componentInstance;
    const internals = cmp as unknown as {
      draft: { set: (v: string) => void };
      open: { set: (v: boolean) => void };
      onSubmitClick: () => Promise<void>;
    };
    internals.draft.set('broken');
    internals.open.set(true);
    await internals.onSubmitClick();
    fixture.detectChanges();
    const err = fixture.nativeElement.querySelector('.bw-error');
    expect(err?.textContent?.trim()).toBe('Quota exceeded');
  });

  it('does not emit submit on a destroyed view', async () => {
    let resolve!: (value: SubmitResult) => void;
    submit.mockImplementationOnce(
      () => new Promise<SubmitResult>((r) => (resolve = r)),
    );
    TestBed.configureTestingModule({
      imports: [BwFeedbackButtonComponent],
      providers: [provideBrevwick({ projectKey: 'pk_test_destroy_emit' })],
    });
    const fixture = TestBed.createComponent(BwFeedbackButtonComponent);
    fixture.detectChanges();
    const cmp = fixture.componentInstance;
    const events: unknown[] = [];
    cmp.submit.subscribe((e) => events.push(e));

    const internals = cmp as unknown as {
      draft: { set: (v: string) => void };
      onSubmitClick: () => Promise<void>;
    };
    internals.draft.set('hello');
    const inflight = internals.onSubmitClick();
    fixture.destroy();
    resolve({ ok: true, issue_id: 'late' });
    await inflight;

    expect(events).toEqual([]);
  });
});
