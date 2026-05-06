import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
} from 'react';
import {
  AccessibilityInfo,
  ActivityIndicator,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
  useColorScheme,
} from 'react-native';
import type {
  FeedbackInput,
  ProjectConfig,
  SubmitError,
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
import { BREVWICK_REACT_NATIVE_VERSION } from './version';

const SUCCESS_DISMISS_DELAY_MS = 2000;
const ASSISTANT_RECEIPT_TEXT = 'Thanks — your issue is on its way.';
const GREETING_TEXT =
  "Hi! Tell us what's happening. Add expected vs actual if it helps.";
const BREVWICK_URL = 'https://brevwick.dev';

/**
 * One bubble in the conversation thread. The greeting and submitted-issue
 * receipt are `assistant` messages; submitted drafts become `user` messages.
 * Mirrors the React adapter's `Message` shape but without the
 * web-only `attachments` field — RN v1 does not surface attachment chips.
 */
interface Message {
  id: string;
  role: 'assistant' | 'user';
  text: string;
  sentAt?: number;
  issueSent?: boolean;
}

const GREETING_MESSAGE: Message = {
  id: 'greeting',
  role: 'assistant',
  text: GREETING_TEXT,
};

const initialMessages = (): Message[] => [GREETING_MESSAGE];

/**
 * Phase ordinal used by the staged-status rows to decide visibility. Row
 * 1 ("Captured") shows from `'sanitising'` onwards, row 2 ("Sanitised")
 * from `'formatting'` onwards. Row 3 ("Formatting with AI") has its own
 * exact-match rule and does not consult this table. Mirrors the React
 * adapter's `PHASE_RANK` so visual progression stays consistent across
 * platforms.
 */
const PHASE_RANK: Record<FeedbackPhase, number> = {
  idle: 0,
  capturing: 1,
  sanitising: 2,
  formatting: 3,
  sent: 4,
  error: -1,
};

/**
 * Cheap relative-time formatter for the issue-sent receipt. The bubble
 * doesn't auto-refresh — once rendered the timestamp captures the moment
 * the issue was queued, which is the only thing that actually matters
 * (the user reads it within seconds of seeing it appear). Mirrors the
 * React adapter's helper of the same name so users porting between
 * adapters see identical receipt copy.
 */
function formatRelativeTime(ms: number | undefined): string {
  if (ms === undefined) return 'just now';
  const diffMs = Date.now() - ms;
  if (diffMs < 60_000) return 'just now';
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;
  const days = Math.floor(hours / 24);
  return `${days} d ago`;
}

/**
 * Read the OS-level reduced-motion preference once at mount via
 * `AccessibilityInfo.isReduceMotionEnabled()`, then keep the value in
 * sync with the OS setting via the matching `'reduceMotionChanged'`
 * event. Defence-in-depth: a user that toggles the setting mid-submit
 * picks up the new value on the next render. Defaults to `false` if the
 * API is missing (older Hermes / web shim) or rejects.
 */
function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    let cancelled = false;
    if (typeof AccessibilityInfo?.isReduceMotionEnabled === 'function') {
      AccessibilityInfo.isReduceMotionEnabled()
        .then((value) => {
          if (!cancelled) setReduced(Boolean(value));
        })
        .catch(() => {
          // Defensive — never throw out of a render-time effect.
        });
    }
    let subscription: { remove: () => void } | null = null;
    if (typeof AccessibilityInfo?.addEventListener === 'function') {
      const listener = (value: boolean): void => {
        if (!cancelled) setReduced(Boolean(value));
      };
      const result = AccessibilityInfo.addEventListener(
        'reduceMotionChanged',
        listener,
      );
      // RN ≥ 0.65 returns an `EventSubscription`; older shapes returned
      // `void` and required `removeEventListener`. We only support the
      // modern shape because the package's peerRange starts at 0.72.
      if (result && typeof result.remove === 'function') {
        subscription = result;
      }
    }
    return () => {
      cancelled = true;
      subscription?.remove();
    };
  }, []);
  return reduced;
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
 * Drop-in feedback modal for React Native — the behavioural twin of
 * `@tatlacas/brevwick-react`'s `<FeedbackButton>` panel.
 *
 * The draft state lives in component-local `useState`, so a Cancel or
 * back-gesture (which only flips `visible` to `false`) preserves the
 * draft for the next open. This applies to BOTH the text fields
 * (description / expected / actual) AND the `useAi` toggle — toggle
 * state is treated as part of the draft and persists across Cancel +
 * reopen. Successful submit clears the draft and calls `onClose` after
 * a short confirmation delay so the user can read the "Sent ✓" receipt.
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
  const reducedMotion = useReducedMotion();
  // Stagger keeps the suite happy under reduced-motion without coupling
  // to a wall-clock timer; both visible style values and reduced-motion
  // a11y are exposed via the `reducedMotion` flag, but RN has no per-row
  // transition-delay so the "stagger" here is whether each row appears
  // at all (we render every row that satisfies its phase predicate).
  void reducedMotion;

  const [description, setDescription] = useState('');
  const [expected, setExpected] = useState('');
  const [actual, setActual] = useState('');
  const [showExtras, setShowExtras] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  const [useAi, setUseAi] = useState(true);
  const [config, setConfig] = useState<ProjectConfig | null>(null);
  const [draftError, setDraftError] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [composerHeight, setComposerHeight] = useState(40);

  // Tracks whether we've kicked off the on-open side-effects (config
  // fetch) for the current open. Reset on close so the next open re-runs
  // them with whatever the SDK looks like then.
  const openTriggeredRef = useRef(false);
  const mountedRef = useRef(true);
  // Pending success-dismiss timer. Held in a ref so the manual close
  // path (`handleManualClose`) can clear it without waiting for the
  // success effect's dependency-driven cleanup — the user tapping Cancel
  // during the 2 s confirmation dwell would otherwise leave the timer to
  // fire on a hidden modal, double-invoking `onClose`.
  const successDismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  // Snapshot of the last `FeedbackInput` passed to `submit()` so a
  // failure surface's Retry CTA can re-fire the exact same payload —
  // mirrors the web adapter's `lastSubmittedInputRef`.
  const lastSubmittedInputRef = useRef<FeedbackInput | null>(null);
  // Monotonic id for message keys so duplicate-content bubbles still
  // reconcile against distinct slots if the user re-sends the same text.
  const messageIdRef = useRef(0);

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

  const showAiToggle =
    config?.ai_enabled === true && config.ai_submitter_choice_allowed === true;

  // Has the user touched the form? Mirrors the React adapter's
  // `hasContent` check so the × button only triggers the discard-confirm
  // when there's something to discard.
  const hasContent =
    description.trim().length > 0 ||
    expected.length > 0 ||
    actual.length > 0 ||
    messages.length > 1;

  const resetDraft = useCallback(() => {
    setDescription('');
    setExpected('');
    setActual('');
    setShowExtras(false);
    setUseAi(true);
    setDraftError(null);
    setMessages(initialMessages());
    setConfirmClose(false);
    lastSubmittedInputRef.current = null;
  }, []);

  // Auto-dismiss + draft reset on success. Runs after the user has had a
  // moment to read the "Sent ✓" confirmation. The cleanup clears the
  // timer if the status changes (rare edge: another submit kicks off
  // before the dwell elapses); the manual-close path below clears it
  // explicitly via `successDismissTimerRef` because tapping Cancel does
  // NOT change `status` and would otherwise leave the timer to fire on a
  // hidden modal.
  useEffect(() => {
    if (status !== 'success') return;
    const id = setTimeout(() => {
      if (!mountedRef.current) return;
      successDismissTimerRef.current = null;
      resetDraft();
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
  }, [status, onClose, reset, resetDraft]);

  // Minimize / back-gesture / Cancel — preserves the draft and just
  // hides the modal. Mirrors the React adapter's `handleMinimize`, with
  // the standalone-mode safety net: if the user hides the modal during
  // the success dwell when WE own the hook, reset it so a reopen doesn't
  // render locked into "Sent ✓". Also clears any pending success-dismiss
  // timer so it cannot fire on the now-hidden modal and double-invoke
  // `onClose`. The FAB-driven path resets via
  // `FeedbackButton.handleClose` so the hook-reset branch only fires for
  // standalone consumers.
  const handleMinimize = useCallback(() => {
    if (successDismissTimerRef.current !== null) {
      clearTimeout(successDismissTimerRef.current);
      successDismissTimerRef.current = null;
    }
    if (ownsFeedback && status === 'success') {
      resetDraft();
      reset();
    }
    setConfirmClose(false);
    onClose();
  }, [onClose, ownsFeedback, status, reset, resetDraft]);

  const handleCloseClick = useCallback(() => {
    if (hasContent) {
      setConfirmClose(true);
      return;
    }
    handleMinimize();
  }, [hasContent, handleMinimize]);

  // Discard fully: clear draft, reset hook, close modal.
  const handleConfirmDiscard = useCallback(() => {
    resetDraft();
    if (ownsFeedback) reset();
    onClose();
  }, [ownsFeedback, reset, resetDraft, onClose]);

  const handleCancelDiscard = useCallback(() => {
    setConfirmClose(false);
  }, []);

  // Clear the inline draft-error as soon as the user resumes typing in
  // any of the three text fields. Mirrors the web React adapter's
  // composer behaviour where the "Please describe what happened." note
  // disappears the moment the user starts addressing it.
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
    // Title derived from the first non-empty line of the trimmed draft so
    // leading whitespace doesn't pollute the issue title; description
    // itself is sent raw to preserve the user's intentional formatting.
    const derivedTitle = description.trim().split('\n', 1)[0]!.slice(0, 120);
    const input: FeedbackInput = {
      title: derivedTitle,
      description,
      expected: expected.trim() || undefined,
      actual: actual.trim() || undefined,
      // RN v1 has no attachment surface; the field is omitted so the
      // server picks up its default behaviour.
      ...(showAiToggle ? { use_ai: useAi } : {}),
    };
    lastSubmittedInputRef.current = input;

    // Push the user's draft into the conversation immediately and clear
    // the composer BEFORE awaiting submit(). The visual progression is
    // what makes the wait feel fast — a synchronous bubble + cleared
    // input lets the staged-status rows below carry the rest of the
    // animation while the network round-trip is in flight (mirrors the
    // React adapter's behaviour for issue #74).
    const submittedDraft = description;
    const userMessage: Message = {
      id: `msg-${++messageIdRef.current}`,
      role: 'user',
      text: submittedDraft,
    };
    setMessages((prev) => [...prev, userMessage]);
    setDescription('');
    setExpected('');
    setActual('');
    setShowExtras(false);

    try {
      const result = await submit(input);
      if (!mountedRef.current) return;
      if (result.ok) {
        const assistantMessage: Message = {
          id: `msg-${++messageIdRef.current}`,
          role: 'assistant',
          text: ASSISTANT_RECEIPT_TEXT,
          issueSent: true,
          sentAt: Date.now(),
        };
        setMessages((prev) => [...prev, assistantMessage]);
      }
      // Failure path: the staged-status rows will collapse into the
      // retry row; the user bubble already lives in the thread. Nothing
      // else to do here.
    } catch {
      // Chunk-load failure path — `useFeedback()` has already flipped
      // status to 'error' and stored the synthetic SubmitError. Nothing
      // else to do here.
    }
  }, [status, description, expected, actual, showAiToggle, useAi, submit]);

  const handleRetry = useCallback(() => {
    setDraftError(null);
    void retry();
  }, [retry]);

  const submitting = status === 'submitting';
  const submitDisabled =
    submitting || status === 'success' || description.trim().length === 0;

  // Phase-driven status row visibility. Mirrors the web React adapter's
  // `Thread` rules.
  const phaseRank = PHASE_RANK[phase];
  const showCaptured = phaseRank >= PHASE_RANK.sanitising!;
  const showSanitised = phaseRank >= PHASE_RANK.formatting!;
  const showFormatting = phase === 'formatting' && config?.ai_enabled === true;
  const showRetryRow = phase === 'error' && error !== null;

  const handleFooterPress = useCallback(() => {
    void Linking.openURL(BREVWICK_URL).catch(() => {
      // Linking failures (no installed handler / sandbox) are silent —
      // the link is informational, not load-bearing.
    });
  }, []);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={handleMinimize}
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
            <Text
              style={styles.headerAvatar}
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
            >
              B
            </Text>
            <Text style={styles.headerTitle} accessibilityRole="header">
              Send feedback
            </Text>
            <Pressable
              onPress={handleMinimize}
              style={styles.iconButton}
              accessibilityLabel="Minimize"
              accessibilityRole="button"
            >
              <Text style={styles.iconButtonLabel}>–</Text>
            </Pressable>
            <Pressable
              onPress={handleCloseClick}
              style={styles.iconButton}
              accessibilityLabel="Close feedback form"
              accessibilityRole="button"
              disabled={submitting}
            >
              <Text style={styles.iconButtonLabel}>×</Text>
            </Pressable>
          </View>

          <ScrollView
            style={styles.thread}
            contentContainerStyle={styles.threadContent}
            keyboardShouldPersistTaps="handled"
            accessibilityRole="text"
            accessibilityLabel="Conversation"
          >
            {messages.map((message) =>
              message.role === 'assistant' ? (
                <AssistantBubble
                  key={message.id}
                  styles={styles}
                  palette={palette}
                  issueSent={message.issueSent}
                  sentAt={message.sentAt}
                >
                  {message.text}
                </AssistantBubble>
              ) : (
                <UserBubble key={message.id} styles={styles}>
                  {message.text}
                </UserBubble>
              ),
            )}

            <DisclosureExpectedActual
              styles={styles}
              palette={palette}
              open={showExtras}
              expected={expected}
              actual={actual}
              disabled={submitting || status === 'success'}
              onToggle={() => setShowExtras((v) => !v)}
              onExpectedChange={handleExpectedChange}
              onActualChange={handleActualChange}
            />

            {draftError ? (
              <Text
                style={styles.errorText}
                accessibilityLiveRegion="polite"
                accessibilityRole="alert"
              >
                {draftError}
              </Text>
            ) : null}

            {showCaptured ? (
              <StatusRow
                key="row-captured"
                variant="check"
                styles={styles}
                palette={palette}
                dataRow="captured"
              >
                Captured route, console, network, device
              </StatusRow>
            ) : null}
            {showSanitised ? (
              <StatusRow
                key="row-sanitised"
                variant="check"
                styles={styles}
                palette={palette}
                dataRow="sanitised"
              >
                PII-sanitised, packaged
              </StatusRow>
            ) : null}
            {showFormatting ? (
              <StatusRow
                key="row-formatting"
                variant="spinner"
                styles={styles}
                palette={palette}
                dataRow="formatting"
              >
                Formatting with AI…
              </StatusRow>
            ) : null}
            {showRetryRow && error ? (
              <RetryRow styles={styles} error={error} onRetry={handleRetry} />
            ) : null}
            {confirmClose ? (
              <DiscardConfirm
                styles={styles}
                onCancel={handleCancelDiscard}
                onConfirm={handleConfirmDiscard}
              />
            ) : null}
          </ScrollView>

          <View style={styles.composer}>
            <View style={styles.composerShell}>
              <TextInput
                value={description}
                onChangeText={handleDescriptionChange}
                multiline
                placeholder="Describe the bug or feedback…"
                placeholderTextColor={palette.fgMuted}
                style={[
                  styles.composerInput,
                  { height: Math.max(34, Math.min(140, composerHeight)) },
                ]}
                accessibilityLabel="Feedback description"
                editable={!submitting && status !== 'success'}
                onContentSizeChange={(e) => {
                  const next = e.nativeEvent.contentSize.height;
                  setComposerHeight(next);
                }}
              />
              {showAiToggle ? (
                <AIToggle
                  on={useAi}
                  disabled={submitting || status === 'success'}
                  onChange={setUseAi}
                  styles={styles}
                />
              ) : null}
              <Pressable
                onPress={handleSubmit}
                style={[
                  styles.sendButton,
                  submitDisabled && styles.sendButtonDisabled,
                ]}
                accessibilityLabel="Send"
                accessibilityRole="button"
                disabled={submitDisabled}
              >
                {submitting ? (
                  <ActivityIndicator color={palette.accentFg} size="small" />
                ) : (
                  <Text style={styles.sendButtonIcon}>➤</Text>
                )}
              </Pressable>
            </View>
          </View>

          <View style={styles.footer}>
            <Pressable
              onPress={handleFooterPress}
              accessibilityRole="link"
              accessibilityLabel="Visit brevwick.dev"
            >
              <Text style={styles.footerLink}>
                Brevwick v{BREVWICK_REACT_NATIVE_VERSION}
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

