import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
// `expect.extend(vitest-axe/matchers)` runs once per process in
// `vitest.setup.ts`; the matching type augmentation lives in
// `src/__tests__/vitest-axe.d.ts` so `toHaveNoViolations()` type-checks
// without per-call casts.
import { axe } from 'vitest-axe';
import type {
  Brevwick,
  BrevwickConfig,
  ProjectConfig,
  SubmitResult,
} from 'brevwick-sdk';
import pkg from '../../package.json' with { type: 'json' };

const submit = vi.fn<(input: unknown) => Promise<SubmitResult>>();
const captureScreenshot = vi.fn<() => Promise<Blob>>();
const getConfig = vi.fn<() => Promise<ProjectConfig | null>>();
const install = vi.fn();
const uninstall = vi.fn();

vi.mock('brevwick-sdk', async () => {
  const actual =
    await vi.importActual<typeof import('brevwick-sdk')>('brevwick-sdk');
  return {
    ...actual,
    createBrevwick: (_config: BrevwickConfig) =>
      ({
        install,
        uninstall,
        submit,
        captureScreenshot,
        getConfig,
      }) as unknown as Brevwick,
  };
});

import { BrevwickProvider } from '../provider';
import { FeedbackButton, type FeedbackButtonProps } from '../feedback-button';
import { BREVWICK_CSS, BREVWICK_STYLE_ID } from '../styles';

beforeEach(() => {
  // happy-dom lacks createObjectURL / revokeObjectURL by default; stub both
  // so the screenshot preview paths don't throw before the spy hooks in.
  if (typeof URL.createObjectURL !== 'function') {
    (
      URL as unknown as { createObjectURL: (b: Blob) => string }
    ).createObjectURL = () => 'blob:mock';
  }
  if (typeof URL.revokeObjectURL !== 'function') {
    (
      URL as unknown as { revokeObjectURL: (u: string) => void }
    ).revokeObjectURL = () => undefined;
  }
  // Existing render tests expect the AI toggle to stay hidden unless they
  // opt into a config shape that enables it, so default getConfig to null.
  getConfig.mockResolvedValue(null);
});

afterEach(() => {
  vi.clearAllMocks();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const mount = (props: FeedbackButtonProps = {}) =>
  render(
    <BrevwickProvider config={{ projectKey: 'pk_test_fab' }}>
      <FeedbackButton onSubmit={onSubmitSpy} {...props} />
    </BrevwickProvider>,
  );

const onSubmitSpy = vi.fn();

afterEach(() => {
  onSubmitSpy.mockReset();
});

function openPanel(): void {
  fireEvent.click(screen.getByRole('button', { name: /open feedback form/i }));
}

/**
 * Drive the screenshot button through the #31 region-capture overlay the
 * pre-existing tests expect "click screenshot → blob in composer" from.
 * Post-#31, the button opens an overlay and the user picks between a
 * region crop and a full-page capture — here we take the latter path,
 * which is the closest analogue to the pre-#31 behaviour.
 */
async function captureFullPage(): Promise<void> {
  await act(async () => {
    fireEvent.click(
      screen.getByRole('button', {
        name: /capture screenshot of this page/i,
      }),
    );
  });
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: /capture full page/i }));
  });
}

function getComposer(): HTMLTextAreaElement {
  return screen.getByRole('textbox', {
    name: /feedback message/i,
  }) as HTMLTextAreaElement;
}

function typeDraft(text: string): void {
  fireEvent.change(getComposer(), { target: { value: text } });
}

