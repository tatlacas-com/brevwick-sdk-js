import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Brevwick, BrevwickConfig, SubmitResult } from 'brevwick-sdk';

const submit = vi.fn<(input: unknown) => Promise<SubmitResult>>();
const captureScreenshot = vi.fn<() => Promise<Blob>>();
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
});

afterEach(() => {
  vi.clearAllMocks();
  vi.useRealTimers();
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
    submit.mockResolvedValueOnce({ ok: true, report_id: 'rep_enter' });
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
    submit.mockResolvedValueOnce({ ok: true, report_id: 'rep_ok' });
    mount();
    openPanel();
    typeDraft('Broken flow');

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /^send$/i }));
    });

    expect(onSubmitSpy).toHaveBeenCalledWith({
      ok: true,
      report_id: 'rep_ok',
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

    await act(async () => {
      fireEvent.click(
        screen.getByRole('button', { name: /attach screenshot/i }),
      );
    });
    expect(captureScreenshot).toHaveBeenCalledTimes(1);
    expect(
      screen.getByRole('button', { name: /remove screenshot/i }),
    ).toBeInTheDocument();
  });

  it('derives the screenshot attachment extension from its MIME type', async () => {
    const blob = new Blob(['x'], { type: 'image/webp' });
    captureScreenshot.mockResolvedValueOnce(blob);
    submit.mockResolvedValueOnce({ ok: true, report_id: 'rep_ext' });
    mount();
    openPanel();
    await act(async () => {
      fireEvent.click(
        screen.getByRole('button', { name: /attach screenshot/i }),
      );
    });
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

    await act(async () => {
      fireEvent.click(
        screen.getByRole('button', { name: /attach screenshot/i }),
      );
    });

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
    await act(async () => {
      fireEvent.click(
        screen.getByRole('button', { name: /attach screenshot/i }),
      );
    });

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
    const confirm = screen.getByRole('alertdialog', {
      name: /discard draft/i,
    });
    expect(
      within(confirm).getByRole('button', { name: /keep/i }),
    ).toBeInTheDocument();

    // Keep → confirm disappears, draft remains.
    fireEvent.click(within(confirm).getByRole('button', { name: /keep/i }));
    expect(screen.queryByRole('alertdialog')).toBeNull();
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
    submit.mockResolvedValueOnce({ ok: true, report_id: 'rep_ea' });
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
    await act(async () => {
      fireEvent.click(
        screen.getByRole('button', { name: /attach screenshot/i }),
      );
    });
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
    submit.mockResolvedValueOnce({ ok: true, report_id: 'rep_live' });
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
      screen.getByRole('button', { name: /attach screenshot/i }),
    ).toBeDisabled();

    await act(async () => {
      release({ ok: true, report_id: 'rep_done' });
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
    expect(BREVWICK_STYLE_ID).toBe('brevwick-react-styles');
  });
});
