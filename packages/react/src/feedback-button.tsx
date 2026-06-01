'use client';

import * as Dialog from '@radix-ui/react-dialog';
import {
  forwardRef,
  useCallback,
  useEffect,
  useId,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactElement,
  type ReactNode,
} from 'react';
import type {
  FeedbackAttachment,
  FeedbackInput,
  ProjectConfig,
  SubmitError,
  SubmitResult,
} from '@tatlacas/brevwick-sdk';
import { useBrevwickInternal } from './context';
import { useFeedback, type FeedbackPhase } from './use-feedback';
import {
  BREVWICK_CSS,
  BREVWICK_STYLE_ID,
  COMPOSER_MAX_HEIGHT_PX,
} from './styles';

declare const __BREVWICK_REACT_VERSION__: string;

/**
 * Stable snapshot of one attachment that rode along with a submit. We store
 * only the underlying `Blob` so the success path can drop the live composer
 * URLs without leaving dangling references on the message bubble. A future
 * render that wants to preview the attachment can call
 * `URL.createObjectURL(blob)` itself.
 */
interface MessageAttachment {
  blob: Blob;
  filename?: string;
}

/**
 * One bubble in the conversation thread. The greeting and submitted-issue
 * receipt are `assistant` messages; submitted drafts become `user` messages.
 * `attachments` snapshots the files that rode along with the submit so a
 * follow-up render can show what was sent (currently the bubble itself
 * just shows text, but the field is there for forward-compat).
 */
interface Message {
  id: string;
  role: 'assistant' | 'user';
  text: string;
  sentAt?: number;
  issueSent?: boolean;
  attachments?: {
    files?: readonly MessageAttachment[];
  };
  /**
   * The exact, post-redaction payload the SDK POSTed for this message — set
   * only when the host enabled `config.debug` (the SDK returns it on
   * `SubmitResult.debug.payload`). When present, the bubble renders a
   * "copy raw payload" affordance so a developer can inspect everything that
   * left the device, including the rings/context the widget never shows.
   */
  rawPayload?: Record<string, unknown>;
}

/**
 * File-attachment cap, mirrored from the SDK's `MAX_ATTACHMENT_COUNT` in
 * `packages/sdk/src/submit.ts`. Enforced in the UI by disabling the
 * file-attach button once the total reaches this ceiling — that way the
 * user can't queue an attachment the SDK would reject downstream.
 */
const MAX_ATTACHMENTS = 5;

const GREETING_MESSAGE: Message = {
  id: 'greeting',
  role: 'assistant',
  text: "Hi! Tell us what's happening.",
};

const initialMessages = (): Message[] => [GREETING_MESSAGE];

const ASSISTANT_RECEIPT_TEXT = 'Thanks — your issue is on its way.';

/**
 * Forced-palette choice for {@link FeedbackButton}. `'system'` defers to the
 * OS-level `prefers-color-scheme` media query (the default and pre-existing
 * behaviour); `'light'` / `'dark'` override it regardless of the OS setting.
 */
export type BrevwickTheme = 'light' | 'dark' | 'system';

/**
 * Props for {@link FeedbackButton}. See SDD § 12 for the React contract.
 */
export interface FeedbackButtonProps {
  /** Corner the FAB pins to. Default `'bottom-right'`. */
  position?: 'bottom-right' | 'bottom-left';
  /** When true, the FAB renders as disabled and cannot open the dialog. */
  disabled?: boolean;
  /** When true, the component renders nothing. Useful for feature-flagging. */
  hidden?: boolean;
  /** Additional class appended to the FAB and dialog root for styling overrides. */
  className?: string;
  /** FAB label. Default `'Feedback'`. */
  label?: ReactNode;
  /**
   * Force a palette regardless of the OS `prefers-color-scheme` setting.
   * Default `'system'` — the widget follows the OS.
   *
   * Host-level `:root { --brw-*: ... }` overrides still win over the
   * forced palette because the stylesheet consumes each public token
   * via `var(--brw-X, var(--brw-X-base))`: the forced-theme blocks
   * rewrite only `--brw-X-base`, never the public `--brw-X`. So
   * `theme="dark"` picks the base palette and a consumer-set
   * `--brw-accent: hotpink` still wins for the accent.
   */
  theme?: BrevwickTheme;
  /** Fired with the SDK's `SubmitResult` after every submit (success or failure). */
  onSubmit?: (result: SubmitResult) => void;
}

const useIsomorphicLayoutEffect =
  typeof window !== 'undefined' ? useLayoutEffect : useEffect;

/**
 * Read `prefers-reduced-motion: reduce` once at mount. The widget keys row
 * stagger off this so a user with the OS-level reduced-motion setting sees
 * all status rows mount at once instead of cascading in.
 *
 * Read at mount only — the spec is an at-render snapshot, and a user that
 * toggles the OS setting mid-submit will pick up the new value on the
 * next interaction (or panel open). SSR-safe: returns `false` when
 * `window.matchMedia` is unavailable.
 */