describe('<FeedbackButton>', () => {
  it('renders an anchored panel with data-brevwick-skip on the FAB and panel', () => {
    mount();
    const fab = screen.getByRole('button', { name: /open feedback form/i });
    expect(fab).toHaveAttribute('data-brevwick-skip');
    expect(fab.className).toMatch(/brw-fab/);

    openPanel();

    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('data-brevwick-skip');
    expect(dialog.className).toMatch(/brw-panel/);
    expect(dialog.className).toMatch(/brw-panel-br/);
    expect(screen.getByText(/send feedback/i)).toBeInTheDocument();
    expect(
      screen.getByText(/Hi! Tell us what's happening/i),
    ).toBeInTheDocument();
  });

  it('renders a Brevwick credit footer linking to brevwick.dev on open', () => {
    mount();
    openPanel();

    const link = screen.getByRole('link', { name: /brevwick v/i });
    expect(link).toHaveAttribute('href', 'https://brevwick.dev');
    expect(link).toHaveAttribute('target', '_blank');
    // noopener is a hard requirement for external target=_blank links — without
    // it the opened tab can hijack window.opener on older engines. rel must
    // carry both tokens, in either order.
    expect(link.getAttribute('rel')).toMatch(/noopener/);
    expect(link.getAttribute('rel')).toMatch(/noreferrer/);
    expect(link).toHaveTextContent(`Brevwick v${pkg.version}`);
  });

  it('keeps the credit footer visible in the success state', async () => {
    submit.mockResolvedValueOnce({ ok: true, issue_id: 'rep_footer' });
    mount();
    openPanel();
    typeDraft('Hello');

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /^send$/i }));
    });

    expect(screen.getByRole('link', { name: /brevwick v/i })).toHaveAttribute(
      'href',
      'https://brevwick.dev',
    );
  });

  it('applies the bottom-left position class to FAB and panel', () => {
    mount({ position: 'bottom-left' });
    const fab = screen.getByRole('button', { name: /open feedback form/i });
    expect(fab.className).toMatch(/brw-fab-bl/);
    expect(fab.className).not.toMatch(/brw-fab-br/);
    openPanel();
    const dialog = screen.getByRole('dialog');
    expect(dialog.className).toMatch(/brw-panel-bl/);
    expect(dialog.className).not.toMatch(/brw-panel-br/);
  });

  it('Enter submits, Shift+Enter inserts a newline', async () => {
    submit.mockResolvedValueOnce({ ok: true, issue_id: 'rep_enter' });
    mount();
    openPanel();
    const textarea = getComposer();

    // Shift+Enter should not submit — simulate by setting value directly
    // (happy-dom does not natively translate keydown into insertion).
    fireEvent.change(textarea, { target: { value: 'line one\nline two' } });
    fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: true });
    expect(submit).not.toHaveBeenCalled();
    expect(textarea.value).toBe('line one\nline two');

    await act(async () => {
      fireEvent.keyDown(textarea, { key: 'Enter' });
    });

    expect(submit).toHaveBeenCalledTimes(1);
    const input = submit.mock.calls[0]![0] as {
      description: string;
      title?: string;
    };
    expect(input.description).toBe('line one\nline two');
    expect(input.title).toBe('line one');
  });

  it('submits via the Send button and shows success + Send another', async () => {
    submit.mockResolvedValueOnce({ ok: true, issue_id: 'rep_ok' });
    mount();
    openPanel();
    typeDraft('Broken flow');

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /^send$/i }));
    });

    expect(onSubmitSpy).toHaveBeenCalledWith({
      ok: true,
      issue_id: 'rep_ok',
    });
    // Panel stays open, thread replaced with success state.
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(/on its way/i);
    // Composer is gone in the success state.
    expect(
      screen.queryByRole('textbox', { name: /feedback message/i }),
    ).toBeNull();

    // "Send another" resets to an empty thread.
    fireEvent.click(screen.getByRole('button', { name: /send another/i }));
    const fresh = getComposer();
    expect(fresh.value).toBe('');
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('does not submit when the composer is empty (send button disabled)', () => {
    mount();
    openPanel();
    const sendButton = screen.getByRole('button', { name: /^send$/i });
    expect(sendButton).toBeDisabled();
    fireEvent.click(sendButton);
    expect(submit).not.toHaveBeenCalled();
  });

  it('surfaces an inline error and keeps the panel open on failure', async () => {
    submit.mockResolvedValueOnce({
      ok: false,
      error: { code: 'INGEST_REJECTED', message: 'quota exceeded' },
    });
    mount();
    openPanel();
    typeDraft('Broken flow');

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /^send$/i }));
    });

    expect(
      screen.getByText(/quota exceeded/i, { selector: '[role="alert"]' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('invokes onSubmit with the { ok: false, error } shape on failure', async () => {
    const failure: SubmitResult = {
      ok: false,
      error: { code: 'INGEST_REJECTED', message: 'nope' },
    };
    submit.mockResolvedValueOnce(failure);
    mount();
    openPanel();
    typeDraft('x');

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /^send$/i }));
    });
    expect(onSubmitSpy).toHaveBeenCalledWith(failure);
  });

  it('surfaces a recovery message when submit() rejects (chunk load failure)', async () => {
    submit.mockRejectedValueOnce(new Error('chunk load failed'));
    mount();
    openPanel();
    typeDraft('oops');

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /^send$/i }));
    });

    expect(
      screen.getByText(/chunk load failed/i, { selector: '[role="alert"]' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('attaches a screenshot via captureScreenshot and renders a chip', async () => {
    const blob = new Blob(['x'], { type: 'image/png' });
    captureScreenshot.mockResolvedValueOnce(blob);
    mount();
    openPanel();

    await captureFullPage();
    expect(captureScreenshot).toHaveBeenCalledTimes(1);
    expect(
      screen.getByRole('button', { name: /remove screenshot/i }),
    ).toBeInTheDocument();
  });

  it('derives the screenshot attachment extension from its MIME type', async () => {
    const blob = new Blob(['x'], { type: 'image/webp' });
    captureScreenshot.mockResolvedValueOnce(blob);
    submit.mockResolvedValueOnce({ ok: true, issue_id: 'rep_ext' });
    mount();
    openPanel();
    await captureFullPage();
    typeDraft('with screenshot');
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /^send$/i }));
    });

    const input = submit.mock.calls[0]![0] as {
      attachments: Array<{ blob: Blob; filename: string }>;
    };
    expect(input.attachments[0]!.filename).toBe('screenshot.webp');
  });

  it('surfaces an error in the panel when captureScreenshot rejects', async () => {
    captureScreenshot.mockRejectedValueOnce(new Error('canvas tainted'));
    mount();
    openPanel();

    await captureFullPage();

    expect(
      screen.getByText(/canvas tainted/i, { selector: '[role="alert"]' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /remove screenshot/i }),
    ).toBeNull();
  });

  it('minimize preserves draft and attachments across reopen', async () => {
    const blob = new Blob(['x'], { type: 'image/png' });
    captureScreenshot.mockResolvedValueOnce(blob);
    mount();
    openPanel();
    typeDraft('half-typed message');
    await captureFullPage();

    fireEvent.click(screen.getByRole('button', { name: /^minimize$/i }));
    expect(screen.queryByRole('dialog')).toBeNull();

    openPanel();
    expect(getComposer().value).toBe('half-typed message');
    expect(
      screen.getByRole('button', { name: /remove screenshot/i }),
    ).toBeInTheDocument();
  });

  it('close when clean dismisses immediately and clears state', () => {
    mount();
    openPanel();
    fireEvent.click(screen.getByRole('button', { name: /^close$/i }));
    expect(screen.queryByRole('dialog')).toBeNull();

    openPanel();
    expect(getComposer().value).toBe('');
  });

  it('close when dirty shows a confirm; Discard clears, Keep preserves', () => {
    mount();
    openPanel();
    typeDraft('draft-content');

    fireEvent.click(screen.getByRole('button', { name: /^close$/i }));
    // Panel remains open, confirm inline renders.
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    const confirm = screen.getByRole('alert', {
      name: /discard draft/i,
    });
    expect(
      within(confirm).getByRole('button', { name: /keep/i }),
    ).toBeInTheDocument();

    // Keep → confirm disappears, draft remains.
    fireEvent.click(within(confirm).getByRole('button', { name: /keep/i }));
    expect(screen.queryByRole('alert', { name: /discard draft/i })).toBeNull();
    expect(getComposer().value).toBe('draft-content');

    // Close again → Discard → panel closes and reopens empty.
    fireEvent.click(screen.getByRole('button', { name: /^close$/i }));
    fireEvent.click(screen.getByRole('button', { name: /discard/i }));
    expect(screen.queryByRole('dialog')).toBeNull();
    openPanel();
    expect(getComposer().value).toBe('');
  });

  it('expected/actual are hidden by default and revealed via disclosure', () => {
    mount();
    openPanel();
    expect(screen.queryByRole('textbox', { name: /expected/i })).toBeNull();
    fireEvent.click(
      screen.getByRole('button', { name: /add expected vs actual/i }),
    );
    expect(
      screen.getByRole('textbox', { name: /expected/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('textbox', { name: /actual/i }),
    ).toBeInTheDocument();
  });

  it('passes expected/actual into the submit payload when filled', async () => {
    submit.mockResolvedValueOnce({ ok: true, issue_id: 'rep_ea' });
    mount();
    openPanel();
    typeDraft('bug');
    fireEvent.click(
      screen.getByRole('button', { name: /add expected vs actual/i }),
    );
    fireEvent.change(screen.getByRole('textbox', { name: /expected/i }), {
      target: { value: 'should succeed' },
    });
    fireEvent.change(screen.getByRole('textbox', { name: /actual/i }), {
      target: { value: 'failed' },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /^send$/i }));
    });
    const input = submit.mock.calls[0]![0] as {
      expected?: string;
      actual?: string;
    };
    expect(input.expected).toBe('should succeed');
    expect(input.actual).toBe('failed');
  });

  it('renders nothing when hidden', () => {
    render(
      <BrevwickProvider config={{ projectKey: 'pk_test_hidden' }}>
        <FeedbackButton hidden />
      </BrevwickProvider>,
    );
    expect(
      screen.queryByRole('button', { name: /open feedback form/i }),
    ).toBeNull();
  });

  it('renders a disabled FAB when disabled prop is true and does not open the panel', () => {
    mount({ disabled: true });
    const fab = screen.getByRole('button', { name: /open feedback form/i });
    expect(fab).toBeDisabled();
    fireEvent.click(fab);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('revokes the screenshot object URL on unmount', async () => {
    const blob = new Blob(['x'], { type: 'image/png' });
    captureScreenshot.mockResolvedValueOnce(blob);
    const createObjectURL = vi
      .spyOn(URL, 'createObjectURL')
      .mockReturnValue('blob:mock-unmount');
    const revokeObjectURL = vi
      .spyOn(URL, 'revokeObjectURL')
      .mockImplementation(() => undefined);

    const { unmount } = mount();
    openPanel();
    await captureFullPage();
    expect(createObjectURL).toHaveBeenCalled();

    unmount();

    expect(revokeObjectURL).toHaveBeenCalledWith('blob:mock-unmount');
    createObjectURL.mockRestore();
    revokeObjectURL.mockRestore();
  });

  it('exposes a polite aria-live log for the thread', () => {
    mount();
    openPanel();
    const log = screen.getByRole('log', { name: /conversation/i });
    expect(log).toHaveAttribute('aria-live', 'polite');
  });

  it('thread log switches to confirmation after success for assistive tech', async () => {
    submit.mockResolvedValueOnce({ ok: true, issue_id: 'rep_live' });
    mount();
    openPanel();
    typeDraft('x');
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /^send$/i }));
    });
    const log = screen.getByRole('log', { name: /confirmation/i });
    expect(log).toHaveAttribute('aria-live', 'polite');
  });

  it('disables composer send + icons while submitting (guards double-send)', async () => {
    // Pending submission keeps status === 'submitting' indefinitely for the assertion.
    let release: (r: SubmitResult) => void = () => undefined;
    submit.mockReturnValueOnce(
      new Promise<SubmitResult>((resolve) => {
        release = resolve;
      }),
    );
    mount();
    openPanel();
    typeDraft('x');
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /^send$/i }));
    });

    expect(
      screen.getByRole('button', { name: /^send$/i }) as HTMLButtonElement,
    ).toBeDisabled();
    expect(
      screen.getByRole('button', { name: /capture screenshot of this page/i }),
    ).toBeDisabled();

    await act(async () => {
      release({ ok: true, issue_id: 'rep_done' });
      await Promise.resolve();
    });
    await waitFor(() => expect(screen.getByRole('status')).toBeInTheDocument());
  });

  it('bundles a slide-up animation with a prefers-reduced-motion override', () => {
    // Guard against stripping the reduced-motion guard from the bundled CSS.
    expect(BREVWICK_CSS).toMatch(/@keyframes brw-slide-up/);
    expect(BREVWICK_CSS).toMatch(
      /@media \(prefers-reduced-motion: reduce\)[\s\S]*\.brw-panel[^{]*\{[^}]*animation:\s*none/,
    );
    // FAB hover transition must also be disabled under reduced-motion so a
    // CSS edit that drops the `.brw-fab { transition: none; }` rule is
    // caught by the test suite.
    expect(BREVWICK_CSS).toMatch(
      /@media \(prefers-reduced-motion: reduce\)[\s\S]*\.brw-fab[^{]*\{[^}]*transition:\s*none/,
    );
    expect(BREVWICK_STYLE_ID).toBe('brevwick-react-styles');
  });

  it('Esc minimizes (preserves draft + attachments), does not destroy state', async () => {
    const blob = new Blob(['x'], { type: 'image/png' });
    captureScreenshot.mockResolvedValueOnce(blob);
    mount();
    openPanel();
    typeDraft('draft survives esc');
    await captureFullPage();

    // Radix's dialog listens on the document; target the dialog content.
    const dialog = screen.getByRole('dialog');
    fireEvent.keyDown(dialog, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();

    openPanel();
    expect(getComposer().value).toBe('draft survives esc');
    expect(
      screen.getByRole('button', { name: /remove screenshot/i }),
    ).toBeInTheDocument();
  });

  it('submit resolving while minimized pops the panel back open with success', async () => {
    let release: (r: SubmitResult) => void = () => undefined;
    submit.mockReturnValueOnce(
      new Promise<SubmitResult>((resolve) => {
        release = resolve;
      }),
    );
    mount();
    openPanel();
    typeDraft('hello while hidden');

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /^send$/i }));
    });

    // Minimize mid-submit.
    fireEvent.click(screen.getByRole('button', { name: /^minimize$/i }));
    expect(screen.queryByRole('dialog')).toBeNull();

    // Resolve the in-flight submit successfully. The panel must pop back
    // open so the user actually sees the confirmation — a silent success
    // while hidden is the worst-of-three outcomes.
    await act(async () => {
      release({ ok: true, issue_id: 'rep_after_min' });
      await Promise.resolve();
    });
    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent(/on its way/i),
    );
  });

  it('submit failure resolving while minimized pops the panel back open with alert', async () => {
    let release: (r: SubmitResult) => void = () => undefined;
    submit.mockReturnValueOnce(
      new Promise<SubmitResult>((resolve) => {
        release = resolve;
      }),
    );
    mount();
    openPanel();
    typeDraft('hello failure');

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /^send$/i }));
    });

    fireEvent.click(screen.getByRole('button', { name: /^minimize$/i }));
    expect(screen.queryByRole('dialog')).toBeNull();

    await act(async () => {
      release({
        ok: false,
        error: { code: 'INGEST_REJECTED', message: 'quota' },
      });
      await Promise.resolve();
    });
    await waitFor(() =>
      expect(
        screen.getByText(/quota/i, { selector: '[role="alert"]' }),
      ).toBeInTheDocument(),
    );
  });

  it('"Send another" returns focus to the composer textarea', async () => {
    submit.mockResolvedValueOnce({ ok: true, issue_id: 'rep_focus' });
    mount();
    openPanel();
    typeDraft('will send');
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /^send$/i }));
    });
    expect(screen.getByRole('status')).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /send another/i }));
    });
    const textarea = getComposer();
    expect(document.activeElement).toBe(textarea);
  });

  it('close on a success-state panel dismisses without a confirm', async () => {
    submit.mockResolvedValueOnce({ ok: true, issue_id: 'rep_succ_close' });
    mount();
    openPanel();
    typeDraft('landing');
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /^send$/i }));
    });
    expect(screen.getByRole('status')).toBeInTheDocument();

    // × on the success-state panel: no confirm dialog, panel closes,
    // next open is empty.
    fireEvent.click(screen.getByRole('button', { name: /^close$/i }));
    expect(screen.queryByRole('alert', { name: /discard draft/i })).toBeNull();
    expect(screen.queryByRole('dialog')).toBeNull();

    openPanel();
    expect(getComposer().value).toBe('');
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('close button is disabled while a submit is in flight', async () => {
    let release: (r: SubmitResult) => void = () => undefined;
    submit.mockReturnValueOnce(
      new Promise<SubmitResult>((resolve) => {
        release = resolve;
      }),
    );
    mount();
    openPanel();
    typeDraft('pending');
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /^send$/i }));
    });
    expect(
      screen.getByRole('button', { name: /^close$/i }) as HTMLButtonElement,
    ).toBeDisabled();
    await act(async () => {
      release({ ok: true, issue_id: 'rep_unblock' });
      await Promise.resolve();
    });
  });

  it('submit rejects → × shows the discard confirm with the draft still populated', async () => {
    submit.mockRejectedValueOnce(new Error('ingest down'));
    mount();
    openPanel();
    typeDraft('will fail');
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /^send$/i }));
    });
    // Status is back to 'error', close should no longer be disabled.
    expect(
      screen.getByText(/ingest down/i, { selector: '[role="alert"]' }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /^close$/i }));
    const confirm = screen.getByRole('alert', {
      name: /discard draft/i,
    });
    expect(confirm).toBeInTheDocument();
    // Keep → the draft is still in the composer.
    fireEvent.click(within(confirm).getByRole('button', { name: /keep/i }));
    expect(getComposer().value).toBe('will fail');
  });

  it('Enter+Ctrl/Meta/Alt does not submit (reserved for platform shortcuts)', async () => {
    mount();
    openPanel();
    typeDraft('modifier guard');
    const textarea = getComposer();

    fireEvent.keyDown(textarea, { key: 'Enter', ctrlKey: true });
    fireEvent.keyDown(textarea, { key: 'Enter', metaKey: true });
    fireEvent.keyDown(textarea, { key: 'Enter', altKey: true });
    expect(submit).not.toHaveBeenCalled();

    // Plain Enter still submits.
    submit.mockResolvedValueOnce({ ok: true, issue_id: 'rep_mod' });
    await act(async () => {
      fireEvent.keyDown(textarea, { key: 'Enter' });
    });
    expect(submit).toHaveBeenCalledTimes(1);
  });

  it('attachment chips use stable keys (removing a middle duplicate-named file keeps survivors)', () => {
    mount();
    openPanel();

    const input = document.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement;
    expect(input).toBeTruthy();
    const a = new File(['a'], 'log.txt', { type: 'text/plain' });
    const b = new File(['bb'], 'log.txt', { type: 'text/plain' });
    const c = new File(['ccc'], 'log.txt', { type: 'text/plain' });
    // happy-dom FileList: build via DataTransfer
    const dt = new DataTransfer();
    dt.items.add(a);
    dt.items.add(b);
    dt.items.add(c);
    fireEvent.change(input, { target: { files: dt.files } });

    const removeButtons = screen.getAllByRole('button', {
      name: /remove log\.txt/i,
    });
    expect(removeButtons).toHaveLength(3);

    // Remove the middle chip. Survivors (0 and 2) must still render.
    fireEvent.click(removeButtons[1]!);
    expect(
      screen.getAllByRole('button', { name: /remove log\.txt/i }),
    ).toHaveLength(2);
  });

  it('dark-mode chip background is distinct from the border colour (contrast)', () => {
    // Pull the dark-mode block out and assert --brw-chip-bg is not the same
    // as --brw-border — a regression where they match hides the chip's 1px
    // border in dark mode.
    const darkBlock = BREVWICK_CSS.match(
      /@media \(prefers-color-scheme: dark\)[\s\S]*?\n\s*\}\n\s*\}/,
    );
    expect(darkBlock).not.toBeNull();
    const block = darkBlock![0];
    const borderMatch = block.match(/--brw-border:\s*([^;]+);/);
    const chipBgMatch = block.match(/--brw-chip-bg:\s*([^;]+);/);
    expect(borderMatch).not.toBeNull();
    expect(chipBgMatch).not.toBeNull();
    expect(chipBgMatch![1]!.trim()).not.toBe(borderMatch![1]!.trim());
  });

  it('composer textarea carries an accessible name (aria-label)', () => {
    mount();
    openPanel();
    const textarea = getComposer();
    expect(textarea).toHaveAttribute('aria-label', 'Feedback message');
  });

  it('disclosure toggle flips aria-expanded in both states', () => {
    mount();
    openPanel();
    const toggle = screen.getByRole('button', {
      name: /add expected vs actual/i,
    });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(toggle);
    const toggleOpen = screen.getByRole('button', {
      name: /hide expected vs actual/i,
    });
    expect(toggleOpen).toHaveAttribute('aria-expanded', 'true');
  });

  it('disclosure uses a per-instance id so two buttons do not collide', () => {
    render(
      <BrevwickProvider config={{ projectKey: 'pk_test_dupe' }}>
        <FeedbackButton />
        <FeedbackButton position="bottom-left" />
      </BrevwickProvider>,
    );
    const fabs = screen.getAllByRole('button', {
      name: /open feedback form/i,
    });
    fireEvent.click(fabs[0]!);
    fireEvent.click(fabs[1]!);
    const toggles = screen.getAllByRole('button', {
      name: /add expected vs actual/i,
    });
    const ids = toggles.map((t) => t.getAttribute('aria-controls'));
    expect(ids[0]).toBeTruthy();
    expect(ids[1]).toBeTruthy();
    expect(ids[0]).not.toBe(ids[1]);
  });

  it('file input carries an accessible name directly (not only via <label>)', () => {
    mount();
    openPanel();
    const fileInput = screen
      .getByRole('dialog')
      .querySelector('input[type="file"]') as HTMLInputElement;
    expect(fileInput).toBeTruthy();
    expect(fileInput).toHaveAttribute('aria-label', 'Attach file');
  });

  it('discard confirm moves focus to Keep so Enter preserves the draft', () => {
    mount();
    openPanel();
    typeDraft('precious');
    fireEvent.click(screen.getByRole('button', { name: /^close$/i }));
    const keep = screen.getByRole('button', { name: /keep/i });
    expect(keep).toHaveFocus();
  });

  it('submits the raw draft so the bubble and payload stay in sync', async () => {
    submit.mockResolvedValueOnce({ ok: true, issue_id: 'rep_ws' });
    mount();
    openPanel();
    // Trailing newlines and whitespace — the user's intentional formatting.
    typeDraft('  hello world\n\n');
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /^send$/i }));
    });
    const input = submit.mock.calls[0]![0] as {
      description: string;
      title?: string;
    };
    expect(input.description).toBe('  hello world\n\n');
    // Title still derived from the first non-empty line so it remains useful.
    expect(input.title).toBe('hello world');
  });
});

