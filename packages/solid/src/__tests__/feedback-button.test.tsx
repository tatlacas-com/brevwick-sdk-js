import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@solidjs/testing-library';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  Brevwick,
  BrevwickConfig,
  FeedbackInput,
  ProjectConfig,
  SubmitResult,
} from '@tatlacas/brevwick-sdk';
import pkg from '../../package.json';

const submit = vi.fn<(input: FeedbackInput) => Promise<SubmitResult>>();
const captureScreenshot = vi.fn<() => Promise<Blob>>();
const getConfig = vi.fn<() => Promise<ProjectConfig | null>>();
const install = vi.fn();
const uninstall = vi.fn();

/**
 * In-memory mirror of the SDK's internal phase bus. The Solid adapter
 * subscribes to this via the `_internal` backdoor (see
 * `src/internal-bridge.ts`), so the test mock stamps a structurally
 * compatible bus on the `Brevwick` instance and the suite drives phase
 * events through `phaseBus.emit(...)`.
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

import { BrevwickProvider } from '../provider';
import {
  FeedbackButton,
  type FeedbackButtonProps,
} from '../components/feedback-button';
import { BREVWICK_CSS } from '../styles';

beforeEach(() => {
  // jsdom lacks createObjectURL by default; stub both for the screenshot
  // path so individual tests don't have to.
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
  // Default: no AI toggle. Individual tests opt into the toggle by re-
  // mocking with `ai_enabled` + `ai_submitter_choice_allowed`.
  getConfig.mockResolvedValue(null);
});

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  phaseListeners.clear();
});

const onSubmitSpy = vi.fn<(result: SubmitResult) => void>();
afterEach(() => onSubmitSpy.mockReset());

const mount = (props: FeedbackButtonProps = {}) =>
  render(() => (
    <BrevwickProvider config={{ projectKey: 'pk_test_fab' }}>
      <FeedbackButton onSubmit={onSubmitSpy} {...props} />
    </BrevwickProvider>
  ));

const openPanel = (): void => {
  fireEvent.click(screen.getByRole('button', { name: /open feedback form/i }));
};

const getComposer = (): HTMLTextAreaElement =>
  screen.getByLabelText(/feedback message/i) as HTMLTextAreaElement;

const typeDraft = (text: string): void => {
  fireEvent.input(getComposer(), { target: { value: text } });
};

describe('<FeedbackButton>', () => {
  it('renders the FAB with the default label', async () => {
    mount();
    const fab = await screen.findByRole('button', {
      name: /open feedback form/i,
    });
    expect(fab).toBeInTheDocument();
    expect(fab).toHaveAttribute('data-brevwick-skip');
    expect(fab.className).toMatch(/brw-fab/);
    // Zero-config default changed in vNEXT: right-edge vertical tab, not
    // the legacy bottom-right bubble.
    expect(fab.className).toMatch(/brw-fab--tab/);
    expect(fab.className).toMatch(/brw-fab-r\b/);
    expect(fab).toHaveAttribute('data-brw-variant', 'tab');
  });

  it('renders the panel with data-brevwick-skip + greeting on open', () => {
    mount();
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

  it('greeting invites a screenshot now that the capture button is back', () => {
    // Pins the full greeting copy: the screenshot-restore decision requires
    // "…A screenshot helps if you have one." whenever the capture button is
    // present. The prefix-only assertions elsewhere would not catch a
    // regression back to the short button-less greeting. Mirrors the React
    // adapter's test so the two adapters stay in lockstep.
    mount();
    openPanel();
    expect(
      screen.getByText(
        "Hi! Tell us what's happening. A screenshot helps if you have one.",
      ),
    ).toBeInTheDocument();
  });

  it('renders a Brevwick credit footer linking to brevwick.dev on open', () => {
    mount();
    openPanel();

    const link = screen.getByRole('link', { name: /brevwick v/i });
    expect(link).toHaveAttribute('href', 'https://brevwick.dev');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link.getAttribute('rel')).toMatch(/noopener/);
    expect(link.getAttribute('rel')).toMatch(/noreferrer/);
    expect(link).toHaveTextContent(`Brevwick v${pkg.version}`);
  });

  it('keeps the bubble at bottom-left for a legacy corner position (no variant)', () => {
    // Legacy compat: an explicit corner without a `variant` must keep the
    // pre-vNEXT presentation — the bubble at that corner, not a tab.
    mount({ position: 'bottom-left' });
    const fab = screen.getByRole('button', { name: /open feedback form/i });
    expect(fab.className).toMatch(/brw-fab--bubble/);
    expect(fab.className).toMatch(/brw-fab-bl/);
    expect(fab.className).not.toMatch(/brw-fab-br/);
    expect(fab).toHaveAttribute('data-brw-variant', 'bubble');
    openPanel();
    const dialog = screen.getByRole('dialog');
    expect(dialog.className).toMatch(/brw-panel-bl/);
    expect(dialog.className).not.toMatch(/brw-panel-br/);
  });

  it('keeps the bubble at bottom-right for a legacy corner position (no variant)', () => {
    mount({ position: 'bottom-right' });
    const fab = screen.getByRole('button', { name: /open feedback form/i });
    expect(fab.className).toMatch(/brw-fab--bubble/);
    expect(fab.className).toMatch(/brw-fab-br/);
    expect(fab.className).not.toMatch(/brw-fab-bl/);
    expect(fab).toHaveAttribute('data-brw-variant', 'bubble');
    openPanel();
    expect(screen.getByRole('dialog').className).toMatch(/brw-panel-br/);
  });

  it('opens the panel and submits a draft as title + raw description', async () => {
    submit.mockResolvedValueOnce({ ok: true, issue_id: 'rep_42' });

    mount();
    openPanel();
    typeDraft('login is broken');

    fireEvent.click(screen.getByRole('button', { name: /^send$/i }));

    await waitFor(() => expect(submit).toHaveBeenCalledTimes(1));
    const input = submit.mock.calls[0]![0]!;
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

  it('submit appends user + assistant bubbles and keeps the composer active', async () => {
    submit.mockResolvedValueOnce({ ok: true, issue_id: 'rep_ok' });
    mount();
    openPanel();
    typeDraft('Broken flow');

    fireEvent.click(screen.getByRole('button', { name: /^send$/i }));
    await waitFor(() => expect(submit).toHaveBeenCalledTimes(1));

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Broken flow')).toBeInTheDocument();
    const receiptText = await screen.findByText(
      /thanks — your issue is on its way/i,
    );
    const receiptBubble = receiptText.closest('.brw-bubble') as HTMLElement;
    expect(receiptBubble).not.toBeNull();
    expect(within(receiptBubble).getByText(/issue sent/i)).toBeInTheDocument();
    // Composer survives the submit, draft cleared but textarea active.
    const composer = getComposer();
    expect(composer).not.toBeDisabled();
    expect(composer.value).toBe('');
  });

  it('Enter submits, Shift+Enter inserts a newline', async () => {
    submit.mockResolvedValueOnce({ ok: true, issue_id: 'rep_enter' });
    mount();
    openPanel();
    const textarea = getComposer();

    fireEvent.input(textarea, { target: { value: 'line one\nline two' } });
    fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: true });
    expect(submit).not.toHaveBeenCalled();
    expect(textarea.value).toBe('line one\nline two');

    fireEvent.keyDown(textarea, { key: 'Enter' });
    await waitFor(() => expect(submit).toHaveBeenCalledTimes(1));
    const input = submit.mock.calls[0]![0]!;
    expect(input.description).toBe('line one\nline two');
    expect(input.title).toBe('line one');
  });

  it('Enter+Ctrl/Meta/Alt does not submit', () => {
    mount();
    openPanel();
    typeDraft('hi');
    const textarea = getComposer();
    fireEvent.keyDown(textarea, { key: 'Enter', ctrlKey: true });
    fireEvent.keyDown(textarea, { key: 'Enter', metaKey: true });
    fireEvent.keyDown(textarea, { key: 'Enter', altKey: true });
    expect(submit).not.toHaveBeenCalled();
  });

  it('typing into the composer does not append a bubble to the thread', () => {
    mount();
    openPanel();
    const log = screen.getByRole('log', { name: /conversation/i });
    expect(log.querySelectorAll('.brw-bubble')).toHaveLength(1);

    typeDraft('still drafting…');

    expect(log.querySelectorAll('.brw-bubble')).toHaveLength(1);
    expect(within(log).queryByText(/still drafting/i)).toBeNull();
  });

  it('does not submit when the composer is empty (send button disabled)', () => {
    mount();
    openPanel();
    const sendButton = screen.getByRole('button', { name: /^send$/i });
    expect(sendButton).toBeDisabled();
    fireEvent.click(sendButton);
    expect(submit).not.toHaveBeenCalled();
  });

  it('keeps the send button disabled while the description is whitespace-only', () => {
    mount();
    openPanel();
    typeDraft('   ');
    expect(screen.getByRole('button', { name: /^send$/i })).toBeDisabled();
    expect(submit).not.toHaveBeenCalled();
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

  it('renders a disabled FAB when disabled prop is true and does not open the panel', () => {
    mount({ disabled: true });
    const fab = screen.getByRole('button', { name: /open feedback form/i });
    expect(fab).toBeDisabled();
    fireEvent.click(fab);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('exposes a polite aria-live log for the thread', () => {
    mount();
    openPanel();
    const log = screen.getByRole('log', { name: /conversation/i });
    expect(log).toHaveAttribute('aria-live', 'polite');
  });

  it('passes the raw draft (no trim) so the bubble and payload stay in sync', async () => {
    submit.mockResolvedValueOnce({ ok: true, issue_id: 'rep_raw' });
    mount();
    openPanel();
    typeDraft('   hi there   \n');
    fireEvent.click(screen.getByRole('button', { name: /^send$/i }));
    await waitFor(() => expect(submit).toHaveBeenCalledTimes(1));
    const input = submit.mock.calls[0]![0]!;
    expect(input.description).toBe('   hi there   \n');
    expect(input.title).toBe('hi there');
  });
});

/**
 * Launcher presentation (variant + position). Pins the full resolution
 * table: explicit `variant` always wins, `position` contributes only its
 * horizontal side to a mismatched variant, and a legacy corner without a
 * variant keeps the bubble. The zero-config default — right-edge tab —
 * is asserted in the main describe block above.
 */