function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    setReduced(window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }, []);
  return reduced;
}

/**
 * Injects the bundled <style> tag on first mount. The DOM probe by id is
 * the single source of truth: React does not dedupe `<style>` by id, so the
 * guard prevents duplicates when multiple <FeedbackButton>s mount, and it is
 * robust under Fast Refresh / HMR (which would otherwise read a stale
 * module-level flag against a teardown'd style node).
 */
function useBrevwickStyles(): void {
  useIsomorphicLayoutEffect(() => {
    if (typeof document === 'undefined') return;
    if (document.getElementById(BREVWICK_STYLE_ID)) return;
    const el = document.createElement('style');
    el.id = BREVWICK_STYLE_ID;
    el.textContent = BREVWICK_CSS;
    document.head.appendChild(el);
  }, []);
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} kB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

type ProjectConfigStatus = 'idle' | 'loading' | 'ready' | 'error';

interface ProjectConfigState {
  status: ProjectConfigStatus;
  config: ProjectConfig | null;
}

/**
 * Lazy project-config fetch, triggered on the FIRST panel open for the
 * lifetime of this FeedbackButton. Subsequent opens reuse the in-memory
 * result — the core SDK also caches per session, so the second call would
 * be a no-op anyway, but tracking here avoids an extra awaited microtask
 * on every open.
 *
 * Explicitly does NOT fetch on mount — the widget's "zero-cost until
 * opened" property must hold for users who never engage the FAB.
 */
function useProjectConfig(open: boolean): ProjectConfigState {
  const { brevwick } = useBrevwickInternal();
  const triggeredRef = useRef(false);
  const [state, setState] = useState<ProjectConfigState>({
    status: 'idle',
    config: null,
  });

  useEffect(() => {
    if (!open) return;
    if (triggeredRef.current) return;
    triggeredRef.current = true;

    let cancelled = false;
    setState({ status: 'loading', config: null });
    brevwick
      .getConfig()
      .then((config) => {
        if (cancelled) return;
        setState({ status: 'ready', config });
      })
      .catch(() => {
        if (cancelled) return;
        // getConfig never rejects in the documented contract, but we stay
        // defensive so a future regression cannot wedge the widget in
        // 'loading' forever.
        setState({ status: 'error', config: null });
      });

    return () => {
      cancelled = true;
    };
  }, [brevwick, open]);

  return state;
}

/**
 * Monotonic id attached to each uploaded file at insert time. Using `name` or
 * the index as the React key would cause duplicate-named files or removals
 * of middle items to reconcile surviving chips against the wrong slots.
 */
interface FileAttachment {
  readonly id: number;
  readonly file: File;
}

/**
 * Brevwick feedback widget — a FAB plus a dialog-based submission form.
 *
 * ## Theming
 *
 * The widget exposes a set of CSS custom properties (`--brw-*`) that any
 * ancestor can override to re-theme without a rebuild. Light defaults ship
 * out of the box; a `@media (prefers-color-scheme: dark)` block swaps the
 * palette when the host OS is in dark mode. The {@link FeedbackButtonProps.theme}
 * prop can force `'light'` or `'dark'` regardless of the OS setting.
 *
 * @see SDD § 12 for the React contract.
 */