describe('<FeedbackButton> — Use AI toggle', () => {
  async function mountAndOpen(): Promise<void> {
    mount();
    openPanel();
    // Flush the getConfig() microtask so the ProjectConfig state settles.
    await act(async () => {
      await Promise.resolve();
    });
  }

  function queryAiToggle(): HTMLElement | null {
    return screen.queryByRole('switch', { name: /format with ai/i });
  }

  it('does not fetch config on mount — only on first panel open', async () => {
    getConfig.mockResolvedValue({
      ai_enabled: true,
      ai_submitter_choice_allowed: true,
    });
    mount();
    // Mount alone must not touch the network-bound config endpoint — the
    // "zero-cost until opened" property is the whole point of lazy fetch.
    expect(getConfig).not.toHaveBeenCalled();
    openPanel();
    await act(async () => {
      await Promise.resolve();
    });
    expect(getConfig).toHaveBeenCalledTimes(1);
  });

  it('only fetches once across multiple opens (cache reused)', async () => {
    getConfig.mockResolvedValue({
      ai_enabled: true,
      ai_submitter_choice_allowed: true,
    });
    await mountAndOpen();
    expect(getConfig).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: /^minimize$/i }));
    expect(screen.queryByRole('dialog')).toBeNull();

    openPanel();
    await act(async () => {
      await Promise.resolve();
    });
    expect(getConfig).toHaveBeenCalledTimes(1);
  });

  it('hides the toggle when ai_enabled=false and omits use_ai from submit', async () => {
    getConfig.mockResolvedValue({
      ai_enabled: false,
      ai_submitter_choice_allowed: true,
    });
    submit.mockResolvedValueOnce({ ok: true, issue_id: 'rep_disabled' });
    await mountAndOpen();
    expect(queryAiToggle()).toBeNull();
    typeDraft('hi');
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /^send$/i }));
    });
    const input = submit.mock.calls[0]![0] as Record<string, unknown>;
    expect('use_ai' in input).toBe(false);
  });

  it('hides the toggle when choice is not allowed and omits use_ai', async () => {
    getConfig.mockResolvedValue({
      ai_enabled: true,
      ai_submitter_choice_allowed: false,
    });
    submit.mockResolvedValueOnce({ ok: true, issue_id: 'rep_forced_on' });
    await mountAndOpen();
    expect(queryAiToggle()).toBeNull();
    typeDraft('admin-forced');
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /^send$/i }));
    });
    const input = submit.mock.calls[0]![0] as Record<string, unknown>;
    expect('use_ai' in input).toBe(false);
  });

  it('renders the toggle default-on when ai_enabled + choice_allowed, payload carries use_ai=true', async () => {
    getConfig.mockResolvedValue({
      ai_enabled: true,
      ai_submitter_choice_allowed: true,
    });
    submit.mockResolvedValueOnce({ ok: true, issue_id: 'rep_choice_on' });
    await mountAndOpen();
    const toggle = queryAiToggle();
    expect(toggle).not.toBeNull();
    expect(toggle).toHaveAttribute('aria-checked', 'true');
    expect(toggle!.className).toMatch(/brw-aitoggle--on/);

    typeDraft('with ai');
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /^send$/i }));
    });
    const input = submit.mock.calls[0]![0] as Record<string, unknown>;
    expect(input.use_ai).toBe(true);
  });

  it('click flips the toggle off and payload carries use_ai=false', async () => {
    getConfig.mockResolvedValue({
      ai_enabled: true,
      ai_submitter_choice_allowed: true,
    });
    submit.mockResolvedValueOnce({ ok: true, issue_id: 'rep_choice_off' });
    await mountAndOpen();
    const toggle = queryAiToggle()!;
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-checked', 'false');
    expect(toggle.className).not.toMatch(/brw-aitoggle--on/);

    typeDraft('without ai');
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /^send$/i }));
    });
    const input = submit.mock.calls[0]![0] as Record<string, unknown>;
    expect(input.use_ai).toBe(false);
  });

  it('Space toggles when focused (keyboard a11y)', async () => {
    getConfig.mockResolvedValue({
      ai_enabled: true,
      ai_submitter_choice_allowed: true,
    });
    await mountAndOpen();
    const toggle = queryAiToggle()!;
    toggle.focus();
    fireEvent.keyDown(toggle, { key: ' ' });
    expect(toggle).toHaveAttribute('aria-checked', 'false');
    fireEvent.keyDown(toggle, { key: ' ' });
    expect(toggle).toHaveAttribute('aria-checked', 'true');
  });

  it('config fetch resolves to null → widget still works, no toggle, use_ai omitted', async () => {
    getConfig.mockResolvedValue(null);
    submit.mockResolvedValueOnce({ ok: true, issue_id: 'rep_null_cfg' });
    await mountAndOpen();
    expect(queryAiToggle()).toBeNull();
    typeDraft('fallback');
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /^send$/i }));
    });
    expect(onSubmitSpy).toHaveBeenCalledWith({
      ok: true,
      issue_id: 'rep_null_cfg',
    });
    const input = submit.mock.calls[0]![0] as Record<string, unknown>;
    expect('use_ai' in input).toBe(false);
  });

  it('config fetch rejects → no toggle, submit still works and omits use_ai', async () => {
    getConfig.mockRejectedValueOnce(new Error('cfg boom'));
    submit.mockResolvedValueOnce({ ok: true, issue_id: 'rep_cfg_err' });
    await mountAndOpen();
    expect(queryAiToggle()).toBeNull();
    typeDraft('cfg error path');
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /^send$/i }));
    });
    const input = submit.mock.calls[0]![0] as Record<string, unknown>;
    expect('use_ai' in input).toBe(false);
  });
});

