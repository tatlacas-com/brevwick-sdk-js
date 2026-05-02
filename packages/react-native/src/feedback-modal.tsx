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
  Image,
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
const SCREENSHOT_FAILURE_NOTE =
  "Couldn't attach screenshot — sending without one.";

/**
 * Convert a screenshot Blob to a `data:` URI suitable for `<Image source={{ uri }} />`.
 * Resolves to `null` if the FileReader API is missing (older Hermes builds —
 * unlikely on supported RN versions, but the typecheck stays defensive) or if
 * the read fails. The preview falls back to a placeholder Text in that case.
 */
function blobToDataUri(blob: Blob): Promise<string | null> {
  if (typeof FileReader === 'undefined') return Promise.resolve(null);
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result;
      resolve(typeof result === 'string' ? result : null);
    };
    reader.onerror = () => resolve(null);
    try {
      reader.readAsDataURL(blob);
    } catch {
      resolve(null);
    }
  });
}

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
 * description / expected / actual fields, a screenshot preview with a skip
 * toggle, and a submit button driven by {@link useFeedback}.
 *
 * The draft state lives in component-local `useState`, so a Cancel or
 * back-gesture (which only flips `visible` to `false`) preserves the
 * draft for the next open. This applies to BOTH the text fields
 * (description / expected / actual) AND the toggles (`includeScreenshot`,
 * `useAi`) — toggle state is treated as part of the draft and persists
 * across Cancel + reopen. Successful submit clears the draft and calls
 * `onClose` after a short confirmation delay.
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
  const { submit, captureScreenshot, status, phase, error, retry, reset } =
    feedback;
  const colorScheme = useColorScheme();
  const palette: BrevwickPalette = useMemo(
    () => resolvePalette(theme, colorScheme),
    [theme, colorScheme],
  );
  const styles = useMemo(() => createWidgetStyles(palette), [palette]);

  const [description, setDescription] = useState('');
  const [expected, setExpected] = useState('');
  const [actual, setActual] = useState('');
  const [includeScreenshot, setIncludeScreenshot] = useState(true);
  const [useAi, setUseAi] = useState(true);
  const [screenshotBlob, setScreenshotBlob] = useState<Blob | null>(null);
  const [screenshotUri, setScreenshotUri] = useState<string | null>(null);
  const [config, setConfig] = useState<ProjectConfig | null>(null);
  const [draftError, setDraftError] = useState<string | null>(null);
  const [screenshotNote, setScreenshotNote] = useState<string | null>(null);

  // Tracks whether we've kicked off the on-open side-effects (config fetch +
  // screenshot capture) for the current open. Reset on close so the next
  // open re-runs them with whatever the SDK and view-tree look like then.
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
    void (async () => {
      try {
        const blob = await captureScreenshot();
        if (cancelled || !mountedRef.current) return;
        setScreenshotBlob(blob);
        setScreenshotNote(null);
        const uri = await blobToDataUri(blob);
        if (cancelled || !mountedRef.current) return;
        setScreenshotUri(uri);
      } catch (err) {
        // Surface the failure to the user so they understand the submit
        // will go through without a screenshot. We also emit a single
        // `console.warn` matching the pattern in `screenshot.ts`'s
        // `logFailure` so device logs carry the diagnostic when capture
        // fails outside the SDK's own placeholder path.
        if (cancelled || !mountedRef.current) return;
        const reason = err instanceof Error ? `: ${err.message}` : '';
        globalThis.console?.warn?.(
          `brevwick: screenshot capture failed in FeedbackModal${reason}`,
        );
        setScreenshotNote(SCREENSHOT_FAILURE_NOTE);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [visible, brevwick, captureScreenshot]);

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
      setIncludeScreenshot(true);
      setScreenshotBlob(null);
      setScreenshotUri(null);
      setScreenshotNote(null);
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
  // `onClose`.
  const handleManualClose = useCallback(() => {
    if (successDismissTimerRef.current !== null) {
      clearTimeout(successDismissTimerRef.current);
      successDismissTimerRef.current = null;
    }
    onClose();
  }, [onClose]);

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
    if (includeScreenshot && screenshotBlob) {
      attachments.push({ blob: screenshotBlob, filename: 'screenshot.png' });
    }
    const input: FeedbackInput = {
      description,
      expected: expected.trim() || undefined,
      actual: actual.trim() || undefined,
      attachments: attachments.length ? attachments : undefined,
      ...(showAiToggle ? { use_ai: useAi } : {}),
    };
    await submit(input);
  }, [
    status,
    description,
    expected,
    actual,
    includeScreenshot,
    screenshotBlob,
    showAiToggle,
    useAi,
    submit,
  ]);

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

            <View style={styles.toggleRow}>
              <Text style={styles.toggleLabel}>Include screenshot</Text>
              <Switch
                value={includeScreenshot}
                onValueChange={setIncludeScreenshot}
                disabled={submitDisabled}
                accessibilityLabel="Include screenshot"
              />
            </View>

            {includeScreenshot ? (
              <View style={styles.screenshotPreview}>
                {screenshotUri ? (
                  <Image
                    source={{ uri: screenshotUri }}
                    style={styles.screenshotImage}
                    resizeMode="cover"
                    accessibilityLabel="Screenshot preview"
                  />
                ) : (
                  <Text style={styles.screenshotPlaceholder}>
                    {screenshotNote ?? 'Screenshot will be captured on send.'}
                  </Text>
                )}
              </View>
            ) : null}

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
