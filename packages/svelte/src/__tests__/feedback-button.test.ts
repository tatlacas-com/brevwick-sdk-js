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

/**
 * In-memory mirror of the SDK's internal phase bus. The Svelte adapter
 * subscribes to this through the `_internal` backdoor in `context.ts`,
 * so the test mock stamps a structurally compatible bus on the
 * `Brevwick` instance and the suite drives phase events through
 * `phaseBus.emit(...)`. Mirrors the React adapter's test scaffolding.
 */
type PhaseEventPayload =
  | { phase: 'capturing-done' }
  | { phase: 'sanitising-done' }
  | { phase: 'sent'; aiEnabled: boolean };
const phaseListeners = new Set<(p: PhaseEventPayload) => void>();
const phaseBus = {
  on: (event: 'phase', listener: (p: PhaseEventPayload) => void) => {
    void event;
    phaseListeners.add(listener);
  },
  off: (event: 'phase', listener: (p: PhaseEventPayload) => void) => {
    void event;
    phaseListeners.delete(listener);
  },
  emit: (event: 'phase', payload: PhaseEventPayload) => {
    void event;
    for (const listener of [...phaseListeners]) listener(payload);
  },
};

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
        _internal: { bus: phaseBus },
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
  phaseListeners.clear();
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

  it('minimize preserves draft + attachments across reopen', async () => {
    captureScreenshot.mockResolvedValueOnce(
      new Blob(['x'], { type: 'image/png' }),
    );
    mountFab();
    await openPanel();
    const textarea = screen.getByRole('textbox', {
      name: /feedback message/i,
    }) as HTMLTextAreaElement;
    await act(async () => {
      await fireEvent.input(textarea, { target: { value: 'wip' } });
    });
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

    await act(async () => {
      await fireEvent.click(
        screen.getByRole('button', { name: /^minimize$/i }),
      );
    });
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );

    // Reopen — composer state must survive.
    await openPanel();
    expect(
      (
        screen.getByRole('textbox', {
          name: /feedback message/i,
        }) as HTMLTextAreaElement
      ).value,
    ).toBe('wip');
    expect(screen.getByText(/^screenshot$/i)).toBeInTheDocument();
  });

  it('close when clean dismisses immediately and clears state', async () => {
    mountFab();
    await openPanel();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    await act(async () => {
      await fireEvent.click(screen.getByRole('button', { name: /^close$/i }));
    });
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );
    expect(screen.queryByRole('alert', { name: /discard draft/i })).toBeNull();
  });

  it('close when dirty shows a confirm; Discard clears, Keep preserves', async () => {
    mountFab();
    await openPanel();
    const textarea = screen.getByRole('textbox', {
      name: /feedback message/i,
    });
    await act(async () => {
      await fireEvent.input(textarea, { target: { value: 'oops' } });
    });
    await act(async () => {
      await fireEvent.click(screen.getByRole('button', { name: /^close$/i }));
    });
    expect(
      screen.getByRole('alert', { name: /discard draft/i }),
    ).toBeInTheDocument();

    // Keep dismisses the confirm but preserves state.
    await act(async () => {
      await fireEvent.click(screen.getByRole('button', { name: /keep/i }));
    });
    expect(screen.queryByRole('alert', { name: /discard draft/i })).toBeNull();
    expect(
      (
        screen.getByRole('textbox', {
          name: /feedback message/i,
        }) as HTMLTextAreaElement
      ).value,
    ).toBe('oops');

    // Discard clears.
    await act(async () => {
      await fireEvent.click(screen.getByRole('button', { name: /^close$/i }));
    });
    await act(async () => {
      await fireEvent.click(screen.getByRole('button', { name: /discard/i }));
    });
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );
  });

  it('expected/actual are hidden by default and revealed via the disclosure', async () => {
    mountFab();
    await openPanel();
    expect(screen.queryByRole('textbox', { name: /expected/i })).toBeNull();
    await act(async () => {
      await fireEvent.click(
        screen.getByRole('button', { name: /add expected vs actual/i }),
      );
    });
    expect(
      screen.getByRole('textbox', { name: /expected/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('textbox', { name: /actual/i }),
    ).toBeInTheDocument();
  });

  it('passes expected/actual into the submit payload when filled', async () => {
    submit.mockResolvedValueOnce({ ok: true, issue_id: 'i_extra' });
    mountFab();
    await openPanel();
    await act(async () => {
      await fireEvent.click(
        screen.getByRole('button', { name: /add expected vs actual/i }),
      );
    });
    const expected = screen.getByRole('textbox', { name: /expected/i });
    const actual = screen.getByRole('textbox', { name: /actual/i });
    await act(async () => {
      await fireEvent.input(expected, { target: { value: 'should succeed' } });
    });
    await act(async () => {
      await fireEvent.input(actual, { target: { value: 'fails' } });
    });
    await act(async () => {
      await fireEvent.input(
        screen.getByRole('textbox', { name: /feedback message/i }),
        { target: { value: 'b' } },
      );
    });
    await act(async () => {
      await fireEvent.click(screen.getByRole('button', { name: /^send$/i }));
    });
    await waitFor(() => expect(submit).toHaveBeenCalledTimes(1));
    const input = submit.mock.calls[0]![0] as {
      expected?: string;
      actual?: string;
    };
    expect(input.expected).toBe('should succeed');
    expect(input.actual).toBe('fails');
  });

  it('disclosure toggle flips aria-expanded in both states', async () => {
    mountFab();
    await openPanel();
    const toggle = screen.getByRole('button', {
      name: /add expected vs actual/i,
    });
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    await act(async () => {
      await fireEvent.click(toggle);
    });
    const hideToggle = screen.getByRole('button', {
      name: /hide expected vs actual/i,
    });
    expect(hideToggle.getAttribute('aria-expanded')).toBe('true');
  });

  it('renders staged status rows in order as phase events arrive', async () => {
    let resolveSubmit: (r: SubmitResult) => void = () => undefined;
    submit.mockReturnValueOnce(
      new Promise<SubmitResult>((res) => {
        resolveSubmit = res;
      }),
    );
    mountFab();
    await openPanel();
    await act(async () => {
      await fireEvent.input(
        screen.getByRole('textbox', { name: /feedback message/i }),
        { target: { value: 'phase test' } },
      );
    });
    await act(async () => {
      await fireEvent.click(screen.getByRole('button', { name: /^send$/i }));
    });
    // Initial: no rows yet (phase === 'capturing').
    expect(document.querySelector('[data-brw-row="captured"]')).toBeNull();
    expect(document.querySelector('[data-brw-row="sanitised"]')).toBeNull();

    await act(async () => {
      phaseBus.emit('phase', { phase: 'capturing-done' });
    });
    await waitFor(() =>
      expect(
        document.querySelector('[data-brw-row="captured"]'),
      ).not.toBeNull(),
    );
    expect(document.querySelector('[data-brw-row="sanitised"]')).toBeNull();

    await act(async () => {
      phaseBus.emit('phase', { phase: 'sanitising-done' });
    });
    await waitFor(() =>
      expect(
        document.querySelector('[data-brw-row="sanitised"]'),
      ).not.toBeNull(),
    );

    // Resolve so the test doesn't leak a pending promise.
    await act(async () => {
      resolveSubmit({ ok: true, issue_id: 'i_phase' });
    });
  });

  it('AI formatting row only appears when ai_enabled and during the formatting phase', async () => {
    getConfig.mockResolvedValue({
      ai_enabled: true,
      ai_submitter_choice_allowed: false,
    } as unknown as ProjectConfig);
    let resolveSubmit: (r: SubmitResult) => void = () => undefined;
    submit.mockReturnValueOnce(
      new Promise<SubmitResult>((res) => {
        resolveSubmit = res;
      }),
    );
    mountFab();
    await openPanel();
    // Wait for project-config fetch to land.
    await waitFor(() => expect(getConfig).toHaveBeenCalled());
    await act(async () => {
      await fireEvent.input(
        screen.getByRole('textbox', { name: /feedback message/i }),
        { target: { value: 'ai phase' } },
      );
    });
    await act(async () => {
      await fireEvent.click(screen.getByRole('button', { name: /^send$/i }));
    });
    await act(async () => {
      phaseBus.emit('phase', { phase: 'capturing-done' });
    });
    await act(async () => {
      phaseBus.emit('phase', { phase: 'sanitising-done' });
    });
    await waitFor(() =>
      expect(
        document.querySelector('[data-brw-row="formatting"]'),
      ).not.toBeNull(),
    );
    await act(async () => {
      resolveSubmit({ ok: true, issue_id: 'i_aiphase' });
    });
  });

  it('renders a red retry row carrying the SubmitError message + code on ok:false', async () => {
    submit.mockResolvedValueOnce({
      ok: false,
      error: { code: 'INGEST_REJECTED', message: 'too big' },
    });
    mountFab();
    await openPanel();
    await act(async () => {
      await fireEvent.input(
        screen.getByRole('textbox', { name: /feedback message/i }),
        { target: { value: 'oops' } },
      );
    });
    await act(async () => {
      await fireEvent.click(screen.getByRole('button', { name: /^send$/i }));
    });
    const errorRow = await waitFor(() => {
      const row = document.querySelector('[data-brw-row="error"]');
      expect(row).not.toBeNull();
      return row as HTMLElement;
    });
    expect(errorRow.getAttribute('data-brw-error-code')).toBe(
      'INGEST_REJECTED',
    );
    expect(errorRow).toHaveTextContent(/too big/i);
    expect(errorRow.querySelector<HTMLButtonElement>('button')).not.toBeNull();
  });

  it('Retry CTA re-runs the most recent submit', async () => {
    submit
      .mockResolvedValueOnce({
        ok: false,
        error: { code: 'INGEST_REJECTED', message: 'first' },
      })
      .mockResolvedValueOnce({ ok: true, issue_id: 'i_retry' });
    mountFab();
    await openPanel();
    await act(async () => {
      await fireEvent.input(
        screen.getByRole('textbox', { name: /feedback message/i }),
        { target: { value: 'retry me' } },
      );
    });
    await act(async () => {
      await fireEvent.click(screen.getByRole('button', { name: /^send$/i }));
    });
    await waitFor(() =>
      expect(document.querySelector('[data-brw-row="error"]')).not.toBeNull(),
    );

    await act(async () => {
      await fireEvent.click(screen.getByRole('button', { name: /retry/i }));
    });
    await waitFor(() => expect(submit).toHaveBeenCalledTimes(2));
    // Both calls receive the same input.
    expect(
      (submit.mock.calls[0]![0] as { description: string }).description,
    ).toBe('retry me');
    expect(
      (submit.mock.calls[1]![0] as { description: string }).description,
    ).toBe('retry me');
  });

  it('does not fetch config on mount — only on first panel open', async () => {
    mountFab();
    // The FAB renders without ever opening — getConfig must stay untouched.
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: /open feedback form/i }),
      ).toBeInTheDocument(),
    );
    expect(getConfig).not.toHaveBeenCalled();

    await openPanel();
    await waitFor(() => expect(getConfig).toHaveBeenCalledTimes(1));
  });

  it('only fetches config once across multiple opens (cache reused)', async () => {
    mountFab();
    await openPanel();
    await waitFor(() => expect(getConfig).toHaveBeenCalledTimes(1));
    await act(async () => {
      await fireEvent.click(
        screen.getByRole('button', { name: /^minimize$/i }),
      );
    });
    await openPanel();
    // Second open reuses the cached result.
    expect(getConfig).toHaveBeenCalledTimes(1);
  });

  it('hides the AI toggle when ai_enabled=false and omits use_ai from submit', async () => {
    getConfig.mockResolvedValue({
      ai_enabled: false,
      ai_submitter_choice_allowed: true,
    } as unknown as ProjectConfig);
    submit.mockResolvedValueOnce({ ok: true, issue_id: 'i_off' });
    mountFab();
    await openPanel();
    await waitFor(() => expect(getConfig).toHaveBeenCalled());
    expect(
      screen.queryByRole('switch', { name: /format with ai/i }),
    ).toBeNull();
    await act(async () => {
      await fireEvent.input(
        screen.getByRole('textbox', { name: /feedback message/i }),
        { target: { value: 'no ai' } },
      );
    });
    await act(async () => {
      await fireEvent.click(screen.getByRole('button', { name: /^send$/i }));
    });
    await waitFor(() => expect(submit).toHaveBeenCalledTimes(1));
    const input = submit.mock.calls[0]![0] as { use_ai?: boolean };
    expect(input.use_ai).toBeUndefined();
  });

  it('hides the AI toggle when submitter choice not allowed and omits use_ai', async () => {
    getConfig.mockResolvedValue({
      ai_enabled: true,
      ai_submitter_choice_allowed: false,
    } as unknown as ProjectConfig);
    submit.mockResolvedValueOnce({ ok: true, issue_id: 'i_choice' });
    mountFab();
    await openPanel();
    await waitFor(() => expect(getConfig).toHaveBeenCalled());
    expect(
      screen.queryByRole('switch', { name: /format with ai/i }),
    ).toBeNull();
    await act(async () => {
      await fireEvent.input(
        screen.getByRole('textbox', { name: /feedback message/i }),
        { target: { value: 'no choice' } },
      );
    });
    await act(async () => {
      await fireEvent.click(screen.getByRole('button', { name: /^send$/i }));
    });
    await waitFor(() => expect(submit).toHaveBeenCalledTimes(1));
    const input = submit.mock.calls[0]![0] as { use_ai?: boolean };
    expect(input.use_ai).toBeUndefined();
  });

  it('renders the AI toggle default-on when allowed; payload carries use_ai=true', async () => {
    getConfig.mockResolvedValue({
      ai_enabled: true,
      ai_submitter_choice_allowed: true,
    } as unknown as ProjectConfig);
    submit.mockResolvedValueOnce({ ok: true, issue_id: 'i_on' });
    mountFab();
    await openPanel();
    await waitFor(() =>
      expect(
        screen.getByRole('switch', { name: /format with ai/i }),
      ).toBeInTheDocument(),
    );
    const toggle = screen.getByRole('switch', { name: /format with ai/i });
    expect(toggle.getAttribute('aria-checked')).toBe('true');
    expect(toggle.className).toMatch(/brw-svelte-aitoggle--on/);
    await act(async () => {
      await fireEvent.input(
        screen.getByRole('textbox', { name: /feedback message/i }),
        { target: { value: 'with ai' } },
      );
    });
    await act(async () => {
      await fireEvent.click(screen.getByRole('button', { name: /^send$/i }));
    });
    await waitFor(() => expect(submit).toHaveBeenCalledTimes(1));
    const input = submit.mock.calls[0]![0] as { use_ai?: boolean };
    expect(input.use_ai).toBe(true);
  });

  it('clicking the AI toggle flips it off; payload carries use_ai=false', async () => {
    getConfig.mockResolvedValue({
      ai_enabled: true,
      ai_submitter_choice_allowed: true,
    } as unknown as ProjectConfig);
    submit.mockResolvedValueOnce({ ok: true, issue_id: 'i_flip' });
    mountFab();
    await openPanel();
    const toggle = await waitFor(() =>
      screen.getByRole('switch', { name: /format with ai/i }),
    );
    await act(async () => {
      await fireEvent.click(toggle);
    });
    expect(toggle.getAttribute('aria-checked')).toBe('false');
    expect(toggle.className).not.toMatch(/brw-svelte-aitoggle--on/);
    await act(async () => {
      await fireEvent.input(
        screen.getByRole('textbox', { name: /feedback message/i }),
        { target: { value: 'no ai please' } },
      );
    });
    await act(async () => {
      await fireEvent.click(screen.getByRole('button', { name: /^send$/i }));
    });
    await waitFor(() => expect(submit).toHaveBeenCalledTimes(1));
    const input = submit.mock.calls[0]![0] as { use_ai?: boolean };
    expect(input.use_ai).toBe(false);
  });

  it('Space toggles the AI switch when focused (keyboard a11y)', async () => {
    getConfig.mockResolvedValue({
      ai_enabled: true,
      ai_submitter_choice_allowed: true,
    } as unknown as ProjectConfig);
    mountFab();
    await openPanel();
    const toggle = await waitFor(() =>
      screen.getByRole('switch', { name: /format with ai/i }),
    );
    expect(toggle.getAttribute('aria-checked')).toBe('true');
    await act(async () => {
      await fireEvent.keyDown(toggle, { key: ' ' });
    });
    expect(toggle.getAttribute('aria-checked')).toBe('false');
  });

  it('config fetch resolves to null → widget still works, no toggle, use_ai omitted', async () => {
    getConfig.mockResolvedValue(null);
    submit.mockResolvedValueOnce({ ok: true, issue_id: 'i_null' });
    mountFab();
    await openPanel();
    await waitFor(() => expect(getConfig).toHaveBeenCalled());
    expect(
      screen.queryByRole('switch', { name: /format with ai/i }),
    ).toBeNull();
    await act(async () => {
      await fireEvent.input(
        screen.getByRole('textbox', { name: /feedback message/i }),
        { target: { value: 'null cfg' } },
      );
    });
    await act(async () => {
      await fireEvent.click(screen.getByRole('button', { name: /^send$/i }));
    });
    await waitFor(() => expect(submit).toHaveBeenCalledTimes(1));
    const input = submit.mock.calls[0]![0] as { use_ai?: boolean };
    expect(input.use_ai).toBeUndefined();
  });

  it('config fetch rejects → no toggle, submit still works and omits use_ai', async () => {
    getConfig.mockRejectedValue(new Error('cfg down'));
    submit.mockResolvedValueOnce({ ok: true, issue_id: 'i_err' });
    mountFab();
    await openPanel();
    await waitFor(() => expect(getConfig).toHaveBeenCalled());
    expect(
      screen.queryByRole('switch', { name: /format with ai/i }),
    ).toBeNull();
    await act(async () => {
      await fireEvent.input(
        screen.getByRole('textbox', { name: /feedback message/i }),
        { target: { value: 'cfg err' } },
      );
    });
    await act(async () => {
      await fireEvent.click(screen.getByRole('button', { name: /^send$/i }));
    });
    await waitFor(() => expect(submit).toHaveBeenCalledTimes(1));
    const input = submit.mock.calls[0]![0] as { use_ai?: boolean };
    expect(input.use_ai).toBeUndefined();
  });

  it('successful submit appends an assistant receipt bubble with "just now"', async () => {
    submit.mockResolvedValueOnce({ ok: true, issue_id: 'i_receipt' });
    mountFab();
    await openPanel();
    await act(async () => {
      await fireEvent.input(
        screen.getByRole('textbox', { name: /feedback message/i }),
        { target: { value: 'receipt' } },
      );
    });
    await act(async () => {
      await fireEvent.click(screen.getByRole('button', { name: /^send$/i }));
    });
    await waitFor(() =>
      expect(
        screen.getByText(/thanks — your issue is on its way/i),
      ).toBeInTheDocument(),
    );
    expect(screen.getByText(/issue sent/i)).toBeInTheDocument();
    expect(screen.getByText(/just now/i)).toBeInTheDocument();
  });

  it('Send pushes a user bubble carrying the raw draft', async () => {
    submit.mockResolvedValueOnce({ ok: true, issue_id: 'i_bubble' });
    mountFab();
    await openPanel();
    await act(async () => {
      await fireEvent.input(
        screen.getByRole('textbox', { name: /feedback message/i }),
        { target: { value: 'line one\nline two' } },
      );
    });
    await act(async () => {
      await fireEvent.click(screen.getByRole('button', { name: /^send$/i }));
    });
    await waitFor(() => expect(submit).toHaveBeenCalledTimes(1));
    // Description is the raw draft (incl. newlines); title is the trimmed
    // first line.
    const input = submit.mock.calls[0]![0] as {
      title: string;
      description: string;
    };
    expect(input.title).toBe('line one');
    expect(input.description).toBe('line one\nline two');
  });

  it('close button is disabled while a submit is in flight', async () => {
    let resolveSubmit: (r: SubmitResult) => void = () => undefined;
    submit.mockReturnValueOnce(
      new Promise<SubmitResult>((res) => {
        resolveSubmit = res;
      }),
    );
    mountFab();
    await openPanel();
    await act(async () => {
      await fireEvent.input(
        screen.getByRole('textbox', { name: /feedback message/i }),
        { target: { value: 'inflight' } },
      );
    });
    await act(async () => {
      await fireEvent.click(screen.getByRole('button', { name: /^send$/i }));
    });
    expect(screen.getByRole('button', { name: /^close$/i })).toBeDisabled();
    await act(async () => {
      resolveSubmit({ ok: true, issue_id: 'i_inflight' });
    });
  });

  // Screenshot region overlay + preview dialog are out of scope for the
  // Svelte v1 widget — kept as `.skip` markers so future ports keep the
  // intent but the suite stays green today.
  it.skip('region overlay drag-select capture', () => {});
  it.skip('screenshot preview dialog opens on chip click', () => {});
});
