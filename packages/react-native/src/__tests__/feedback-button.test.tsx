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

  it('does not open the Modal when disabled', async () => {
    const renderer = await renderTree(<FeedbackButton disabled />);
    const fab = findFab(renderer)!;
    expect(fab.props.disabled).toBe(true);
    expect(fab.props.accessibilityState).toEqual({ disabled: true });
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
});