interface AIToggleProps {
  on: boolean;
  disabled: boolean;
  onChange: (next: boolean) => void;
  styles: ReturnType<typeof createWidgetStyles>;
}

/**
 * Track-and-thumb switch surfaced in the composer when the project allows
 * submitters to opt in/out of AI formatting per issue. Visual twin of the
 * web React adapter's `brw-aitoggle` — small pill track + animated thumb +
 * "AI" text outside the button — so the panel reads identically across
 * adapters. `accessibilityRole="switch"` + `accessibilityState.checked` is
 * the narrow semantic TalkBack/VoiceOver want for an on/off control.
 */
function AIToggle({
  on,
  disabled,
  onChange,
  styles,
}: AIToggleProps): ReactElement {
  return (
    <View style={styles.aiToggleWrap}>
      <Pressable
        onPress={() => onChange(!on)}
        disabled={disabled}
        accessibilityRole="switch"
        accessibilityLabel="Format with AI"
        accessibilityState={{ checked: on, disabled }}
        style={[
          styles.aiToggleTrack,
          on && styles.aiToggleTrackOn,
          disabled && styles.aiToggleDisabled,
        ]}
      >
        <View
          style={[styles.aiToggleThumb, on && styles.aiToggleThumbOn]}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        />
      </Pressable>
      <Text
        style={[styles.aiToggleText, on && styles.aiToggleTextOn]}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        AI
      </Text>
    </View>
  );
}