export function FeedbackButton({
  position = 'bottom-right',
  disabled = false,
  hidden = false,
  className,
  label = 'Feedback',
  theme = 'system',
  onSubmit,
}: FeedbackButtonProps): ReactElement | null {
  const {
    submit,
    status,
    phase,
    error: submitErrorTagged,
    reset,
  } = useFeedback();
  const reducedMotion = usePrefersReducedMotion();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const [expected, setExpected] = useState('');
  const [actual, setActual] = useState('');
  const [showExtras, setShowExtras] = useState(false);
  const [files, setFiles] = useState<readonly FileAttachment[]>([]);
  const [confirmClose, setConfirmClose] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  // Submitter's per-issue AI preference. Defaults to true so the toggle
  // renders "on" the first time; only read on submit when the render-policy
  // matrix below says the toggle should be visible.
  const [useAi, setUseAi] = useState(true);
  const mountedRef = useRef(true);
  const fileIdRef = useRef(0);
  const messageIdRef = useRef(0);
  // Snapshot of the last `FeedbackInput` passed to `submit()` so the
  // retry CTA on a failed submit can re-run with the exact same payload
  // without forcing the user to re-type the draft we cleared on Send.
  const lastSubmittedInputRef = useRef<FeedbackInput | null>(null);
  // Id of the user bubble for the most recent submit, so the retry path can
  // re-attach a freshly composed `rawPayload` to the same bubble (retry
  // recomposes the payload from current ring snapshots).
  const lastUserMessageIdRef = useRef<string | null>(null);

  useBrevwickStyles();

  const projectConfig = useProjectConfig(open);
  // Render-policy matrix, SDD § 12. The toggle is visible exactly when the
  // config has loaded successfully, AI is enabled for the project, AND the
  // admin has opted submitters into the choice. Any other state (loading,
  // error, disabled, admin-forced) hides the toggle and the payload omits
  // `use_ai` so the server-side default applies.
  const showAiToggle =
    projectConfig.status === 'ready' &&
    projectConfig.config?.ai_enabled === true &&
    projectConfig.config.ai_submitter_choice_allowed === true;

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const attachmentsAtCap = files.length >= MAX_ATTACHMENTS;

  const hasContent =
    draft.trim().length > 0 ||
    expected.length > 0 ||
    actual.length > 0 ||
    files.length > 0;

  const resetAll = useCallback(() => {
    setDraft('');
    setExpected('');
    setActual('');
    setShowExtras(false);
    setFiles([]);
    setConfirmClose(false);
    setSubmitError(null);
    setMessages(initialMessages());
    setUseAi(true);
    lastSubmittedInputRef.current = null;
    reset();
  }, [reset]);

  const handleFullClose = useCallback(() => {
    setOpen(false);
    resetAll();
  }, [resetAll]);

  const handleMinimize = useCallback(() => {
    setOpen(false);
    setConfirmClose(false);
    setSubmitError(null);
  }, []);

  // Radix routes Esc, overlay clicks, and parent setOpen through onOpenChange.
  // Map a programmatic close-to-false to 'minimize' semantics so Esc preserves
  // the user's draft. The × button handles the dirty-confirm flow directly.
  const handleOpenChange = useCallback(
    (next: boolean) => {
      if (next) {
        setOpen(true);
        return;
      }
      handleMinimize();
    },
    [handleMinimize],
  );

  const handleCloseClick = useCallback(() => {
    if (hasContent) {
      setConfirmClose(true);
      return;
    }
    handleFullClose();
  }, [hasContent, handleFullClose]);

  const handleFiles = useCallback((list: FileList | null) => {
    if (!list || list.length === 0) return;
    setFiles((prev) => {
      // Cap the file total at MAX_ATTACHMENTS so a bulk-add via
      // <input multiple> can't exceed the SDK ceiling. Keep
      // prefix-of-input semantics: drop the overflow tail rather than
      // silently dropping arbitrary entries.
      const remaining = MAX_ATTACHMENTS - prev.length;
      if (remaining <= 0) return prev;
      const next = Array.from(list)
        .slice(0, remaining)
        .map<FileAttachment>((file) => ({
          id: ++fileIdRef.current,
          file,
        }));
      return [...prev, ...next];
    });
  }, []);

  const removeFile = useCallback((id: number) => {
    setFiles((prev) => prev.filter((f) => f.id !== id));
  }, []);

  /**
   * Stamp the dev-only raw payload onto a user bubble once `submit()`
   * resolves. No-op unless the host enabled `config.debug` (the SDK only
   * populates `result.debug` then), so this is inert in production.
   */
  const attachRawPayload = useCallback(
    (messageId: string, result: SubmitResult) => {
      const payload = result.debug?.payload;
      if (!payload) return;
      setMessages((prev) =>
        prev.map((m) =>
          m.id === messageId ? { ...m, rawPayload: payload } : m,
        ),
      );
    },
    [],
  );

  const doSubmit = useCallback(async () => {
    if (status === 'submitting') return;
    if (!draft.trim()) {
      setSubmitError('Please describe what happened.');
      return;
    }
    setSubmitError(null);

    const attachments: Array<Blob | FeedbackAttachment> = [];
    for (const { file } of files)
      attachments.push({ blob: file, filename: file.name });

    // Submit what the user actually sees in their bubble — trimming here
    // would drop the user's intentional whitespace/newlines on the wire.
    // `draft.trim().length > 0` above already rejects the whitespace-only
    // case; for title derivation we still want the first non-empty line.
    const derivedTitle = draft.trim().split('\n', 1)[0]!.slice(0, 120);
    const input: FeedbackInput = {
      title: derivedTitle,
      description: draft,
      expected: expected.trim() || undefined,
      actual: actual.trim() || undefined,
      attachments: attachments.length ? attachments : undefined,
      // use_ai rides the payload only when the submitter has been given
      // the choice; in every other render state we leave the server-side
      // default alone.
      ...(showAiToggle ? { use_ai: useAi } : {}),
    };

    // Push the user's draft into the conversation immediately and clear
    // the composer BEFORE awaiting submit(). The visual progression is
    // what makes the wait feel fast — a synchronous bubble + cleared
    // input lets the staged-status rows below carry the rest of the
    // animation while the network round-trip is in flight.
    const submittedDraft = draft;
    const filesSnapshot: readonly MessageAttachment[] | undefined =
      files.length > 0
        ? files.map(({ file }) => ({
            blob: file,
            filename: file.name,
          }))
        : undefined;
    const userMessage: Message = {
      id: `msg-${++messageIdRef.current}`,
      role: 'user',
      text: submittedDraft,
      attachments: filesSnapshot ? { files: filesSnapshot } : undefined,
    };
    setMessages((prev) => [...prev, userMessage]);
    setDraft('');
    setExpected('');
    setActual('');
    setShowExtras(false);
    setFiles([]);
    lastSubmittedInputRef.current = input;
    lastUserMessageIdRef.current = userMessage.id;

    try {
      const result = await submit(input);
      if (!mountedRef.current) return;
      onSubmit?.(result);
      attachRawPayload(userMessage.id, result);
      if (result.ok) {
        const assistantMessage: Message = {
          id: `msg-${++messageIdRef.current}`,
          role: 'assistant',
          text: ASSISTANT_RECEIPT_TEXT,
          issueSent: true,
          sentAt: Date.now(),
        };
        setMessages((prev) => [...prev, assistantMessage]);
        // If the user minimized mid-submit, pop the panel back open so the
        // success confirmation is actually seen. A silent success while
        // hidden leaves the user unsure whether their issue landed.
        setOpen(true);
      } else {
        // Failure: the user bubble is already in the thread; the staged
        // rows collapse into a red retry row driven by `phase === 'error'`
        // (see `Thread` below). Pop the panel back open so the user
        // actually sees the retry CTA.
        setOpen(true);
      }
    } catch (err) {
      if (!mountedRef.current) return;
      // Chunk-load failure path — the hook has already flipped phase to
      // `'error'` and stored a synthetic SubmitError. Just pop the panel
      // back open so the retry row is visible.
      void err;
      setOpen(true);
    }
  }, [
    actual,
    attachRawPayload,
    draft,
    expected,
    files,
    onSubmit,
    showAiToggle,
    status,
    submit,
    useAi,
  ]);

  /**
   * Re-run the most recent submit with the original `FeedbackInput`. The
   * user bubble is already in the thread (pushed on the first Send),
   * so the retry path only needs to re-fire `submit()` and append the
   * assistant receipt on success — no duplicate bubble for the retry.
   */
  const doRetry = useCallback(async () => {
    const last = lastSubmittedInputRef.current;
    if (!last) return;
    if (status === 'submitting') return;
    try {
      const result = await submit(last);
      if (!mountedRef.current) return;
      onSubmit?.(result);
      const retriedId = lastUserMessageIdRef.current;
      if (retriedId) attachRawPayload(retriedId, result);
      if (result.ok) {
        const assistantMessage: Message = {
          id: `msg-${++messageIdRef.current}`,
          role: 'assistant',
          text: ASSISTANT_RECEIPT_TEXT,
          issueSent: true,
          sentAt: Date.now(),
        };
        setMessages((prev) => [...prev, assistantMessage]);
        setOpen(true);
      } else {
        setOpen(true);
      }
    } catch (err) {
      if (!mountedRef.current) return;
      void err;
      setOpen(true);
    }
  }, [attachRawPayload, onSubmit, status, submit]);

  if (hidden) return null;

  const fabPosClass = position === 'bottom-left' ? 'brw-fab-bl' : 'brw-fab-br';
  const panelPosClass =
    position === 'bottom-left' ? 'brw-panel-bl' : 'brw-panel-br';
  const rootClassName = ['brw-root', className].filter(Boolean).join(' ');

  return (
    <Dialog.Root open={open} onOpenChange={handleOpenChange}>
      <Dialog.Trigger asChild>
        <button
          type="button"
          data-brevwick-skip=""
          data-brw-theme={theme}
          className={`${rootClassName} brw-fab ${fabPosClass}`}
          disabled={disabled}
          aria-label="Open feedback form"
        >
          <ChatIcon />
          {label}
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Content
          data-brevwick-skip=""
          data-brw-theme={theme}
          className={`${rootClassName} brw-panel ${panelPosClass}`}
          aria-describedby={undefined}
        >
          <PanelHeader
            submitting={status === 'submitting'}
            onMinimize={handleMinimize}
            onClose={handleCloseClick}
          />
          <Thread
            messages={messages}
            files={files}
            showExtras={showExtras}
            expected={expected}
            actual={actual}
            confirmClose={confirmClose}
            submitError={submitError}
            phase={phase}
            submitErrorTagged={submitErrorTagged}
            aiEnabled={projectConfig.config?.ai_enabled === true}
            reducedMotion={reducedMotion}
            onRetry={() => {
              void doRetry();
            }}
            onToggleExtras={() => setShowExtras((v) => !v)}
            onExpectedChange={setExpected}
            onActualChange={setActual}
            onRemoveFile={removeFile}
            onConfirmDiscard={handleFullClose}
            onCancelClose={() => setConfirmClose(false)}
          />
          <Composer
            draft={draft}
            submitting={status === 'submitting'}
            attachmentsAtCap={attachmentsAtCap}
            showAiToggle={showAiToggle}
            useAi={useAi}
            onDraftChange={setDraft}
            onSubmit={doSubmit}
            onAttachFiles={handleFiles}
            onUseAiChange={setUseAi}
          />
          <PanelFooter />
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

interface PanelHeaderProps {
  submitting: boolean;
  onMinimize: () => void;
  onClose: () => void;
}

function PanelHeader({
  submitting,
  onMinimize,
  onClose,
}: PanelHeaderProps): ReactElement {
  return (
    <div className="brw-panel-header">
      <span className="brw-panel-avatar" aria-hidden="true">
        B
      </span>
      <Dialog.Title className="brw-panel-title">Send feedback</Dialog.Title>
      <button
        type="button"
        className="brw-icon-btn"
        aria-label="Minimize"
        onClick={onMinimize}
      >
        <MinimizeIcon />
      </button>
      <button
        type="button"
        className="brw-icon-btn"
        aria-label="Close"
        onClick={onClose}
        /* Disable close while a submit is in flight — clicking "Discard"
           mid-request would otherwise throw the confirmation away while the
           callback still resolves into the parent. */
        disabled={submitting}
      >
        <CloseIcon />
      </button>
    </div>
  );
}

/**
 * Thin "Brevwick v<x.y.z>" credit anchored below the composer. The whole
 * label is a single link to brevwick.dev so the footer reads as one
 * affordance rather than two competing elements; styling keeps it muted
 * and small so it sits quietly at the bottom of the panel.
 */
function PanelFooter(): ReactElement {
  return (
    <div className="brw-panel-footer">
      <a
        className="brw-panel-footer-link"
        href="https://brevwick.dev"
        target="_blank"
        rel="noopener noreferrer"
      >
        Brevwick v{__BREVWICK_REACT_VERSION__}
      </a>
    </div>
  );
}

interface ThreadProps {
  messages: readonly Message[];
  files: readonly FileAttachment[];
  showExtras: boolean;
  expected: string;
  actual: string;
  confirmClose: boolean;
  submitError: string | null;
  phase: FeedbackPhase;
  submitErrorTagged: SubmitError | null;
  aiEnabled: boolean;
  reducedMotion: boolean;
  onRetry: () => void;
  onToggleExtras: () => void;
  onExpectedChange: (v: string) => void;
  onActualChange: (v: string) => void;
  onRemoveFile: (id: number) => void;
  onConfirmDiscard: () => void;
  onCancelClose: () => void;
}

/**
 * Phase ordinal used by the staged-status rows to decide visibility. Row
 * 1 ("Captured") shows from `'sanitising'` onwards, row 2 ("Sanitised")
 * from `'formatting'` onwards. Row 3 ("Formatting with AI") has its own
 * exact-match rule and does not consult this table.
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
 * Stagger between staged-status rows in milliseconds. Applied as
 * `animation-delay` per row (the rows mount with a CSS @keyframes
 * entrance, not a transition) so the rows fade in sequentially even
 * when the underlying SDK phase events fire microseconds apart on a
 * healthy happy path. Honoured only when the user has not requested
 * reduced motion — see {@link usePrefersReducedMotion}.
 */
const STATUS_ROW_STAGGER_MS = 200;

function Thread({
  messages,
  files,
  showExtras,
  expected,
  actual,
  confirmClose,
  submitError,
  phase,
  submitErrorTagged,
  aiEnabled,
  reducedMotion,
  onRetry,
  onToggleExtras,
  onExpectedChange,
  onActualChange,
  onRemoveFile,
  onConfirmDiscard,
  onCancelClose,
}: ThreadProps): ReactElement {
  const phaseRank = PHASE_RANK[phase];
  const showCaptured = phaseRank >= PHASE_RANK.sanitising;
  const showSanitised = phaseRank >= PHASE_RANK.formatting;
  // Row 3 is gated on the project's AI configuration AND the exact
  // 'formatting' phase — it disappears the moment the pipeline reports
  // 'sent' so the user is not left with a perpetually spinning row.
  const showFormatting = phase === 'formatting' && aiEnabled;
  const showRetryRow = phase === 'error' && submitErrorTagged !== null;

  return (
    <div
      className="brw-thread"
      role="log"
      aria-live="polite"
      aria-label="Conversation"
    >
      {messages.map((message) =>
        message.role === 'assistant' ? (
          <AssistantBubble
            key={message.id}
            issueSent={message.issueSent}
            sentAt={message.sentAt}
          >
            {message.text}
          </AssistantBubble>
        ) : (
          <UserBubble key={message.id} rawPayload={message.rawPayload}>
            {message.text}
          </UserBubble>
        ),
      )}
      {files.map(({ id, file }) => (
        <AttachmentChip
          key={id}
          name={file.name}
          size={file.size}
          onRemove={() => onRemoveFile(id)}
        />
      ))}
      <DisclosureExpectedActual
        open={showExtras}
        expected={expected}
        actual={actual}
        onToggle={onToggleExtras}
        onExpectedChange={onExpectedChange}
        onActualChange={onActualChange}
      />
      {/* Validation errors set by feedback-button itself stay on the
          existing inline alert. Submit-pipeline failures are rendered
          by the retry row below so the user gets the proper retry CTA. */}
      {submitError && (
        <div className="brw-error" role="alert">
          {submitError}
        </div>
      )}
      {(showCaptured || showSanitised || showFormatting) && (
        <div className="brw-status-rows">
          {showCaptured && (
            <StatusRow
              variant="check"
              // Row 1 anchors the cascade at 0 ms; rows 2 and 3 stagger off it.
              delayMs={0}
              dataRow="captured"
            >
              Captured route, console, network, device
            </StatusRow>
          )}
          {showSanitised && (
            <StatusRow
              variant="check"
              delayMs={reducedMotion ? 0 : STATUS_ROW_STAGGER_MS}
              dataRow="sanitised"
            >
              PII-sanitised, packaged
            </StatusRow>
          )}
          {showFormatting && (
            <StatusRow
              variant="spinner"
              delayMs={reducedMotion ? 0 : STATUS_ROW_STAGGER_MS * 2}
              dataRow="formatting"
            >
              Formatting with AI…
            </StatusRow>
          )}
        </div>
      )}
      {showRetryRow && submitErrorTagged && (
        <RetryRow error={submitErrorTagged} onRetry={onRetry} />
      )}
      {confirmClose && (
        <DiscardConfirm onCancel={onCancelClose} onConfirm={onConfirmDiscard} />
      )}
    </div>
  );
}

interface StatusRowProps {
  variant: 'check' | 'spinner';
  delayMs: number;
  dataRow: string;
  children: ReactNode;
}

/**
 * One staged-status row in the conversation thread. Visual variants:
 *
 * - `'check'` — green checkmark + label. Used for the "Captured" /
 *   "Sanitised" milestones.
 * - `'spinner'` — spinner + label. Used for the "Formatting with AI…"
 *   row that sits next to the pending AI work.
 *
 * The `data-brw-row` attribute exists for the test suite to query rows by
 * their role-in-the-pipeline without coupling to the visible label.
 * Stagger is applied as an `animation-delay` so the rows fade in
 * sequentially under the shared entrance keyframe.
 */
function StatusRow({
  variant,
  delayMs,
  dataRow,
  children,
}: StatusRowProps): ReactElement {
  return (
    <div
      className="brw-status-row"
      style={{ animationDelay: `${delayMs}ms` }}
      data-brw-row={dataRow}
    >
      {variant === 'check' ? (
        <span className="brw-status-row-check" aria-hidden="true">
          <CheckIcon />
        </span>
      ) : (
        <span className="brw-spinner" aria-hidden="true" />
      )}
      <span className="brw-status-row-label">{children}</span>
    </div>
  );
}

interface RetryRowProps {
  error: SubmitError;
  onRetry: () => void;
}

/**
 * Red retry row shown when the submit pipeline fails. Renders the
 * `SubmitError.message` verbatim — server-echoed bodies have already
 * been redacted upstream — and a single "Retry" CTA wired to
 * {@link UseFeedbackResult.retry}.
 *
 * `role="alert"` so screen readers pick up the failure inside the
 * panel's `aria-live="polite"` thread; `data-brw-error-code` keeps the
 * code accessible to the test suite without coupling on the rendered
 * copy.
 */
function RetryRow({ error, onRetry }: RetryRowProps): ReactElement {
  return (
    <div
      className="brw-status-row brw-status-row--error"
      role="alert"
      data-brw-error-code={error.code}
      data-brw-row="error"
    >
      {error.message}
      <button
        type="button"
        className="brw-btn brw-status-row-retry"
        onClick={onRetry}
      >
        Retry
      </button>
    </div>
  );
}

interface DiscardConfirmProps {
  onCancel: () => void;
  onConfirm: () => void;
}

/**
 * Inline `role="alert"` confirm — not a true modal dialog. Focus moves to
 * "Keep" on appearance so a keyboard user can dismiss with Enter without
 * having to Tab through the surrounding chrome; "Keep" is the non-destructive
 * default so an accidental Enter preserves the draft.
 */
function DiscardConfirm({
  onCancel,
  onConfirm,
}: DiscardConfirmProps): ReactElement {
  const keepRef = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    keepRef.current?.focus();
  }, []);
  return (
    <div className="brw-confirm" role="alert" aria-label="Discard draft?">
      <span className="brw-confirm-msg">Discard your feedback?</span>
      <button
        ref={keepRef}
        type="button"
        className="brw-btn"
        onClick={onCancel}
      >
        Keep
      </button>
      <button
        type="button"
        className="brw-btn brw-btn-primary"
        onClick={onConfirm}
      >
        Discard
      </button>
    </div>
  );
}

