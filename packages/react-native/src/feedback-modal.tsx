import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactElement,
} from 'react';
import {
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Switch,
  Text,
  TextInput,
  View,
  useColorScheme,
} from 'react-native';
import type {
  FeedbackAttachment,
  FeedbackInput,
  ProjectConfig,
} from '@tatlacas/brevwick-sdk';
import { useBrevwick } from './context';
import {
  useFeedback,
  type FeedbackPhase,
  type UseFeedbackResult,
} from './use-feedback';
import {
  createWidgetStyles,
  resolvePalette,
  type BrevwickPalette,
  type BrevwickTheme,
} from './styles';

const SUCCESS_DISMISS_DELAY_MS = 2000;

/**
 * Map the (`status`, `phase`) tuple returned by `useFeedback()` to the
 * primary-button label. Same vocabulary as the web React adapter so a user
 * who has seen the web widget recognises every state.
 */
function submitButtonLabel(
  status: 'idle' | 'submitting' | 'success' | 'error',
  phase: FeedbackPhase,
): string {
  if (status === 'success' || phase === 'sent') return 'Sent ✓';
  if (status === 'error') return 'Try again';
  if (status === 'submitting') {
    if (phase === 'formatting') return 'Sending…';
    return 'Capturing…';
  }
  return 'Send';
}

/**
 * Props for {@link FeedbackModal}. The component is a controlled modal —
 * the parent owns `visible` and the close callback so the FAB can drive
 * open/close while the modal owns the form draft.
 */
export interface FeedbackModalProps {
  /** Whether the modal is mounted and visible. */
  visible: boolean;
  /** Fired when the user taps Cancel, the close button, or the back gesture. */
  onClose: () => void;
  /**
   * Forced palette. `'system'` (default) follows the host's color scheme;
   * `'light'`/`'dark'` override it.
   */
  theme?: BrevwickTheme;
  /**
   * Externally-owned `useFeedback()` instance. When supplied (the
   * {@link FeedbackButton} path), the modal renders against this hook
   * tuple instead of allocating its own — the FAB needs to observe the
   * same `status` / `phase` / `error` so its label can advance through
   * the post-submit terminal states (`Sent ✓` / `Try again`) which the
   * SDK's phase bus does not emit. Standalone consumers can omit this
   * prop; the modal falls back to its own `useFeedback()` call.
   */
  feedback?: UseFeedbackResult;
}

/**
 * Drop-in feedback modal for React Native. Renders a slide-up sheet with
 * description / expected / actual fields and a submit button driven by
 * {@link useFeedback}.
 *
 * The draft state lives in component-local `useState`, so a Cancel or
 * back-gesture (which only flips `visible` to `false`) preserves the
 * draft for the next open. This applies to BOTH the text fields
 * (description / expected / actual) AND the `useAi` toggle — toggle
 * state is treated as part of the draft and persists across Cancel +
 * reopen. Successful submit clears the draft and calls `onClose` after
 * a short confirmation delay.
 *
 * The "Format with AI" toggle is rendered exactly when the project's
 * `getConfig()` reports `ai_enabled && ai_submitter_choice_allowed` —
 * matching the web adapter's render-policy matrix.
 */
