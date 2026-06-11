import {
  For,
  Match,
  Show,
  Switch,
  createEffect,
  createSignal,
  createUniqueId,
  onCleanup,
  onMount,
  type Accessor,
  type Component,
  type JSX,
} from 'solid-js';
import { createStore, produce } from 'solid-js/store';
import type {
  FeedbackAttachment,
  FeedbackInput,
  ProjectConfig,
  SubmitError,
  SubmitResult,
} from '@tatlacas/brevwick-sdk';
import { useFeedback, type FeedbackPhase } from '../use-feedback';
import { BrevwickContext } from '../provider';
import {
  BREVWICK_CSS,
  BREVWICK_STYLE_ID,
  COMPOSER_MAX_HEIGHT_PX,
} from '../styles';
import { BREVWICK_SOLID_VERSION } from '../internal/version';
import { useContext } from 'solid-js';

/**
 * Stable snapshot of one attachment that rode along with a submit. We store
 * only the underlying `Blob` so a future render that wants to preview the
 * attachment can call `URL.createObjectURL(blob)` itself.
 */
interface MessageAttachment {
  blob: Blob;
  filename?: string;
}

/**
 * One bubble in the conversation thread. The greeting and submitted-issue
 * receipt are `assistant` messages; submitted drafts become `user` messages.
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
   * only when the host enabled `config.debug`. When present, the bubble
   * renders a "copy raw payload" affordance so a developer can inspect
   * everything that left the device (rings/context the widget never shows).
   */
  rawPayload?: Record<string, unknown>;
}

/**
 * File-attachment cap, mirrored from the SDK's `MAX_ATTACHMENT_COUNT` in
 * `packages/sdk/src/submit.ts`. Enforced in the UI by disabling the file-
 * attach button once the queued total reaches this ceiling so the user
 * can't queue an attachment the SDK would reject downstream.
 */
const MAX_ATTACHMENTS = 5;

const GREETING_MESSAGE: Message = {
  id: 'greeting',
  role: 'assistant',
  text: "Hi! Tell us what's happening.",
};

const ASSISTANT_RECEIPT_TEXT = 'Thanks — your issue is on its way.';

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

/** Stagger between staged-status rows in milliseconds. */
const STATUS_ROW_STAGGER_MS = 200;

/**
 * Forced-palette choice for {@link FeedbackButton}. `'system'` defers to the
 * OS-level `prefers-color-scheme` media query (the default and pre-existing
 * behaviour); `'light'` / `'dark'` override it regardless of the OS setting.
 */
export type BrevwickTheme = 'light' | 'dark' | 'system';

/** Launcher presentation. `'tab'` (NEW DEFAULT) is a vertical button flush
 *  against a viewport edge; `'bubble'` is the legacy floating corner pill. */
export type FeedbackButtonVariant = 'bubble' | 'tab';

/**
 * Launcher placement.
 * - `'right' | 'left'`        — edge sides (natural home of the tab).
 * - `'bottom-right' | 'bottom-left'` — legacy corners (natural home of the
 *   bubble). Passing one of these WITHOUT an explicit `variant` opts into
 *   the bubble, preserving pre-2.x call sites byte-for-byte.
 */
export type FeedbackButtonPosition =
  | 'right'
  | 'left'
  | 'bottom-right'
  | 'bottom-left';

/**
 * Resolved launcher placement — the single source of truth shared by the
 * FAB class derivation and the panel anchor. See the resolution table in
 * the design spec (mirrored in every adapter):
 *
 * - Explicit `variant` always wins; `position` then only contributes its
 *   horizontal side (a corner's vertical component is ignored for the tab
 *   — tabs are always vertically centered, ± `offset`).
 * - With `variant` unset, an explicit legacy corner implies the bubble so
 *   pre-existing call sites keep their corner pill; everything else is
 *   the tab (the new default), on the right edge unless `position` says
 *   otherwise.
 *
 * Every combination is total — no throws, no dead states.
 */
function resolveLauncherPlacement(
  variant?: FeedbackButtonVariant,
  position?: FeedbackButtonPosition,
): { variant: FeedbackButtonVariant; side: 'right' | 'left' } {
  const side: 'right' | 'left' =
    position === 'left' || position === 'bottom-left' ? 'left' : 'right';
  if (variant !== undefined) return { variant, side };
  // Legacy compat: an explicit corner without a variant keeps the bubble.
  const isCorner = position === 'bottom-right' || position === 'bottom-left';
  return { variant: isCorner ? 'bubble' : 'tab', side };
}

/**
 * Props for {@link FeedbackButton}. See SDD § 12 for the Solid contract.
 */
