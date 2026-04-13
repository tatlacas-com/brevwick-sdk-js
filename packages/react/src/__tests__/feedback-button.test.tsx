import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
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

beforeEach(() => {
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

describe('<FeedbackButton>', () => {
  it('opens the dialog and marks FAB + dialog with data-brevwick-skip', () => {
    mount();
    const fab = screen.getByRole('button', { name: /open feedback form/i });
    expect(fab).toHaveAttribute('data-brevwick-skip');
    fireEvent.click(fab);

    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('data-brevwick-skip');
    expect(screen.getByText('Send feedback')).toBeInTheDocument();
  });

  it('surfaces a form-level error when title is missing', () => {
    mount();
    fireEvent.click(
      screen.getByRole('button', { name: /open feedback form/i }),
    );
    fireEvent.click(screen.getByRole('button', { name: /^send$/i }));
    expect(screen.getByRole('alert')).toHaveTextContent(/title is required/i);
    expect(submit).not.toHaveBeenCalled();
  });

  it('attaches a screenshot by calling sdk.captureScreenshot and shows a thumbnail', async () => {
    const blob = new Blob(['x'], { type: 'image/png' });
    captureScreenshot.mockResolvedValueOnce(blob);
    mount();
    fireEvent.click(
      screen.getByRole('button', { name: /open feedback form/i }),
    );

    await act(async () => {
      fireEvent.click(
        screen.getByRole('button', { name: /attach screenshot/i }),
      );
    });
    expect(captureScreenshot).toHaveBeenCalledTimes(1);
    expect(screen.getByAltText(/screenshot preview/i)).toBeInTheDocument();
  });

  it('calls onSubmit with result and closes after 1.5s on success', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    submit.mockResolvedValueOnce({ ok: true, report_id: 'rep_ok' });
    mount();
    fireEvent.click(
      screen.getByRole('button', { name: /open feedback form/i }),
    );

    const titleInput = screen.getAllByRole('textbox')[0]!;
    fireEvent.change(titleInput, { target: { value: 'Broken flow' } });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /^send$/i }));
    });

    expect(onSubmitSpy).toHaveBeenCalledWith({
      ok: true,
      report_id: 'rep_ok',
    });
    expect(screen.getByRole('status')).toHaveTextContent(/report sent/i);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500);
    });

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull();
    });
  });

  it('shows an inline error and keeps the dialog open on failure', async () => {
    submit.mockResolvedValueOnce({
      ok: false,
      error: { code: 'INGEST_REJECTED', message: 'quota exceeded' },
    });
    mount();
    fireEvent.click(
      screen.getByRole('button', { name: /open feedback form/i }),
    );

    const titleInput = screen.getAllByRole('textbox')[0]!;
    fireEvent.change(titleInput, { target: { value: 'Broken flow' } });

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
    fireEvent.click(
      screen.getByRole('button', { name: /open feedback form/i }),
    );
    const titleInput = screen.getAllByRole('textbox')[0]!;
    fireEvent.change(titleInput, { target: { value: 'x' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /^send$/i }));
    });
    expect(onSubmitSpy).toHaveBeenCalledWith(failure);
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

  it('renders a disabled FAB when disabled prop is true and does not open the dialog', () => {
    mount({ disabled: true });
    const fab = screen.getByRole('button', { name: /open feedback form/i });
    expect(fab).toBeDisabled();
    fireEvent.click(fab);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('applies the brw-fab-bl class when position is bottom-left', () => {
    mount({ position: 'bottom-left' });
    const fab = screen.getByRole('button', { name: /open feedback form/i });
    expect(fab.className).toMatch(/brw-fab-bl/);
    expect(fab.className).not.toMatch(/brw-fab-br/);
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
    fireEvent.click(
      screen.getByRole('button', { name: /open feedback form/i }),
    );
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

  it('clears form fields after a success + auto-close when reopened', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    submit.mockResolvedValueOnce({ ok: true, report_id: 'rep_reset' });
    mount();
    fireEvent.click(
      screen.getByRole('button', { name: /open feedback form/i }),
    );

    const textboxes = screen.getAllByRole('textbox');
    fireEvent.change(textboxes[0]!, { target: { value: 'title-a' } });
    fireEvent.change(textboxes[1]!, { target: { value: 'desc-a' } });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /^send$/i }));
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500);
    });

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull();
    });

    // Reopen
    fireEvent.click(
      screen.getByRole('button', { name: /open feedback form/i }),
    );
    const reopenedBoxes = screen.getAllByRole('textbox');
    expect((reopenedBoxes[0] as HTMLInputElement).value).toBe('');
    expect((reopenedBoxes[1] as HTMLTextAreaElement).value).toBe('');
    // Success banner should be cleared too
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('clears prior form state when the dialog is closed manually and reopened', () => {
    mount();
    fireEvent.click(
      screen.getByRole('button', { name: /open feedback form/i }),
    );
    const textboxes = screen.getAllByRole('textbox');
    fireEvent.change(textboxes[0]!, { target: { value: 'stale-title' } });
    fireEvent.change(textboxes[1]!, { target: { value: 'stale-desc' } });

    // Close via Cancel
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(screen.queryByRole('dialog')).toBeNull();

    // Reopen
    fireEvent.click(
      screen.getByRole('button', { name: /open feedback form/i }),
    );
    const reopenedBoxes = screen.getAllByRole('textbox');
    expect((reopenedBoxes[0] as HTMLInputElement).value).toBe('');
    expect((reopenedBoxes[1] as HTMLTextAreaElement).value).toBe('');
  });

  it('surfaces an error in the dialog when captureScreenshot rejects', async () => {
    captureScreenshot.mockRejectedValueOnce(new Error('canvas tainted'));
    mount();
    fireEvent.click(
      screen.getByRole('button', { name: /open feedback form/i }),
    );

    await act(async () => {
      fireEvent.click(
        screen.getByRole('button', { name: /attach screenshot/i }),
      );
    });

    expect(
      screen.getByText(/canvas tainted/i, { selector: '[role="alert"]' }),
    ).toBeInTheDocument();
    // No thumbnail was rendered
    expect(screen.queryByAltText(/screenshot preview/i)).toBeNull();
  });
});
