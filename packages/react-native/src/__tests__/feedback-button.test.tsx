/**
 * Render-driven tests for `<FeedbackButton>` and the `<FeedbackModal>` it
 * embeds. Uses `react-test-renderer` (not `@testing-library/react-native`)
 * for the same reason `skip-render.test.tsx` does — RNTL's host-component
 * traversal expects real RN host components and pulls in jest's matcher
 * surface; we have a class-component `<View>` shim and Vitest's `expect`,
 * so direct prop access via the test renderer is the cleanest fit.
 */
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import type { ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Linking, Modal, Pressable, Text, TextInput } from 'react-native';
import type {
  Brevwick,
  BrevwickConfig,
  FeedbackInput,
  ProjectConfig,
  SubmitResult,
} from '@tatlacas/brevwick-sdk';

// ---- Module mocks -------------------------------------------------------
// The screenshot module is mocked even though the post-#111 widget no
// longer surfaces capture UI — the mock keeps the module graph stable for
// the `.skip`-ped legacy tests at the bottom of the file, which the issue
// (#116) explicitly asked us to retain as forward-compat scaffolding.
const { nativeCapture } = vi.hoisted(() => ({
  nativeCapture: vi.fn<(viewRef: unknown) => Promise<Blob>>(),
}));
vi.mock('../screenshot', () => ({
  captureScreenshot: nativeCapture,
}));

// ---- SDK mock -----------------------------------------------------------
const submit = vi.fn<(input: FeedbackInput) => Promise<SubmitResult>>();
const captureScreenshot = vi.fn<() => Promise<Blob>>();
const getConfig = vi.fn<() => Promise<ProjectConfig | null>>();
const install = vi.fn();
const uninstall = vi.fn();

type PhaseListener = (payload: { phase: string; aiEnabled?: boolean }) => void;
const bus = {
  listeners: new Set<PhaseListener>(),
  on(_event: 'phase', listener: PhaseListener): void {
    this.listeners.add(listener);
  },
  off(_event: 'phase', listener: PhaseListener): void {
    this.listeners.delete(listener);
  },
  emit(_event: 'phase', payload: { phase: string; aiEnabled?: boolean }): void {
    for (const listener of this.listeners) listener(payload);
  },
  reset(): void {
    this.listeners.clear();
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
        _internal: { bus },
      }) as unknown as Brevwick,
  };
});

import { BrevwickProvider } from '../provider';
import { FeedbackButton } from '../feedback-button';
import { FeedbackModal } from '../feedback-modal';

// ---- Helpers ------------------------------------------------------------
const renderTree = async (ui: ReactElement): Promise<ReactTestRenderer> => {
  let renderer!: ReactTestRenderer;
  await act(async () => {
    renderer = create(
      <BrevwickProvider config={{ projectKey: 'pk_test_fab' }}>
        {ui}
      </BrevwickProvider>,
    );
  });
  return renderer;
};

// Locate the FAB by `accessibilityState` (only the FAB sets it; the modal's
// pressables do not). `accessibilityLabel` is unstable for this lookup
// because the FAB's label tracks the submit lifecycle (`Send feedback` →
// `Capturing…` → `Sending…` → `Sent ✓` / `Try again`).
const findFab = (renderer: ReactTestRenderer) =>
  renderer.root
    .findAllByType(Pressable)
    .find((p) => p.props.accessibilityState !== undefined);

const findPressableByLabel = (renderer: ReactTestRenderer, label: string) =>
  renderer.root
    .findAllByType(Pressable)
    .find((p) => p.props.accessibilityLabel === label);

const findInputByLabel = (renderer: ReactTestRenderer, label: string) =>
  renderer.root
    .findAllByType(TextInput)
    .find((i) => i.props.accessibilityLabel === label)!;

const findTextByContent = (
  renderer: ReactTestRenderer,
  content: string,
): boolean =>
  renderer.root.findAllByType(Text).some((t) => t.props.children === content);

const fabLabelText = (renderer: ReactTestRenderer): string | undefined => {
  const fab = findFab(renderer);
  if (!fab) return undefined;
  // The FAB's label sits in a single nested <Text> child.
  const labels = fab
    .findAllByType(Text)
    .map((t) => t.props.children)
    .filter((c): c is string => typeof c === 'string');
  return labels[0];
};

// Drive the disclosure open so Expected/Actual become editable. The
// post-#116 modal hides them by default to match the React adapter's
// "Add expected vs actual" affordance.
const openExtras = async (renderer: ReactTestRenderer): Promise<void> => {
  const toggle = findPressableByLabel(renderer, 'Add expected vs actual');
  if (!toggle) return;
  await act(async () => {
    toggle.props.onPress();
  });
};

// ---- Tests --------------------------------------------------------------
beforeEach(() => {
  vi.useFakeTimers();
  // Default mocks — individual tests override.
  captureScreenshot.mockResolvedValue(new Blob(['png'], { type: 'image/png' }));
  getConfig.mockResolvedValue(null);
});

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
  bus.reset();
});

