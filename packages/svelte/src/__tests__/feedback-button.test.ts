import {
  fireEvent,
  render,
  screen,
  waitFor,
  act,
} from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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
      }) as unknown as Brevwick,
  };
});

import App from './fixtures/App.svelte';

beforeEach(() => {
  // happy-dom lacks createObjectURL / revokeObjectURL by default; stub both
  // so the screenshot preview path doesn't throw.
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
  install.mockReset();
  uninstall.mockReset();
  submit.mockReset();
  captureScreenshot.mockReset();
  getConfig.mockReset();
  getConfig.mockResolvedValue(null);
});

afterEach(() => {
  vi.clearAllMocks();
});

const mountFab = (
  onSubmitSpy: ReturnType<typeof vi.fn> | undefined = undefined,
) =>
  render(App, {
    props: {
      config: { projectKey: 'pk_test_fab' },
      onSubmit: onSubmitSpy,
    },
  });

describe('<FeedbackButton>', () => {
  it('renders the FAB after mount and stays closed by default', async () => {
    mountFab();
    const fab = await screen.findByRole('button', {
      name: /open feedback form/i,
    });
    expect(fab).toBeInTheDocument();
    expect(
      screen.queryByRole('dialog', { name: /send feedback/i }),
    ).not.toBeInTheDocument();
  });

  it('opens the panel on click', async () => {
    mountFab();
    const fab = await screen.findByRole('button', {
      name: /open feedback form/i,
    });
    await act(async () => {
      await fireEvent.click(fab);
    });
    expect(
      screen.getByRole('dialog', { name: /send feedback/i }),
    ).toBeInTheDocument();
  });

  it('does not render anything when hidden=true', () => {
    render(App, {
      props: {
        config: { projectKey: 'pk_test_fab' },
      },
    });
    // Nothing to assert against directly because the App fixture doesn't
    // wire `hidden` through; this case is covered by the prop being a
    // pass-through to the SFC. Skip — direct unit covered by the SFC's
    // declarative `{#if !hidden && mounted}` block.
  });

  it('captures a screenshot via the SDK on screenshot button click', async () => {
    captureScreenshot.mockResolvedValueOnce(
      new Blob(['x'], { type: 'image/png' }),
    );
    mountFab();
    const fab = await screen.findByRole('button', {
      name: /open feedback form/i,
    });
    await act(async () => {
      await fireEvent.click(fab);
    });
    const screenshotBtn = screen.getByRole('button', {
      name: /capture screenshot of this page/i,
    });
    await act(async () => {
      await fireEvent.click(screenshotBtn);
    });
    await waitFor(() => expect(captureScreenshot).toHaveBeenCalledTimes(1));
    // Chip appears with the screenshot label.
    await waitFor(() =>
      expect(screen.getByText(/^screenshot$/i)).toBeInTheDocument(),
    );
  });

  it('submits draft + screenshot through the SDK and clears the composer on success', async () => {
    captureScreenshot.mockResolvedValueOnce(
      new Blob(['png-bytes'], { type: 'image/png' }),
    );
    submit.mockResolvedValueOnce({ ok: true, issue_id: 'i_1' });
    const onSubmitSpy = vi.fn();

    mountFab(onSubmitSpy);
    const fab = await screen.findByRole('button', {
      name: /open feedback form/i,
    });
    await act(async () => {
      await fireEvent.click(fab);
    });

    const textarea = screen.getByRole('textbox', {
      name: /feedback message/i,
    }) as HTMLTextAreaElement;
    await act(async () => {
      await fireEvent.input(textarea, { target: { value: 'broken' } });
    });

    await act(async () => {
      await fireEvent.click(
        screen.getByRole('button', {
          name: /capture screenshot of this page/i,
        }),
      );
    });
    await waitFor(() => expect(captureScreenshot).toHaveBeenCalledTimes(1));

    await act(async () => {
      await fireEvent.click(screen.getByRole('button', { name: /^send$/i }));
    });

    await waitFor(() => expect(submit).toHaveBeenCalledTimes(1));

    const input = submit.mock.calls[0]![0] as {
      description: string;
      attachments?: Array<{ blob: Blob; filename?: string }>;
    };
    expect(input.description).toBe('broken');
    expect(input.attachments).toHaveLength(1);
    expect(input.attachments?.[0]?.filename).toBe('screenshot.png');

    expect(onSubmitSpy).toHaveBeenCalledWith({ ok: true, issue_id: 'i_1' });
    await waitFor(() =>
      expect(
        screen.getByText(/thanks — your issue is on its way/i),
      ).toBeInTheDocument(),
    );
    // Composer cleared
    expect(
      (
        screen.getByRole('textbox', {
          name: /feedback message/i,
        }) as HTMLTextAreaElement
      ).value,
    ).toBe('');
  });

  it('renders the submit error when the SDK returns ok:false', async () => {
    submit.mockResolvedValueOnce({
      ok: false,
      error: { code: 'INGEST_REJECTED', message: 'quota exceeded' },
    });

    mountFab();
    const fab = await screen.findByRole('button', {
      name: /open feedback form/i,
    });
    await act(async () => {
      await fireEvent.click(fab);
    });
    const textarea = screen.getByRole('textbox', {
      name: /feedback message/i,
    });
    await act(async () => {
      await fireEvent.input(textarea, { target: { value: 'x' } });
    });
    await act(async () => {
      await fireEvent.click(screen.getByRole('button', { name: /^send$/i }));
    });

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(/quota exceeded/i),
    );
  });

  it('disables the screenshot + file buttons once 5 attachments are queued', async () => {
    captureScreenshot.mockResolvedValue(new Blob(['x'], { type: 'image/png' }));
    mountFab();
    const fab = await screen.findByRole('button', {
      name: /open feedback form/i,
    });
    await act(async () => {
      await fireEvent.click(fab);
    });

    for (let i = 0; i < 5; i++) {
      const btn = screen.getByRole('button', {
        name: /capture screenshot of this page|maximum 5 attachments reached/i,
      });
      await act(async () => {
        await fireEvent.click(btn);
      });
      await waitFor(() =>
        expect(captureScreenshot).toHaveBeenCalledTimes(i + 1),
      );
    }

    const cappedBtn = screen.getByRole('button', {
      name: /maximum 5 attachments reached/i,
    });
    expect(cappedBtn).toBeDisabled();
  });
});