describe('<FeedbackButton> — launcher presentation (variant + position)', () => {
  function getFab(name: RegExp | string = /open feedback form/i): HTMLElement {
    return screen.getByRole('button', { name });
  }

  it('variant="bubble" without a position renders the bottom-right bubble', () => {
    mount({ variant: 'bubble' });
    const fab = getFab();
    expect(fab.className).toMatch(/brw-fab--bubble/);
    expect(fab.className).toMatch(/brw-fab-br/);
    expect(fab).toHaveAttribute('data-brw-variant', 'bubble');
  });

  it('position="left" renders the tab on the left edge', () => {
    mount({ position: 'left' });
    const fab = getFab();
    expect(fab.className).toMatch(/brw-fab--tab/);
    expect(fab.className).toMatch(/brw-fab-l\b/);
    expect(fab).toHaveAttribute('data-brw-variant', 'tab');
  });

  it('position="right" renders the tab on the right edge', () => {
    mount({ position: 'right' });
    const fab = getFab();
    expect(fab.className).toMatch(/brw-fab--tab/);
    expect(fab.className).toMatch(/brw-fab-r\b/);
  });

  it('variant="tab" + corner position keeps the tab and takes only the horizontal side', () => {
    // Conflict rule: variant wins; 'bottom-left' contributes only 'left'.
    mount({ variant: 'tab', position: 'bottom-left' });
    const fab = getFab();
    expect(fab.className).toMatch(/brw-fab--tab/);
    expect(fab.className).toMatch(/brw-fab-l\b/);
    expect(fab.className).not.toMatch(/brw-fab-bl/);
  });

  it('variant="tab" + position="bottom-right" resolves to the right-edge tab', () => {
    mount({ variant: 'tab', position: 'bottom-right' });
    const fab = getFab();
    expect(fab.className).toMatch(/brw-fab--tab/);
    expect(fab.className).toMatch(/brw-fab-r\b/);
  });

  it('variant="bubble" + position="left" renders the bubble at the bottom-left corner', () => {
    mount({ variant: 'bubble', position: 'left' });
    const fab = getFab();
    expect(fab.className).toMatch(/brw-fab--bubble/);
    expect(fab.className).toMatch(/brw-fab-bl/);
  });

  it('variant="bubble" + position="right" renders the bubble at the bottom-right corner', () => {
    mount({ variant: 'bubble', position: 'right' });
    const fab = getFab();
    expect(fab.className).toMatch(/brw-fab--bubble/);
    expect(fab.className).toMatch(/brw-fab-br/);
  });

  it('left-edge tab opens the panel anchored bottom-left', () => {
    mount({ position: 'left' });
    openPanel();
    const dialog = screen.getByRole('dialog');
    expect(dialog.className).toMatch(/brw-panel-bl/);
    expect(dialog.className).not.toMatch(/brw-panel-br/);
  });

  it('compact drops the visible label and promotes the string label to aria-label', () => {
    mount({ compact: true, label: 'Report a bug' });
    const fab = getFab('Report a bug');
    expect(fab.className).toMatch(/brw-fab--compact/);
    // The label text must not render — compact is icon-only.
    expect(fab.querySelector('.brw-fab-label')).toBeNull();
    expect(screen.queryByText('Report a bug')).toBeNull();
  });

  it('compact with a non-string JSX label falls back to aria-label="Feedback"', () => {
    mount({ compact: true, label: <strong>Fancy</strong> });
    const fab = getFab('Feedback');
    expect(fab).toHaveAttribute('aria-label', 'Feedback');
    expect(fab.querySelector('.brw-fab-label')).toBeNull();
  });

  it('non-compact keeps aria-label="Open feedback form" and the visible label span', () => {
    mount({ label: 'Report a bug' });
    const fab = getFab();
    expect(fab).toHaveAttribute('aria-label', 'Open feedback form');
    const labelSpan = fab.querySelector('.brw-fab-label');
    expect(labelSpan).not.toBeNull();
    expect(labelSpan!.textContent).toBe('Report a bug');
  });

  it('offset sets --brw-fab-tab-offset inline on the tab only when non-zero', () => {
    mount({ offset: 120 });
    const fab = getFab();
    expect(fab.style.getPropertyValue('--brw-fab-tab-offset')).toBe('120px');
  });

  it('offset=0 sets no inline custom property on the tab', () => {
    mount({ offset: 0 });
    expect(getFab().style.getPropertyValue('--brw-fab-tab-offset')).toBe('');
  });

  it('offset is ignored for the bubble (no inline custom property)', () => {
    mount({ variant: 'bubble', offset: 120 });
    expect(getFab().style.getPropertyValue('--brw-fab-tab-offset')).toBe('');
  });

  it('emitted stylesheet declares the vertical tab + keeps the launcher chrome contract', () => {
    // Tab geometry: writing-mode flips the inline axis vertical.
    expect(BREVWICK_CSS).toMatch(
      /\.brw-fab--tab\s*\{[^}]*writing-mode:\s*vertical-rl/,
    );
    // Shared launcher chrome keeps the max-ish stacking contract.
    expect(BREVWICK_CSS).toMatch(/\.brw-fab\s*\{[^}]*z-index:\s*2147483000/);
    // Bubble keeps the legacy pill geometry under its own class.
    expect(BREVWICK_CSS).toMatch(
      /\.brw-fab--bubble\s*\{[^}]*border-radius:\s*999px/,
    );
  });

  // Regression: the left-edge tab must stay vertically centred. The standalone
  // `rotate: 180deg` property on `.brw-fab-l` is applied AFTER `transform`
  // (CSS Transforms L2), flipping the centering `translateY(-50%)` into
  // `+50%` and dropping the tab a full tab-height below centre. jsdom cannot
  // compute composed transforms, so we assert the corrected stylesheet shape.
  it('left-edge tab composes its 180° flip inside transform so centering survives', () => {
    expect(BREVWICK_CSS).not.toMatch(/rotate:\s*180deg/);
    expect(BREVWICK_CSS).toMatch(
      /\.brw-fab--tab\s*\{[^}]*transform:\s*translateY\(-50%\)\s*rotate\(var\(--brw-fab-tab-flip/,
    );
    expect(BREVWICK_CSS).toMatch(
      /\.brw-fab-l\s*\{[^}]*--brw-fab-tab-flip:\s*180deg/,
    );
    expect(BREVWICK_CSS).toMatch(
      /\.brw-fab--tab:hover[^{]*\{[^}]*transform:\s*translateY\(-50%\)\s*rotate\(var\(--brw-fab-tab-flip[^)]*\)\)\s*translateX\(-2px\)/,
    );
  });
});

describe('<FeedbackButton> — minimize / close / discard', () => {
  it('minimize preserves draft across reopen', () => {
    mount();
    openPanel();
    typeDraft('half-typed message');

    fireEvent.click(screen.getByRole('button', { name: /^minimize$/i }));
    expect(screen.queryByRole('dialog')).toBeNull();

    openPanel();
    expect(getComposer().value).toBe('half-typed message');
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
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    const confirm = screen.getByRole('alert', { name: /discard draft/i });
    expect(
      within(confirm).getByRole('button', { name: /keep/i }),
    ).toBeInTheDocument();

    fireEvent.click(within(confirm).getByRole('button', { name: /keep/i }));
    expect(screen.queryByRole('alert', { name: /discard draft/i })).toBeNull();
    expect(getComposer().value).toBe('draft-content');

    fireEvent.click(screen.getByRole('button', { name: /^close$/i }));
    fireEvent.click(screen.getByRole('button', { name: /^discard$/i }));
    expect(screen.queryByRole('dialog')).toBeNull();
    openPanel();
    expect(getComposer().value).toBe('');
  });

  it('closing and reopening the panel resets the thread to just the greeting', async () => {
    submit.mockResolvedValueOnce({ ok: true, issue_id: 'rep_reset' });
    mount();
    openPanel();
    typeDraft('first message');
    fireEvent.click(screen.getByRole('button', { name: /^send$/i }));
    await waitFor(() =>
      expect(
        screen.getByText(/thanks — your issue is on its way/i),
      ).toBeInTheDocument(),
    );

    fireEvent.click(screen.getByRole('button', { name: /^close$/i }));
    expect(screen.queryByRole('dialog')).toBeNull();

    openPanel();
    const log = screen.getByRole('log', { name: /conversation/i });
    expect(log.querySelectorAll('.brw-bubble')).toHaveLength(1);
    expect(
      within(log).getByText(/Hi! Tell us what's happening/i),
    ).toBeInTheDocument();
    expect(getComposer().value).toBe('');
  });
});

describe('<FeedbackButton> — error paths', () => {
  it('surfaces a tagged retry row when submit() returns ok:false', async () => {
    submit.mockResolvedValueOnce({
      ok: false,
      error: { code: 'INGEST_REJECTED', message: 'quota exceeded' },
    });
    mount();
    openPanel();
    typeDraft('Broken flow');
    fireEvent.click(screen.getByRole('button', { name: /^send$/i }));

    await waitFor(() => {
      const row = document.querySelector('[data-brw-row="error"]');
      expect(row).not.toBeNull();
    });
    const row = document.querySelector('[data-brw-row="error"]') as HTMLElement;
    expect(row).toHaveAttribute('role', 'alert');
    expect(row).toHaveAttribute('data-brw-error-code', 'INGEST_REJECTED');
    expect(row.textContent).toContain('quota exceeded');
    // The retry row is a standalone alert — it must sit OUTSIDE the
    // `.brw-status-rows` checklist wrapper so the dashed-divider styling
    // does not bleed into the failure state. Pins the structural
    // relationship against an accidental fold-back during future refactors.
    expect(row.closest('.brw-status-rows')).toBeNull();
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
    fireEvent.click(screen.getByRole('button', { name: /^send$/i }));
    await waitFor(() => expect(onSubmitSpy).toHaveBeenCalledWith(failure));
  });

  it('surfaces a tagged retry row when submit() rejects (chunk load failure)', async () => {
    submit.mockRejectedValueOnce(new Error('chunk load failed'));
    mount();
    openPanel();
    typeDraft('oops');
    fireEvent.click(screen.getByRole('button', { name: /^send$/i }));
    await waitFor(() => {
      expect(document.querySelector('[data-brw-row="error"]')).not.toBeNull();
    });
    const row = document.querySelector('[data-brw-row="error"]') as HTMLElement;
    expect(row).toHaveAttribute(
      'data-brw-error-code',
      'INGEST_RETRY_EXHAUSTED',
    );
    expect(row.textContent).toContain('chunk load failed');
  });

  it('Retry CTA re-runs submit() with the original FeedbackInput', async () => {
    submit.mockResolvedValueOnce({
      ok: false,
      error: { code: 'INGEST_REJECTED', message: 'first try' },
    });
    mount();
    openPanel();
    typeDraft('please retry me');
    fireEvent.click(screen.getByRole('button', { name: /^send$/i }));

    await waitFor(() => {
      expect(document.querySelector('[data-brw-row="error"]')).not.toBeNull();
    });
    const row = document.querySelector('[data-brw-row="error"]') as HTMLElement;

    submit.mockResolvedValueOnce({ ok: true, issue_id: 'rep_retry' });
    fireEvent.click(within(row).getByRole('button', { name: /^retry$/i }));
    await waitFor(() => expect(submit).toHaveBeenCalledTimes(2));
    expect((submit.mock.calls[1]![0] as FeedbackInput).description).toBe(
      'please retry me',
    );
  });
});

describe('<FeedbackButton> — expected/actual disclosure', () => {
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
    fireEvent.input(screen.getByRole('textbox', { name: /expected/i }), {
      target: { value: 'should succeed' },
    });
    fireEvent.input(screen.getByRole('textbox', { name: /actual/i }), {
      target: { value: 'failed' },
    });
    fireEvent.click(screen.getByRole('button', { name: /^send$/i }));
    await waitFor(() => expect(submit).toHaveBeenCalledTimes(1));
    const input = submit.mock.calls[0]![0]!;
    expect(input.expected).toBe('should succeed');
    expect(input.actual).toBe('failed');
  });

  it('disclosure toggle flips aria-expanded in both states', () => {
    mount();
    openPanel();
    const toggle = screen.getByRole('button', {
      name: /add expected vs actual/i,
    });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(toggle);
    expect(
      screen.getByRole('button', { name: /hide expected vs actual/i }),
    ).toHaveAttribute('aria-expanded', 'true');
  });
});

describe('<FeedbackButton> — staged-status rows (#74)', () => {
  function parkSubmit(): void {
    submit.mockReturnValueOnce(new Promise<SubmitResult>(() => undefined));
  }

  function getStatusRow(
    name: 'captured' | 'sanitised' | 'formatting' | 'error',
  ): HTMLElement | null {
    return document.querySelector<HTMLElement>(`[data-brw-row="${name}"]`);
  }

  it('Pressing Send clears the input + renders user bubble synchronously', () => {
    parkSubmit();
    mount();
    openPanel();
    typeDraft('synchronous-send-test');
    fireEvent.click(screen.getByRole('button', { name: /^send$/i }));

    expect(getComposer().value).toBe('');
    const log = screen.getByRole('log', { name: /conversation/i });
    expect(within(log).getByText('synchronous-send-test')).toBeInTheDocument();
  });

  it('Three staged rows render in order as phase events arrive', async () => {
    parkSubmit();
    getConfig.mockResolvedValue({
      ai_enabled: true,
      ai_submitter_choice_allowed: false,
    });
    mount();
    openPanel();
    // Wait for the lazy getConfig() microtask to settle so the AI-row
    // gate sees `ai_enabled: true` instead of the default null.
    await waitFor(() => expect(getConfig).toHaveBeenCalled());
    typeDraft('staged-rows-test');
    fireEvent.click(screen.getByRole('button', { name: /^send$/i }));

    expect(getStatusRow('captured')).toBeNull();
    expect(getStatusRow('sanitised')).toBeNull();
    expect(getStatusRow('formatting')).toBeNull();

    phaseBus.emit('phase', { phase: 'capturing-done' });
    await waitFor(() => expect(getStatusRow('captured')).not.toBeNull());
    expect(getStatusRow('sanitised')).toBeNull();
    expect(getStatusRow('formatting')).toBeNull();

    phaseBus.emit('phase', { phase: 'sanitising-done' });
    await waitFor(() => expect(getStatusRow('sanitised')).not.toBeNull());
    await waitFor(() => expect(getStatusRow('formatting')).not.toBeNull());
  });

  it('.brw-status-rows wrapper is absent at idle and present once a row mounts', async () => {
    // Pins the structural contract documented at packages/solid/src/styles.ts:
    // the dashed-divider checklist wrapper exists only while at least one of
    // the three staged rows is visible, and the captured row sits inside it.
    // Mirrors the React assertion so both adapters stay in lockstep.
    parkSubmit();
    getConfig.mockResolvedValue({
      ai_enabled: true,
      ai_submitter_choice_allowed: false,
    });
    mount();
    openPanel();
    await waitFor(() => expect(getConfig).toHaveBeenCalled());

    // Negative: panel open, nothing sent yet → no wrapper in the DOM.
    expect(document.querySelector('.brw-status-rows')).toBeNull();

    typeDraft('wrapper-presence-test');
    fireEvent.click(screen.getByRole('button', { name: /^send$/i }));
    phaseBus.emit('phase', { phase: 'capturing-done' });
    await waitFor(() => expect(getStatusRow('captured')).not.toBeNull());

    // Positive: once the captured row is visible the wrapper exists and
    // contains that row.
    const wrapper = document.querySelector('.brw-status-rows');
    expect(wrapper).not.toBeNull();
    const captured = getStatusRow('captured');
    expect(captured).not.toBeNull();
    expect(captured!.closest('.brw-status-rows')).toBe(wrapper);
  });

  it('AI row is suppressed when getConfig().ai_enabled === false', async () => {
    parkSubmit();
    getConfig.mockResolvedValue({
      ai_enabled: false,
      ai_submitter_choice_allowed: false,
    });
    mount();
    openPanel();
    await waitFor(() => expect(getConfig).toHaveBeenCalled());
    typeDraft('non-ai-project');
    fireEvent.click(screen.getByRole('button', { name: /^send$/i }));
    phaseBus.emit('phase', { phase: 'capturing-done' });
    phaseBus.emit('phase', { phase: 'sanitising-done' });

    await waitFor(() => expect(getStatusRow('captured')).not.toBeNull());
    await waitFor(() => expect(getStatusRow('sanitised')).not.toBeNull());
    expect(getStatusRow('formatting')).toBeNull();
  });

  it('Reduced motion renders all rows with a 0 ms transition delay (no stagger)', async () => {
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: query.includes('prefers-reduced-motion'),
      media: query,
      onchange: null,
      addListener: () => undefined,
      removeListener: () => undefined,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      dispatchEvent: () => false,
    }));
    parkSubmit();
    getConfig.mockResolvedValue({
      ai_enabled: true,
      ai_submitter_choice_allowed: false,
    });
    mount();
    openPanel();
    await waitFor(() => expect(getConfig).toHaveBeenCalled());
    typeDraft('reduced-motion-test');
    fireEvent.click(screen.getByRole('button', { name: /^send$/i }));
    phaseBus.emit('phase', { phase: 'capturing-done' });
    phaseBus.emit('phase', { phase: 'sanitising-done' });
    await waitFor(() => expect(getStatusRow('captured')).not.toBeNull());

    const rows = document.querySelectorAll<HTMLElement>('[data-brw-row]');
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row.style.animationDelay).toBe('0ms');
    }
  });
});