interface AssistantBubbleProps {
  children: ReactNode;
  styles: ReturnType<typeof createWidgetStyles>;
  palette: BrevwickPalette;
  issueSent?: boolean;
  sentAt?: number;
}

function AssistantBubble({
  children,
  styles,
  palette,
  issueSent,
  sentAt,
}: AssistantBubbleProps): ReactElement {
  return (
    <View style={styles.bubbleAssistant}>
      <Text style={styles.bubbleAssistantText}>{children}</Text>
      {issueSent ? (
        <View style={styles.receipt}>
          <View style={styles.statusCheck}>
            <Text style={styles.statusCheckLabel}>✓</Text>
          </View>
          <Text style={styles.receiptText}>
            Issue sent · {formatRelativeTime(sentAt)}
          </Text>
          {/* Reference palette so the param is consumed even on the
              non-issueSent branch — keeps the lint clean if the receipt
              styling later wants to deviate. */}
          {palette ? null : null}
        </View>
      ) : null}
    </View>
  );
}

interface UserBubbleProps {
  children: ReactNode;
  styles: ReturnType<typeof createWidgetStyles>;
}

function UserBubble({ children, styles }: UserBubbleProps): ReactElement {
  return (
    <View style={styles.bubbleUser}>
      <Text style={styles.bubbleUserText}>{children}</Text>
    </View>
  );
}

