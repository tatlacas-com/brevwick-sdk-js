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

/**
 * Drive the screenshot button through the region-capture overlay the
 * pre-existing tests expect "click screenshot → blob in composer" from.
 * Post-restore (React parity), the button opens an overlay and the user
 * picks between a region crop and a full-page capture — here we take the
 * latter path, which is the closest analogue to the original one-click
 * behaviour. Mirrors the React suite's `captureFullPage` helper.
 */
const captureFullPage = async (): Promise<void> => {
  await act(async () => {
    await fireEvent.click(
      screen.getByRole('button', {
        name: /capture screenshot of this page/i,
      }),
    );
  });
  await act(async () => {
    await fireEvent.click(
      screen.getByRole('button', { name: /capture full page/i }),
    );
  });
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

  it('greeting invites a screenshot now that the capture button is back', async () => {
    // Pins the full greeting copy: the screenshot-restore decision requires
    // "…A screenshot helps if you have one." whenever the capture button is
    // present. Mirrors the React adapter's regression pin.
    mountFab();
    await openPanel();
    expect(
      screen.getByText(
        "Hi! Tell us what's happening. A screenshot helps if you have one.",
      ),
    ).toBeInTheDocument();
  });

  it('captures a screenshot via the SDK on screenshot button click', async () => {
    captureScreenshot.mockResolvedValueOnce(
      new Blob(['x'], { type: 'image/png' }),
    );
    mountFab();
    await openPanel();
    await captureFullPage();
    await waitFor(() => expect(captureScreenshot).toHaveBeenCalledTimes(1));
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
    await openPanel();

    const textarea = screen.getByRole('textbox', {
      name: /feedback message/i,
    }) as HTMLTextAreaElement;
    await act(async () => {
      await fireEvent.input(textarea, { target: { value: 'broken' } });
    });

    await captureFullPage();
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

  it('renders an error when the screenshot capture fails', async () => {
    captureScreenshot.mockRejectedValueOnce(new Error('capture exploded'));
    mountFab();
    await openPanel();
    await captureFullPage();
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(/capture exploded/i),
    );
    // Failure path queues no chip — submission is never blocked.
    expect(screen.queryByText(/^screenshot$/i)).not.toBeInTheDocument();
  });

  it('disables the screenshot + file buttons once 5 attachments are queued', async () => {
    captureScreenshot.mockResolvedValue(new Blob(['x'], { type: 'image/png' }));
    mountFab();
    await openPanel();

    for (let i = 0; i < 5; i++) {
      await captureFullPage();
      await waitFor(() =>
        expect(captureScreenshot).toHaveBeenCalledTimes(i + 1),
      );
    }

    const cappedBtn = screen.getByRole('button', {
      name: /maximum 5 attachments reached/i,
    });
    expect(cappedBtn).toBeDisabled();
    // The file input shares the combined cap and its aria-label mutates the
    // same way the screenshot button's does.
    const fileInput = screen
      .getByRole('dialog')
      .querySelector<HTMLInputElement>('input[type="file"]');
    expect(fileInput).toBeDisabled();
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

  it('removes a captured screenshot via its remove button and revokes the URL', async () => {
    captureScreenshot.mockResolvedValueOnce(
      new Blob(['x'], { type: 'image/png' }),
    );
    const revokeSpy = vi.spyOn(URL, 'revokeObjectURL');

    mountFab();
    await openPanel();
    await captureFullPage();

    await waitFor(() =>
      expect(screen.getByText(/^screenshot$/i)).toBeInTheDocument(),
    );

    // A single screenshot is labelled "screenshot" (no ordinal) — parity
    // with the React adapter's chip naming.
    const removeBtn = screen.getByRole('button', {
      name: /^remove screenshot$/i,
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

  it('caps screenshots at 5 even if a stale capture lands after the cap', async () => {
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
    // capture button is now disabled (attachmentsAtCap), `openRegionOverlay`
    // is gated by the early `if (capturing || attachmentsAtCap) return`
    // guard — defence-in-depth verified by the surface contract. (The
    // post-await re-check inside performCapture is pinned separately in the
    // multi-screenshot describe below.)
    const screenshotBtn = screen.getByRole('button', {
      name: /maximum 5 attachments reached/i,
    });
    expect(screenshotBtn).toBeDisabled();
  });

  it('minimize preserves draft + attachments across reopen', async () => {
    mountFab();
    await openPanel();
    const textarea = screen.getByRole('textbox', {
      name: /feedback message/i,
    }) as HTMLTextAreaElement;
    await act(async () => {
      await fireEvent.input(textarea, { target: { value: 'wip' } });
    });

    // Attach a file so we can assert the chip survives the minimize / reopen
    // cycle. The same property holds for any chip in the composer — the
    // screenshot path is exercised by its own describe blocks below.
    const fileInput = screen
      .getByRole('dialog')
      .querySelector<HTMLInputElement>('input[type="file"]');
    expect(fileInput).not.toBeNull();
    const attached = new File(['x'], 'note.txt', { type: 'text/plain' });
    await act(async () => {
      await fireEvent.change(fileInput!, { target: { files: [attached] } });
    });
    await waitFor(() =>
      expect(screen.getByText('note.txt')).toBeInTheDocument(),
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
    expect(screen.getByText('note.txt')).toBeInTheDocument();
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
});

/**
 * Multi-screenshot, in-flight loading indicator, and tap-to-preview
 * thumbnails — mirrors the React adapter's "multi-screenshot + preview"
 * describe (#55 / #56 / #57). The single-screenshot tests above pin the
 * "one capture" wire format; this block locks in the array shape, the cap,
 * the capturing bubble, and the preview dialog wiring.
 */
describe('<FeedbackButton> — multi-screenshot + preview', () => {
  const typeDraft = async (text: string): Promise<void> => {
    await act(async () => {
      await fireEvent.input(
        screen.getByRole('textbox', { name: /feedback message/i }),
        { target: { value: text } },
      );
    });
  };

  it('keeps both captures (no replace) and disambiguates filenames on submit', async () => {
    captureScreenshot.mockResolvedValueOnce(
      new Blob(['1'], { type: 'image/png' }),
    );
    captureScreenshot.mockResolvedValueOnce(
      new Blob(['2'], { type: 'image/webp' }),
    );
    submit.mockResolvedValueOnce({ ok: true, issue_id: 'i_multi' });
    mountFab();
    await openPanel();

    await captureFullPage();
    await captureFullPage();

    expect(
      screen.getByRole('button', { name: /remove screenshot 1/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /remove screenshot 2/i }),
    ).toBeInTheDocument();

    await typeDraft('two screenshots');
    await act(async () => {
      await fireEvent.click(screen.getByRole('button', { name: /^send$/i }));
    });
    await waitFor(() => expect(submit).toHaveBeenCalledTimes(1));
    const input = submit.mock.calls[0]![0] as {
      attachments: Array<{ blob: Blob; filename: string }>;
    };
    expect(input.attachments).toHaveLength(2);
    expect(input.attachments[0]!.filename).toBe('screenshot-1.png');
    expect(input.attachments[1]!.filename).toBe('screenshot-2.webp');
  });

  it('shows a "Capturing screenshot…" indicator between region close and the chip render', async () => {
    let release: (b: Blob) => void = () => undefined;
    captureScreenshot.mockReturnValueOnce(
      new Promise<Blob>((resolve) => {
        release = resolve;
      }),
    );
    mountFab();
    await openPanel();
    await captureFullPage();

    // Capture is still pending — bubble + spinner should be visible.
    expect(screen.getByText(/capturing screenshot/i)).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /remove screenshot/i }),
    ).toBeNull();

    await act(async () => {
      release(new Blob(['x'], { type: 'image/png' }));
      await Promise.resolve();
    });
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: /^remove screenshot$/i }),
      ).toBeInTheDocument(),
    );
    expect(screen.queryByText(/capturing screenshot/i)).toBeNull();
  });

  it('disables the screenshot button while a capture is in flight', async () => {
    let release: (b: Blob) => void = () => undefined;
    captureScreenshot.mockReturnValueOnce(
      new Promise<Blob>((resolve) => {
        release = resolve;
      }),
    );
    mountFab();
    await openPanel();
    await captureFullPage();

    expect(
      screen.getByRole('button', { name: /capturing screenshot/i }),
    ).toBeDisabled();

    await act(async () => {
      release(new Blob(['x'], { type: 'image/png' }));
      await Promise.resolve();
    });
    await waitFor(() =>
      expect(
        screen.getByRole('button', {
          name: /capture screenshot of this page/i,
        }),
      ).not.toBeDisabled(),
    );
  });

  it('blocks Enter-to-send while a capture is in flight (no submit without the pending screenshot)', async () => {
    let release: (b: Blob) => void = () => undefined;
    captureScreenshot.mockReturnValueOnce(
      new Promise<Blob>((resolve) => {
        release = resolve;
      }),
    );
    mountFab();
    await openPanel();
    await typeDraft('partial draft');
    await captureFullPage();

    // Send button is disabled because Capture is in flight; Enter-to-send
    // is independently guarded inside handleSubmit so the keyboard path
    // can't race past the disabled-button protection.
    expect(screen.getByRole('button', { name: /^send$/i })).toBeDisabled();
    await act(async () => {
      await fireEvent.keyDown(
        screen.getByRole('textbox', { name: /feedback message/i }),
        { key: 'Enter' },
      );
    });
    expect(submit).not.toHaveBeenCalled();

    await act(async () => {
      release(new Blob(['x'], { type: 'image/png' }));
      await Promise.resolve();
    });
    // After capture resolves, Send re-enables — the guard only fires while
    // `capturing` is true.
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: /^send$/i }),
      ).not.toBeDisabled(),
    );
  });

  it('surfaces an error when a capture lands after the cap was reached', async () => {
    // Hit the defence-in-depth branch in performCapture: a capture in
    // flight while files fill the remaining slots must be dropped (no 6th
    // attachment) and surface the cap message as a role=alert.
    captureScreenshot.mockResolvedValueOnce(
      new Blob(['1'], { type: 'image/png' }),
    );
    let releaseSecond: (b: Blob) => void = () => undefined;
    captureScreenshot.mockReturnValueOnce(
      new Promise<Blob>((resolve) => {
        releaseSecond = resolve;
      }),
    );
    mountFab();
    await openPanel();
    await captureFullPage();

    // Kick off capture #2 (still pending).
    await captureFullPage();

    // Fill the remaining 4 slots with files while capture #2 is in flight.
    const fileInput = screen
      .getByRole('dialog')
      .querySelector<HTMLInputElement>('input[type="file"]');
    expect(fileInput).not.toBeNull();
    const four = Array.from(
      { length: 4 },
      (_, i) => new File(['f'], `f${i}.png`, { type: 'image/png' }),
    );
    await act(async () => {
      await fireEvent.change(fileInput!, { target: { files: four } });
    });

    // Resolve capture #2 — performCapture's cap guard rejects the new
    // capture and surfaces the error message.
    await act(async () => {
      releaseSecond(new Blob(['2'], { type: 'image/png' }));
      await Promise.resolve();
    });
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(
        /maximum 5 attachments reached/i,
      ),
    );
    // Still 5 attachments: 1 screenshot + 4 files — no 6th chip.
    expect(screen.getAllByRole('button', { name: /^remove/i })).toHaveLength(5);
  });

  it('tapping a screenshot thumbnail opens a preview dialog with the captured image', async () => {
    captureScreenshot.mockResolvedValueOnce(
      new Blob(['x'], { type: 'image/png' }),
    );
    const createSpy = vi
      .spyOn(URL, 'createObjectURL')
      .mockReturnValue('blob:mock-preview');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);

    mountFab();
    await openPanel();
    await captureFullPage();

    await act(async () => {
      await fireEvent.click(
        screen.getByRole('button', { name: /preview screenshot/i }),
      );
    });
    const preview = screen.getByTestId('brw-preview-dialog');
    expect(preview).toBeInTheDocument();
    const img = preview.querySelector('img[alt="Captured screenshot"]');
    expect(img).not.toBeNull();
    expect(img).toHaveAttribute('src', 'blob:mock-preview');

    await act(async () => {
      await fireEvent.click(
        screen.getByRole('button', { name: /close preview/i }),
      );
    });
    await waitFor(() =>
      expect(screen.queryByTestId('brw-preview-dialog')).toBeNull(),
    );
    createSpy.mockRestore();
  });

  it('Esc dismisses the preview dialog without removing the screenshot', async () => {
    captureScreenshot.mockResolvedValueOnce(
      new Blob(['x'], { type: 'image/png' }),
    );
    mountFab();
    await openPanel();
    await captureFullPage();

    await act(async () => {
      await fireEvent.click(
        screen.getByRole('button', { name: /preview screenshot/i }),
      );
    });
    expect(screen.getByTestId('brw-preview-dialog')).toBeInTheDocument();
    await act(async () => {
      await fireEvent.keyDown(window, { key: 'Escape' });
    });
    await waitFor(() =>
      expect(screen.queryByTestId('brw-preview-dialog')).toBeNull(),
    );
    // Chip survives the Esc — Esc on the preview must not fall through to
    // the panel's own minimize handler. The chip's preview button is the
    // canonical "screenshot is still attached" probe.
    expect(
      screen.getByRole('button', { name: /preview screenshot/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('dialog', { name: /send feedback/i }),
    ).toBeInTheDocument();
  });

  it('clicking the chip × does not open the preview dialog', async () => {
    captureScreenshot.mockResolvedValueOnce(
      new Blob(['x'], { type: 'image/png' }),
    );
    mountFab();
    await openPanel();
    await captureFullPage();

    await act(async () => {
      await fireEvent.click(
        screen.getByRole('button', { name: /^remove screenshot$/i }),
      );
    });
    expect(screen.queryByTestId('brw-preview-dialog')).toBeNull();
    expect(
      screen.queryByRole('button', { name: /preview screenshot/i }),
    ).toBeNull();
  });

  it('removing a screenshot while its preview is open closes the dialog', async () => {
    captureScreenshot.mockResolvedValueOnce(
      new Blob(['1'], { type: 'image/png' }),
    );
    captureScreenshot.mockResolvedValueOnce(
      new Blob(['2'], { type: 'image/png' }),
    );
    mountFab();
    await openPanel();
    await captureFullPage();
    await captureFullPage();

    await act(async () => {
      await fireEvent.click(
        screen.getByRole('button', { name: /preview screenshot 2/i }),
      );
    });
    expect(screen.getByTestId('brw-preview-dialog')).toBeInTheDocument();

    await act(async () => {
      await fireEvent.click(
        screen.getByRole('button', { name: /^remove screenshot 2$/i }),
      );
    });
    await waitFor(() =>
      expect(screen.queryByTestId('brw-preview-dialog')).toBeNull(),
    );
  });
});