describe('<FeedbackButton> — Use AI toggle', () => {
  function queryAiToggle(): HTMLElement | null {
    return screen.queryByRole('switch', { name: /format with ai/i });
  }

  it('does not fetch config on mount — only on first panel open', async () => {
    getConfig.mockResolvedValue({
      ai_enabled: true,
      ai_submitter_choice_allowed: true,
    });
    mount();
    expect(getConfig).not.toHaveBeenCalled();
    openPanel();
    await waitFor(() => expect(getConfig).toHaveBeenCalledTimes(1));
  });

  it('only fetches once across multiple opens (cache reused)', async () => {
    getConfig.mockResolvedValue({
      ai_enabled: true,
      ai_submitter_choice_allowed: true,
    });
    mount();
    openPanel();
    await waitFor(() => expect(getConfig).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole('button', { name: /^minimize$/i }));
    expect(screen.queryByRole('dialog')).toBeNull();

    openPanel();
    // No second fetch — value cached.
    await Promise.resolve();
    expect(getConfig).toHaveBeenCalledTimes(1);
  });

  it('hides the toggle when ai_enabled=false and omits use_ai from submit', async () => {
    getConfig.mockResolvedValue({
      ai_enabled: false,
      ai_submitter_choice_allowed: true,
    });
    submit.mockResolvedValueOnce({ ok: true, issue_id: 'rep_disabled' });
    mount();
    openPanel();
    await waitFor(() => expect(getConfig).toHaveBeenCalled());
    expect(queryAiToggle()).toBeNull();
    typeDraft('hi');
    fireEvent.click(screen.getByRole('button', { name: /^send$/i }));
    await waitFor(() => expect(submit).toHaveBeenCalledTimes(1));
    const input = submit.mock.calls[0]![0]! as unknown as Record<
      string,
      unknown
    >;
    expect('use_ai' in input).toBe(false);
  });

  it('hides the toggle when choice is not allowed and omits use_ai', async () => {
    getConfig.mockResolvedValue({
      ai_enabled: true,
      ai_submitter_choice_allowed: false,
    });
    submit.mockResolvedValueOnce({ ok: true, issue_id: 'rep_forced' });
    mount();
    openPanel();
    await waitFor(() => expect(getConfig).toHaveBeenCalled());
    expect(queryAiToggle()).toBeNull();
    typeDraft('admin-forced');
    fireEvent.click(screen.getByRole('button', { name: /^send$/i }));
    await waitFor(() => expect(submit).toHaveBeenCalledTimes(1));
    const input = submit.mock.calls[0]![0]! as unknown as Record<
      string,
      unknown
    >;
    expect('use_ai' in input).toBe(false);
  });

  it('renders the toggle default-on and payload carries use_ai=true', async () => {
    getConfig.mockResolvedValue({
      ai_enabled: true,
      ai_submitter_choice_allowed: true,
    });
    submit.mockResolvedValueOnce({ ok: true, issue_id: 'rep_choice_on' });
    mount();
    openPanel();
    await waitFor(() => expect(queryAiToggle()).not.toBeNull());
    const toggle = queryAiToggle()!;
    expect(toggle).toHaveAttribute('aria-checked', 'true');
    expect(toggle.className).toMatch(/brw-aitoggle--on/);

    typeDraft('with ai');
    fireEvent.click(screen.getByRole('button', { name: /^send$/i }));
    await waitFor(() => expect(submit).toHaveBeenCalledTimes(1));
    const input = submit.mock.calls[0]![0]! as unknown as Record<
      string,
      unknown
    >;
    expect(input.use_ai).toBe(true);
  });

  it('click flips the toggle off and payload carries use_ai=false', async () => {
    getConfig.mockResolvedValue({
      ai_enabled: true,
      ai_submitter_choice_allowed: true,
    });
    submit.mockResolvedValueOnce({ ok: true, issue_id: 'rep_choice_off' });
    mount();
    openPanel();
    await waitFor(() => expect(queryAiToggle()).not.toBeNull());
    const toggle = queryAiToggle()!;
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-checked', 'false');
    expect(toggle.className).not.toMatch(/brw-aitoggle--on/);

    typeDraft('without ai');
    fireEvent.click(screen.getByRole('button', { name: /^send$/i }));
    await waitFor(() => expect(submit).toHaveBeenCalledTimes(1));
    const input = submit.mock.calls[0]![0]! as unknown as Record<
      string,
      unknown
    >;
    expect(input.use_ai).toBe(false);
  });

  it('Space toggles when focused (keyboard a11y)', async () => {
    getConfig.mockResolvedValue({
      ai_enabled: true,
      ai_submitter_choice_allowed: true,
    });
    mount();
    openPanel();
    await waitFor(() => expect(queryAiToggle()).not.toBeNull());
    const toggle = queryAiToggle()!;
    toggle.focus();
    fireEvent.keyDown(toggle, { key: ' ' });
    expect(toggle).toHaveAttribute('aria-checked', 'false');
    fireEvent.keyDown(toggle, { key: ' ' });
    expect(toggle).toHaveAttribute('aria-checked', 'true');
  });

  it('config fetch resolves to null → widget still works, no toggle, use_ai omitted', async () => {
    getConfig.mockResolvedValue(null);
    submit.mockResolvedValueOnce({ ok: true, issue_id: 'rep_null' });
    mount();
    openPanel();
    await waitFor(() => expect(getConfig).toHaveBeenCalled());
    expect(queryAiToggle()).toBeNull();
    typeDraft('fallback');
    fireEvent.click(screen.getByRole('button', { name: /^send$/i }));
    await waitFor(() => expect(submit).toHaveBeenCalledTimes(1));
    const input = submit.mock.calls[0]![0]! as unknown as Record<
      string,
      unknown
    >;
    expect('use_ai' in input).toBe(false);
  });

  it('config fetch rejects → no toggle, submit still works and omits use_ai', async () => {
    getConfig.mockRejectedValueOnce(new Error('cfg boom'));
    submit.mockResolvedValueOnce({ ok: true, issue_id: 'rep_cfg_err' });
    mount();
    openPanel();
    await waitFor(() => expect(getConfig).toHaveBeenCalled());
    expect(queryAiToggle()).toBeNull();
    typeDraft('cfg error path');
    fireEvent.click(screen.getByRole('button', { name: /^send$/i }));
    await waitFor(() => expect(submit).toHaveBeenCalledTimes(1));
    const input = submit.mock.calls[0]![0]! as unknown as Record<
      string,
      unknown
    >;
    expect('use_ai' in input).toBe(false);
  });
});