interface AssistantBubbleProps {
  children: ReactNode;
  issueSent?: boolean;
  sentAt?: number;
}

function AssistantBubble({
  children,
  issueSent,
  sentAt,
}: AssistantBubbleProps): ReactElement {
  return (
    <div className="brw-bubble brw-bubble--assistant">
      {children}
      {issueSent && (
        <div className="brw-bubble--receipt">
          <CheckIcon /> Issue sent · {formatRelativeTime(sentAt)}
        </div>
      )}
    </div>
  );
}

function UserBubble({
  children,
  rawPayload,
}: {
  children: ReactNode;
  rawPayload?: Record<string, unknown>;
}): ReactElement {
  return (
    <div className="brw-bubble brw-bubble--user">
      {children}
      {rawPayload !== undefined && <CopyRawButton payload={rawPayload} />}
    </div>
  );
}

/**
 * Dev-only affordance rendered on a sent bubble when the SDK returned a
 * `debug.payload` (i.e. the host set `config.debug`). Copies the exact,
 * post-redaction JSON body that was POSTed to the ingest endpoint —
 * including the console / network / route rings and device + user context
 * the widget never shows — so a developer can inspect everything that left
 * the device. Pretty-prints with two-space indent for readability; the
 * content is identical to the wire bytes.
 */