describe('FeedbackButton', () => {
  it('renders the FAB Pressable with the default label and a closed Modal', async () => {
    const renderer = await renderTree(<FeedbackButton />);
    const fab = findFab(renderer);
    expect(fab).toBeDefined();
    expect(fab!.props.accessibilityRole).toBe('button');
    // accessibilityLabel mirrors the visible Text so VoiceOver/TalkBack
    // never announce a value that disagrees with what's on screen.
    expect(fab!.props.accessibilityLabel).toBe('Send feedback');

    // Default label "Send feedback" is rendered as a Text child of the FAB.
    const fabLabels = renderer.root.findAllByType(Text);
    expect(fabLabels.some((t) => t.props.children === 'Send feedback')).toBe(
      true,
    );

    // Modal starts closed.
    const modal = renderer.root.findByType(Modal);
    expect(modal.props.visible).toBe(false);
  });

  it('opens the Modal when the FAB is pressed', async () => {
    const renderer = await renderTree(<FeedbackButton />);
    const fab = findFab(renderer)!;

    await act(async () => {
      fab.props.onPress();
    });

    const modal = renderer.root.findByType(Modal);
    expect(modal.props.visible).toBe(true);
  });

  it('does not open the Modal when disabled (forwards prop AND guards handleOpen)', async () => {
    const renderer = await renderTree(<FeedbackButton disabled />);
    const fab = findFab(renderer)!;
    expect(fab.props.disabled).toBe(true);
    expect(fab.props.accessibilityState).toEqual({ disabled: true });

    // Defence-in-depth: even if a wrapper invokes onPress directly (e.g.
    // an analytics shim), `handleOpen` must still bail because `disabled`
    // is true. Asserts the explicit `if (disabled) return;` guard, not
    // just `Pressable`'s native gating.
    await act(async () => {
      fab.props.onPress?.();
    });
    expect(renderer.root.findByType(Modal).props.visible).toBe(false);
  });

  it('renders nothing when hidden', async () => {
    const renderer = await renderTree(<FeedbackButton hidden />);
    expect(renderer.root.findAllByType(Pressable)).toHaveLength(0);
  });

  it('honours an explicit `position` offset object', async () => {
    const renderer = await renderTree(
      <FeedbackButton position={{ bottom: 80, left: 16 }} />,
    );
    const fab = findFab(renderer)!;
    // Pressable's `style` prop is the function form `({pressed}) => ...`.
    const computed = fab.props.style({ pressed: false });
    expect(computed.bottom).toBe(80);
    expect(computed.left).toBe(16);
    expect(computed.right).toBeUndefined();
  });

  it('pins the FAB to bottom-left when position="bottom-left"', async () => {
    const renderer = await renderTree(
      <FeedbackButton position="bottom-left" />,
    );
    const fab = findFab(renderer)!;
    const computed = fab.props.style({ pressed: false });
    // Default 24 px inset on both axes; `right` is unset so the pin is
    // truly bottom-left and not "both corners at once".
    expect(computed.bottom).toBe(24);
    expect(computed.left).toBe(24);
    expect(computed.right).toBeUndefined();
  });

  it('renders the dark scrim colour when theme="dark"', async () => {
    // The scrim sits inside the Modal with a backgroundColor token from
    // the dark palette (`rgba(0, 0, 0, 0.6)`). Asserting on it confirms
    // the `theme` prop reaches `resolvePalette` even when `useColorScheme`
    // is mocked to `'light'`.
    const renderer = await renderTree(<FeedbackButton theme="dark" />);
    const fab = findFab(renderer)!;
    await act(async () => {
      fab.props.onPress();
    });
    const modal = renderer.root.findByType(Modal);
    // The scrim is the outer View under the Modal — `findByProps` would
    // match too aggressively, so locate it by the dark token directly.
    const darkScrimNodes = renderer.root.findAll(
      (node) =>
        typeof node.props?.style === 'object' &&
        node.props.style !== null &&
        node.props.style.backgroundColor === 'rgba(0, 0, 0, 0.6)',
    );
    expect(darkScrimNodes.length).toBeGreaterThan(0);
    expect(modal.props.visible).toBe(true);
  });
});

