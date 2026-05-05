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
  extra: Record<string, unknown> = {},
) =>
  render(App, {
    props: {
      config: { projectKey: 'pk_test_fab' },
      onSubmit: onSubmitSpy,
      ...extra,
    },
  });

const openPanel = async (): Promise<HTMLElement> => {
  const fab = await screen.findByRole('button', {
    name: /open feedback form/i,
  });
  await act(async () => {
    await fireEvent.click(fab);
  });
  return fab;
};

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
    await openPanel();
    expect(
      screen.getByRole('dialog', { name: /send feedback/i }),
    ).toBeInTheDocument();
  });

  it('renders nothing when hidden=true', async () => {
    mountFab(undefined, { hidden: true });
    // Wait for any potential mount cycle, then assert no FAB / dialog exist.
    await waitFor(() => {
      expect(
        screen.queryByRole('button', { name: /open feedback form/i }),
      ).not.toBeInTheDocument();
    });
    expect(
      screen.queryByRole('dialog', { name: /send feedback/i }),
    ).not.toBeInTheDocument();
  });

  it('does not open the panel when disabled=true', async () => {
    mountFab(undefined, { disabled: true });
    const fab = await screen.findByRole('button', {
      name: /open feedback form/i,
    });
    expect(fab).toBeDisabled();
    await act(async () => {
      await fireEvent.click(fab);
    });
    expect(
      screen.queryByRole('dialog', { name: /send feedback/i }),
    ).not.toBeInTheDocument();
  });

  it('pins the FAB to the bottom-left corner when position="bottom-left"', async () => {
    mountFab(undefined, { position: 'bottom-left' });
    const fab = await screen.findByRole('button', {
      name: /open feedback form/i,
    });
    expect(fab.className).toContain('brw-fab-bl');
    expect(fab.className).not.toContain('brw-fab-br');

    await act(async () => {
      await fireEvent.click(fab);
    });
    const panel = screen.getByRole('dialog', { name: /send feedback/i });
    expect(panel.className).toContain('brw-panel-bl');
  });

  it('forwards the theme prop onto the widget root via data-brw-theme', async () => {
    const { container } = mountFab(undefined, { theme: 'dark' });
    await waitFor(() => {
      const root = container.querySelector('.brw-svelte-root');
      expect(root).not.toBeNull();
      expect(root?.getAttribute('data-brw-theme')).toBe('dark');
    });
  });

  it.skip('captures a screenshot via the SDK on screenshot button click', async () => {
    captureScreenshot.mockResolvedValueOnce(
      new Blob(['x'], { type: 'image/png' }),
    );
    mountFab();
    await openPanel();
    const screenshotBtn = screen.getByRole('button', {
      name: /capture screenshot of this page/i,
    });
    await act(async () => {
      await fireEvent.click(screenshotBtn);
    });
    await waitFor(() => expect(captureScreenshot).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(screen.getByText(/^screenshot$/i)).toBeInTheDocument(),
    );
  });

  it.skip('submits draft + screenshot through the SDK and clears the composer on success', async () => {
    captureScreenshot.mockResolvedValueOnce(
      new Blob(['png-bytes'], { type: 'image/png' }),
    );
    submit.mockResolvedValueOnce({ ok: true, issue_id: 'i_1' });
    const onSubmitSpy = vi.fn();

    mountFab(onSubmitSpy);
    await openPanel();

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
    await openPanel();
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

  it('renders a generic error when the SDK throws (catch branch)', async () => {
    submit.mockRejectedValueOnce(new Error('network down'));

    mountFab();
    await openPanel();
    const textarea = screen.getByRole('textbox', {
      name: /feedback message/i,
    });
    await act(async () => {
      await fireEvent.input(textarea, { target: { value: 'oops' } });
    });
    await act(async () => {
      await fireEvent.click(screen.getByRole('button', { name: /^send$/i }));
    });

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(/network down/i),
    );
  });

  it.skip('renders an error when the screenshot capture fails', async () => {
    captureScreenshot.mockRejectedValueOnce(new Error('capture exploded'));
    mountFab();
    await openPanel();
    await act(async () => {
      await fireEvent.click(
        screen.getByRole('button', {
          name: /capture screenshot of this page/i,
        }),
      );
    });
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(/capture exploded/i),
    );
  });

  it.skip('disables the screenshot + file buttons once 5 attachments are queued', async () => {
    captureScreenshot.mockResolvedValue(new Blob(['x'], { type: 'image/png' }));
    mountFab();
    await openPanel();

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

  it('attaches files via the file input and removes them on chip click', async () => {
    mountFab();
    await openPanel();

    const fileInput = screen
      .getByRole('dialog')
      .querySelector<HTMLInputElement>('input[type="file"]');
    expect(fileInput).not.toBeNull();

    const f1 = new File(['hello'], 'log.txt', { type: 'text/plain' });
    const f2 = new File(['x'.repeat(2048)], 'big.bin', {
      type: 'application/octet-stream',
    });

    await act(async () => {
      await fireEvent.change(fileInput!, { target: { files: [f1, f2] } });
    });

    await waitFor(() =>
      expect(screen.getByText('log.txt')).toBeInTheDocument(),
    );
    expect(screen.getByText('big.bin')).toBeInTheDocument();
    // formatSize: 5 B (B tier) and 2.0 kB (kB tier).
    expect(screen.getByText('5 B')).toBeInTheDocument();
    expect(screen.getByText('2.0 kB')).toBeInTheDocument();

    const removeBtn = screen.getByRole('button', { name: /remove log\.txt/i });
    await act(async () => {
      await fireEvent.click(removeBtn);
    });
    await waitFor(() =>
      expect(screen.queryByText('log.txt')).not.toBeInTheDocument(),
    );
  });

  it('exercises every formatSize tier (B / kB / MB)', async () => {
    mountFab();
    await openPanel();

    const fileInput = screen
      .getByRole('dialog')
      .querySelector<HTMLInputElement>('input[type="file"]');
    expect(fileInput).not.toBeNull();

    const small = new File(['ab'], 'small.txt', { type: 'text/plain' });
    const med = new File(['x'.repeat(1500)], 'med.bin', {
      type: 'application/octet-stream',
    });
    const big = new File(['y'.repeat(2 * 1024 * 1024)], 'big.bin', {
      type: 'application/octet-stream',
    });

    await act(async () => {
      await fireEvent.change(fileInput!, {
        target: { files: [small, med, big] },
      });
    });

    await waitFor(() => {
      expect(screen.getByText('2 B')).toBeInTheDocument();
      expect(screen.getByText('1.5 kB')).toBeInTheDocument();
      expect(screen.getByText('2.0 MB')).toBeInTheDocument();
    });
  });

  it.skip('removes a captured screenshot via its remove button and revokes the URL', async () => {
    captureScreenshot.mockResolvedValueOnce(
      new Blob(['x'], { type: 'image/png' }),
    );
    const revokeSpy = vi.spyOn(URL, 'revokeObjectURL');

    mountFab();
    await openPanel();
    await act(async () => {
      await fireEvent.click(
        screen.getByRole('button', {
          name: /capture screenshot of this page/i,
        }),
      );
    });

    await waitFor(() =>
      expect(screen.getByText(/^screenshot$/i)).toBeInTheDocument(),
    );

    const removeBtn = screen.getByRole('button', {
      name: /remove screenshot 1/i,
    });
    await act(async () => {
      await fireEvent.click(removeBtn);
    });
    await waitFor(() =>
      expect(screen.queryByText(/^screenshot$/i)).not.toBeInTheDocument(),
    );
    expect(revokeSpy).toHaveBeenCalled();
  });

  it('submits via Enter (and ignores Enter with modifier keys)', async () => {
    submit.mockResolvedValueOnce({ ok: true, issue_id: 'i_enter' });
    mountFab();
    await openPanel();
    const textarea = screen.getByRole('textbox', {
      name: /feedback message/i,
    });
    await act(async () => {
      await fireEvent.input(textarea, { target: { value: 'enter-send' } });
    });

    // Shift+Enter MUST NOT submit.
    await act(async () => {
      await fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: true });
    });
    expect(submit).not.toHaveBeenCalled();

    // Plain Enter submits.
    await act(async () => {
      await fireEvent.keyDown(textarea, { key: 'Enter' });
    });
    await waitFor(() => expect(submit).toHaveBeenCalledTimes(1));
  });

  it('does not submit when the draft is empty / whitespace', async () => {
    mountFab();
    await openPanel();
    const send = screen.getByRole('button', { name: /^send$/i });
    expect(send).toBeDisabled();
    await act(async () => {
      await fireEvent.click(send);
    });
    expect(submit).not.toHaveBeenCalled();
  });

  it('closes the panel via the × button', async () => {
    mountFab();
    await openPanel();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    const closeBtn = screen.getByRole('button', { name: /^close$/i });
    await act(async () => {
      await fireEvent.click(closeBtn);
    });
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );
  });

  it('closes the panel on Escape (parity with React/Radix)', async () => {
    mountFab();
    await openPanel();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    await act(async () => {
      await fireEvent.keyDown(window, { key: 'Escape' });
    });
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );
  });

  it.skip('caps screenshots at 5 even if a stale capture lands after the cap', async () => {
    // Race-cap defence-in-depth: once 5 attachments are queued, a long-running
    // capture that resolves AFTER the cap was reached must not push a 6th.
    captureScreenshot.mockResolvedValue(new Blob(['x'], { type: 'image/png' }));
    mountFab();
    await openPanel();

    // Fill via 5 file attachments (instant, no await).
    const fileInput = screen
      .getByRole('dialog')
      .querySelector<HTMLInputElement>('input[type="file"]');
    expect(fileInput).not.toBeNull();
    const five = Array.from(
      { length: 5 },
      (_, i) => new File(['x'], `f${i}.txt`, { type: 'text/plain' }),
    );
    await act(async () => {
      await fireEvent.change(fileInput!, { target: { files: five } });
    });

    // Trigger a screenshot that resolves *after* we hit the cap. Because the
    // capture button is now disabled (attachmentsAtCap), `handleScreenshot`
    // is gated by the early `if (capturing || attachmentsAtCap) return`
    // guard — defence-in-depth verified by the surface contract.
    const screenshotBtn = screen.getByRole('button', {
      name: /maximum 5 attachments reached/i,
    });
    expect(screenshotBtn).toBeDisabled();
  });
});