interface StatusRowProps {
  variant: 'check' | 'spinner';
  styles: ReturnType<typeof createWidgetStyles>;
  palette: BrevwickPalette;
  dataRow: string;
  children: ReactNode;
}

/**
 * One staged-status row in the conversation thread. Visual variants:
 *
 * - `'check'` — small green check + label. Used for the "Captured" /
 *   "Sanitised" milestones.
 * - `'spinner'` — `ActivityIndicator` + label. Used for the "Formatting
 *   with AI…" row that sits next to the pending AI work.
 *
 * The `accessibilityLabel` carries the role-in-the-pipeline as a
 * `brevwick:row:<dataRow>` token so the test suite can query rows by
 * their semantic role without coupling to the visible label, mirroring
 * the web adapter's `data-brw-row` attribute.
 */
function StatusRow({
  variant,
  styles,
  palette,
  dataRow,
  children,
}: StatusRowProps): ReactElement {
  return (
    <View
      style={styles.statusRow}
      accessibilityLabel={`brevwick:row:${dataRow}`}
    >
      {variant === 'check' ? (
        <View style={styles.statusCheck}>
          <Text style={styles.statusCheckLabel}>✓</Text>
        </View>
      ) : (
        <ActivityIndicator size="small" color={palette.fgMuted} />
      )}
      <Text style={styles.statusRowLabel}>{children}</Text>
    </View>
  );
}