export interface FeedbackButtonProps {
  /**
   * Launcher presentation. Default `'tab'` — **this changed in vNEXT**:
   * the zero-config launcher is now a vertical tab on the right viewport
   * edge. Pass `variant="bubble"` (or a legacy corner `position`) to keep
   * the floating corner pill.
   */
  variant?: FeedbackButtonVariant;
  /**
   * Where the launcher sits. Defaults: `'right'` for the tab,
   * `'bottom-right'` for the bubble.
   *
   * Compatibility: passing a legacy corner (`'bottom-right'` /
   * `'bottom-left'`) without an explicit `variant` renders the BUBBLE at
   * that corner — existing call sites keep their pre-vNEXT presentation.
   * When `variant` and `position` disagree (e.g. `variant="tab"` +
   * `position="bottom-left"`), `variant` wins and `position` contributes
   * only its horizontal side.
   */
  position?: FeedbackButtonPosition;
  /**
   * Icon-only mode. Bubble → 48px circular icon button; tab → compact
   * square edge tab with just the icon. The `label` is not rendered but
   * (when it is a string) becomes the launcher's `aria-label`. Default
   * `false`.
   */
  compact?: boolean;
  /**
   * Tab-only: vertical offset in px from the vertical center of the
   * viewport. Positive moves the tab down, negative up. Ignored for the
   * bubble. Default `0`.
   */
  offset?: number;
  /** When true, the launcher renders as disabled and cannot open the dialog. */
  disabled?: boolean;
  /** When true, the component renders nothing. Useful for feature-flagging. */
  hidden?: boolean;
  /** Additional class appended to the launcher and dialog root for styling overrides. */
  class?: string;
  /** Launcher label. Default `'Feedback'`. Hidden visually when `compact`. */
  label?: JSX.Element;
  /** Force a palette regardless of the OS `prefers-color-scheme` setting. */
  theme?: BrevwickTheme;
  /** Fired with the SDK's `SubmitResult` after every submit (success or failure). */
  onSubmit?: (result: SubmitResult) => void;
}

/**
 * Inject the bundled `<style>` tag once per document. Idempotent — guards on
 * the well-known id so multiple `<FeedbackButton>` instances and HMR
 * remounts don't duplicate the stylesheet.
 */
function injectStyles(): void {
  if (typeof document === 'undefined') return;
  if (document.getElementById(BREVWICK_STYLE_ID)) return;
  const el = document.createElement('style');
  el.id = BREVWICK_STYLE_ID;
  el.textContent = BREVWICK_CSS;
  document.head.appendChild(el);
}

/**
 * Read `prefers-reduced-motion: reduce` once at first client mount. The
 * widget keys row stagger off this so a user with the OS-level
 * reduced-motion setting sees all status rows mount at once instead of
 * cascading in. SSR-safe: returns `false` on the server.
 */
function readPrefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

interface FileAttachment {
  readonly id: number;
  readonly file: File;
}

type ProjectConfigStatus = 'idle' | 'loading' | 'ready' | 'error';

