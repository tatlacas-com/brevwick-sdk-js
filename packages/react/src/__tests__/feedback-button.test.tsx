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
  const actual = await vi.importActual<typeof import('brevwick-sdk')>(
    'brevwick-sdk',
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

import { BrevwickProvider } from '../provider';
import { FeedbackButton } from '../feedback-button';

beforeEach(() => {
  if (typeof URL.createObjectURL !== 'function') {
    (URL as unknown as { createObjectURL: (b: Blob) => string }).createObjectURL =
      () => 'blob:mock';
  }
  if (typeof URL.revokeObjectURL !== 'function') {
    (URL as unknown as { revokeObjectURL: (u: string) => void }).revokeObjectURL =
      () => undefined;
  }
});

afterEach(() => {
  vi.clearAllMocks();
  vi.useRealTimers();
});

const mount = () =>
  render(
    <BrevwickProvider config={{ projectKey: 'pk_test_fab' }}>
      <FeedbackButton onSubmit={onSubmitSpy} />
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
    fireEvent.click(screen.getByRole('button', { name: /open feedback form/i }));
    fireEvent.click(screen.getByRole('button', { name: /^send$/i }));
    expect(screen.getByRole('alert')).toHaveTextContent(/title is required/i);
    expect(submit).not.toHaveBeenCalled();
  });

  it('attaches a screenshot by calling sdk.captureScreenshot and shows a thumbnail', async () => {
    const blob = new Blob(['x'], { type: 'image/png' });
    captureScreenshot.mockResolvedValueOnce(blob);
    mount();
    fireEvent.click(screen.getByRole('button', { name: /open feedback form/i }));

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
    fireEvent.click(screen.getByRole('button', { name: /open feedback form/i }));

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
    fireEvent.click(screen.getByRole('button', { name: /open feedback form/i }));

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
});
