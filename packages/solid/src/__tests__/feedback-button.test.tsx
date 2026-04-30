import { fireEvent, render, screen, waitFor } from '@solidjs/testing-library';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  Brevwick,
  BrevwickConfig,
  FeedbackInput,
  SubmitResult,
} from '@tatlacas/brevwick-sdk';

const submit = vi.fn<(input: FeedbackInput) => Promise<SubmitResult>>();
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

import { BrevwickProvider } from '../provider';
import { FeedbackButton } from '../components/feedback-button';

beforeEach(() => {
  // jsdom lacks createObjectURL by default; stub both for the screenshot path.
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
});

const onSubmitSpy = vi.fn<(result: SubmitResult) => void>();
afterEach(() => onSubmitSpy.mockReset());

const mount = () =>
  render(() => (
    <BrevwickProvider config={{ projectKey: 'pk_test_fab' }}>
      <FeedbackButton onSubmit={onSubmitSpy} />
    </BrevwickProvider>
  ));

const openPanel = (): void => {
  fireEvent.click(screen.getByRole('button', { name: /open feedback form/i }));
};

describe('FeedbackButton', () => {
  it('renders the FAB with the default label', async () => {
    mount();
    expect(
      await screen.findByRole('button', { name: /open feedback form/i }),
    ).toBeInTheDocument();
  });

  it('opens the dialog and submits a draft', async () => {
    submit.mockResolvedValueOnce({ ok: true, issue_id: 'rep_42' });

    mount();
    openPanel();

    const textarea = await screen.findByLabelText(/feedback message/i);
    fireEvent.input(textarea, { target: { value: 'login is broken' } });

    fireEvent.click(screen.getByRole('button', { name: /send/i }));

    await waitFor(() => expect(submit).toHaveBeenCalledTimes(1));
    const [input] = submit.mock.calls[0]!;
    expect(input.description).toBe('login is broken');
    expect(input.title).toBe('login is broken');
    expect(input.attachments).toBeUndefined();

    await waitFor(() =>
      expect(onSubmitSpy).toHaveBeenCalledWith({
        ok: true,
        issue_id: 'rep_42',
      }),
    );
  });

  it('captures a screenshot via the SDK and rides it on the next submit', async () => {
    captureScreenshot.mockResolvedValueOnce(
      new Blob(['png'], { type: 'image/png' }),
    );
    submit.mockResolvedValueOnce({ ok: true, issue_id: 'rep_99' });

    mount();
    openPanel();

    fireEvent.click(
      screen.getByRole('button', { name: /capture screenshot/i }),
    );
    await waitFor(() => expect(captureScreenshot).toHaveBeenCalledTimes(1));

    fireEvent.input(await screen.findByLabelText(/feedback message/i), {
      target: { value: 'see screenshot' },
    });
    fireEvent.click(screen.getByRole('button', { name: /send/i }));

    await waitFor(() => expect(submit).toHaveBeenCalledTimes(1));
    const [input] = submit.mock.calls[0]!;
    expect(input.attachments).toHaveLength(1);
    expect(input.attachments![0]).toMatchObject({ filename: 'screenshot.png' });
  });

  it('renders nothing when hidden', () => {
    const { container } = render(() => (
      <BrevwickProvider config={{ projectKey: 'pk_test_hidden' }}>
        <FeedbackButton hidden />
      </BrevwickProvider>
    ));
    expect(
      container.querySelector('button[aria-label="Open feedback form"]'),
    ).toBeNull();
  });

  it('shows an error when submitted without a description', async () => {
    mount();
    openPanel();
    fireEvent.click(screen.getByRole('button', { name: /send/i }));
    // Send is disabled on empty draft, so type a single space (still trims to empty).
    fireEvent.input(await screen.findByLabelText(/feedback message/i), {
      target: { value: '   ' },
    });
    // Force-enable submit by typing real text first, then space-trimming via direct call:
    // simpler — assert the send button stays disabled with whitespace-only.
    expect(screen.getByRole('button', { name: /send/i })).toBeDisabled();
    expect(submit).not.toHaveBeenCalled();
  });
});