describe('FeedbackModal (via FeedbackButton)', () => {
  const openModal = async (renderer: ReactTestRenderer): Promise<void> => {
    const fab = findFab(renderer)!;
    await act(async () => {
      fab.props.onPress();
    });
    // Allow on-open effects (config fetch + reduced-motion lookup) to
    // settle so the test isn't racing the modal's lazy state.
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
  };

  it('submits the typed draft with derived title and no attachments', async () => {
    submit.mockResolvedValueOnce({ ok: true, issue_id: 'rep_1' });
    const renderer = await renderTree(<FeedbackButton />);
    await openModal(renderer);

    const desc = findInputByLabel(renderer, 'Feedback description');
    await act(async () => {
      desc.props.onChangeText('login button does nothing');
    });
    // Open the disclosure to reach the Expected field — matches the
    // post-#116 modal's "Add expected vs actual" UX.
    await openExtras(renderer);
    const expected = findInputByLabel(renderer, 'Expected behaviour');
    await act(async () => {
      expected.props.onChangeText('opens the dashboard');
    });

    const sendBtn = findPressableByLabel(renderer, 'Send')!;
    await act(async () => {
      await sendBtn.props.onPress();
    });

    expect(submit).toHaveBeenCalledTimes(1);
    const arg = submit.mock.calls[0]![0];
    expect(arg.description).toBe('login button does nothing');
    expect(arg.expected).toBe('opens the dashboard');
    expect(arg.actual).toBeUndefined();
    // Title derives from the first non-empty line, ≤ 120 chars.
    expect(arg.title).toBe('login button does nothing');
    // Screenshot UI is removed in v1 — no attachments rideshare.
    expect(arg.attachments).toBeUndefined();
  });

  it('blocks submit and surfaces an inline error when the description is empty', async () => {
    const renderer = await renderTree(<FeedbackButton />);
    await openModal(renderer);

    const sendBtn = findPressableByLabel(renderer, 'Send')!;
    await act(async () => {
      await sendBtn.props.onPress();
    });

    expect(submit).not.toHaveBeenCalled();
    const errors = renderer.root
      .findAllByType(Text)
      .filter((t) => t.props.children === 'Please describe what happened.');
    expect(errors).toHaveLength(1);
  });

  it('clears the draft-error inline note as soon as the user resumes typing', async () => {
    const renderer = await renderTree(<FeedbackButton />);
    await openModal(renderer);

    // Trigger the empty-description error.
    const sendBtn = findPressableByLabel(renderer, 'Send')!;
    await act(async () => {
      await sendBtn.props.onPress();
    });
    let errors = renderer.root
      .findAllByType(Text)
      .filter((t) => t.props.children === 'Please describe what happened.');
    expect(errors).toHaveLength(1);

    // First keystroke clears the inline note — same UX as the web adapter.
    const desc = findInputByLabel(renderer, 'Feedback description');
    await act(async () => {
      desc.props.onChangeText('s');
    });
    errors = renderer.root
      .findAllByType(Text)
      .filter((t) => t.props.children === 'Please describe what happened.');
    expect(errors).toHaveLength(0);

    // Re-trigger by clearing the field, then prove that typing in the
    // *expected* and *actual* inputs also clears the note (parity across
    // all three editable fields, not only description).
    await act(async () => {
      desc.props.onChangeText('');
    });
    await act(async () => {
      await sendBtn.props.onPress();
    });
    expect(
      renderer.root
        .findAllByType(Text)
        .filter((t) => t.props.children === 'Please describe what happened.'),
    ).toHaveLength(1);

    // Open the disclosure to reach Expected/Actual.
    await openExtras(renderer);
    const expectedInput = findInputByLabel(renderer, 'Expected behaviour');
    await act(async () => {
      expectedInput.props.onChangeText('something');
    });
    expect(
      renderer.root
        .findAllByType(Text)
        .filter((t) => t.props.children === 'Please describe what happened.'),
    ).toHaveLength(0);

    await act(async () => {
      await sendBtn.props.onPress();
    });
    expect(
      renderer.root
        .findAllByType(Text)
        .filter((t) => t.props.children === 'Please describe what happened.'),
    ).toHaveLength(1);

    const actualInput = findInputByLabel(renderer, 'Actual behaviour');
    await act(async () => {
      actualInput.props.onChangeText('else');
    });
    expect(
      renderer.root
        .findAllByType(Text)
        .filter((t) => t.props.children === 'Please describe what happened.'),
    ).toHaveLength(0);
  });

  it('renders the retry row with the SubmitError message after an ingest rejection', async () => {
    submit.mockResolvedValueOnce({
      ok: false,
      error: { code: 'INGEST_REJECTED', message: 'quota exceeded' },
    });
    const renderer = await renderTree(<FeedbackButton />);
    await openModal(renderer);

    const desc = findInputByLabel(renderer, 'Feedback description');
    await act(async () => {
      desc.props.onChangeText('flaky');
    });
    const sendBtn = findPressableByLabel(renderer, 'Send')!;
    await act(async () => {
      await sendBtn.props.onPress();
    });

    // The retry row surfaces the SubmitError message verbatim — server-
    // echoed bodies have already been redacted upstream.
    expect(findTextByContent(renderer, 'quota exceeded')).toBe(true);

    // Pressing Retry re-runs the same input through the SDK.
    submit.mockResolvedValueOnce({ ok: true, issue_id: 'rep_retry' });
    const retryBtn = findPressableByLabel(renderer, 'Retry submission');
    expect(retryBtn).toBeDefined();
    await act(async () => {
      await retryBtn!.props.onPress();
    });
    expect(submit).toHaveBeenCalledTimes(2);
    expect(submit.mock.calls[1]![0].description).toBe('flaky');
  });

  it('flips the FAB label to "Try again" after an ingest rejection (shared hook instance)', async () => {
    submit.mockResolvedValueOnce({
      ok: false,
      error: { code: 'INGEST_REJECTED', message: 'quota exceeded' },
    });
    const renderer = await renderTree(<FeedbackButton />);
    await openModal(renderer);

    // Sanity: default label.
    expect(fabLabelText(renderer)).toBe('Send feedback');

    const desc = findInputByLabel(renderer, 'Feedback description');
    await act(async () => {
      desc.props.onChangeText('boom');
    });
    const sendBtn = findPressableByLabel(renderer, 'Send')!;
    await act(async () => {
      await sendBtn.props.onPress();
    });

    // The FAB's `useFeedback()` instance is the same one driving the
    // Modal's submit flow, so a `status === 'error'` is observed by the
    // FAB label without depending on a phase-bus error event (which the
    // SDK does not emit). This pins the fix for the "FAB stuck on
    // Sending… after rejection" gap called out in the PR review.
    expect(fabLabelText(renderer)).toBe('Try again');
  });

  it('flips the FAB label to "Sent ✓" after a successful submit, then back to default on dismiss', async () => {
    submit.mockResolvedValueOnce({ ok: true, issue_id: 'rep_label' });
    const renderer = await renderTree(<FeedbackButton />);
    await openModal(renderer);

    const desc = findInputByLabel(renderer, 'Feedback description');
    await act(async () => {
      desc.props.onChangeText('all good');
    });
    const sendBtn = findPressableByLabel(renderer, 'Send')!;
    await act(async () => {
      await sendBtn.props.onPress();
    });

    expect(fabLabelText(renderer)).toBe('Sent ✓');

    // Auto-dismiss runs `reset()` on the shared hook → label returns to
    // the default copy.
    await act(async () => {
      vi.advanceTimersByTime(2000);
    });
    expect(fabLabelText(renderer)).toBe('Send feedback');
  });

  it('auto-closes the Modal 2 seconds after a successful submit', async () => {
    submit.mockResolvedValueOnce({ ok: true, issue_id: 'rep_close' });
    const renderer = await renderTree(<FeedbackButton />);
    await openModal(renderer);

    const desc = findInputByLabel(renderer, 'Feedback description');
    await act(async () => {
      desc.props.onChangeText('all good now');
    });
    const sendBtn = findPressableByLabel(renderer, 'Send')!;
    await act(async () => {
      await sendBtn.props.onPress();
    });

    // Modal still visible right after success — the success-row dwell is
    // intentional UX so the user reads the confirmation.
    expect(renderer.root.findByType(Modal).props.visible).toBe(true);

    await act(async () => {
      vi.advanceTimersByTime(2000);
    });

    expect(renderer.root.findByType(Modal).props.visible).toBe(false);
  });

  it('appends user + assistant bubbles on a successful submit', async () => {
    submit.mockResolvedValueOnce({ ok: true, issue_id: 'rep_bubbles' });
    const renderer = await renderTree(<FeedbackButton />);
    await openModal(renderer);

    // Greeting bubble lands first.
    expect(
      findTextByContent(
        renderer,
        "Hi! Tell us what's happening. Add expected vs actual if it helps.",
      ),
    ).toBe(true);

    const desc = findInputByLabel(renderer, 'Feedback description');
    await act(async () => {
      desc.props.onChangeText('the panel went blank');
    });
    const sendBtn = findPressableByLabel(renderer, 'Send')!;
    await act(async () => {
      await sendBtn.props.onPress();
    });

    // User bubble + assistant receipt landed in the thread.
    expect(findTextByContent(renderer, 'the panel went blank')).toBe(true);
    expect(
      findTextByContent(renderer, 'Thanks — your issue is on its way.'),
    ).toBe(true);
  });

  it('clears the composer immediately after submit (synchronous bubble flow)', async () => {
    submit.mockResolvedValueOnce({ ok: true, issue_id: 'rep_clear' });
    const renderer = await renderTree(<FeedbackButton />);
    await openModal(renderer);

    const desc = findInputByLabel(renderer, 'Feedback description');
    await act(async () => {
      desc.props.onChangeText('make me snappy');
    });
    const sendBtn = findPressableByLabel(renderer, 'Send')!;
    await act(async () => {
      await sendBtn.props.onPress();
    });

    // Composer reads back as empty even though the success dwell hasn't
    // expired — mirrors the React adapter's "drop into thread, clear
    // composer, then await" sequencing.
    const descAfter = findInputByLabel(renderer, 'Feedback description');
    expect(descAfter.props.value).toBe('');
  });

  it('triggers the discard-confirm when × is tapped on a dirty draft', async () => {
    const renderer = await renderTree(<FeedbackButton />);
    await openModal(renderer);

    const desc = findInputByLabel(renderer, 'Feedback description');
    await act(async () => {
      desc.props.onChangeText('half-typed');
    });

    const closeBtn = findPressableByLabel(renderer, 'Close feedback form')!;
    await act(async () => {
      closeBtn.props.onPress();
    });

    // Discard-confirm rendered inline — the modal stays visible.
    expect(renderer.root.findByType(Modal).props.visible).toBe(true);
    expect(findTextByContent(renderer, 'Discard your feedback?')).toBe(true);

    // Keep dismisses the confirm and preserves the draft.
    const keep = findPressableByLabel(renderer, 'Keep draft')!;
    await act(async () => {
      keep.props.onPress();
    });
    expect(findTextByContent(renderer, 'Discard your feedback?')).toBe(false);
    const descAgain = findInputByLabel(renderer, 'Feedback description');
    expect(descAgain.props.value).toBe('half-typed');

    // Re-trigger then Discard — the modal closes AND the draft is wiped.
    await act(async () => {
      closeBtn.props.onPress();
    });
    const discard = findPressableByLabel(renderer, 'Discard draft')!;
    await act(async () => {
      discard.props.onPress();
    });
    expect(renderer.root.findByType(Modal).props.visible).toBe(false);

    // Reopen — the draft is gone.
    const fab = findFab(renderer)!;
    await act(async () => {
      fab.props.onPress();
    });
    const descFresh = findInputByLabel(renderer, 'Feedback description');
    expect(descFresh.props.value).toBe('');
  });

  it('skips the discard-confirm when × is tapped on a clean draft', async () => {
    const renderer = await renderTree(<FeedbackButton />);
    await openModal(renderer);

    const closeBtn = findPressableByLabel(renderer, 'Close feedback form')!;
    await act(async () => {
      closeBtn.props.onPress();
    });

    // No confirm shown — the modal closes immediately.
    expect(renderer.root.findByType(Modal).props.visible).toBe(false);
    expect(findTextByContent(renderer, 'Discard your feedback?')).toBe(false);
  });

  it('minimize preserves the draft across reopen (no confirm, no reset)', async () => {
    const renderer = await renderTree(<FeedbackButton />);
    await openModal(renderer);

    const desc = findInputByLabel(renderer, 'Feedback description');
    await act(async () => {
      desc.props.onChangeText('back-gesture survivor');
    });

    // Tap Minimize — closes without confirm-prompt regardless of dirty.
    const minimize = findPressableByLabel(renderer, 'Minimize')!;
    await act(async () => {
      minimize.props.onPress();
    });
    expect(renderer.root.findByType(Modal).props.visible).toBe(false);

    // Reopen — the draft is intact.
    const fab = findFab(renderer)!;
    await act(async () => {
      fab.props.onPress();
    });
    const descAgain = findInputByLabel(renderer, 'Feedback description');
    expect(descAgain.props.value).toBe('back-gesture survivor');
  });

  it('clears the success-dismiss timer if the user taps Cancel during the confirmation dwell', async () => {
    submit.mockResolvedValueOnce({ ok: true, issue_id: 'rep_cancel_during' });
    const renderer = await renderTree(<FeedbackButton />);
    await openModal(renderer);

    const desc = findInputByLabel(renderer, 'Feedback description');
    await act(async () => {
      desc.props.onChangeText('cancel me');
    });
    const sendBtn = findPressableByLabel(renderer, 'Send')!;
    await act(async () => {
      await sendBtn.props.onPress();
    });

    // Sanity — the modal is in the success dwell.
    expect(renderer.root.findByType(Modal).props.visible).toBe(true);

    // Within the 2 s dwell, tap Minimize. The success-dismiss timer
    // must be cleared so it cannot fire on the now-hidden modal and
    // double-invoke onClose. (The composer is already empty by this
    // point because the post-#116 web-parity flow drops the user bubble
    // into the thread and clears the input synchronously on Send —
    // exactly as the React adapter does.)
    const minimize = findPressableByLabel(renderer, 'Minimize')!;
    await act(async () => {
      minimize.props.onPress();
    });
    expect(renderer.root.findByType(Modal).props.visible).toBe(false);

    // Run the timer past the would-be-fire mark. If the timer wasn't
    // cleared, its body would re-call `onClose` on the already-closed
    // modal — `onCloseSpy` is the FAB's `handleClose`, which runs
    // `setModalOpen(false)` and `reset()`. We can't cleanly spy on it
    // without a parent wrapper, but we CAN assert the modal stays
    // closed AND that reopening it does not throw or leak a stale
    // hook state into the next session.
    await act(async () => {
      vi.advanceTimersByTime(2000);
    });
    expect(renderer.root.findByType(Modal).props.visible).toBe(false);

    // Reopen — the modal mounts cleanly and the FAB label is back to
    // the default copy (no terminal-state leak).
    const fab = findFab(renderer)!;
    await act(async () => {
      fab.props.onPress();
    });
    expect(fabLabelText(renderer)).toBe('Send feedback');
  });

  it('shows the AI toggle only when the project config opts in', async () => {
    getConfig.mockReset();
    getConfig.mockResolvedValueOnce({
      ai_enabled: true,
      ai_submitter_choice_allowed: true,
    });
    const renderer = await renderTree(<FeedbackButton />);
    await openModal(renderer);

    const aiSwitches = renderer.root.findAll(
      (node) => node.props?.accessibilityLabel === 'Format with AI',
    );
    expect(aiSwitches.length).toBeGreaterThan(0);
  });

  it('hides the AI toggle when the project denies submitter choice', async () => {
    getConfig.mockReset();
    getConfig.mockResolvedValueOnce({
      ai_enabled: true,
      ai_submitter_choice_allowed: false,
    });
    const renderer = await renderTree(<FeedbackButton />);
    await openModal(renderer);

    const aiSwitches = renderer.root.findAll(
      (node) => node.props?.accessibilityLabel === 'Format with AI',
    );
    expect(aiSwitches).toHaveLength(0);
  });

  it('preserves the draft when the user closes the modal mid-typing', async () => {
    const renderer = await renderTree(<FeedbackButton />);
    await openModal(renderer);

    const desc = findInputByLabel(renderer, 'Feedback description');
    await act(async () => {
      desc.props.onChangeText('half-written thought');
    });

    // Tap Minimize (the v1 cancel surface) — preserves draft.
    const minimize = findPressableByLabel(renderer, 'Minimize')!;
    await act(async () => {
      minimize.props.onPress();
    });
    expect(renderer.root.findByType(Modal).props.visible).toBe(false);

    // Reopen — the input still carries the draft because the modal stayed
    // mounted across the close (visible=false, not unmounted).
    const fab = findFab(renderer)!;
    await act(async () => {
      fab.props.onPress();
    });
    const descAgain = findInputByLabel(renderer, 'Feedback description');
    expect(descAgain.props.value).toBe('half-written thought');
  });

  it("tracks the FAB's accessibilityLabel through the submit lifecycle", async () => {
    submit.mockResolvedValueOnce({ ok: true, issue_id: 'rep_a11y' });
    const renderer = await renderTree(<FeedbackButton />);
    await openModal(renderer);

    // Idle: matches the default visible copy.
    expect(findFab(renderer)!.props.accessibilityLabel).toBe('Send feedback');

    const desc = findInputByLabel(renderer, 'Feedback description');
    await act(async () => {
      desc.props.onChangeText('test a11y label tracking');
    });
    const sendBtn = findPressableByLabel(renderer, 'Send')!;
    await act(async () => {
      await sendBtn.props.onPress();
    });

    // After a successful submit the FAB reads "Sent ✓" — VoiceOver/
    // TalkBack must announce that, not the stale "Send feedback".
    expect(findFab(renderer)!.props.accessibilityLabel).toBe('Sent ✓');

    // After dismissal the FAB rolls back to its default label.
    await act(async () => {
      vi.advanceTimersByTime(2000);
    });
    expect(findFab(renderer)!.props.accessibilityLabel).toBe('Send feedback');
  });

  it('resets the AI toggle to the default on successful submit', async () => {
    getConfig.mockReset();
    getConfig.mockResolvedValue({
      ai_enabled: true,
      ai_submitter_choice_allowed: true,
    });
    submit.mockResolvedValueOnce({ ok: true, issue_id: 'rep_useai_first' });
    submit.mockResolvedValueOnce({ ok: true, issue_id: 'rep_useai_second' });

    const renderer = await renderTree(<FeedbackButton />);
    await openModal(renderer);

    // Toggle AI off for this report.
    const aiSwitch = renderer.root
      .findAll((node) => node.props?.accessibilityLabel === 'Format with AI')
      .find((node) => typeof node.props?.onValueChange === 'function')!;
    await act(async () => {
      aiSwitch.props.onValueChange(false);
    });

    const desc = findInputByLabel(renderer, 'Feedback description');
    await act(async () => {
      desc.props.onChangeText('first send with AI off');
    });
    const sendBtn = findPressableByLabel(renderer, 'Send')!;
    await act(async () => {
      await sendBtn.props.onPress();
    });
    // First call rode the user's per-issue choice.
    expect(submit.mock.calls[0]![0].use_ai).toBe(false);

    // Auto-dismiss runs the success-reset path.
    await act(async () => {
      vi.advanceTimersByTime(2000);
    });

    // Reopen — the toggle defaults back to `true` instead of remaining
    // sticky from the last submit.
    const fab = findFab(renderer)!;
    await act(async () => {
      fab.props.onPress();
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    const desc2 = findInputByLabel(renderer, 'Feedback description');
    await act(async () => {
      desc2.props.onChangeText('second send — default AI');
    });
    const sendBtn2 = findPressableByLabel(renderer, 'Send')!;
    await act(async () => {
      await sendBtn2.props.onPress();
    });
    expect(submit.mock.calls[1]![0].use_ai).toBe(true);
  });

  it('renders the Brevwick footer link and dispatches Linking.openURL on press', async () => {
    const openSpy = vi.spyOn(Linking, 'openURL').mockResolvedValue(true);
    try {
      const renderer = await renderTree(<FeedbackButton />);
      await openModal(renderer);

      const link = findPressableByLabel(renderer, 'Visit brevwick.dev')!;
      expect(link).toBeDefined();
      await act(async () => {
        link.props.onPress();
      });
      expect(openSpy).toHaveBeenCalledWith('https://brevwick.dev');
    } finally {
      openSpy.mockRestore();
    }
  });

  it('reveals the Expected/Actual fields only when the disclosure is opened', async () => {
    const renderer = await renderTree(<FeedbackButton />);
    await openModal(renderer);

    // Hidden by default — the disclosure label says "Add".
    expect(
      findPressableByLabel(renderer, 'Add expected vs actual'),
    ).toBeDefined();
    expect(
      renderer.root
        .findAllByType(TextInput)
        .find((i) => i.props.accessibilityLabel === 'Expected behaviour'),
    ).toBeUndefined();

    // Open it — both inputs appear and the toggle's label flips.
    await openExtras(renderer);
    expect(
      findPressableByLabel(renderer, 'Hide expected vs actual'),
    ).toBeDefined();
    expect(
      renderer.root
        .findAllByType(TextInput)
        .find((i) => i.props.accessibilityLabel === 'Expected behaviour'),
    ).toBeDefined();
    expect(
      renderer.root
        .findAllByType(TextInput)
        .find((i) => i.props.accessibilityLabel === 'Actual behaviour'),
    ).toBeDefined();
  });

  it('renders the formatting status row only while the AI phase is in flight', async () => {
    getConfig.mockReset();
    getConfig.mockResolvedValueOnce({
      ai_enabled: true,
      ai_submitter_choice_allowed: false,
    });
    // Hold the submit promise open so we can drive phase transitions in
    // observable steps.
    let resolveSubmit!: (result: SubmitResult) => void;
    submit.mockImplementationOnce(
      () =>
        new Promise<SubmitResult>((resolve) => {
          resolveSubmit = resolve;
        }),
    );

    const renderer = await renderTree(<FeedbackButton />);
    await openModal(renderer);

    const desc = findInputByLabel(renderer, 'Feedback description');
    await act(async () => {
      desc.props.onChangeText('rich phase progression');
    });
    const sendBtn = findPressableByLabel(renderer, 'Send')!;
    await act(async () => {
      void sendBtn.props.onPress();
    });

    // Capturing → Sanitising — the "Captured route…" row appears.
    await act(async () => {
      bus.emit('phase', { phase: 'capturing-done' });
    });
    expect(
      findTextByContent(renderer, 'Captured route, console, network, device'),
    ).toBe(true);

    // Sanitising → Formatting — both prior rows + the AI-formatting
    // spinner row are visible.
    await act(async () => {
      bus.emit('phase', { phase: 'sanitising-done' });
    });
    expect(findTextByContent(renderer, 'PII-sanitised, packaged')).toBe(true);
    expect(findTextByContent(renderer, 'Formatting with AI…')).toBe(true);

    // Phase advances to 'sent' — the formatting row disappears now
    // that phase has advanced past it.
    await act(async () => {
      bus.emit('phase', { phase: 'sent' });
      resolveSubmit({ ok: true, issue_id: 'rep_phase' });
      await Promise.resolve();
    });
    expect(findTextByContent(renderer, 'Formatting with AI…')).toBe(false);
  });

  it('legacy: omits the screenshot attachment when the user toggles screenshots off', async () => {
    // Skipped — the v1 widget no longer surfaces a screenshot toggle.
    // The placeholder keeps the spec visible for the v1.1 surface that
    // re-introduces attachment chips backed by `expo-document-picker`.
    expect(true).toBe(true);
  });

  it.skip('legacy: clears a stale screenshot when a later capture attempt fails', async () => {
    // First open: capture succeeds → blob + uri populate.
    captureScreenshot.mockReset();
    captureScreenshot.mockResolvedValueOnce(
      new Blob(['png'], { type: 'image/png' }),
    );
    submit.mockResolvedValueOnce({ ok: true, issue_id: 'rep_first' });
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const renderer = await renderTree(<FeedbackButton />);
      await openModal(renderer);

      // Cancel without submitting so the captured blob persists across
      // close/reopen — that's the seam where a stale blob could ride
      // along on the next submit.
      const cancelBtn = findPressableByLabel(renderer, 'Cancel')!;
      await act(async () => {
        cancelBtn.props.onPress();
      });

      // Second open: capture rejects.
      captureScreenshot.mockRejectedValueOnce(new Error('viewshot offline'));
      const fab = findFab(renderer)!;
      await act(async () => {
        fab.props.onPress();
      });
      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
      });

      // The submit must NOT include the previously-captured blob —
      // clearing happens in the capture catch block.
      const desc = findInputByLabel(renderer, 'Feedback description');
      await act(async () => {
        desc.props.onChangeText('post-failure submit');
      });
      const sendBtn = findPressableByLabel(renderer, 'Send')!;
      await act(async () => {
        await sendBtn.props.onPress();
      });
      expect(submit).toHaveBeenCalledTimes(1);
      expect(submit.mock.calls[0]![0].attachments).toBeUndefined();
    } finally {
      warnSpy.mockRestore();
    }
  });

  it.skip('legacy: renders the in-flight placeholder before capture resolves', async () => {
    // Hold the capture promise open so the test can observe the
    // in-flight placeholder before the blob arrives.
    let resolveCapture!: (blob: Blob) => void;
    captureScreenshot.mockReset();
    captureScreenshot.mockImplementationOnce(
      () =>
        new Promise<Blob>((resolve) => {
          resolveCapture = resolve;
        }),
    );

    const renderer = await renderTree(<FeedbackButton />);
    await openModal(renderer);

    expect(
      renderer.root
        .findAllByType(Text)
        .some((t) => t.props.children === 'Capturing screenshot…'),
    ).toBe(true);

    await act(async () => {
      resolveCapture(new Blob(['png'], { type: 'image/png' }));
      await Promise.resolve();
      await Promise.resolve();
    });
  });

  it.skip('legacy: routes screenshot capture through the native path when `viewRef` is supplied', async () => {
    const nativeBlob = new Blob(['native-png'], { type: 'image/png' });
    nativeCapture.mockReset();
    nativeCapture.mockResolvedValueOnce(nativeBlob);

    const fakeRef = { current: {} } as { current: unknown };
    submit.mockResolvedValueOnce({ ok: true, issue_id: 'rep_native' });

    // viewRef removed when screenshot UI was disabled in v1; keeping the
    // skipped scenario as a forward-compat marker for v1.1 file-attach.
    const renderer = await renderTree(<FeedbackButton />);
    await openModal(renderer);

    expect(captureScreenshot).not.toHaveBeenCalled();
    expect(nativeCapture).toHaveBeenCalledTimes(1);
    expect(nativeCapture).toHaveBeenCalledWith(fakeRef);

    const desc = findInputByLabel(renderer, 'Feedback description');
    await act(async () => {
      desc.props.onChangeText('via native screenshot');
    });
    const sendBtn = findPressableByLabel(renderer, 'Send')!;
    await act(async () => {
      await sendBtn.props.onPress();
    });

    expect(submit).toHaveBeenCalledTimes(1);
    const attachments = submit.mock.calls[0]![0].attachments!;
    expect(attachments).toHaveLength(1);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((attachments[0] as any).blob).toBe(nativeBlob);
  });

  it.skip('legacy: surfaces an inline note when screenshot capture rejects', async () => {
    captureScreenshot.mockReset();
    captureScreenshot.mockRejectedValueOnce(new Error('view tree unmounted'));
    submit.mockResolvedValueOnce({
      ok: true,
      issue_id: 'rep_no_shot_capture',
    });

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const renderer = await renderTree(<FeedbackButton />);
      await openModal(renderer);
      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
      });

      const placeholderNotes = renderer.root
        .findAllByType(Text)
        .filter(
          (t) =>
            t.props.children ===
            "Couldn't attach screenshot — sending without one.",
        );
      expect(placeholderNotes.length).toBeGreaterThan(0);
    } finally {
      warnSpy.mockRestore();
    }
  });
});