export function FeedbackModal({
  visible,
  onClose,
  theme = 'system',
  feedback: feedbackProp,
}: FeedbackModalProps): ReactElement {
  const brevwick = useBrevwick();
  // Always call `useFeedback()` to satisfy hook ordering rules; discard
  // the result when the parent supplied one. Passing an externally-owned
  // tuple keeps the FAB and Modal in lockstep across submit terminal
  // states the phase bus does not emit (`error`).
  const localFeedback = useFeedback();
  const feedback = feedbackProp ?? localFeedback;
  const { submit, status, phase, error, retry, reset } = feedback;
  // Standalone modal (no external `feedback` prop) means we own the hook
  // and are responsible for rolling its `status` back to `'idle'` on
  // manual close. The `FeedbackButton` parent does this in its own
  // `handleClose`, so the FAB-driven path doesn't need it here.
  const ownsFeedback = feedbackProp === undefined;
  const colorScheme = useColorScheme();
  const palette: BrevwickPalette = useMemo(
    () => resolvePalette(theme, colorScheme),
    [theme, colorScheme],
  );
  const styles = useMemo(() => createWidgetStyles(palette), [palette]);

  const [description, setDescription] = useState('');
  const [expected, setExpected] = useState('');
  const [actual, setActual] = useState('');
  const [useAi, setUseAi] = useState(true);
  const [config, setConfig] = useState<ProjectConfig | null>(null);
  const [draftError, setDraftError] = useState<string | null>(null);

  // Tracks whether we've kicked off the on-open side-effects (config fetch)
  // for the current open. Reset on close so the next open re-runs them.
  const openTriggeredRef = useRef(false);
  const mountedRef = useRef(true);
  // Pending success-dismiss timer. Held in a ref so the manual close path
  // (`handleManualClose`) can clear it without waiting for the success
  // effect's dependency-driven cleanup — the user tapping Cancel during
  // the 2 s confirmation dwell would otherwise leave the timer to fire on
  // a hidden modal, double-invoking `onClose`.
  const successDismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!visible) {
      openTriggeredRef.current = false;
      return;
    }
    if (openTriggeredRef.current) return;
    openTriggeredRef.current = true;

    let cancelled = false;
    void (async () => {
      try {
        const cfg = await brevwick.getConfig();
        if (!cancelled && mountedRef.current && cfg) setConfig(cfg);
      } catch {
        // getConfig() never throws under contract; defensive — leave
        // config null so the AI toggle stays hidden.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [visible, brevwick]);

  // Auto-dismiss + draft reset on success. Runs after the user has had a
  // moment to read the "Sent ✓" confirmation. The cleanup clears the timer
  // if the status changes (rare edge: another submit kicks off before the
  // dwell elapses); the manual-close path below clears it explicitly via
  // `successDismissTimerRef` because tapping Cancel does NOT change
  // `status` and would otherwise leave the timer to fire on a hidden modal.
  useEffect(() => {
    if (status !== 'success') return;
    const id = setTimeout(() => {
      if (!mountedRef.current) return;
      successDismissTimerRef.current = null;
      setDescription('');
      setExpected('');
      setActual('');
      // `useAi` is part of the per-issue draft, not a sticky preference —
      // mirror the web React adapter and roll it back to its default so
      // the next issue starts from the project's render-policy baseline
      // (the toggle defaults to `true` on first render and is hidden
      // entirely unless `ai_submitter_choice_allowed`).
      setUseAi(true);
      setDraftError(null);
      reset();
      onClose();
    }, SUCCESS_DISMISS_DELAY_MS);
    successDismissTimerRef.current = id;
    return () => {
      clearTimeout(id);
      if (successDismissTimerRef.current === id) {
        successDismissTimerRef.current = null;
      }
    };
  }, [status, onClose, reset]);

  // Cancel / × / back-gesture — also clears any pending success-dismiss
  // timer so it cannot fire on the now-hidden modal and double-invoke
  // `onClose`. When the modal owns its hook (no `feedback` prop) AND the
  // user closes during the "Sent ✓" dwell, `status === 'success'` would
  // otherwise persist to the next open and render the form locked into
  // the terminal state. The FAB-driven path doesn't need this branch
  // because `FeedbackButton.handleClose` already calls `reset()` itself.
  const handleManualClose = useCallback(() => {
    if (successDismissTimerRef.current !== null) {
      clearTimeout(successDismissTimerRef.current);
      successDismissTimerRef.current = null;
    }
    if (ownsFeedback && status === 'success') {
      setDescription('');
      setExpected('');
      setActual('');
      setUseAi(true);
      setDraftError(null);
      reset();
    }
    onClose();
  }, [onClose, ownsFeedback, status, reset]);

  const showAiToggle =
    config?.ai_enabled === true && config.ai_submitter_choice_allowed === true;

  // Clear the inline draft-error as soon as the user resumes typing in
  // any of the three text fields. Mirrors the web React adapter's
  // composer behaviour where the "Please describe what happened." note
  // disappears the moment the user starts addressing it. Wrapped per
  // setter so the closure equality React uses for `onChangeText` props
  // stays stable across renders that don't change the field.
  const handleDescriptionChange = useCallback((next: string) => {
    setDescription(next);
    setDraftError(null);
  }, []);
  const handleExpectedChange = useCallback((next: string) => {
    setExpected(next);
    setDraftError(null);
  }, []);
  const handleActualChange = useCallback((next: string) => {
    setActual(next);
    setDraftError(null);
  }, []);

  const handleSubmit = useCallback(async () => {
    if (status === 'submitting' || status === 'success') return;
    if (!description.trim()) {
      setDraftError('Please describe what happened.');
      return;
    }
    setDraftError(null);
    const attachments: Array<Blob | FeedbackAttachment> = [];
    // Title derived from the first non-empty line of the trimmed draft so
    // leading whitespace doesn't pollute the issue title; description
    // itself is sent raw to preserve the user's intentional formatting.
    const derivedTitle = description.trim().split('\n', 1)[0]!.slice(0, 120);
    const input: FeedbackInput = {
      title: derivedTitle,
      description,
      expected: expected.trim() || undefined,
      actual: actual.trim() || undefined,
      attachments: attachments.length ? attachments : undefined,
      ...(showAiToggle ? { use_ai: useAi } : {}),
    };
    await submit(input);
  }, [status, description, expected, actual, showAiToggle, useAi, submit]);

  const handleRetry = useCallback(() => {
    setDraftError(null);
    void retry();
  }, [retry]);

  const submitting = status === 'submitting';
  const showRetry = status === 'error';
  const submitDisabled = submitting || status === 'success';
  const primaryLabel = submitButtonLabel(status, phase);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={handleManualClose}
    >
      <View
        style={styles.scrim}
        // Real iOS VoiceOver scopes accessibility focus to the topmost view
        // marked with `accessibilityViewIsModal`. RN's TS types accept the
        // prop on `View` already, but we only pass it on iOS — Android's
        // TalkBack uses a different prop family and ignores this one.
        {...(Platform.OS === 'ios' ? { accessibilityViewIsModal: true } : null)}
      >
        <View style={styles.card}>
          <View style={styles.headerRow}>
            <Text style={styles.title} accessibilityRole="header">
              Send feedback
            </Text>
            <Pressable
              onPress={handleManualClose}
              style={styles.closeButton}
              accessibilityLabel="Close feedback form"
              accessibilityRole="button"
            >
              <Text style={styles.closeLabel}>×</Text>
            </Pressable>
          </View>
          <ScrollView keyboardShouldPersistTaps="handled">
            <Text style={styles.fieldLabel}>What happened?</Text>
            <TextInput
              value={description}
              onChangeText={handleDescriptionChange}
              multiline
              placeholder="Describe the bug or feedback…"
              placeholderTextColor={palette.fgMuted}
              style={[styles.input, styles.descriptionInput]}
              accessibilityLabel="Feedback description"
              editable={!submitDisabled}
            />
            <Text style={styles.fieldLabel}>What did you expect?</Text>
            <TextInput
              value={expected}
              onChangeText={handleExpectedChange}
              placeholder="Optional"
              placeholderTextColor={palette.fgMuted}
              style={styles.input}
              accessibilityLabel="Expected behaviour"
              editable={!submitDisabled}
            />
            <Text style={styles.fieldLabel}>What actually happened?</Text>
            <TextInput
              value={actual}
              onChangeText={handleActualChange}
              placeholder="Optional"
              placeholderTextColor={palette.fgMuted}
              style={styles.input}
              accessibilityLabel="Actual behaviour"
              editable={!submitDisabled}
            />

            {showAiToggle ? (
              <View style={styles.toggleRow}>
                <Text style={styles.toggleLabel}>Format with AI</Text>
                <Switch
                  value={useAi}
                  onValueChange={setUseAi}
                  disabled={submitDisabled}
                  accessibilityLabel="Format with AI"
                />
              </View>
            ) : null}

            {draftError ? (
              <Text style={styles.errorText}>{draftError}</Text>
            ) : null}
            {!draftError && error ? (
              <Text style={styles.errorText}>{error.message}</Text>
            ) : null}
          </ScrollView>

          <View style={styles.actionsRow}>
            <Pressable
              onPress={handleManualClose}
              style={styles.secondaryButton}
              accessibilityLabel="Cancel"
              accessibilityRole="button"
              disabled={submitting}
            >
              <Text style={styles.secondaryLabel}>Cancel</Text>
            </Pressable>
            {showRetry ? (
              <Pressable
                onPress={handleRetry}
                style={styles.primaryButton}
                accessibilityLabel="Retry submission"
                accessibilityRole="button"
              >
                <Text style={styles.primaryLabel}>Try again</Text>
              </Pressable>
            ) : (
              <Pressable
                onPress={handleSubmit}
                style={[
                  styles.primaryButton,
                  submitDisabled && styles.primaryButtonDisabled,
                ]}
                accessibilityLabel={primaryLabel}
                accessibilityRole="button"
                disabled={submitDisabled}
              >
                {submitting ? (
                  <ActivityIndicator color={palette.accentFg} size="small" />
                ) : null}
                <Text style={styles.primaryLabel}>{primaryLabel}</Text>
              </Pressable>
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
}