describe('<FeedbackButton> — theming + composer shell', () => {
  /**
   * The widget's default tokens live in a `:where(:root) { --brw-*: ... }`
   * declaration at specificity 0, so any host rule (including a direct
   * inline `style.setProperty` on body) beats it without `!important`. These
   * tests assert the consumption contract: every surface / accent / focus
   * affordance must read through a `var(--brw-*)` so host overrides take
   * effect at mount time.
   */

  afterEach(() => {
    // Clean up any host-level token overrides set by individual tests so
    // they don't leak across the file.
    const html = document.documentElement;
    const body = document.body;
    for (const el of [html, body]) {
      for (let i = el.style.length - 1; i >= 0; i--) {
        const prop = el.style.item(i)!;
        if (prop.startsWith('--brw-')) el.style.removeProperty(prop);
      }
      for (const cls of [
        'brw-test-panel-light',
        'brw-test-panel-dark',
      ] as const) {
        el.classList.remove(cls);
      }
    }
    document
      .querySelectorAll('style[data-brw-test-stylesheet]')
      .forEach((el) => el.remove());
  });

  function injectTestSheet(css: string): void {
    const el = document.createElement('style');
    el.setAttribute('data-brw-test-stylesheet', '');
    el.textContent = css;
    document.head.appendChild(el);
  }

  it('send button background reads from --brw-accent set on a widget ancestor', () => {
    // Radix Portal mounts the dialog into document.body, so setting the
    // token on body propagates via inheritance to the portaled content.
    document.body.style.setProperty('--brw-accent', 'rgb(255, 0, 0)');
    mount();
    openPanel();
    const sendBtn = screen.getByRole('button', { name: /^send$/i });
    expect(getComputedStyle(sendBtn).backgroundColor).toBe('rgb(255, 0, 0)');
  });

  it('panel background reads from --brw-panel-bg (light / dark sentinels swap independently)', () => {
    // Test-only stylesheet that defines two ancestor classes with distinct
    // --brw-panel-bg values. Toggling the class on body must flip the
    // widget panel's computed backgroundColor, proving the consumption path.
    injectTestSheet(`
      .brw-test-panel-light { --brw-panel-bg: rgb(1, 2, 3); }
      .brw-test-panel-dark  { --brw-panel-bg: rgb(4, 5, 6); }
    `);

    document.body.classList.add('brw-test-panel-light');
    const lightView = mount();
    openPanel();
    expect(getComputedStyle(screen.getByRole('dialog')).backgroundColor).toBe(
      'rgb(1, 2, 3)',
    );
    lightView.unmount();

    document.body.classList.remove('brw-test-panel-light');
    document.body.classList.add('brw-test-panel-dark');
    mount();
    openPanel();
    expect(getComputedStyle(screen.getByRole('dialog')).backgroundColor).toBe(
      'rgb(4, 5, 6)',
    );
  });

  it('composer children are wrapped in a single .brw-composer-shell div', () => {
    mount();
    openPanel();
    const textarea = screen.getByRole('textbox', {
      name: /feedback message/i,
    });
    const shell = textarea.parentElement as HTMLElement;
    expect(shell.className).toMatch(/brw-composer-shell/);
    // All composer controls share this shell parent.
    expect(
      within(shell).getByRole('button', {
        name: /capture screenshot of this page/i,
      }),
    ).toBeInTheDocument();
    expect(
      within(shell).getByRole('button', { name: /^send$/i }),
    ).toBeInTheDocument();
  });

  it('composer shell declares a :focus-within rule on --brw-border-focus', () => {
    // happy-dom's computed-style engine does not evaluate the :focus-within
    // pseudo-class, so the behaviour is pinned via a string guard on the
    // emitted stylesheet. A regression that drops the rule (or hardcodes a
    // colour) is caught here.
    expect(BREVWICK_CSS).toMatch(
      /\.brw-composer-shell:focus-within[^{]*\{[^}]*border-color:\s*var\(--brw-border-focus\)/,
    );
  });

  it('composer textarea autogrows — input events apply an inline height', async () => {
    mount();
    openPanel();
    const textarea = screen.getByRole('textbox', {
      name: /feedback message/i,
    }) as HTMLTextAreaElement;
    // happy-dom issues `scrollHeight === 0` for unmeasured textareas, so
    // asserting only `/px$/` passes vacuously for `"0px"`. Spy on the
    // prototype getter so the autogrow effect sees a realistic scrollHeight
    // and we can assert the exact clamped value applied by the effect.
    const { COMPOSER_MAX_HEIGHT_PX } = await import('../styles');
    const fakeScrollHeight = 400; // deliberately above the clamp ceiling
    const scrollHeightSpy = vi
      .spyOn(HTMLElement.prototype, 'scrollHeight', 'get')
      .mockReturnValue(fakeScrollHeight);
    try {
      fireEvent.change(textarea, {
        target: { value: 'line 1\nline 2\nline 3\nline 4\nline 5' },
      });
      // Effect sets height to `min(scrollHeight, COMPOSER_MAX_HEIGHT_PX)`.
      // With scrollHeight > ceiling, the inline style must equal the
      // ceiling — catches a regression that silently removes the clamp
      // OR drops the effect (`style.height === ''`).
      expect(textarea.style.height).toBe(`${COMPOSER_MAX_HEIGHT_PX}px`);
    } finally {
      scrollHeightSpy.mockRestore();
    }
  });

  it('every themeable declaration reads from a --brw-* token (no hardcoded hex in class rules)', () => {
    // Acceptance-criterion guard: shadows, colours, and backgrounds in
    // class rules must flow through `var(--brw-*)`. Hex literals inside a
    // class-rule body break the host-override contract. We strip the
    // `:where(:root)` token blocks first (those are ALLOWED to hold hex
    // defaults) via a balanced-brace walker, so a future refactor that
    // reformats the block (single-line, extra nesting, etc.) doesn't
    // silently break the guard.
    const stripped = stripTokenBlocks(BREVWICK_CSS);
    expect(stripped).not.toMatch(/#[0-9a-fA-F]{3,8}/);
  });

  // The two axe specs below guard structural a11y only (role / aria /
  // accessible-name). happy-dom does not re-evaluate
  // `@media (prefers-color-scheme: dark)` against the stubbed matchMedia,
  // and axe-core's `color-contrast` rule issues `inapplicable` under
  // happy-dom since the non-layout-engine environment can't resolve
  // cascaded `color` values. Contrast for the default light + dark
  // palettes is pinned separately via `dark-mode bubble-user / accent
  // pairs meet WCAG AA contrast` below, which works directly off the
  // emitted CSS strings and does not need a layout engine.
  it('vitest-axe is clean on the rendered panel in a light matchMedia stub', async () => {
    stubMatchMedia(false);
    mount();
    openPanel();
    const results = await axe(screen.getByRole('dialog'));
    expect(results).toHaveNoViolations();
  });

  it('vitest-axe is clean on the rendered panel in a dark matchMedia stub', async () => {
    stubMatchMedia(true);
    mount();
    openPanel();
    const results = await axe(screen.getByRole('dialog'));
    expect(results).toHaveNoViolations();
  });

  it('dark-mode bubble-user / accent pairs meet WCAG AA contrast', () => {
    // Guard the default dark palette against silent regressions. Pulls the
    // hex values straight out of the emitted CSS and computes the WCAG 2.x
    // relative-luminance contrast ratio. Both the user-bubble and the
    // accent (send button) need ≥ 4.5:1 for body-text AA.
    const dark = extractDarkTokenBlock(BREVWICK_CSS);
    const bubblePair = contrastRatio(
      dark['--brw-bubble-user-bg']!,
      dark['--brw-bubble-user-fg']!,
    );
    const accentPair = contrastRatio(
      dark['--brw-accent']!,
      dark['--brw-accent-fg']!,
    );
    expect(bubblePair).toBeGreaterThanOrEqual(4.5);
    expect(accentPair).toBeGreaterThanOrEqual(4.5);
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
      // Stamp the dimensions on the blob for assertion — Blobs are
      // opaque in happy-dom so the test reads them via this side-channel.
      (blob as Blob & { _brwW: number; _brwH: number })._brwW = this.width;
      (blob as Blob & { _brwW: number; _brwH: number })._brwH = this.height;
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

  function openOverlay(): void {
    openPanel();
    fireEvent.click(
      screen.getByRole('button', {
        name: /capture screenshot of this page/i,
      }),
    );
  }

  function getOverlay(): HTMLElement {
    return screen.getByLabelText(/select screenshot region/i);
  }

  function queryOverlay(): HTMLElement | null {
    return screen.queryByLabelText(/select screenshot region/i);
  }

  function drag(
    overlay: HTMLElement,
    from: { x: number; y: number },
    to: { x: number; y: number },
  ): void {
    fireEvent.pointerDown(overlay, {
      clientX: from.x,
      clientY: from.y,
      pointerId: 1,
      button: 0,
    });
    fireEvent.pointerMove(overlay, {
      clientX: to.x,
      clientY: to.y,
      pointerId: 1,
    });
    fireEvent.pointerUp(overlay, {
      clientX: to.x,
      clientY: to.y,
      pointerId: 1,
    });
  }

  it('click on the screenshot button opens the overlay with a region marker', () => {
    mount();
    openOverlay();
    const overlay = getOverlay();
    // `data-testid` (not `data-brevwick-*`) — this hook is test-only, not a
    // public stability selector. The SDK's capture scrub reads
    // `data-brevwick-skip`, which is still present.
    expect(overlay).toHaveAttribute('data-testid', 'brw-region-overlay');
    expect(overlay).toHaveAttribute('data-brevwick-skip');
  });

  it('Escape dismisses the overlay and leaves the main panel open', () => {
    mount();
    openOverlay();
    expect(getOverlay()).toBeInTheDocument();
    fireEvent.keyDown(getOverlay(), { key: 'Escape' });
    expect(queryOverlay()).toBeNull();
    // Main panel remains; the Escape should not have minimized it.
    expect(
      screen.getByRole('textbox', { name: /feedback message/i }),
    ).toBeInTheDocument();
  });

  it('pointer drag produces a visible selection rectangle sized to the drag', () => {
    mount();
    openOverlay();
    const overlay = getOverlay();
    drag(overlay, { x: 30, y: 40 }, { x: 230, y: 140 });
    const rect = screen.getByTestId('brw-region-selection');
    expect(rect.style.left).toBe('30px');
    expect(rect.style.top).toBe('40px');
    expect(rect.style.width).toBe('200px');
    expect(rect.style.height).toBe('100px');
  });

  it('drag produces the same rectangle regardless of direction (upward drag)', () => {
    mount();
    openOverlay();
    const overlay = getOverlay();
    // Dragging bottom-right → top-left should still anchor the rect's
    // x/y at the minimum corner.
    drag(overlay, { x: 200, y: 180 }, { x: 50, y: 60 });
    const rect = screen.getByTestId('brw-region-selection');
    expect(rect.style.left).toBe('50px');
    expect(rect.style.top).toBe('60px');
    expect(rect.style.width).toBe('150px');
    expect(rect.style.height).toBe('120px');
  });

  it('confirm region crops the captured blob to the selection dimensions', async () => {
    const stub = installCropStub();
    try {
      const fullBlob = new Blob(['full'], { type: 'image/webp' });
      captureScreenshot.mockResolvedValueOnce(fullBlob);
      // Pin dpr so the crop math is deterministic under the test.
      vi.stubGlobal('devicePixelRatio', 2);
      mount();
      openOverlay();
      drag(getOverlay(), { x: 10, y: 20 }, { x: 210, y: 120 });
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /^capture$/i }));
      });
      // Wait for the crop microtasks to flush and the chip to render.
      await waitFor(() =>
        expect(
          screen.getByRole('button', { name: /remove screenshot/i }),
        ).toBeInTheDocument(),
      );
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
      stub.restore();
    }
  });

  it('pointerdown bubbled from control buttons does not reset the drag selection', async () => {
    // Regression for the Copilot reviewer's finding: pointerdown on the
    // Cancel / Capture / Capture-full-page buttons bubbles up through
    // React delegation to the overlay's onPointerDown. Without the
    // `e.target !== e.currentTarget` guard, the bubbled event
    // reinitialises `drag` to a zero-size rect and the subsequent click
    // hits the degenerate-shake path instead of running the crop.
    const stub = installCropStub();
    try {
      const fullBlob = new Blob(['full'], { type: 'image/webp' });
      captureScreenshot.mockResolvedValueOnce(fullBlob);
      vi.stubGlobal('devicePixelRatio', 1);
      mount();
      openOverlay();
      drag(getOverlay(), { x: 30, y: 40 }, { x: 230, y: 140 });
      // Simulate the real-browser input sequence when the user clicks the
      // Capture button: pointerdown → pointerup → click, each bubbling.
      const captureBtn = screen.getByRole('button', { name: /^capture$/i });
      await act(async () => {
        fireEvent.pointerDown(captureBtn, {
          clientX: 400,
          clientY: 400,
          pointerId: 2,
          button: 0,
        });
        fireEvent.pointerUp(captureBtn, {
          clientX: 400,
          clientY: 400,
          pointerId: 2,
        });
        fireEvent.click(captureBtn);
      });
      await waitFor(() =>
        expect(
          screen.getByRole('button', { name: /remove screenshot/i }),
        ).toBeInTheDocument(),
      );
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
    mount();
    openOverlay();
    await act(async () => {
      fireEvent.click(
        screen.getByRole('button', { name: /capture full page/i }),
      );
    });
    typeDraft('full cap');
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /^send$/i }));
    });
    const input = submit.mock.calls[0]![0] as {
      attachments: Array<{ blob: Blob; filename: string }>;
    };
    // Extension derives from the MIME of the full-page blob — proves no
    // canvas crop happened in the full-page path.
    expect(input.attachments[0]!.filename).toBe('screenshot.webp');
    expect(input.attachments[0]!.blob).toBe(fullBlob);
  });

  it('degenerate selection on Capture shakes and does not invoke captureScreenshot', async () => {
    mount();
    openOverlay();
    const overlay = getOverlay();
    // A 1×1 drag — below the REGION_MIN_SIDE_PX threshold.
    drag(overlay, { x: 50, y: 50 }, { x: 51, y: 51 });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /^capture$/i }));
    });
    expect(captureScreenshot).not.toHaveBeenCalled();
    expect(queryOverlay()).toBeInTheDocument();
  });

  it('degenerate selection on Enter → overlay stays open, no capture', async () => {
    mount();
    openOverlay();
    const overlay = getOverlay();
    drag(overlay, { x: 100, y: 100 }, { x: 101, y: 101 });
    await act(async () => {
      fireEvent.keyDown(overlay, { key: 'Enter' });
    });
    expect(captureScreenshot).not.toHaveBeenCalled();
    expect(queryOverlay()).toBeInTheDocument();
  });

  it('overlay is unmounted before captureScreenshot resolves (capture sees no overlay chrome)', async () => {
    let resolveCapture!: (b: Blob) => void;
    captureScreenshot.mockReturnValueOnce(
      new Promise<Blob>((resolve) => {
        resolveCapture = resolve;
      }),
    );
    mount();
    openOverlay();
    expect(queryOverlay()).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(
        screen.getByRole('button', { name: /capture full page/i }),
      );
    });

    // The capture promise is still pending — by now the overlay must
    // already be torn down so its transparent layer cannot bleed into
    // the captured page.
    expect(queryOverlay()).toBeNull();

    const blob = new Blob(['done'], { type: 'image/webp' });
    await act(async () => {
      resolveCapture(blob);
      await Promise.resolve();
    });
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: /remove screenshot/i }),
      ).toBeInTheDocument(),
    );
  });

  it('Cancel button closes the overlay without capture', async () => {
    mount();
    openOverlay();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /^cancel$/i }));
    });
    expect(queryOverlay()).toBeNull();
    expect(captureScreenshot).not.toHaveBeenCalled();
  });

  // Radix Dialog.Content logs a console.error when no Dialog.Title
  // descendant is present. The overlay used to rely on aria-label alone,
  // which triggered the warning on every screenshot button click. Pin a
  // visually-hidden Dialog.Title so the primitive stays satisfied without
  // changing the announced name (aria-label still wins).
  it('renders a Dialog.Title descendant so Radix does not warn', () => {
    mount();
    openOverlay();
    const title = within(getOverlay()).getByText(/select screenshot region/i, {
      selector: 'h2,[role="heading"]',
    });
    expect(title).toHaveClass('brw-sr-only');
  });

  it('vitest-axe is clean on an idle region overlay', async () => {
    mount();
    openOverlay();
    const results = await axe(getOverlay());
    expect(results).toHaveNoViolations();
  });

  it('vitest-axe is clean mid-drag on the region overlay', async () => {
    mount();
    openOverlay();
    const overlay = getOverlay();
    fireEvent.pointerDown(overlay, {
      clientX: 30,
      clientY: 40,
      pointerId: 1,
      button: 0,
    });
    fireEvent.pointerMove(overlay, {
      clientX: 130,
      clientY: 140,
      pointerId: 1,
    });
    const results = await axe(overlay);
    expect(results).toHaveNoViolations();
    // Clean up the dangling pointer capture so subsequent tests aren't
    // started with the overlay stuck in dragging mode.
    fireEvent.pointerUp(overlay, {
      clientX: 130,
      clientY: 140,
      pointerId: 1,
    });
  });

  it('vitest-axe is clean after the overlay closes back to the composer', async () => {
    mount();
    openOverlay();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /^cancel$/i }));
    });
    const results = await axe(screen.getByRole('dialog'));
    expect(results).toHaveNoViolations();
  });

  it('brw-region-* rules opt out of animation under prefers-reduced-motion', () => {
    expect(BREVWICK_CSS).toMatch(
      /@media \(prefers-reduced-motion: reduce\)[\s\S]*\.brw-region-shake[^{]*\{[^}]*animation:\s*none/,
    );
  });

  // Regression for a11y bug: `onKeyDown` on `Dialog.Content` used to
  // unconditionally preventDefault + confirm() on Enter, hijacking Cancel
  // and Capture-full-page when a keyboard user tabbed to them and pressed
  // Enter. Guard is `e.target !== e.currentTarget` — the region-confirm
  // shortcut only fires when the overlay root itself has focus.
  it('Enter while Cancel has focus closes the overlay (does not confirm region)', async () => {
    mount();
    openOverlay();
    const overlay = getOverlay();
    // Build a non-degenerate selection: if Enter wrongly bubbled to the
    // overlay-level handler, this would trigger a region capture (and
    // we'd see captureScreenshot invoked) rather than the Cancel click.
    drag(overlay, { x: 20, y: 30 }, { x: 220, y: 230 });
    const cancelBtn = screen.getByRole('button', { name: /^cancel$/i });
    cancelBtn.focus();
    await act(async () => {
      // `keyDown` targets the focused button. The click that Enter would
      // normally synthesize on a native button doesn't fire from
      // `fireEvent.keyDown` alone in happy-dom — so dispatch both: the
      // keyDown verifies the overlay handler does NOT preventDefault, and
      // the click simulates the native Enter→click behaviour. If the old
      // handler were still in place, it would call preventDefault here and
      // run confirm() before the click.
      fireEvent.keyDown(cancelBtn, { key: 'Enter' });
      fireEvent.click(cancelBtn);
    });
    expect(queryOverlay()).toBeNull();
    expect(captureScreenshot).not.toHaveBeenCalled();
  });

  it('Enter while Capture-full-page has focus runs the full-page capture', async () => {
    const fullBlob = new Blob(['uncropped-enter'], { type: 'image/webp' });
    captureScreenshot.mockResolvedValueOnce(fullBlob);
    mount();
    openOverlay();
    const overlay = getOverlay();
    // Drag a non-degenerate selection to prove the region path is NOT
    // the one that fires (if Enter leaked to the overlay handler, the
    // region would crop rather than the full-page blob passing through).
    drag(overlay, { x: 20, y: 30 }, { x: 220, y: 230 });
    const fullBtn = screen.getByRole('button', { name: /capture full page/i });
    fullBtn.focus();
    await act(async () => {
      fireEvent.keyDown(fullBtn, { key: 'Enter' });
      fireEvent.click(fullBtn);
    });
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: /remove screenshot/i }),
      ).toBeInTheDocument(),
    );
    expect(queryOverlay()).toBeNull();
    expect(captureScreenshot).toHaveBeenCalledTimes(1);
    typeDraft('enter full cap');
    submit.mockResolvedValueOnce({ ok: true, issue_id: 'rep_enter_full' });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /^send$/i }));
    });
    const input = submit.mock.calls[0]![0] as {
      attachments: Array<{ blob: Blob; filename: string }>;
    };
    // Blob identity confirms no crop happened — the full-page path was taken.
    expect(input.attachments[0]!.blob).toBe(fullBlob);
  });

  // Region-path error: if `captureScreenshot()` rejects on a region confirm,
  // the composer's `setSubmitError` banner must surface the message and
  // no screenshot chip must render. The existing 'canvas tainted' test
  // covers the full-page branch only; this pins the region branch.
  it('surfaces an error in the panel when captureScreenshot rejects on a region confirm', async () => {
    captureScreenshot.mockRejectedValueOnce(new Error('region canvas tainted'));
    mount();
    openOverlay();
    const overlay = getOverlay();
    drag(overlay, { x: 12, y: 24 }, { x: 212, y: 224 });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /^capture$/i }));
    });
    // Overlay closes synchronously before the await inside performCapture.
    expect(queryOverlay()).toBeNull();
    await waitFor(() =>
      expect(
        screen.getByText(/region canvas tainted/i, {
          selector: '[role="alert"]',
        }),
      ).toBeInTheDocument(),
    );
    expect(
      screen.queryByRole('button', { name: /remove screenshot/i }),
    ).toBeNull();
  });

  // Coverage for the `OffscreenCanvas` branch of `cropToRegion`. The main
  // crop test forces the `<canvas>` fallback (happy-dom's stock
  // `OffscreenCanvas`, where present, has no `convertToBlob`). This test
  // installs a minimal `OffscreenCanvas` shim with `getContext('2d')` +
  // `convertToBlob` and confirms the crop blob (stamped by the shim) lands
  // in the composer.
  it('uses OffscreenCanvas when available and delivers its convertToBlob output', async () => {
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
        const blob = new Blob([`offscreen:${this.width}x${this.height}`], {
          type: options.type,
        });
        (
          blob as Blob & {
            _brwOffscreen: boolean;
            _brwW: number;
            _brwH: number;
          }
        )._brwOffscreen = true;
        (
          blob as Blob & {
            _brwOffscreen: boolean;
            _brwW: number;
            _brwH: number;
          }
        )._brwW = this.width;
        (
          blob as Blob & {
            _brwOffscreen: boolean;
            _brwW: number;
            _brwH: number;
          }
        )._brwH = this.height;
        return Promise.resolve(blob);
      }
    }

    const originalOffscreen = (globalThis as { OffscreenCanvas?: unknown })
      .OffscreenCanvas;
    (globalThis as { OffscreenCanvas?: unknown }).OffscreenCanvas =
      OffscreenCanvasStub;

    try {
      const fullBlob = new Blob(['full'], { type: 'image/webp' });
      captureScreenshot.mockResolvedValueOnce(fullBlob);
      vi.stubGlobal('devicePixelRatio', 2);
      submit.mockResolvedValueOnce({ ok: true, issue_id: 'rep_offscreen' });
      mount();
      openOverlay();
      drag(getOverlay(), { x: 10, y: 20 }, { x: 210, y: 120 });
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /^capture$/i }));
      });
      await waitFor(() =>
        expect(
          screen.getByRole('button', { name: /remove screenshot/i }),
        ).toBeInTheDocument(),
      );
      expect(drawImageCalls).toHaveLength(1);
      const [, sx, sy, sw, sh, dx, dy, dw, dh] = drawImageCalls[0]!;
      expect(sx).toBe(20);
      expect(sy).toBe(40);
      expect(sw).toBe(400);
      expect(sh).toBe(200);
      expect(dx).toBe(0);
      expect(dy).toBe(0);
      expect(dw).toBe(200);
      expect(dh).toBe(100);
      // Drive a submit so we can read the attachment blob off the spy and
      // confirm the OffscreenCanvas stub's output (not the <canvas>
      // fallback) is what the composer received.
      typeDraft('offscreen crop');
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /^send$/i }));
      });
      const input = submit.mock.calls[0]![0] as {
        attachments: Array<{ blob: Blob; filename: string }>;
      };
      const delivered = input.attachments[0]!.blob as Blob & {
        _brwOffscreen?: boolean;
        _brwW?: number;
        _brwH?: number;
      };
      expect(delivered._brwOffscreen).toBe(true);
      expect(delivered._brwW).toBe(200);
      expect(delivered._brwH).toBe(100);
      expect(input.attachments[0]!.filename).toBe('screenshot.png');
    } finally {
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
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        delete (globalThis as any).OffscreenCanvas;
      }
    }
  });

  // Coverage for the `<canvas>.toBlob` null branch. `installCropStub`
  // always resolves with a stamped Blob; this override forces the
  // `reject(new Error('Canvas produced no blob'))` path and confirms the
  // composer surfaces the error and renders no screenshot chip.
  it('surfaces an error when the canvas toBlob path yields null', async () => {
    const stub = installCropStub();
    // Override toBlob to hand `null` to the callback so the internal
    // Promise rejects with the 'Canvas produced no blob' error.
    HTMLCanvasElement.prototype.toBlob = function toBlobNull(cb: BlobCallback) {
      queueMicrotask(() => cb(null));
    };
    try {
      const fullBlob = new Blob(['full'], { type: 'image/webp' });
      captureScreenshot.mockResolvedValueOnce(fullBlob);
      mount();
      openOverlay();
      drag(getOverlay(), { x: 15, y: 25 }, { x: 215, y: 225 });
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /^capture$/i }));
      });
      await waitFor(() =>
        expect(
          screen.getByText(/canvas produced no blob/i, {
            selector: '[role="alert"]',
          }),
        ).toBeInTheDocument(),
      );
      expect(
        screen.queryByRole('button', { name: /remove screenshot/i }),
      ).toBeNull();
    } finally {
      stub.restore();
    }
  });

  // Coverage for `handlePointerDown` non-primary-button early return
  // (e.button !== 0). A right-click must not initialise the drag state,
  // so a subsequent pointerMove produces no selection rectangle.
  it('ignores non-primary pointer buttons (right-click does not start a drag)', () => {
    mount();
    openOverlay();
    const overlay = getOverlay();
    fireEvent.pointerDown(overlay, {
      clientX: 40,
      clientY: 60,
      pointerId: 1,
      button: 2,
    });
    fireEvent.pointerMove(overlay, {
      clientX: 140,
      clientY: 160,
      pointerId: 1,
    });
    expect(screen.queryByTestId('brw-region-selection')).toBeNull();
  });

  // Coverage for `handlePointerMove` `!draggingRef.current` early return
  // and `handlePointerUp` `!draggingRef.current` early return. A stray
  // move / up without a preceding down must not crash nor render a rect.
  it('ignores pointer move / up without a preceding pointer down', () => {
    mount();
    openOverlay();
    const overlay = getOverlay();
    fireEvent.pointerMove(overlay, {
      clientX: 100,
      clientY: 100,
      pointerId: 1,
    });
    expect(screen.queryByTestId('brw-region-selection')).toBeNull();
    // Lone pointerUp must also no-op (covers `!draggingRef.current` in
    // handlePointerUp). happy-dom's releasePointerCapture stub would
    // throw without the early return, giving us a second signal.
    fireEvent.pointerUp(overlay, {
      clientX: 100,
      clientY: 100,
      pointerId: 1,
    });
    expect(screen.queryByTestId('brw-region-selection')).toBeNull();
  });

  // Coverage for `handleKeyDown` `e.key !== 'Enter'` early return.
  // Pressing any non-Enter key on the overlay root must not run
  // `confirm()` (no captureScreenshot call, overlay stays open, no
  // shake class).
  it('non-Enter key on the overlay root does not confirm the region', async () => {
    mount();
    openOverlay();
    const overlay = getOverlay();
    drag(overlay, { x: 30, y: 40 }, { x: 230, y: 240 });
    await act(async () => {
      fireEvent.keyDown(overlay, { key: 'a' });
      fireEvent.keyDown(overlay, { key: 'Tab' });
    });
    expect(captureScreenshot).not.toHaveBeenCalled();
    expect(queryOverlay()).toBeInTheDocument();
    expect(overlay.className).not.toMatch(/brw-region-shake/);
  });

  // Coverage for the Enter-with-target===currentTarget branch of
  // `handleKeyDown`. The existing Enter tests press Enter on focused
  // buttons (which hit the `e.target !== e.currentTarget` guard);
  // this test focuses the overlay root directly and confirms the
  // region-confirm path runs from there.
  it('Enter on the focused overlay root confirms a non-degenerate region', async () => {
    const stub = installCropStub();
    try {
      const fullBlob = new Blob(['full-enter'], { type: 'image/webp' });
      captureScreenshot.mockResolvedValueOnce(fullBlob);
      vi.stubGlobal('devicePixelRatio', 1);
      mount();
      openOverlay();
      const overlay = getOverlay();
      drag(overlay, { x: 20, y: 30 }, { x: 220, y: 230 });
      overlay.focus();
      await act(async () => {
        fireEvent.keyDown(overlay, { key: 'Enter' });
      });
      await waitFor(() =>
        expect(
          screen.getByRole('button', { name: /remove screenshot/i }),
        ).toBeInTheDocument(),
      );
      expect(captureScreenshot).toHaveBeenCalledTimes(1);
      expect(stub.drawImageArgs).toHaveLength(1);
    } finally {
      stub.restore();
    }
  });

  // Coverage for the shake settle timer body (lines 1191-1192): triggers
  // a degenerate Capture, advances fake timers past the 320ms settle, and
  // confirms `setShake(false)` fired (the shake class drops off the root).
  it('shake settle timer clears the shake flag after the animation window', async () => {
    vi.useFakeTimers();
    try {
      mount();
      openOverlay();
      const overlay = getOverlay();
      drag(overlay, { x: 50, y: 50 }, { x: 51, y: 51 });
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /^capture$/i }));
      });
      // The shake flag is set synchronously on the Capture click.
      expect(getOverlay().className).toMatch(/brw-region-shake/);
      await act(async () => {
        vi.advanceTimersByTime(320);
      });
      expect(getOverlay().className).not.toMatch(/brw-region-shake/);
    } finally {
      vi.useRealTimers();
    }
  });

  // Coverage for the unmount cleanup effect. Triggering a degenerate
  // Capture schedules the 320ms shake-settle timer; unmounting before
  // the timer fires must clear it so React does not log a 'state update
  // on unmounted component' warning (and so the handle doesn't leak).
  it('unmounting during an active shake clears the in-flight settle timer', async () => {
    const clearTimeoutSpy = vi.spyOn(window, 'clearTimeout');
    const view = mount();
    openOverlay();
    const overlay = getOverlay();
    drag(overlay, { x: 50, y: 50 }, { x: 51, y: 51 });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /^capture$/i }));
    });
    expect(getOverlay().className).toMatch(/brw-region-shake/);
    const beforeUnmount = clearTimeoutSpy.mock.calls.length;
    view.unmount();
    // The cleanup effect (or the close-path reset effect, whichever runs
    // first during teardown) must call clearTimeout for the handle we
    // scheduled on the Capture click. One extra call is enough to prove
    // the timer was cancelled.
    expect(clearTimeoutSpy.mock.calls.length).toBeGreaterThan(beforeUnmount);
    clearTimeoutSpy.mockRestore();
  });
});