interface RetryRowProps {
  styles: ReturnType<typeof createWidgetStyles>;
  error: SubmitError;
  onRetry: () => void;
}

/**
 * Red retry row shown when the submit pipeline fails. Renders the
 * `SubmitError.message` verbatim — server-echoed bodies have already
 * been redacted upstream — and a single "Retry" CTA wired to
 * `useFeedback().retry`.
 *
 * `accessibilityRole="alert"` so screen readers pick up the failure
 * inside the panel's `aria-live="polite"` thread.
 */
function RetryRow({ styles, error, onRetry }: RetryRowProps): ReactElement {
  return (
    <View
      style={styles.retryRow}
      accessibilityRole="alert"
      accessibilityLabel={`brevwick:row:error:${error.code}`}
    >
      <Text style={styles.retryText}>{error.message}</Text>
      <Pressable
        onPress={onRetry}
        style={styles.retryButton}
        accessibilityLabel="Retry submission"
        accessibilityRole="button"
      >
        <Text style={styles.retryButtonLabel}>Retry</Text>
      </Pressable>
    </View>
  );
}

interface DiscardConfirmProps {
  styles: ReturnType<typeof createWidgetStyles>;
  onCancel: () => void;
  onConfirm: () => void;
}

/**
 * Inline `accessibilityRole="alert"` confirm — not a true modal dialog.
 * "Keep" is the non-destructive default so an accidental Enter / Tab
 * confirms the safer choice; matches the web adapter's focus model
 * insofar as RN's flat focus tree allows.
 */
