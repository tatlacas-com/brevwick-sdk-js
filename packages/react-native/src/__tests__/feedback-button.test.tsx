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
import { Modal, Pressable, Text, TextInput } from 'react-native';
import type {
  Brevwick,
  BrevwickConfig,
  FeedbackInput,
  ProjectConfig,
  SubmitResult,
} from '@tatlacas/brevwick-sdk';

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

const findFab = (renderer: ReactTestRenderer) =>
  renderer.root
    .findAllByType(Pressable)
    .find((p) => p.props.accessibilityLabel === 'Send feedback');

const findPressableByLabel = (renderer: ReactTestRenderer, label: string) =>
  renderer.root
    .findAllByType(Pressable)
    .find((p) => p.props.accessibilityLabel === label);

const findInputByLabel = (renderer: ReactTestRenderer, label: string) =>
  renderer.root
    .findAllByType(TextInput)
    .find((i) => i.props.accessibilityLabel === label)!;

const fabLabelText = (renderer: ReactTestRenderer): string | undefined => {
  const fab = findFab(renderer);
  if (!fab) return undefined;
  // The FAB's label sits in a single nested <Text> child. We grab the
  // closest descendant Text whose immediate child is a string — under the
  // class-component View shim the label is the only string-typed Text in
  // that subtree.
  const labels = fab
    .findAllByType(Text)
    .map((t) => t.props.children)
    .filter((c): c is string => typeof c === 'string');
  return labels[0];
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
    // Allow on-open effects (config fetch + screenshot capture) to settle
    // so the test isn't racing the modal's lazy state.
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
  };

  it('calls useFeedback().submit with the typed draft when the user presses the primary button', async () => {
    submit.mockResolvedValueOnce({ ok: true, issue_id: 'rep_1' });
    const renderer = await renderTree(<FeedbackButton />);
    await openModal(renderer);

    const desc = findInputByLabel(renderer, 'Feedback description');
    await act(async () => {
      desc.props.onChangeText('login button does nothing');
    });
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
    // Screenshot is on by default — attachments should include the captured
    // blob with the canonical filename.
    expect(arg.attachments).toHaveLength(1);
    expect(arg.attachments![0]).toMatchObject({ filename: 'screenshot.png' });
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

  it('renders the Try again retry button after an ingest rejection', async () => {
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

    // The Send pressable is replaced by a Try again pressable when
    // status === 'error'.
    expect(findPressableByLabel(renderer, 'Send')).toBeUndefined();
    const retryBtn = findPressableByLabel(renderer, 'Retry submission');
    expect(retryBtn).toBeDefined();

    // Pressing it re-runs the same input through the SDK.
    submit.mockResolvedValueOnce({ ok: true, issue_id: 'rep_retry' });
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

    // Within the 2 s dwell, tap Cancel.
    const cancelBtn = findPressableByLabel(renderer, 'Cancel')!;
    await act(async () => {
      cancelBtn.props.onPress();
    });
    expect(renderer.root.findByType(Modal).props.visible).toBe(false);

    // Run the timer past the would-be-fire mark. If the timer wasn't
    // cleared, its body would re-call `onClose` on the already-closed
    // modal. We assert the modal stays closed AND no draft state is
    // surprise-reset (the description clear path inside the timer body).
    // After the cancel, reopen the FAB — the draft must still be there
    // (preserved across cancel, NOT wiped by a stale timer).
    await act(async () => {
      vi.advanceTimersByTime(2000);
    });
    const fab = findFab(renderer)!;
    await act(async () => {
      fab.props.onPress();
    });
    const descAgain = findInputByLabel(renderer, 'Feedback description');
    expect(descAgain.props.value).toBe('cancel me');
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

  it('omits the screenshot attachment when the user toggles screenshots off', async () => {
    submit.mockResolvedValueOnce({ ok: true, issue_id: 'rep_no_shot' });
    const renderer = await renderTree(<FeedbackButton />);
    await openModal(renderer);

    const screenshotSwitch = renderer.root
      .findAll(
        (node) => node.props?.accessibilityLabel === 'Include screenshot',
      )
      .find((node) => typeof node.props?.onValueChange === 'function')!;
    await act(async () => {
      screenshotSwitch.props.onValueChange(false);
    });

    const desc = findInputByLabel(renderer, 'Feedback description');
    await act(async () => {
      desc.props.onChangeText('typo only, no shot needed');
    });
    const sendBtn = findPressableByLabel(renderer, 'Send')!;
    await act(async () => {
      await sendBtn.props.onPress();
    });

    expect(submit).toHaveBeenCalledTimes(1);
    expect(submit.mock.calls[0]![0].attachments).toBeUndefined();
  });

  it('preserves the draft when the user closes the modal mid-typing', async () => {
    const renderer = await renderTree(<FeedbackButton />);
    await openModal(renderer);

    const desc = findInputByLabel(renderer, 'Feedback description');
    await act(async () => {
      desc.props.onChangeText('half-written thought');
    });

    const cancelBtn = findPressableByLabel(renderer, 'Cancel')!;
    await act(async () => {
      cancelBtn.props.onPress();
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

  it('surfaces an inline note and warns to the console when screenshot capture rejects', async () => {
    captureScreenshot.mockReset();
    captureScreenshot.mockRejectedValueOnce(new Error('view tree unmounted'));
    submit.mockResolvedValueOnce({ ok: true, issue_id: 'rep_no_shot_capture' });

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const renderer = await renderTree(<FeedbackButton />);
      await openModal(renderer);
      // Allow the screenshot effect's catch branch to schedule a setState.
      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
      });

      // Inline note appears in place of the placeholder copy so the user
      // understands the submit will go through without a screenshot.
      const placeholderNotes = renderer.root
        .findAllByType(Text)
        .filter(
          (t) =>
            t.props.children ===
            "Couldn't attach screenshot — sending without one.",
        );
      expect(placeholderNotes.length).toBeGreaterThan(0);

      // Single warn matching the screenshot.ts logFailure pattern.
      expect(warnSpy).toHaveBeenCalledTimes(1);
      const message = warnSpy.mock.calls[0]![0] as string;
      expect(message).toMatch(/^brevwick: screenshot capture failed/);
      expect(message).toContain('view tree unmounted');

      // Submit still POSTs successfully — without the screenshot blob.
      const desc = findInputByLabel(renderer, 'Feedback description');
      await act(async () => {
        desc.props.onChangeText('shot failed but I want to send');
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
});