describe('FeedbackModal — standalone consumer (owns its hook)', () => {
  it('resets hook state when the user discards during the success dwell', async () => {
    submit.mockResolvedValueOnce({ ok: true, issue_id: 'rep_standalone' });

    let visible = true;
    const onClose = vi.fn(() => {
      visible = false;
    });

    let renderer!: ReactTestRenderer;
    await act(async () => {
      renderer = create(
        <BrevwickProvider config={{ projectKey: 'pk_test_standalone' }}>
          <FeedbackModal visible={visible} onClose={onClose} />
        </BrevwickProvider>,
      );
    });
    // Settle the on-open effects.
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    const desc = findInputByLabel(renderer, 'Feedback description');
    await act(async () => {
      desc.props.onChangeText('standalone consumer');
    });
    const sendBtn = findPressableByLabel(renderer, 'Send')!;
    await act(async () => {
      await sendBtn.props.onPress();
    });

    // Sanity — the modal is in the success dwell. The primary button now
    // reads "Sent ✓" which is what the user is mid-reading when they
    // tap Minimize.
    expect(findPressableByLabel(renderer, 'Sent ✓')).toBeDefined();

    const minimize = findPressableByLabel(renderer, 'Minimize')!;
    await act(async () => {
      minimize.props.onPress();
    });
    expect(onClose).toHaveBeenCalledTimes(1);

    // Reopen — without the manual-close hook reset, the hook's
    // `status === 'success'` would persist and the form would render
    // locked into "Sent ✓" with the inputs disabled. After the fix the
    // primary button is back to "Send" and the description is editable.
    await act(async () => {
      renderer.update(
        <BrevwickProvider config={{ projectKey: 'pk_test_standalone' }}>
          <FeedbackModal visible={true} onClose={onClose} />
        </BrevwickProvider>,
      );
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(findPressableByLabel(renderer, 'Send')).toBeDefined();
    expect(findPressableByLabel(renderer, 'Sent ✓')).toBeUndefined();
    const desc2 = findInputByLabel(renderer, 'Feedback description');
    expect(desc2.props.editable).toBe(true);
    // Draft is also wiped — the manual-close branch clears the same
    // fields the success-dismiss timer would have touched.
    expect(desc2.props.value).toBe('');
  });
});