function CopyRawButton({
  payload,
}: {
  payload: Record<string, unknown>;
}): ReactElement {
  const [copied, setCopied] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    },
    [],
  );

  const handleCopy = useCallback(() => {
    const json = JSON.stringify(payload, null, 2);
    const clip = navigator.clipboard;
    // Degrade to a no-op on insecure contexts / older browsers where the
    // async clipboard API is missing, rather than throwing inside the dialog.
    if (!clip) return;
    void clip.writeText(json).then(
      () => {
        setCopied(true);
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        timeoutRef.current = setTimeout(() => setCopied(false), 1500);
      },
      () => {
        /* clipboard write rejected (permissions) — leave the label unchanged */
      },
    );
  }, [payload]);

  return (
    <button
      type="button"
      className="brw-copy-raw"
      onClick={handleCopy}
      aria-label="Copy the raw payload sent to the API"
      data-brw-copy-raw=""
    >
      {copied ? 'Copied!' : 'Copy raw payload'}
    </button>
  );
}

/**
 * Cheap relative-time formatter for the issue-sent receipt. The bubble
 * doesn't auto-refresh — once rendered the timestamp captures the moment
 * the issue was queued, which is the only thing that actually matters
 * (the user reads it within seconds of seeing it appear). Intentionally
 * does not pull in `Intl.RelativeTimeFormat` or `date-fns` so the
 * react-bundle gzip stays inside the §12 budget.
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

interface AttachmentChipProps {
  name: string;
  size: number;
  onRemove: () => void;
}

function AttachmentChip({
  name,
  size,
  onRemove,
}: AttachmentChipProps): ReactElement {
  return (
    <div className="brw-chip">
      <span className="brw-chip-name">{name}</span>
      <span className="brw-chip-size">{formatSize(size)}</span>
      <button
        type="button"
        className="brw-chip-remove"
        aria-label={`Remove ${name}`}
        onClick={onRemove}
      >
        ×
      </button>
    </div>
  );
}

interface DisclosureProps {
  open: boolean;
  expected: string;
  actual: string;
  onToggle: () => void;
  onExpectedChange: (v: string) => void;
  onActualChange: (v: string) => void;
}

function DisclosureExpectedActual({
  open,
  expected,
  actual,
  onToggle,
  onExpectedChange,
  onActualChange,
}: DisclosureProps): ReactElement {
  // Per-instance id so rendering multiple <FeedbackButton>s (or two panels
  // mid-animation) doesn't collide on a shared DOM id and break aria-controls.
  const panelId = useId();
  return (
    <>
      <button
        type="button"
        className="brw-disclosure"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={onToggle}
      >
        {open ? 'Hide expected vs actual' : 'Add expected vs actual'}
      </button>
      {open && (
        <div id={panelId} className="brw-disclosure-panel">
          <label>
            <span className="brw-disclosure-label">Expected</span>
            <textarea
              className="brw-disclosure-input"
              rows={2}
              value={expected}
              onChange={(e) => onExpectedChange(e.target.value)}
            />
          </label>
          <label>
            <span className="brw-disclosure-label">Actual</span>
            <textarea
              className="brw-disclosure-input"
              rows={2}
              value={actual}
              onChange={(e) => onActualChange(e.target.value)}
            />
          </label>
        </div>
      )}
    </>
  );
}

interface ComposerProps {
  draft: string;
  submitting: boolean;
  /** True once `files.length >= MAX_ATTACHMENTS`. Disables the file-attach
   *  button with an explanatory aria-label so the user can't queue an
   *  attachment the SDK would reject. */
  attachmentsAtCap: boolean;
  showAiToggle: boolean;
  useAi: boolean;
  onDraftChange: (v: string) => void;
  onSubmit: () => void;
  onAttachFiles: (list: FileList | null) => void;
  onUseAiChange: (v: boolean) => void;
}