/**
 * Region-capture overlay — mirrors the React adapter's "region capture
 * overlay" describe (#31 / #49): drag-select geometry, DPR-aware crop,
 * full-page passthrough, degenerate-selection shake, and the
 * panel-hidden-while-overlay-up contract.
 */
describe('<FeedbackButton> — region capture overlay', () => {
  /**
   * Test double for the canvas crop pipeline so the overlay's
   * confirm-region path can resolve under happy-dom (which provides no
   * functional 2D context, `toBlob`, or image loader). Captures the
   * `drawImage` source/dest args so a test can assert the crop math
   * matches the dragged rectangle × devicePixelRatio. Mirrors the React
   * suite's `installCropStub`.
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

  const openOverlay = async (): Promise<void> => {
    await openPanel();
    await act(async () => {
      await fireEvent.click(
        screen.getByRole('button', {
          name: /capture screenshot of this page/i,
        }),
      );
    });
  };

  const getOverlay = (): HTMLElement =>
    screen.getByTestId('brw-region-overlay');

  const queryOverlay = (): HTMLElement | null =>
    screen.queryByTestId('brw-region-overlay');

  const drag = async (
    overlay: HTMLElement,
    from: { x: number; y: number },
    to: { x: number; y: number },
  ): Promise<void> => {
    await act(async () => {
      await fireEvent.pointerDown(overlay, {
        clientX: from.x,
        clientY: from.y,
        pointerId: 1,
        button: 0,
      });
      await fireEvent.pointerMove(overlay, {
        clientX: to.x,
        clientY: to.y,
        pointerId: 1,
      });
      await fireEvent.pointerUp(overlay, {
        clientX: to.x,
        clientY: to.y,
        pointerId: 1,
      });
    });
  };

  it('click on the screenshot button opens the overlay with the skip attribute', async () => {
    mountFab();
    await openOverlay();
    const overlay = getOverlay();
    // `data-testid` (not `data-brevwick-*`) — test-only hook. The SDK's
    // capture scrub reads `data-brevwick-skip`, which must be present.
    expect(overlay).toHaveAttribute('data-brevwick-skip');
    expect(overlay).toHaveAttribute('aria-label', 'Select screenshot region');
  });

  it('Escape dismisses the overlay and leaves the main panel open', async () => {
    mountFab();
    await openOverlay();
    expect(getOverlay()).toBeInTheDocument();
    await act(async () => {
      await fireEvent.keyDown(window, { key: 'Escape' });
    });
    expect(queryOverlay()).toBeNull();
    // Main panel remains; the Escape must not have minimized it.
    expect(
      screen.getByRole('textbox', { name: /feedback message/i }),
    ).toBeInTheDocument();
  });

  it('hides the feedback panel while the region overlay is open and restores it on cancel', async () => {
    mountFab();
    await openPanel();
    const panel = screen.getByRole('dialog', { name: /send feedback/i });
    expect(panel.className).not.toMatch(/brw-svelte-panel-hidden/);

    await act(async () => {
      await fireEvent.click(
        screen.getByRole('button', {
          name: /capture screenshot of this page/i,
        }),
      );
    });
    expect(panel.className).toMatch(/brw-svelte-panel-hidden/);

    await act(async () => {
      await fireEvent.click(screen.getByRole('button', { name: /^cancel$/i }));
    });
    expect(queryOverlay()).toBeNull();
    expect(panel.className).not.toMatch(/brw-svelte-panel-hidden/);
  });

  it('preserves the composer draft across an open/cancel of the region overlay', async () => {
    mountFab();
    await openPanel();
    await act(async () => {
      await fireEvent.input(
        screen.getByRole('textbox', { name: /feedback message/i }),
        { target: { value: 'regression repro for issue 49' } },
      );
    });
    await act(async () => {
      await fireEvent.click(
        screen.getByRole('button', {
          name: /capture screenshot of this page/i,
        }),
      );
    });
    await act(async () => {
      await fireEvent.click(screen.getByRole('button', { name: /^cancel$/i }));
    });
    expect(
      (
        screen.getByRole('textbox', {
          name: /feedback message/i,
        }) as HTMLTextAreaElement
      ).value,
    ).toBe('regression repro for issue 49');
  });

  it('pointer drag produces a visible selection rectangle sized to the drag', async () => {
    mountFab();
    await openOverlay();
    await drag(getOverlay(), { x: 30, y: 40 }, { x: 230, y: 140 });
    const rect = screen.getByTestId('brw-region-selection');
    expect(rect.style.left).toBe('30px');
    expect(rect.style.top).toBe('40px');
    expect(rect.style.width).toBe('200px');
    expect(rect.style.height).toBe('100px');
  });

  it('drag produces the same rectangle regardless of direction (upward drag)', async () => {
    mountFab();
    await openOverlay();
    // Dragging bottom-right → top-left should still anchor the rect's
    // x/y at the minimum corner.
    await drag(getOverlay(), { x: 200, y: 180 }, { x: 50, y: 60 });
    const rect = screen.getByTestId('brw-region-selection');
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
      mountFab();
      await openOverlay();
      await drag(getOverlay(), { x: 10, y: 20 }, { x: 210, y: 120 });
      await act(async () => {
        await fireEvent.click(
          screen.getByRole('button', { name: /^capture$/i }),
        );
      });
      // Wait for the crop microtasks to flush and the chip to render.
      await waitFor(() =>
        expect(
          screen.getByRole('button', { name: /remove screenshot/i }),
        ).toBeInTheDocument(),
      );
      expect(captureScreenshot).toHaveBeenCalledTimes(1);
      // Crop: drawImage(img, sx=dpr*x, sy=dpr*y, sw=dpr*w, sh=dpr*h, 0, 0, w, h)
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
      vi.unstubAllGlobals();
    }
  });

  it('"Capture full page" passes the uncropped blob through to the composer', async () => {
    const fullBlob = new Blob(['uncropped'], { type: 'image/webp' });
    captureScreenshot.mockResolvedValueOnce(fullBlob);
    submit.mockResolvedValueOnce({ ok: true, issue_id: 'i_full' });
    mountFab();
    await openOverlay();
    await act(async () => {
      await fireEvent.click(
        screen.getByRole('button', { name: /capture full page/i }),
      );
    });
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: /^remove screenshot$/i }),
      ).toBeInTheDocument(),
    );
    await act(async () => {
      await fireEvent.input(
        screen.getByRole('textbox', { name: /feedback message/i }),
        { target: { value: 'full cap' } },
      );
    });
    await act(async () => {
      await fireEvent.click(screen.getByRole('button', { name: /^send$/i }));
    });
    await waitFor(() => expect(submit).toHaveBeenCalledTimes(1));
    const input = submit.mock.calls[0]![0] as {
      attachments: Array<{ blob: Blob; filename: string }>;
    };
    // Extension derives from the MIME of the full-page blob — proves no
    // canvas crop happened in the full-page path.
    expect(input.attachments[0]!.filename).toBe('screenshot.webp');
    expect(input.attachments[0]!.blob).toBe(fullBlob);
  });

  it('degenerate selection on Capture shakes and does not invoke captureScreenshot', async () => {
    mountFab();
    await openOverlay();
    // A 1×1 drag — below the REGION_MIN_SIDE_PX threshold.
    await drag(getOverlay(), { x: 50, y: 50 }, { x: 51, y: 51 });
    await act(async () => {
      await fireEvent.click(screen.getByRole('button', { name: /^capture$/i }));
    });
    expect(captureScreenshot).not.toHaveBeenCalled();
    expect(queryOverlay()).toBeInTheDocument();
    expect(getOverlay().className).toMatch(/brw-svelte-region-shake/);
  });

  it('degenerate selection on Enter → overlay stays open, no capture', async () => {
    mountFab();
    await openOverlay();
    const overlay = getOverlay();
    await drag(overlay, { x: 100, y: 100 }, { x: 101, y: 101 });
    await act(async () => {
      await fireEvent.keyDown(overlay, { key: 'Enter' });
    });
    expect(captureScreenshot).not.toHaveBeenCalled();
    expect(queryOverlay()).toBeInTheDocument();
  });

  it('overlay is unmounted before captureScreenshot resolves (capture sees no overlay chrome)', async () => {
    let resolveCapture: (b: Blob) => void = () => undefined;
    captureScreenshot.mockReturnValueOnce(
      new Promise<Blob>((resolve) => {
        resolveCapture = resolve;
      }),
    );
    mountFab();
    await openOverlay();
    expect(queryOverlay()).toBeInTheDocument();

    await act(async () => {
      await fireEvent.click(
        screen.getByRole('button', { name: /capture full page/i }),
      );
    });

    // The capture promise is still pending — by now the overlay must
    // already be torn down so its translucent layer cannot bleed into
    // the captured page.
    expect(queryOverlay()).toBeNull();

    await act(async () => {
      resolveCapture(new Blob(['done'], { type: 'image/webp' }));
      await Promise.resolve();
    });
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: /remove screenshot/i }),
      ).toBeInTheDocument(),
    );
  });

  it('Cancel button closes the overlay without capture', async () => {
    mountFab();
    await openOverlay();
    await act(async () => {
      await fireEvent.click(screen.getByRole('button', { name: /^cancel$/i }));
    });
    expect(queryOverlay()).toBeNull();
    expect(captureScreenshot).not.toHaveBeenCalled();
  });
});

describe('<FeedbackButton> — debug raw payload (config.debug)', () => {
  const COPY_LABEL = /copy the raw payload sent to the api/i;

  const sendDraft = async (text: string): Promise<void> => {
    mountFab();
    await openPanel();
    const textarea = screen.getByRole('textbox', {
      name: /feedback message/i,
    }) as HTMLTextAreaElement;
    await act(async () => {
      await fireEvent.input(textarea, { target: { value: text } });
    });
    await act(async () => {
      await fireEvent.click(screen.getByRole('button', { name: /^send$/i }));
    });
    await waitFor(() => expect(submit).toHaveBeenCalledTimes(1));
  };

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
    await sendDraft('Broken');
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: COPY_LABEL }),
      ).toBeInTheDocument(),
    );
  });

  it('omits the copy-raw button when the result has no debug payload', async () => {
    submit.mockResolvedValueOnce({ ok: true, issue_id: 'rep_nodbg' });
    await sendDraft('Broken');
    expect(screen.queryByRole('button', { name: COPY_LABEL })).toBeNull();
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
    await sendDraft('Broken');

    const copyBtn = await screen.findByRole('button', { name: COPY_LABEL });
    await act(async () => {
      await fireEvent.click(copyBtn);
    });

    await waitFor(() =>
      expect(writeText).toHaveBeenCalledWith(JSON.stringify(payload, null, 2)),
    );
    await waitFor(() =>
      expect(screen.getByText('Copied!')).toBeInTheDocument(),
    );
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
    await sendDraft('Broken');

    const copyBtn = await screen.findByRole('button', { name: COPY_LABEL });
    await act(async () => {
      await fireEvent.click(copyBtn);
    });
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
    await sendDraft('Broken');

    const copyBtn = await screen.findByRole('button', { name: COPY_LABEL });
    await act(async () => {
      await fireEvent.click(copyBtn);
    });
    await waitFor(() => expect(writeText).toHaveBeenCalled());
    expect(copyBtn.textContent?.trim()).toBe('Copy raw payload');
  });
});