/**
 * Stub window.matchMedia so `(prefers-color-scheme: dark)` issues the
 * chosen value. happy-dom doesn't re-evaluate `@media` CSS rules against a
 * stubbed matchMedia, so this is intended for callers that check matchMedia
 * themselves (e.g. axe's own UA detection). Restored automatically via the
 * top-level `afterEach` that clears mocks / unstubs globals.
 */
function stubMatchMedia(prefersDark: boolean): void {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: query.includes('prefers-color-scheme: dark') ? prefersDark : false,
    media: query,
    onchange: null,
    addListener: () => undefined,
    removeListener: () => undefined,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    dispatchEvent: () => false,
  }));
}

/**
 * Remove every `:where(:root) { ... }` token-default block from the
 * emitted CSS using a balanced-brace walker. Survives whitespace and
 * newline refactors that a `[\s\S]*?\n\s*}` regex would silently
 * mis-strip; used by the "no hardcoded hex in class rules" guard.
 */
function stripTokenBlocks(css: string): string {
  const out: string[] = [];
  let i = 0;
  while (i < css.length) {
    const match = css.slice(i).match(/:where\(:root\)\s*\{/);
    if (!match) {
      out.push(css.slice(i));
      break;
    }
    const blockStart = i + match.index!;
    out.push(css.slice(i, blockStart));
    // Walk forward from the opening `{`, tracking nesting until the
    // matching `}` closes this block.
    let depth = 0;
    let j = blockStart + match[0].length - 1; // points AT the `{`
    for (; j < css.length; j++) {
      const ch = css[j];
      if (ch === '{') depth++;
      else if (ch === '}') {
        depth--;
        if (depth === 0) {
          j++; // consume the closing brace
          break;
        }
      }
    }
    i = j;
  }
  return out.join('');
}

/**
 * Parse the `@media (prefers-color-scheme: dark) :where(:root) { ... }`
 * block out of the emitted CSS and return every `--brw-*` declaration as
 * a plain object. Used by the dark-palette contrast guard. Throws on a
 * missing block so a future refactor that removes the dark palette fails
 * loudly instead of silently skipping the check.
 */
function extractDarkTokenBlock(css: string): Record<string, string> {
  const openRe = /@media\s*\(prefers-color-scheme:\s*dark\)\s*\{/;
  const openMatch = css.match(openRe);
  if (!openMatch) throw new Error('dark media block not found in BREVWICK_CSS');
  const start = openMatch.index! + openMatch[0].length;
  // Walk to the matching `}` of the @media wrapper.
  let depth = 1;
  let end = start;
  for (; end < css.length; end++) {
    const ch = css[end];
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) break;
    }
  }
  const body = css.slice(start, end);
  const tokens: Record<string, string> = {};
  const declRe = /(--brw-[\w-]+)\s*:\s*([^;]+);/g;
  let m: RegExpExecArray | null;
  while ((m = declRe.exec(body)) !== null) {
    tokens[m[1]!] = m[2]!.trim();
  }
  return tokens;
}

/**
 * WCAG 2.x contrast ratio between two `#RRGGBB` hex colours. Returns a
 * number in [1, 21]; ≥ 4.5 is the AA bar for body text. The function is
 * symmetric in its arguments (lighter / darker is resolved internally), so
 * parameters are named `aHex` / `bHex` rather than `fg` / `bg`.
 */
function contrastRatio(aHex: string, bHex: string): number {
  const lum = (hex: string): number => {
    const cleaned = hex.trim().replace(/^#/, '');
    const full =
      cleaned.length === 3
        ? cleaned
            .split('')
            .map((c) => c + c)
            .join('')
        : cleaned;
    const r = parseInt(full.slice(0, 2), 16) / 255;
    const g = parseInt(full.slice(2, 4), 16) / 255;
    const b = parseInt(full.slice(4, 6), 16) / 255;
    const ch = (c: number): number =>
      c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    return 0.2126 * ch(r) + 0.7152 * ch(g) + 0.0722 * ch(b);
  };
  const L1 = lum(aHex);
  const L2 = lum(bHex);
  const [lighter, darker] = L1 > L2 ? [L1, L2] : [L2, L1];
  return (lighter + 0.05) / (darker + 0.05);
}