const Composer = forwardRef<HTMLTextAreaElement, ComposerProps>(
  function Composer(
    {
      draft,
      submitting,
      attachmentsAtCap,
      showAiToggle,
      useAi,
      onDraftChange,
      onSubmit,
      onAttachFiles,
      onUseAiChange,
    },
    forwardedRef,
  ): ReactElement {
    const textareaRef = useRef<HTMLTextAreaElement | null>(null);
    useImperativeHandle(forwardedRef, () => textareaRef.current!, []);

    // Autogrow between ~1 and ~5 rows. The CSS `max-height` on the input
    // bounds this visually; the JS mirror keeps the height animating up as
    // the user types. Both come from the same COMPOSER_MAX_HEIGHT_PX
    // constant so bumping the ceiling is a single edit.
    useEffect(() => {
      const el = textareaRef.current;
      if (!el) return;
      el.style.height = 'auto';
      el.style.height = `${Math.min(el.scrollHeight, COMPOSER_MAX_HEIGHT_PX)}px`;
    }, [draft]);

    const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>): void => {
      if (
        e.key === 'Enter' &&
        !e.shiftKey &&
        !e.ctrlKey &&
        !e.metaKey &&
        !e.altKey &&
        !e.nativeEvent.isComposing
      ) {
        e.preventDefault();
        onSubmit();
      }
    };

    const attachDisabled = submitting || attachmentsAtCap;
    const fileLabel = attachmentsAtCap
      ? `Maximum ${MAX_ATTACHMENTS} attachments reached`
      : 'Attach file';
    return (
      <div className="brw-composer">
        <div className="brw-composer-shell">
          <label className="brw-icon-btn">
            <PaperclipIcon />
            <input
              type="file"
              multiple
              aria-label={fileLabel}
              className="brw-file-input"
              onChange={(e) => {
                onAttachFiles(e.target.files);
                e.target.value = '';
              }}
              disabled={attachDisabled}
            />
          </label>
          <textarea
            ref={textareaRef}
            className="brw-composer-input"
            rows={1}
            placeholder="Describe the bug or feedback…"
            value={draft}
            onChange={(e) => onDraftChange(e.target.value)}
            onKeyDown={handleKeyDown}
            aria-label="Feedback message"
          />
          {showAiToggle && (
            <AIToggle
              on={useAi}
              disabled={submitting}
              onChange={onUseAiChange}
            />
          )}
          <button
            type="button"
            className="brw-send-btn"
            aria-label="Send"
            disabled={submitting || draft.trim().length === 0}
            onClick={onSubmit}
          >
            <SendIcon />
          </button>
        </div>
      </div>
    );
  },
);