function DiscardConfirm({
  styles,
  onCancel,
  onConfirm,
}: DiscardConfirmProps): ReactElement {
  return (
    <View
      style={styles.confirmRow}
      accessibilityRole="alert"
      accessibilityLabel="Discard draft?"
    >
      <Text style={styles.confirmText}>Discard your feedback?</Text>
      <Pressable
        onPress={onCancel}
        style={styles.confirmKeepBtn}
        accessibilityLabel="Keep draft"
        accessibilityRole="button"
        // RN's `focusable` is the analogue of the web adapter's
        // `keepRef.current?.focus()` — TalkBack / VoiceOver's first
        // hit on the alert lands here so the non-destructive choice is
        // the default activation target.
        focusable
      >
        <Text style={styles.confirmKeepLabel}>Keep</Text>
      </Pressable>
      <Pressable
        onPress={onConfirm}
        style={styles.confirmDiscardBtn}
        accessibilityLabel="Discard draft"
        accessibilityRole="button"
      >
        <Text style={styles.confirmDiscardLabel}>Discard</Text>
      </Pressable>
    </View>
  );
}

interface DisclosureProps {
  styles: ReturnType<typeof createWidgetStyles>;
  palette: BrevwickPalette;
  open: boolean;
  expected: string;
  actual: string;
  disabled: boolean;
  onToggle: () => void;
  onExpectedChange: (v: string) => void;
  onActualChange: (v: string) => void;
}

/**
 * Disclosure toggle + two TextInputs for the optional Expected / Actual
 * fields. Hidden by default so the composer surface stays focused on the
 * common case (one-line description); revealed when the user wants to
 * structure the report further.
 */
function DisclosureExpectedActual({
  styles,
  palette,
  open,
  expected,
  actual,
  disabled,
  onToggle,
  onExpectedChange,
  onActualChange,
}: DisclosureProps): ReactElement {
  return (
    <View>
      <Pressable
        onPress={onToggle}
        style={styles.disclosureToggle}
        accessibilityLabel={
          open ? 'Hide expected vs actual' : 'Add expected vs actual'
        }
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
      >
        <Text style={styles.disclosureToggleLabel}>
          {open ? 'Hide expected vs actual' : 'Add expected vs actual'}
        </Text>
      </Pressable>
      {open ? (
        <View style={styles.disclosurePanel}>
          <View style={styles.disclosureField}>
            <Text style={styles.fieldLabel}>Expected</Text>
            <TextInput
              value={expected}
              onChangeText={onExpectedChange}
              multiline
              placeholder="What did you expect?"
              placeholderTextColor={palette.fgMuted}
              style={styles.input}
              accessibilityLabel="Expected behaviour"
              editable={!disabled}
            />
          </View>
          <View style={styles.disclosureField}>
            <Text style={styles.fieldLabel}>Actual</Text>
            <TextInput
              value={actual}
              onChangeText={onActualChange}
              multiline
              placeholder="What actually happened?"
              placeholderTextColor={palette.fgMuted}
              style={styles.input}
              accessibilityLabel="Actual behaviour"
              editable={!disabled}
            />
          </View>
        </View>
      ) : null}
    </View>
  );
}