interface ProjectConfigState {
  status: ProjectConfigStatus;
  config: ProjectConfig | null;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} kB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Cheap relative-time formatter for the issue-sent receipt. The bubble
 * doesn't auto-refresh — once rendered the timestamp captures the moment
 * the issue was queued, which is the only thing that actually matters
 * (the user reads it within seconds of seeing it appear).
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
 * Brevwick feedback widget — a FAB plus a dialog-based submission form.
 *
 * Solid V1 ships UX parity with the React adapter's modern chat-thread
 * panel: greeting + user/assistant bubbles, an autogrow composer, the
 * expected/actual disclosure, file attachment chips, the AI toggle,
 * staged-status rows driven by the SDK's phase bus, the retry row, and
 * the Brevwick credit footer. Screenshot UI is intentionally absent in
 * v1 (see PR #111); callers that need a screenshot capture path can
 * invoke `useFeedback().captureScreenshot()` directly.
 *
 * SSR-safe: the entire component is gated behind `Show when={isClient}`, so
 * a SolidStart server render emits nothing and the hydration pass mounts
 * the FAB on the client.
 *
 * @see SDD § 12 for the public Solid contract.
 */
export const FeedbackButton: Component<FeedbackButtonProps> = (props) => {
  const [isClient, setIsClient] = createSignal(false);
  onMount(() => {
    setIsClient(true);
    injectStyles();
  });

  return (
    <Show when={isClient() && !props.hidden}>
      <FeedbackButtonInner {...props} />
    </Show>
  );
};

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
function useProjectConfig(
  open: Accessor<boolean>,
): Accessor<ProjectConfigState> {
  const ctx = useContext(BrevwickContext);
  const [state, setState] = createSignal<ProjectConfigState>({
    status: 'idle',
    config: null,
  });
  let triggered = false;
  let alive = true;
  onCleanup(() => {
    alive = false;
  });
  createEffect(() => {
    if (!open()) return;
    if (triggered) return;
    triggered = true;
    const sdk = ctx?.brevwick();
    if (!sdk) return;
    setState({ status: 'loading', config: null });
    sdk
      .getConfig()
      .then((config: ProjectConfig | null) => {
        if (!alive) return;
        setState({ status: 'ready', config });
      })
      .catch(() => {
        if (!alive) return;
        // getConfig() never rejects in the documented contract, but stay
        // defensive so a future regression cannot wedge the widget in
        // 'loading' forever.
        setState({ status: 'error', config: null });
      });
  });
  return state;
}

const FeedbackButtonInner: Component<FeedbackButtonProps> = (props) => {
  const {
    submit,
    status,
    phase,
    error: submitErrorTagged,
    retry,
    reset,
  } = useFeedback();
  const reducedMotion = readPrefersReducedMotion();
  const [open, setOpen] = createSignal(false);
  const [draft, setDraft] = createSignal('');
  const [expected, setExpected] = createSignal('');
  const [actual, setActual] = createSignal('');
  const [showExtras, setShowExtras] = createSignal(false);
  const [confirmClose, setConfirmClose] = createSignal(false);
  const [submitError, setSubmitError] = createSignal<string | null>(null);
  // Submitter's per-issue AI preference. Defaults to true so the toggle
  // renders "on" the first time; only read on submit when the render-policy
  // matrix below says the toggle should be visible.
  const [useAi, setUseAi] = createSignal(true);
  const [messages, setMessages] = createStore<Message[]>([
    { ...GREETING_MESSAGE },
  ]);
  const [files, setFiles] = createStore<FileAttachment[]>([]);

  let alive = true;
  let fileIdSeq = 0;
  let messageIdSeq = 0;
  // Snapshot of the last `FeedbackInput` passed to `submit()` so the
  // retry CTA on a failed submit can re-run with the exact same payload
  // without forcing the user to re-type the draft we cleared synchronously
  // on Send.
  let lastSubmittedInput: FeedbackInput | null = null;
  // Id of the user bubble for the most recent submit, so the retry path can
  // re-attach a freshly composed `rawPayload` to the same bubble.
  let lastUserMessageId: string | null = null;

  const projectConfig = useProjectConfig(open);
  // Render-policy matrix, SDD § 12. The toggle is visible exactly when the
  // config has loaded successfully, AI is enabled for the project, AND the
  // admin has opted submitters into the choice. Any other state (loading,
  // error, disabled, admin-forced) hides the toggle and the payload omits
  // `use_ai` so the server-side default applies.
  const showAiToggle = (): boolean => {
    const cfg = projectConfig();
    return (
      cfg.status === 'ready' &&
      cfg.config?.ai_enabled === true &&
      cfg.config.ai_submitter_choice_allowed === true
    );
  };

  const attachmentCount = (): number => files.length;
  const attachmentsAtCap = (): boolean => attachmentCount() >= MAX_ATTACHMENTS;
  const hasContent = (): boolean =>
    draft().trim().length > 0 ||
    expected().length > 0 ||
    actual().length > 0 ||
    files.length > 0;

  const resetAll = (): void => {
    setDraft('');
    setExpected('');
    setActual('');
    setShowExtras(false);
    setFiles([]);
    setConfirmClose(false);
    setSubmitError(null);
    setMessages([{ ...GREETING_MESSAGE }]);
    setUseAi(true);
    lastSubmittedInput = null;
    reset();
  };

  // Catch the rare unmount-without-close path (route change, parent
  // re-render that swaps the FAB out, HMR teardown).
  onCleanup(() => {
    alive = false;
  });

  const handleFullClose = (): void => {
    setOpen(false);
    resetAll();
  };

  // Esc / minimize semantics: just hide the panel without dropping state.
  const handleMinimize = (): void => {
    setOpen(false);
    setConfirmClose(false);
    setSubmitError(null);
  };

  const handleCloseClick = (): void => {
    if (hasContent()) {
      setConfirmClose(true);
      return;
    }
    handleFullClose();
  };

  const handleAttachFiles = (list: FileList | null): void => {
    if (!list || list.length === 0) return;
    const remaining = MAX_ATTACHMENTS - attachmentCount();
    if (remaining <= 0) return;
    const next = Array.from(list)
      .slice(0, remaining)
      .map<FileAttachment>((file) => ({
        id: ++fileIdSeq,
        file,
      }));
    setFiles(
      produce((prev: FileAttachment[]) => {
        for (const item of next) prev.push(item);
      }),
    );
  };

  const removeFile = (id: number): void => {
    setFiles(files.filter((f) => f.id !== id));
  };

  /**
   * Stamp the dev-only raw payload onto a user bubble once `submit()`
   * resolves. No-op unless the host enabled `config.debug` (the SDK only
   * populates `result.debug` then), so this is inert in production.
   */
  const attachRawPayload = (messageId: string, result: SubmitResult): void => {
    const payload = result.debug?.payload;
    if (!payload) return;
    setMessages(
      produce((prev: Message[]) => {
        const target = prev.find((m) => m.id === messageId);
        if (target) target.rawPayload = payload;
      }),
    );
  };

  const doSubmit = async (): Promise<void> => {
    if (status() === 'submitting') return;
    if (!draft().trim()) {
      setSubmitError('Please describe what happened.');
      return;
    }
    setSubmitError(null);

    const attachments: Array<Blob | FeedbackAttachment> = [];
    const filesSnap = [...files];
    for (const { file } of filesSnap)
      attachments.push({ blob: file, filename: file.name });

    // Submit what the user actually sees in their bubble — trimming here
    // would drop the user's intentional whitespace/newlines on the wire.
    // `draft().trim().length > 0` above already rejects the whitespace-
    // only case; for title derivation we still want the first non-empty
    // line.
    const draftRaw = draft();
    const derivedTitle = draftRaw.trim().split('\n', 1)[0]!.slice(0, 120);
    const expectedTrimmed = expected().trim();
    const actualTrimmed = actual().trim();
    const input: FeedbackInput = {
      title: derivedTitle,
      description: draftRaw,
      ...(expectedTrimmed ? { expected: expectedTrimmed } : {}),
      ...(actualTrimmed ? { actual: actualTrimmed } : {}),
      ...(attachments.length ? { attachments } : {}),
      // use_ai rides the payload only when the submitter has been given
      // the choice; in every other render state we leave the server-side
      // default alone.
      ...(showAiToggle() ? { use_ai: useAi() } : {}),
    };

    // Push the user's draft into the conversation immediately and clear
    // the composer BEFORE awaiting submit(). The visual progression is
    // what makes the wait feel fast — a synchronous bubble + cleared
    // input lets the staged-status rows below carry the rest of the
    // animation while the network round-trip is in flight (issue #74).
    const filesSnapshot: readonly MessageAttachment[] | undefined =
      filesSnap.length > 0
        ? filesSnap.map(({ file }) => ({ blob: file, filename: file.name }))
        : undefined;
    const userMessage: Message = {
      id: `msg-${++messageIdSeq}`,
      role: 'user',
      text: draftRaw,
      attachments: filesSnapshot ? { files: filesSnapshot } : undefined,
    };
    setMessages(
      produce((prev: Message[]) => {
        prev.push(userMessage);
      }),
    );
    setDraft('');
    setExpected('');
    setActual('');
    setShowExtras(false);
    setFiles([]);
    lastSubmittedInput = input;
    lastUserMessageId = userMessage.id;

    try {
      const result = await submit(input);
      if (!alive) return;
      props.onSubmit?.(result);
      attachRawPayload(userMessage.id, result);
      if (result.ok) {
        setMessages(
          produce((prev: Message[]) => {
            prev.push({
              id: `msg-${++messageIdSeq}`,
              role: 'assistant',
              text: ASSISTANT_RECEIPT_TEXT,
              issueSent: true,
              sentAt: Date.now(),
            });
          }),
        );
        setOpen(true);
      } else {
        // Failure: the user bubble is already in the thread; the staged
        // rows collapse into a red retry row driven by `phase === 'error'`.
        setOpen(true);
      }
    } catch {
      if (!alive) return;
      // Chunk-load failure path — the hook has already flipped phase to
      // 'error' and stored a synthetic SubmitError. Just pop the panel
      // back open so the retry row is visible.
      setOpen(true);
    }
  };

  /**
   * Re-run the most recent submit with the original `FeedbackInput`. The
   * user bubble is already in the thread (pushed on the first Send), so
   * the retry path only needs to re-fire `submit()` and append the
   * assistant receipt on success — no duplicate bubble for the retry.
   */
  const doRetry = async (): Promise<void> => {
    if (!lastSubmittedInput) return;
    if (status() === 'submitting') return;
    try {
      const result = await retry();
      if (!alive || !result) return;
      props.onSubmit?.(result);
      if (lastUserMessageId) attachRawPayload(lastUserMessageId, result);
      if (result.ok) {
        setMessages(
          produce((prev: Message[]) => {
            prev.push({
              id: `msg-${++messageIdSeq}`,
              role: 'assistant',
              text: ASSISTANT_RECEIPT_TEXT,
              issueSent: true,
              sentAt: Date.now(),
            });
          }),
        );
        setOpen(true);
      } else {
        setOpen(true);
      }
    } catch {
      if (!alive) return;
      setOpen(true);
    }
  };

  // Lazy prop reads inside a derived accessor keep Solid's reactivity:
  // changing `variant`/`position` re-runs every consumer below. The
  // resolution itself lives in `resolveLauncherPlacement` — variant is
  // intentionally NOT defaulted at the prop layer so the corner-implies-
  // bubble compat rule can see "unset".
  const placement = (): {
    variant: FeedbackButtonVariant;
    side: 'right' | 'left';
  } => resolveLauncherPlacement(props.variant, props.position);
  const rootClass = (): string =>
    ['brw-root', props.class].filter(Boolean).join(' ');
  const fabClass = (): string => {
    const { variant: v, side } = placement();
    return [
      rootClass(),
      'brw-fab',
      v === 'tab' ? 'brw-fab--tab' : 'brw-fab--bubble',
      v === 'tab'
        ? side === 'left'
          ? 'brw-fab-l'
          : 'brw-fab-r'
        : side === 'left'
          ? 'brw-fab-bl'
          : 'brw-fab-br',
      props.compact ? 'brw-fab--compact' : '',
    ]
      .filter(Boolean)
      .join(' ');
  };
  const panelPosClass = (): string =>
    placement().side === 'left' ? 'brw-panel-bl' : 'brw-panel-br';
  // Non-compact keeps the established accessible name (the visible label
  // still supplements it). Compact removes the visible text, so the string
  // `label` becomes the aria-label; a non-string JSX label falls back to
  // 'Feedback'.
  const fabAriaLabel = (): string =>
    props.compact
      ? typeof props.label === 'string'
        ? props.label
        : 'Feedback'
      : 'Open feedback form';
  // `--brw-fab-tab-offset` is a positioning input (like the inline
  // animation-delay on status rows), not part of the public --brw-*
  // theming contract — set only when it has an effect.
  const fabStyle = (): JSX.CSSProperties | undefined =>
    placement().variant === 'tab' && (props.offset ?? 0) !== 0
      ? { '--brw-fab-tab-offset': `${props.offset}px` }
      : undefined;

  return (
    <>
      <button
        type="button"
        data-brevwick-skip=""
        data-brw-theme={props.theme ?? 'system'}
        data-brw-variant={placement().variant}
        class={fabClass()}
        disabled={props.disabled}
        aria-label={fabAriaLabel()}
        aria-expanded={open()}
        style={fabStyle()}
        onClick={() => setOpen(true)}
      >
        <ChatIcon />
        <Show when={!props.compact}>
          <span class="brw-fab-label">{props.label ?? 'Feedback'}</span>
        </Show>
      </button>
      <Show when={open()}>
        <div
          role="dialog"
          aria-label="Send feedback"
          aria-modal="false"
          data-brevwick-skip=""
          data-brw-theme={props.theme ?? 'system'}
          class={`${rootClass()} brw-panel ${panelPosClass()}`}
        >
          <PanelHeader
            submitting={() => status() === 'submitting'}
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
            aiEnabled={() => projectConfig().config?.ai_enabled === true}
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
            submitting={() => status() === 'submitting'}
            attachmentsAtCap={attachmentsAtCap}
            showAiToggle={showAiToggle}
            useAi={useAi}
            onDraftChange={setDraft}
            onSubmit={() => {
              void doSubmit();
            }}
            onAttachFiles={handleAttachFiles}
            onUseAiChange={setUseAi}
          />
          <PanelFooter />
        </div>
      </Show>
    </>
  );
};

interface PanelHeaderProps {
  submitting: Accessor<boolean>;
  onMinimize: () => void;
  onClose: () => void;
}

function PanelHeader(props: PanelHeaderProps): JSX.Element {
  return (
    <div class="brw-panel-header">
      <span class="brw-panel-avatar" aria-hidden="true">
        B
      </span>
      <h2 class="brw-panel-title">Send feedback</h2>
      <button
        type="button"
        class="brw-icon-btn"
        aria-label="Minimize"
        onClick={props.onMinimize}
      >
        <MinimizeIcon />
      </button>
      <button
        type="button"
        class="brw-icon-btn"
        aria-label="Close"
        onClick={props.onClose}
        // Disable close while a submit is in flight — clicking "Discard"
        // mid-request would otherwise throw the confirmation away while
        // the callback still resolves into the parent.
        disabled={props.submitting()}
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
function PanelFooter(): JSX.Element {
  return (
    <div class="brw-panel-footer">
      <a
        class="brw-panel-footer-link"
        href="https://brevwick.dev"
        target="_blank"
        rel="noopener noreferrer"
      >
        Brevwick v{BREVWICK_SOLID_VERSION}
      </a>
    </div>
  );
}

interface ThreadProps {
  messages: readonly Message[];
  files: readonly FileAttachment[];
  showExtras: Accessor<boolean>;
  expected: Accessor<string>;
  actual: Accessor<string>;
  confirmClose: Accessor<boolean>;
  submitError: Accessor<string | null>;
  phase: Accessor<FeedbackPhase>;
  submitErrorTagged: Accessor<SubmitError | null>;
  aiEnabled: Accessor<boolean>;
  reducedMotion: boolean;
  onRetry: () => void;
  onToggleExtras: () => void;
  onExpectedChange: (v: string) => void;
  onActualChange: (v: string) => void;
  onRemoveFile: (id: number) => void;
  onConfirmDiscard: () => void;
  onCancelClose: () => void;
}

function Thread(props: ThreadProps): JSX.Element {
  const phaseRank = (): number => PHASE_RANK[props.phase()];
  const showCaptured = (): boolean => phaseRank() >= PHASE_RANK.sanitising;
  const showSanitised = (): boolean => phaseRank() >= PHASE_RANK.formatting;
  // Row 3 is gated on the project's AI configuration AND the exact
  // 'formatting' phase — it disappears the moment the pipeline reports
  // 'sent' so the user is not left with a perpetually spinning row.
  const showFormatting = (): boolean =>
    props.phase() === 'formatting' && props.aiEnabled();
  const showRetryRow = (): boolean =>
    props.phase() === 'error' && props.submitErrorTagged() !== null;

  return (
    <div
      class="brw-thread"
      role="log"
      aria-live="polite"
      aria-label="Conversation"
    >
      <For each={props.messages}>
        {(message) => (
          <Show
            when={message.role === 'assistant'}
            fallback={
              <UserBubble rawPayload={message.rawPayload}>
                {message.text}
              </UserBubble>
            }
          >
            <AssistantBubble
              issueSent={message.issueSent}
              sentAt={message.sentAt}
            >
              {message.text}
            </AssistantBubble>
          </Show>
        )}
      </For>
      <For each={props.files}>
        {(f) => (
          <AttachmentChip
            name={f.file.name}
            size={f.file.size}
            onRemove={() => props.onRemoveFile(f.id)}
          />
        )}
      </For>
      <DisclosureExpectedActual
        open={props.showExtras}
        expected={props.expected}
        actual={props.actual}
        onToggle={props.onToggleExtras}
        onExpectedChange={props.onExpectedChange}
        onActualChange={props.onActualChange}
      />
      <Show when={props.submitError()}>
        {(msg) => (
          <div class="brw-error" role="alert">
            {msg()}
          </div>
        )}
      </Show>
      <Show when={showCaptured() || showSanitised() || showFormatting()}>
        <div class="brw-status-rows">
          <Show when={showCaptured()}>
            <StatusRow variant="check" delayMs={0} dataRow="captured">
              Captured route, console, network, device
            </StatusRow>
          </Show>
          <Show when={showSanitised()}>
            <StatusRow
              variant="check"
              delayMs={props.reducedMotion ? 0 : STATUS_ROW_STAGGER_MS}
              dataRow="sanitised"
            >
              PII-sanitised, packaged
            </StatusRow>
          </Show>
          <Show when={showFormatting()}>
            <StatusRow
              variant="spinner"
              delayMs={props.reducedMotion ? 0 : STATUS_ROW_STAGGER_MS * 2}
              dataRow="formatting"
            >
              Formatting with AI…
            </StatusRow>
          </Show>
        </div>
      </Show>
      <Show when={showRetryRow() && props.submitErrorTagged()}>
        {(err) => <RetryRow error={err()} onRetry={props.onRetry} />}
      </Show>
      <Show when={props.confirmClose()}>
        <DiscardConfirm
          onCancel={props.onCancelClose}
          onConfirm={props.onConfirmDiscard}
        />
      </Show>
    </div>
  );
}

interface StatusRowProps {
  variant: 'check' | 'spinner';
  delayMs: number;
  dataRow: string;
  children: JSX.Element;
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
function StatusRow(props: StatusRowProps): JSX.Element {
  return (
    <div
      class="brw-status-row"
      style={{ 'animation-delay': `${props.delayMs}ms` }}
      data-brw-row={props.dataRow}
    >
      <Switch>
        <Match when={props.variant === 'check'}>
          <span class="brw-status-row-check" aria-hidden="true">
            <CheckIcon />
          </span>
        </Match>
        <Match when={props.variant === 'spinner'}>
          <span class="brw-spinner" aria-hidden="true" />
        </Match>
      </Switch>
      <span class="brw-status-row-label">{props.children}</span>
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
 */
function RetryRow(props: RetryRowProps): JSX.Element {
  return (
    <div
      class="brw-status-row brw-status-row--error"
      role="alert"
      data-brw-error-code={props.error.code}
      data-brw-row="error"
    >
      {props.error.message}
      <button
        type="button"
        class="brw-btn brw-status-row-retry"
        onClick={props.onRetry}
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
 * having to Tab through the surrounding chrome; "Keep" is the non-
 * destructive default so an accidental Enter preserves the draft.
 */
function DiscardConfirm(props: DiscardConfirmProps): JSX.Element {
  // Callback ref: Solid's `ref={varName}` is compile-time magic that ESLint's
  // `no-unassigned-vars` cannot see; the callback form is identical at the
  // semantic layer and keeps the lint rule happy without an inline disable.
  let keepRef: HTMLButtonElement | undefined;
  const setKeepRef = (el: HTMLButtonElement): void => {
    keepRef = el;
  };
  onMount(() => {
    keepRef?.focus();
  });
  return (
    <div class="brw-confirm" role="alert" aria-label="Discard draft?">
      <span class="brw-confirm-msg">Discard your feedback?</span>
      <button
        ref={setKeepRef}
        type="button"
        class="brw-btn"
        onClick={props.onCancel}
      >
        Keep
      </button>
      <button
        type="button"
        class="brw-btn brw-btn-primary"
        onClick={props.onConfirm}
      >
        Discard
      </button>
    </div>
  );
}

interface AssistantBubbleProps {
  children: JSX.Element;
  issueSent?: boolean;
  sentAt?: number;
}

function AssistantBubble(props: AssistantBubbleProps): JSX.Element {
  return (
    <div class="brw-bubble brw-bubble--assistant">
      {props.children}
      <Show when={props.issueSent}>
        <div class="brw-bubble--receipt">
          <CheckIcon /> Issue sent · {formatRelativeTime(props.sentAt)}
        </div>
      </Show>
    </div>
  );
}

function UserBubble(props: {
  children: JSX.Element;
  rawPayload?: Record<string, unknown>;
}): JSX.Element {
  return (
    <div class="brw-bubble brw-bubble--user">
      {props.children}
      <Show when={props.rawPayload !== undefined}>
        <CopyRawButton payload={props.rawPayload!} />
      </Show>
    </div>
  );
}

/**
 * Dev-only affordance rendered on a sent bubble when the SDK returned a
 * `debug.payload` (host set `config.debug`). Copies the exact, post-redaction
 * JSON body POSTed to the ingest endpoint — including the console / network /
 * route rings and device + user context the widget never shows. Pretty-printed
 * with a two-space indent; the parsed JSON matches what was sent over the wire
 * (only the whitespace differs from the unindented request body).
 */
function CopyRawButton(props: {
  payload: Record<string, unknown>;
}): JSX.Element {
  const [copied, setCopied] = createSignal(false);
  let timeout: ReturnType<typeof setTimeout> | undefined;
  onCleanup(() => {
    if (timeout) clearTimeout(timeout);
  });

  const handleCopy = (): void => {
    const json = JSON.stringify(props.payload, null, 2);
    const clip = navigator.clipboard;
    // Degrade to a no-op on insecure contexts / older browsers where the
    // async clipboard API is missing, rather than throwing inside the dialog.
    if (!clip) return;
    void clip.writeText(json).then(
      () => {
        setCopied(true);
        if (timeout) clearTimeout(timeout);
        timeout = setTimeout(() => setCopied(false), 1500);
      },
      () => {
        /* clipboard write rejected (permissions) — leave the label unchanged */
      },
    );
  };

  return (
    <button
      type="button"
      class="brw-copy-raw"
      onClick={handleCopy}
      aria-label="Copy the raw payload sent to the API"
      data-brw-copy-raw=""
    >
      {copied() ? 'Copied!' : 'Copy raw payload'}
    </button>
  );
}

interface AttachmentChipProps {
  name: string;
  size: number;
  onRemove: () => void;
}

function AttachmentChip(props: AttachmentChipProps): JSX.Element {
  return (
    <div class="brw-chip">
      <span class="brw-chip-name">{props.name}</span>
      <span class="brw-chip-size">{formatSize(props.size)}</span>
      <button
        type="button"
        class="brw-chip-remove"
        aria-label={`Remove ${props.name}`}
        onClick={props.onRemove}
      >
        ×
      </button>
    </div>
  );
}

interface DisclosureProps {
  open: Accessor<boolean>;
  expected: Accessor<string>;
  actual: Accessor<string>;
  onToggle: () => void;
  onExpectedChange: (v: string) => void;
  onActualChange: (v: string) => void;
}

function DisclosureExpectedActual(props: DisclosureProps): JSX.Element {
  // Per-instance id so rendering multiple <FeedbackButton>s (or two panels
  // mid-animation) doesn't collide on a shared DOM id and break aria-controls.
  const panelId = createUniqueId();
  return (
    <>
      <button
        type="button"
        class="brw-disclosure"
        aria-expanded={props.open()}
        aria-controls={panelId}
        onClick={props.onToggle}
      >
        <Show when={props.open()} fallback={<>Add expected vs actual</>}>
          Hide expected vs actual
        </Show>
      </button>
      <Show when={props.open()}>
        <div id={panelId} class="brw-disclosure-panel">
          <label>
            <span class="brw-disclosure-label">Expected</span>
            <textarea
              class="brw-disclosure-input"
              rows={2}
              value={props.expected()}
              onInput={(e) => props.onExpectedChange(e.currentTarget.value)}
            />
          </label>
          <label>
            <span class="brw-disclosure-label">Actual</span>
            <textarea
              class="brw-disclosure-input"
              rows={2}
              value={props.actual()}
              onInput={(e) => props.onActualChange(e.currentTarget.value)}
            />
          </label>
        </div>
      </Show>
    </>
  );
}

interface ComposerProps {
  draft: Accessor<string>;
  submitting: Accessor<boolean>;
  attachmentsAtCap: Accessor<boolean>;
  showAiToggle: Accessor<boolean>;
  useAi: Accessor<boolean>;
  onDraftChange: (v: string) => void;
  onSubmit: () => void;
  onAttachFiles: (list: FileList | null) => void;
  onUseAiChange: (v: boolean) => void;
}

function Composer(props: ComposerProps): JSX.Element {
  // Callback ref: Solid's `ref={varName}` compile-time assignment is invisible
  // to ESLint's `no-unassigned-vars`; the explicit setter is identical at the
  // runtime layer.
  let textareaRef: HTMLTextAreaElement | undefined;
  const setTextareaRef = (el: HTMLTextAreaElement): void => {
    textareaRef = el;
  };

  // Autogrow between ~1 and ~5 rows. The CSS `max-height` on the input
  // bounds this visually; the JS mirror keeps the height animating up as
  // the user types. Both come from the same COMPOSER_MAX_HEIGHT_PX
  // constant so bumping the ceiling is a single edit.
  createEffect(() => {
    // Read draft() so the effect re-runs on every keystroke.
    void props.draft();
    const el = textareaRef;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, COMPOSER_MAX_HEIGHT_PX)}px`;
  });

  const handleKeyDown = (
    e: KeyboardEvent & { currentTarget: HTMLTextAreaElement },
  ): void => {
    if (
      e.key === 'Enter' &&
      !e.shiftKey &&
      !e.ctrlKey &&
      !e.metaKey &&
      !e.altKey &&
      // happy-dom does not surface isComposing reliably; guard for both.
      !(e as unknown as { isComposing?: boolean }).isComposing
    ) {
      e.preventDefault();
      props.onSubmit();
    }
  };

  const attachDisabled = (): boolean =>
    props.submitting() || props.attachmentsAtCap();
  const fileLabel = (): string =>
    props.attachmentsAtCap()
      ? `Maximum ${MAX_ATTACHMENTS} attachments reached`
      : 'Attach file';

  return (
    <div class="brw-composer">
      <div class="brw-composer-shell">
        <label class="brw-icon-btn">
          <PaperclipIcon />
          <input
            type="file"
            multiple
            aria-label={fileLabel()}
            class="brw-file-input"
            onChange={(e) => {
              props.onAttachFiles(e.currentTarget.files);
              e.currentTarget.value = '';
            }}
            disabled={attachDisabled()}
          />
        </label>
        <textarea
          ref={setTextareaRef}
          class="brw-composer-input"
          rows={1}
          placeholder="Describe the bug or feedback…"
          value={props.draft()}
          onInput={(e) => props.onDraftChange(e.currentTarget.value)}
          onKeyDown={handleKeyDown}
          aria-label="Feedback message"
        />
        <Show when={props.showAiToggle()}>
          <AIToggle
            on={props.useAi}
            disabled={props.submitting}
            onChange={props.onUseAiChange}
          />
        </Show>
        <button
          type="button"
          class="brw-send-btn"
          aria-label="Send"
          disabled={props.submitting() || props.draft().trim().length === 0}
          onClick={props.onSubmit}
        >
          <SendIcon />
        </button>
      </div>
    </div>
  );
}

interface AIToggleProps {
  on: Accessor<boolean>;
  disabled: Accessor<boolean>;
  onChange: (next: boolean) => void;
}

/**
 * Track-and-thumb switch surfaced in the composer footer when the project
 * allows submitters to opt in/out of AI formatting per issue.
 *
 * role="switch" + aria-checked is the narrow semantic the WCAG a11y matrix
 * wants. Space toggles when focused (default browser behaviour on
 * role="button" is Enter and Space, but Space carries fewer collisions
 * with the composer's Enter-to-send shortcut).
 */
function AIToggle(props: AIToggleProps): JSX.Element {
  const handleKeyDown = (e: KeyboardEvent): void => {
    if (e.key === ' ') {
      e.preventDefault();
      props.onChange(!props.on());
    }
  };
  return (
    <span class="brw-aitoggle-wrap">
      <button
        type="button"
        role="switch"
        aria-checked={props.on()}
        aria-label="Format with AI"
        class={`brw-aitoggle${props.on() ? ' brw-aitoggle--on' : ''}`}
        disabled={props.disabled()}
        onClick={() => props.onChange(!props.on())}
        onKeyDown={handleKeyDown}
      >
        <span class="brw-aitoggle-thumb" aria-hidden="true" />
      </button>
      <span class="brw-aitoggle-text" aria-hidden="true">
        AI
      </span>
    </span>
  );
}

function ChatIcon(): JSX.Element {
  return (
    <svg
      class="brw-fab-icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      <path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z" />
    </svg>
  );
}

function MinimizeIcon(): JSX.Element {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      <path d="M5 14h14" />
    </svg>
  );
}

function CloseIcon(): JSX.Element {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}

function PaperclipIcon(): JSX.Element {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      <path d="M21 10.5l-8.5 8.5a5 5 0 0 1-7-7l9-9a3.5 3.5 0 0 1 5 5l-9 9a2 2 0 0 1-3-3l7.5-7.5" />
    </svg>
  );
}

function SendIcon(): JSX.Element {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      <path d="M4 20l16-8L4 4l2 8-2 8z" />
      <path d="M6 12h14" />
    </svg>
  );
}

function CheckIcon(): JSX.Element {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2.5"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      <path d="M5 12l5 5L20 7" />
    </svg>
  );
}