interface AIToggleProps {
  on: boolean;
  disabled: boolean;
  onChange: (next: boolean) => void;
}

/**
 * Track-and-thumb switch surfaced in the composer footer when the project
 * allows submitters to opt in/out of AI formatting per issue. The "AI" text
 * sits outside the button so the switch itself is an unambiguous iOS-style
 * track — visually obvious that it toggles, not a pressed-button state.
 *
 * role="switch" + aria-checked is the narrow semantic the WCAG a11y matrix
 * wants. Space toggles when focused (default browser behaviour on
 * role="button" is Enter and Space, but Space carries fewer collisions with
 * the composer's Enter-to-send shortcut).
 */
function AIToggle({ on, disabled, onChange }: AIToggleProps): ReactElement {
  const handleKeyDown = (e: KeyboardEvent<HTMLButtonElement>): void => {
    if (e.key === ' ') {
      e.preventDefault();
      onChange(!on);
    }
  };
  return (
    <span className="brw-aitoggle-wrap">
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label="Format with AI"
        className={`brw-aitoggle${on ? ' brw-aitoggle--on' : ''}`}
        disabled={disabled}
        onClick={() => onChange(!on)}
        onKeyDown={handleKeyDown}
      >
        <span className="brw-aitoggle-thumb" aria-hidden="true" />
      </button>
      <span className="brw-aitoggle-text" aria-hidden="true">
        AI
      </span>
    </span>
  );
}

function ChatIcon(): ReactElement {
  return (
    <svg
      className="brw-fab-icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z" />
    </svg>
  );
}

function MinimizeIcon(): ReactElement {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M5 14h14" />
    </svg>
  );
}

function CloseIcon(): ReactElement {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}

function PaperclipIcon(): ReactElement {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M21 10.5l-8.5 8.5a5 5 0 0 1-7-7l9-9a3.5 3.5 0 0 1 5 5l-9 9a2 2 0 0 1-3-3l7.5-7.5" />
    </svg>
  );
}

function SendIcon(): ReactElement {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M4 20l16-8L4 4l2 8-2 8z" />
      <path d="M6 12h14" />
    </svg>
  );
}

function CheckIcon(): ReactElement {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M5 12l5 5L20 7" />
    </svg>
  );
}