describe('<FeedbackButton> — theme prop', () => {
  it('defaults to theme="system" on both the FAB and the dialog panel', () => {
    mount();
    expect(
      screen.getByRole('button', { name: /open feedback form/i }),
    ).toHaveAttribute('data-brw-theme', 'system');
    openPanel();
    expect(screen.getByRole('dialog')).toHaveAttribute(
      'data-brw-theme',
      'system',
    );
  });

  it('stamps data-brw-theme="light" when theme="light"', () => {
    mount({ theme: 'light' });
    expect(
      screen.getByRole('button', { name: /open feedback form/i }),
    ).toHaveAttribute('data-brw-theme', 'light');
    openPanel();
    expect(screen.getByRole('dialog')).toHaveAttribute(
      'data-brw-theme',
      'light',
    );
  });

  it('stamps data-brw-theme="dark" when theme="dark"', () => {
    mount({ theme: 'dark' });
    expect(
      screen.getByRole('button', { name: /open feedback form/i }),
    ).toHaveAttribute('data-brw-theme', 'dark');
    openPanel();
    expect(screen.getByRole('dialog')).toHaveAttribute(
      'data-brw-theme',
      'dark',
    );
  });
});

describe('<FeedbackButton> — screenshot capture', () => {
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

    typeDraft('see screenshot');
    fireEvent.click(screen.getByRole('button', { name: /^send$/i }));

    await waitFor(() => expect(submit).toHaveBeenCalledTimes(1));
    const input = submit.mock.calls[0]![0]!;
    expect(input.attachments).toHaveLength(1);
    expect(input.attachments![0]).toMatchObject({ filename: 'screenshot.png' });
  });

  it('surfaces an error alert when capture rejects', async () => {
    captureScreenshot.mockRejectedValueOnce(new Error('canvas blew up'));
    mount();
    openPanel();
    fireEvent.click(
      screen.getByRole('button', { name: /capture screenshot/i }),
    );
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/canvas blew up/i);
  });

  it('revokes queued screenshot object URLs after a discard-confirmed close', async () => {
    captureScreenshot.mockResolvedValueOnce(
      new Blob(['png'], { type: 'image/png' }),
    );

    let urlSeq = 0;
    const createSpy = vi
      .spyOn(URL, 'createObjectURL')
      .mockImplementation(() => `blob:close-leak-${++urlSeq}`);
    const revokeSpy = vi
      .spyOn(URL, 'revokeObjectURL')
      .mockImplementation(() => undefined);

    try {
      mount();
      openPanel();
      fireEvent.click(
        screen.getByRole('button', { name: /capture screenshot/i }),
      );
      await waitFor(() => expect(captureScreenshot).toHaveBeenCalledTimes(1));
      await waitFor(() =>
        expect(
          screen.getByRole('button', { name: /^remove screenshot$/i }),
        ).toBeInTheDocument(),
      );

      const created = createSpy.mock.results.map((r) => r.value as string);
      expect(created.length).toBeGreaterThanOrEqual(1);

      fireEvent.click(screen.getByRole('button', { name: /^close$/i }));
      fireEvent.click(screen.getByRole('button', { name: /^discard$/i }));

      const revoked = revokeSpy.mock.calls.map((c) => c[0]);
      for (const url of created) expect(revoked).toContain(url);
    } finally {
      createSpy.mockRestore();
      revokeSpy.mockRestore();
    }
  });

  it('region overlay parity (Solid V1 ships full-page only)', async () => {
    // The React adapter routes the capture button through a region-select
    // overlay; Solid V1 deliberately does not (SDD § 12) — clicking the
    // button captures the full page immediately, with no overlay node in
    // the DOM at any point.
    captureScreenshot.mockResolvedValueOnce(
      new Blob(['png'], { type: 'image/png' }),
    );
    mount();
    openPanel();
    fireEvent.click(
      screen.getByRole('button', { name: /capture screenshot/i }),
    );
    expect(
      document.querySelector('[data-testid="brw-region-overlay"]'),
    ).toBeNull();
    await waitFor(() => expect(captureScreenshot).toHaveBeenCalledTimes(1));
    expect(
      document.querySelector('[data-testid="brw-region-overlay"]'),
    ).toBeNull();
  });

  it('screenshot preview dialog parity (Solid V1 has no preview modal)', async () => {
    // The chip shows an inline thumbnail of the captured screenshot, but
    // Solid V1 has no tap-to-preview modal — the thumbnail is a plain
    // <img>, not a button, and no preview dialog node ever mounts.
    captureScreenshot.mockResolvedValueOnce(
      new Blob(['png'], { type: 'image/png' }),
    );
    mount();
    openPanel();
    fireEvent.click(
      screen.getByRole('button', { name: /capture screenshot/i }),
    );
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: /^remove screenshot$/i }),
      ).toBeInTheDocument(),
    );
    const chip = screen
      .getByRole('button', { name: /^remove screenshot$/i })
      .closest('.brw-chip') as HTMLElement;
    const thumb = chip.querySelector('img');
    expect(thumb).not.toBeNull();
    expect(thumb!.closest('button')).toBeNull();
    expect(screen.queryByRole('button', { name: /preview/i })).toBeNull();
    expect(
      document.querySelector('[data-testid="brw-preview-dialog"]'),
    ).toBeNull();
  });

  it('shows an in-thread "Capturing screenshot…" bubble and blocks send while in flight', async () => {
    let release: (b: Blob) => void = () => undefined;
    captureScreenshot.mockReturnValueOnce(
      new Promise<Blob>((resolve) => {
        release = resolve;
      }),
    );
    mount();
    openPanel();
    typeDraft('mid-capture send attempt');

    const captureBtn = screen.getByRole('button', {
      name: /capture screenshot/i,
    });
    fireEvent.click(captureBtn);

    // Loading state: in-thread bubble + mutated label + disabled controls.
    expect(screen.getByText(/capturing screenshot…/i)).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /capturing screenshot/i }),
    ).toBeDisabled();
    const sendBtn = screen.getByRole('button', { name: /^send$/i });
    expect(sendBtn).toBeDisabled();
    // Enter-to-send bypasses the disabled button — the submit-path guard
    // must drop it too.
    fireEvent.keyDown(getComposer(), { key: 'Enter' });
    expect(submit).not.toHaveBeenCalled();

    release(new Blob(['png'], { type: 'image/png' }));
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: /^remove screenshot$/i }),
      ).toBeInTheDocument(),
    );
    expect(screen.queryByText(/capturing screenshot…/i)).toBeNull();
    expect(sendBtn).not.toBeDisabled();
  });

  it('disambiguates filenames when multiple screenshots ride one submit', async () => {
    captureScreenshot
      .mockResolvedValueOnce(new Blob(['1'], { type: 'image/png' }))
      .mockResolvedValueOnce(new Blob(['2'], { type: 'image/webp' }));
    submit.mockResolvedValueOnce({ ok: true, issue_id: 'rep_multi' });

    mount();
    openPanel();
    fireEvent.click(
      screen.getByRole('button', { name: /capture screenshot/i }),
    );
    await waitFor(() => expect(captureScreenshot).toHaveBeenCalledTimes(1));
    fireEvent.click(
      screen.getByRole('button', { name: /capture screenshot/i }),
    );
    await waitFor(() => expect(captureScreenshot).toHaveBeenCalledTimes(2));

    typeDraft('two shots');
    fireEvent.click(screen.getByRole('button', { name: /^send$/i }));
    await waitFor(() => expect(submit).toHaveBeenCalledTimes(1));
    const input = submit.mock.calls[0]![0]!;
    expect(input.attachments).toHaveLength(2);
    expect(input.attachments![0]).toMatchObject({
      filename: 'screenshot-1.png',
    });
    expect(input.attachments![1]).toMatchObject({
      filename: 'screenshot-2.webp',
    });
  });

  it('removing a screenshot chip revokes its object URL and drops it from the submit payload', async () => {
    captureScreenshot
      .mockResolvedValueOnce(new Blob(['1'], { type: 'image/png' }))
      .mockResolvedValueOnce(new Blob(['2'], { type: 'image/webp' }));
    submit.mockResolvedValueOnce({ ok: true, issue_id: 'rep_rm' });

    let urlSeq = 0;
    const createSpy = vi
      .spyOn(URL, 'createObjectURL')
      .mockImplementation(() => `blob:rm-${++urlSeq}`);
    const revokeSpy = vi
      .spyOn(URL, 'revokeObjectURL')
      .mockImplementation(() => undefined);

    try {
      mount();
      openPanel();
      fireEvent.click(
        screen.getByRole('button', { name: /capture screenshot/i }),
      );
      await waitFor(() => expect(captureScreenshot).toHaveBeenCalledTimes(1));
      fireEvent.click(
        screen.getByRole('button', { name: /capture screenshot/i }),
      );
      await waitFor(() => expect(captureScreenshot).toHaveBeenCalledTimes(2));
      await waitFor(() =>
        expect(
          screen.getByRole('button', { name: /^remove screenshot 1$/i }),
        ).toBeInTheDocument(),
      );

      fireEvent.click(
        screen.getByRole('button', { name: /^remove screenshot 1$/i }),
      );
      // The removed capture's URL is revoked immediately; the second one
      // stays live for its thumbnail.
      await waitFor(() => expect(revokeSpy).toHaveBeenCalledWith('blob:rm-1'));
      expect(revokeSpy).not.toHaveBeenCalledWith('blob:rm-2');
      // The remaining chip re-labels as the only screenshot.
      expect(
        screen.getByRole('button', { name: /^remove screenshot$/i }),
      ).toBeInTheDocument();

      typeDraft('kept only the second shot');
      fireEvent.click(screen.getByRole('button', { name: /^send$/i }));
      await waitFor(() => expect(submit).toHaveBeenCalledTimes(1));
      const input = submit.mock.calls[0]![0]!;
      expect(input.attachments).toHaveLength(1);
      expect(input.attachments![0]).toMatchObject({
        filename: 'screenshot.webp',
      });
    } finally {
      createSpy.mockRestore();
      revokeSpy.mockRestore();
    }
  });

  it('drops a capture that lands after the attachment cap was reached mid-flight', async () => {
    let release: (b: Blob) => void = () => undefined;
    captureScreenshot.mockReturnValueOnce(
      new Promise<Blob>((resolve) => {
        release = resolve;
      }),
    );
    mount();
    openPanel();
    fireEvent.click(
      screen.getByRole('button', { name: /capture screenshot/i }),
    );

    // While the capture is in flight, the user attaches five files — the
    // combined total hits the SDK ceiling before the capture resolves.
    const fileInput = screen.getByLabelText(/attach file/i) as HTMLInputElement;
    const files = Array.from(
      { length: 5 },
      (_, i) => new File([`f${i}`], `f${i}.txt`, { type: 'text/plain' }),
    );
    fireEvent.change(fileInput, { target: { files } });
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: /^remove f4\.txt$/i }),
      ).toBeInTheDocument(),
    );

    release(new Blob(['late'], { type: 'image/png' }));
    // The stale capture is dropped (no chip) and the inline alert explains
    // why instead of silently exceeding the ceiling.
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/maximum 5 attachments reached/i);
    expect(
      screen.queryByRole('button', { name: /remove screenshot/i }),
    ).toBeNull();
    // The screenshot button's aria-label mutates so AT users hear why the
    // control is unavailable.
    expect(
      screen.getAllByRole('button', {
        name: /maximum 5 attachments reached/i,
      })[0],
    ).toBeDisabled();
  });

  it('a files-only submit stamps file chips (and no screenshots) on the user bubble', async () => {
    submit.mockResolvedValueOnce({ ok: true, issue_id: 'rep_files_only' });
    mount();
    openPanel();
    const fileInput = screen.getByLabelText(/attach file/i) as HTMLInputElement;
    fireEvent.change(fileInput, {
      target: {
        files: [new File(['log'], 'trace.log', { type: 'text/plain' })],
      },
    });
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: /^remove trace\.log$/i }),
      ).toBeInTheDocument(),
    );

    typeDraft('file only, no screenshot');
    fireEvent.click(screen.getByRole('button', { name: /^send$/i }));
    await waitFor(() => expect(submit).toHaveBeenCalledTimes(1));

    const input = submit.mock.calls[0]![0]!;
    expect(input.attachments).toHaveLength(1);
    expect(input.attachments![0]).toMatchObject({ filename: 'trace.log' });
    // The composer chip row is cleared after the successful submit — the
    // file rode along and is no longer pending.
    await waitFor(() =>
      expect(
        screen.queryByRole('button', { name: /^remove trace\.log$/i }),
      ).toBeNull(),
    );
  });

  it('falls back to a generic alert when capture rejects with a non-Error', async () => {
    captureScreenshot.mockRejectedValueOnce('tainted');
    mount();
    openPanel();
    fireEvent.click(
      screen.getByRole('button', { name: /capture screenshot/i }),
    );
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/screenshot capture failed/i);
  });

  it('defaults the attachment extension to webp when the blob carries no MIME type', async () => {
    captureScreenshot.mockResolvedValueOnce(new Blob(['raw'], { type: '' }));
    submit.mockResolvedValueOnce({ ok: true, issue_id: 'rep_ext' });
    mount();
    openPanel();
    fireEvent.click(
      screen.getByRole('button', { name: /capture screenshot/i }),
    );
    await waitFor(() => expect(captureScreenshot).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: /^remove screenshot$/i }),
      ).toBeInTheDocument(),
    );
    typeDraft('untyped blob');
    fireEvent.click(screen.getByRole('button', { name: /^send$/i }));
    await waitFor(() => expect(submit).toHaveBeenCalledTimes(1));
    const input = submit.mock.calls[0]![0]!;
    expect(input.attachments![0]).toMatchObject({
      filename: 'screenshot.webp',
    });
  });
});

