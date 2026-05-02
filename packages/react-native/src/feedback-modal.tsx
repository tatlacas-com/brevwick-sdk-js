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
import { useFeedback, type FeedbackPhase } from './use-feedback';
import {
  createWidgetStyles,
  resolvePalette,
  type BrevwickPalette,
  type BrevwickTheme,
} from './styles';

const SUCCESS_DISMISS_DELAY_MS = 2000;

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
}

/**
 * Drop-in feedback modal for React Native. Renders a slide-up sheet with
 * description / expected / actual fields, a screenshot preview with a skip
 * toggle, and a submit button driven by {@link useFeedback}.
 *
 * The draft state lives in component-local `useState`, so a Cancel or
 * back-gesture (which only flips `visible` to `false`) preserves the
 * draft for the next open. Successful submit clears the draft and calls
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
}: FeedbackModalProps): ReactElement {
  const brevwick = useBrevwick();
  const { submit, captureScreenshot, status, phase, error, retry, reset } =
    useFeedback();
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

  // Tracks whether we've kicked off the on-open side-effects (config fetch +
  // screenshot capture) for the current open. Reset on close so the next
  // open re-runs them with whatever the SDK and view-tree look like then.
  const openTriggeredRef = useRef(false);
  const mountedRef = useRef(true);
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
        const uri = await blobToDataUri(blob);
        if (cancelled || !mountedRef.current) return;
        setScreenshotUri(uri);
      } catch {
        // Capture failed — placeholder text covers the missing preview.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [visible, brevwick, captureScreenshot]);

  // Auto-dismiss + draft reset on success. Runs after the user has had a
  // moment to read the "Sent ✓" confirmation. The cleanup clears the timer
  // if the user manually closes the modal in the gap, so we don't fire
  // `onClose` on an already-closed sheet.
  useEffect(() => {
    if (status !== 'success') return;
    const id = setTimeout(() => {
      if (!mountedRef.current) return;
      setDescription('');
      setExpected('');
      setActual('');
      setIncludeScreenshot(true);
      setScreenshotBlob(null);
      setScreenshotUri(null);
      setDraftError(null);
      reset();
      onClose();
    }, SUCCESS_DISMISS_DELAY_MS);
    return () => clearTimeout(id);
  }, [status, onClose, reset]);

  const showAiToggle =
    config?.ai_enabled === true && config.ai_submitter_choice_allowed === true;

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
      onRequestClose={onClose}
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
              onPress={onClose}
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
              onChangeText={setDescription}
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
              onChangeText={setExpected}
              placeholder="Optional"
              placeholderTextColor={palette.fgMuted}
              style={styles.input}
              accessibilityLabel="Expected behaviour"
              editable={!submitDisabled}
            />
            <Text style={styles.fieldLabel}>What actually happened?</Text>
            <TextInput
              value={actual}
              onChangeText={setActual}
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
                    Screenshot will be captured on send.
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
              onPress={onClose}
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