describe('<FeedbackButton> — debug raw payload (config.debug)', () => {
  const COPY_LABEL = /copy the raw payload sent to the api/i;

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
    mount();
    openPanel();
    typeDraft('Broken');
    fireEvent.click(screen.getByRole('button', { name: /^send$/i }));

    const userBubble = (await screen.findByText('Broken')).closest(
      '.brw-bubble--user',
    );
    expect(userBubble).not.toBeNull();
    await waitFor(() =>
      expect(
        within(userBubble as HTMLElement).getByRole('button', {
          name: COPY_LABEL,
        }),
      ).toBeInTheDocument(),
    );
  });

  it('omits the copy-raw button when the result has no debug payload', async () => {
    submit.mockResolvedValueOnce({ ok: true, issue_id: 'rep_nodbg' });
    mount();
    openPanel();
    typeDraft('Broken');
    fireEvent.click(screen.getByRole('button', { name: /^send$/i }));

    await screen.findByText('Broken');
    await waitFor(() => expect(submit).toHaveBeenCalledTimes(1));
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
    mount();
    openPanel();
    typeDraft('Broken');
    fireEvent.click(screen.getByRole('button', { name: /^send$/i }));

    const copyBtn = await screen.findByRole('button', { name: COPY_LABEL });
    fireEvent.click(copyBtn);

    await waitFor(() =>
      expect(writeText).toHaveBeenCalledWith(JSON.stringify(payload, null, 2)),
    );
    expect(await screen.findByText('Copied!')).toBeInTheDocument();
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
    mount();
    openPanel();
    typeDraft('Broken');
    fireEvent.click(screen.getByRole('button', { name: /^send$/i }));

    const copyBtn = await screen.findByRole('button', { name: COPY_LABEL });
    fireEvent.click(copyBtn);
    // No throw, label unchanged.
    expect(copyBtn.textContent).toBe('Copy raw payload');
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
    mount();
    openPanel();
    typeDraft('Broken');
    fireEvent.click(screen.getByRole('button', { name: /^send$/i }));

    const copyBtn = await screen.findByRole('button', { name: COPY_LABEL });
    fireEvent.click(copyBtn);
    await waitFor(() => expect(writeText).toHaveBeenCalled());
    expect(copyBtn.textContent).toBe('Copy raw payload');
  });
});
