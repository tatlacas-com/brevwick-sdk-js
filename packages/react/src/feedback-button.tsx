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
  type PointerEvent,
  type ReactElement,
  type ReactNode,
} from 'react';
import type {
  FeedbackAttachment,
  FeedbackInput,
  ProjectConfig,
  SubmitResult,
} from 'brevwick-sdk';
import { useBrevwickInternal } from './context';
import { useFeedback, type FeedbackStatus } from './use-feedback';
import {
  BREVWICK_CSS,
  BREVWICK_STYLE_ID,
  COMPOSER_MAX_HEIGHT_PX,
} from './styles';

declare const __BREVWICK_REACT_VERSION__: string;

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
  /** Fired with the SDK's `SubmitResult` after every submit (success or failure). */
  onSubmit?: (result: SubmitResult) => void;
}

const GREETING =
  "Hi! Tell us what's happening. A screenshot helps if you have one.";

const useIsomorphicLayoutEffect =
  typeof window !== 'undefined' ? useLayoutEffect : useEffect;

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

interface ScreenshotAttachment {
  readonly blob: Blob;
  readonly url: string;
}

/** Viewport-space rectangle selected by the user on the region overlay. */
interface Region {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

/** Minimum accepted side length (px) — below this the selection is treated
 *  as an accidental click and the confirm is rejected with a shake. */
const REGION_MIN_SIDE_PX = 2;

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
 * palette when the host OS is in dark mode. Set these as CSS custom
 * properties on any ancestor (e.g. `:root` or your app shell) to re-theme
 * the widget without a rebuild — the widget's own `.brw-root` scope never
 * uses `!important`, so normal cascade wins.
 *
 * Surfaces
 * - `--brw-panel-bg` — dialog panel background
 * - `--brw-bubble-assistant-bg` — assistant bubble background
 * - `--brw-bubble-user-bg` — user bubble background
 * - `--brw-bubble-user-fg` — foreground on top of `--brw-bubble-user-bg`
 *   (set as a pair with `--brw-bubble-user-bg` to keep bubble contrast
 *   WCAG-adequate)
 * - `--brw-chip-bg` — attachment chip + inline panel background
 * - `--brw-composer-bg` — composer shell background
 *
 * Text
 * - `--brw-fg` — primary foreground text
 * - `--brw-fg-muted` — muted / secondary text
 *
 * Border / focus
 * - `--brw-border` — default border colour
 * - `--brw-border-focus` — colour applied on composer `:focus-within`
 * - `--brw-divider` — hairline between panel header / composer and thread
 *
 * Accent
 * - `--brw-accent` — send button + active AI toggle colour
 * - `--brw-accent-fg` — foreground on top of accent (set as a pair
 *   with `--brw-accent` so accent + accent-fg stay contrast-safe; e.g.
 *   a bright `--brw-accent` must pair with a dark `--brw-accent-fg`)
 *
 * Shadow
 * - `--brw-shadow` — composite drop shadow for FAB + panel
 *
 * @see SDD § 12 for the React contract.
 */
export function FeedbackButton({
  position = 'bottom-right',
  disabled = false,
  hidden = false,
  className,
  label = 'Feedback',
  onSubmit,
}: FeedbackButtonProps): ReactElement | null {
  const { submit, captureScreenshot, status, reset } = useFeedback();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const [expected, setExpected] = useState('');
  const [actual, setActual] = useState('');
  const [showExtras, setShowExtras] = useState(false);
  const [screenshot, setScreenshot] = useState<ScreenshotAttachment | null>(
    null,
  );
  const [files, setFiles] = useState<readonly FileAttachment[]>([]);
  const [confirmClose, setConfirmClose] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [succeeded, setSucceeded] = useState(false);
  const [regionOpen, setRegionOpen] = useState(false);
  // Submitter's per-issue AI preference. Defaults to true so the toggle
  // renders "on" the first time; only read on submit when the render-policy
  // matrix below says the toggle should be visible.
  const [useAi, setUseAi] = useState(true);
  const mountedRef = useRef(true);
  const screenshotUrlRef = useRef<string | null>(null);
  const fileIdRef = useRef(0);
  const composerRef = useRef<HTMLTextAreaElement | null>(null);

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
      if (screenshotUrlRef.current) {
        URL.revokeObjectURL(screenshotUrlRef.current);
        screenshotUrlRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    screenshotUrlRef.current = screenshot?.url ?? null;
  }, [screenshot]);

  const hasContent =
    draft.trim().length > 0 ||
    expected.length > 0 ||
    actual.length > 0 ||
    screenshot !== null ||
    files.length > 0;

  const resetAll = useCallback(() => {
    setDraft('');
    setExpected('');
    setActual('');
    setShowExtras(false);
    setScreenshot((prev) => {
      if (prev) URL.revokeObjectURL(prev.url);
      return null;
    });
    setFiles([]);
    setConfirmClose(false);
    setSubmitError(null);
    setSucceeded(false);
    setUseAi(true);
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
    if (succeeded) {
      handleFullClose();
      return;
    }
    if (hasContent) {
      setConfirmClose(true);
      return;
    }
    handleFullClose();
  }, [succeeded, hasContent, handleFullClose]);

  // Split from the historical one-shot capture: the button now only opens
  // the region overlay, and the overlay fans out to either a full-page or
  // a cropped capture. `setRegionOpen(false)` schedules the overlay unmount
  // and we start `captureScreenshot()` in the same tick — so the primary
  // protection against the overlay bleeding into the rendered page is
  // `data-brevwick-skip` on every overlay node, which the SDK's capture
  // path honours before it snapshots. The React unmount lands before the
  // async rasterization / crop work completes and is defence-in-depth.
  const performCapture = useCallback(
    async (region: Region | null) => {
      setSubmitError(null);
      try {
        const blob = await captureScreenshot();
        if (!mountedRef.current) return;
        const finalBlob = region ? await cropToRegion(blob, region) : blob;
        if (!mountedRef.current) return;
        setScreenshot((prev) => {
          if (prev) URL.revokeObjectURL(prev.url);
          return { blob: finalBlob, url: URL.createObjectURL(finalBlob) };
        });
      } catch (err) {
        if (!mountedRef.current) return;
        const message =
          err instanceof Error ? err.message : 'Screenshot capture failed';
        setSubmitError(message);
      }
    },
    [captureScreenshot],
  );

  const handleOpenRegionOverlay = useCallback(() => {
    setSubmitError(null);
    setRegionOpen(true);
  }, []);

  const handleCloseRegion = useCallback(() => {
    setRegionOpen(false);
  }, []);

  const handleConfirmRegion = useCallback(
    (region: Region) => {
      setRegionOpen(false);
      void performCapture(region);
    },
    [performCapture],
  );

  const handleConfirmFull = useCallback(() => {
    setRegionOpen(false);
    void performCapture(null);
  }, [performCapture]);

  const handleFiles = useCallback((list: FileList | null) => {
    if (!list || list.length === 0) return;
    setFiles((prev) => {
      const next = Array.from(list).map<FileAttachment>((file) => ({
        id: ++fileIdRef.current,
        file,
      }));
      return [...prev, ...next];
    });
  }, []);

  const removeScreenshot = useCallback(() => {
    setScreenshot((prev) => {
      if (prev) URL.revokeObjectURL(prev.url);
      return null;
    });
  }, []);

  const removeFile = useCallback((id: number) => {
    setFiles((prev) => prev.filter((f) => f.id !== id));
  }, []);

  const doSubmit = useCallback(async () => {
    if (status === 'submitting') return;
    if (!draft.trim()) {
      setSubmitError('Please describe what happened.');
      return;
    }
    setSubmitError(null);

    const attachments: Array<Blob | FeedbackAttachment> = [];
    if (screenshot) {
      const ext = screenshot.blob.type.split('/')[1]?.split('+')[0] || 'webp';
      attachments.push({
        blob: screenshot.blob,
        filename: `screenshot.${ext}`,
      });
    }
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

    try {
      const result = await submit(input);
      if (!mountedRef.current) return;
      onSubmit?.(result);
      if (result.ok) {
        setSucceeded(true);
        // If the user minimized mid-submit, pop the panel back open so the
        // success confirmation is actually seen. A silent success while
        // hidden leaves the user unsure whether their issue landed.
        setOpen(true);
      } else {
        setSubmitError(result.error.message);
        // Same reasoning for a failed submit: the error alert belongs in
        // front of the user, not buried behind a minimized panel.
        setOpen(true);
      }
    } catch (err) {
      if (!mountedRef.current) return;
      const message =
        err instanceof Error && err.message
          ? err.message
          : 'We could not submit your feedback. Please try again.';
      setSubmitError(message);
      setOpen(true);
    }
  }, [
    actual,
    draft,
    expected,
    files,
    onSubmit,
    screenshot,
    showAiToggle,
    status,
    submit,
    useAi,
  ]);

  // Pending-focus flag: "Send another" needs to focus the composer, but the
  // composer only remounts after the SuccessState unmounts. A layout effect
  // below consumes the flag after the composer is in the tree.
  const [focusComposerPending, setFocusComposerPending] = useState(false);

  /**
   * "Send another" — reset back to the empty Thread+Composer and move focus
   * into the composer textarea so keyboard users aren't dumped onto whatever
   * Radix's focus-trap picks next (the close button, in practice).
   */
  const handleSendAnother = useCallback(() => {
    resetAll();
    setFocusComposerPending(true);
  }, [resetAll]);

  useIsomorphicLayoutEffect(() => {
    if (!focusComposerPending) return;
    if (!composerRef.current) return;
    composerRef.current.focus();
    setFocusComposerPending(false);
  }, [focusComposerPending, succeeded]);

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
          className={`${rootClassName} brw-panel ${panelPosClass}`}
          aria-describedby={undefined}
        >
          <PanelHeader
            submitting={status === 'submitting'}
            onMinimize={handleMinimize}
            onClose={handleCloseClick}
          />
          {succeeded ? (
            <SuccessState onSendAnother={handleSendAnother} />
          ) : (
            <Thread
              greeting={GREETING}
              draft={draft}
              screenshot={screenshot}
              files={files}
              showExtras={showExtras}
              expected={expected}
              actual={actual}
              confirmClose={confirmClose}
              submitError={submitError}
              status={status}
              onToggleExtras={() => setShowExtras((v) => !v)}
              onExpectedChange={setExpected}
              onActualChange={setActual}
              onRemoveScreenshot={removeScreenshot}
              onRemoveFile={removeFile}
              onConfirmDiscard={handleFullClose}
              onCancelClose={() => setConfirmClose(false)}
            />
          )}
          {!succeeded && (
            <Composer
              ref={composerRef}
              draft={draft}
              submitting={status === 'submitting'}
              showAiToggle={showAiToggle}
              useAi={useAi}
              onDraftChange={setDraft}
              onSubmit={doSubmit}
              onAttachScreenshot={handleOpenRegionOverlay}
              onAttachFiles={handleFiles}
              onUseAiChange={setUseAi}
            />
          )}
          <PanelFooter />
        </Dialog.Content>
      </Dialog.Portal>
      <RegionCaptureOverlay
        open={regionOpen}
        onClose={handleCloseRegion}
        onConfirmRegion={handleConfirmRegion}
        onConfirmFull={handleConfirmFull}
      />
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
  greeting: string;
  draft: string;
  screenshot: ScreenshotAttachment | null;
  files: readonly FileAttachment[];
  showExtras: boolean;
  expected: string;
  actual: string;
  confirmClose: boolean;
  submitError: string | null;
  status: FeedbackStatus;
  onToggleExtras: () => void;
  onExpectedChange: (v: string) => void;
  onActualChange: (v: string) => void;
  onRemoveScreenshot: () => void;
  onRemoveFile: (id: number) => void;
  onConfirmDiscard: () => void;
  onCancelClose: () => void;
}

function Thread({
  greeting,
  draft,
  screenshot,
  files,
  showExtras,
  expected,
  actual,
  confirmClose,
  submitError,
  status,
  onToggleExtras,
  onExpectedChange,
  onActualChange,
  onRemoveScreenshot,
  onRemoveFile,
  onConfirmDiscard,
  onCancelClose,
}: ThreadProps): ReactElement {
  const trimmed = draft.trim();
  return (
    <div
      className="brw-thread"
      role="log"
      aria-live="polite"
      aria-label="Conversation"
    >
      <AssistantBubble>{greeting}</AssistantBubble>
      {trimmed.length > 0 && <UserBubble>{draft}</UserBubble>}
      {screenshot && (
        <AttachmentChip
          name="screenshot"
          size={screenshot.blob.size}
          previewUrl={screenshot.url}
          onRemove={onRemoveScreenshot}
        />
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
      {submitError && (
        <div className="brw-error" role="alert">
          {submitError}
        </div>
      )}
      {status === 'submitting' && (
        <AssistantBubble>
          <span className="brw-spinner" aria-hidden="true" /> Sending…
        </AssistantBubble>
      )}
      {confirmClose && (
        <DiscardConfirm onCancel={onCancelClose} onConfirm={onConfirmDiscard} />
      )}
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

function AssistantBubble({ children }: { children: ReactNode }): ReactElement {
  return <div className="brw-bubble brw-bubble--assistant">{children}</div>;
}

function UserBubble({ children }: { children: ReactNode }): ReactElement {
  return <div className="brw-bubble brw-bubble--user">{children}</div>;
}

interface AttachmentChipProps {
  name: string;
  size: number;
  previewUrl?: string;
  onRemove: () => void;
}

function AttachmentChip({
  name,
  size,
  previewUrl,
  onRemove,
}: AttachmentChipProps): ReactElement {
  return (
    <div className="brw-chip">
      {previewUrl && <img src={previewUrl} alt="" />}
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
  showAiToggle: boolean;
  useAi: boolean;
  onDraftChange: (v: string) => void;
  onSubmit: () => void;
  onAttachScreenshot: () => void;
  onAttachFiles: (list: FileList | null) => void;
  onUseAiChange: (v: boolean) => void;
}

const Composer = forwardRef<HTMLTextAreaElement, ComposerProps>(
  function Composer(
    {
      draft,
      submitting,
      showAiToggle,
      useAi,
      onDraftChange,
      onSubmit,
      onAttachScreenshot,
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

    return (
      <div className="brw-composer">
        <div className="brw-composer-shell">
          <button
            type="button"
            className="brw-icon-btn"
            aria-label="Capture screenshot of this page"
            onClick={onAttachScreenshot}
            disabled={submitting}
          >
            <ScreenshotIcon />
          </button>
          <label className="brw-icon-btn">
            <PaperclipIcon />
            <input
              type="file"
              multiple
              aria-label="Attach file"
              className="brw-file-input"
              onChange={(e) => {
                onAttachFiles(e.target.files);
                e.target.value = '';
              }}
              disabled={submitting}
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
 * Inline pill/switch surfaced in the composer footer when the project allows
 * submitters to opt in/out of AI formatting per issue. role="switch" +
 * aria-checked is the narrow semantic the WCAG a11y matrix wants; Space
 * toggles when focused (default browser behaviour on role="button" is Enter
 * and Space, but Space carries fewer collisions with the composer's
 * Enter-to-send shortcut).
 */
function AIToggle({ on, disabled, onChange }: AIToggleProps): ReactElement {
  const handleKeyDown = (e: KeyboardEvent<HTMLButtonElement>): void => {
    if (e.key === ' ') {
      e.preventDefault();
      onChange(!on);
    }
  };
  return (
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
      <span className="brw-aitoggle-dot" aria-hidden="true" />
      <span>AI</span>
    </button>
  );
}

interface SuccessStateProps {
  onSendAnother: () => void;
}

function SuccessState({ onSendAnother }: SuccessStateProps): ReactElement {
  return (
    <div
      className="brw-thread"
      role="log"
      aria-live="polite"
      aria-label="Confirmation"
    >
      <div className="brw-success-wrap">
        <div className="brw-bubble brw-bubble--success" role="status">
          Thanks — your issue is on its way.
        </div>
        <button
          type="button"
          className="brw-btn brw-btn-primary"
          onClick={onSendAnother}
        >
          Send another
        </button>
      </div>
    </div>
  );
}

/**
 * Crop a full-page screenshot Blob to the user-selected viewport rectangle.
 *
 * The source Blob from `captureScreenshot()` is rendered in device pixels by
 * `modern-screenshot`, but the region came from pointer-events in CSS pixels,
 * so we multiply the source rectangle by `devicePixelRatio` on the way in and
 * draw out at the selection's CSS-pixel size. Uses `OffscreenCanvas` when the
 * host provides it (cheaper, avoids a DOM node); otherwise falls back to a
 * detached `<canvas>` + `toBlob`. Output MIME is PNG — the caller derives
 * the attachment filename from `blob.type`.
 */
async function cropToRegion(blob: Blob, region: Region): Promise<Blob> {
  const url = URL.createObjectURL(blob);
  try {
    const img = await loadImageForCrop(url);
    const dpr =
      typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
    const sx = region.x * dpr;
    const sy = region.y * dpr;
    const sw = region.w * dpr;
    const sh = region.h * dpr;

    const OffscreenCanvasCtor =
      typeof OffscreenCanvas !== 'undefined' ? OffscreenCanvas : undefined;
    if (OffscreenCanvasCtor) {
      const canvas = new OffscreenCanvasCtor(region.w, region.h);
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Canvas 2D context unavailable');
      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, region.w, region.h);
      return await canvas.convertToBlob({ type: 'image/png' });
    }
    const canvas = document.createElement('canvas');
    canvas.width = region.w;
    canvas.height = region.h;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D context unavailable');
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, region.w, region.h);
    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (out) =>
          out ? resolve(out) : reject(new Error('Canvas produced no blob')),
        'image/png',
      );
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

function loadImageForCrop(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Screenshot failed to load for crop'));
    img.src = src;
  });
}

interface DragState {
  readonly startX: number;
  readonly startY: number;
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

interface RegionCaptureOverlayProps {
  open: boolean;
  onClose: () => void;
  onConfirmRegion: (region: Region) => void;
  onConfirmFull: () => void;
}

/**
 * Full-viewport overlay that lets the submitter drag-select a rectangle on
 * top of the page. Confirming with a non-degenerate rectangle fans out to
 * the crop pipeline; 'Capture full page' preserves the pre-#31 behaviour
 * for users who want the whole viewport.
 *
 * Mounts a second `Dialog.Root` independent of the main feedback panel so
 * Radix owns focus trap + scroll lock + Escape-to-dismiss. Every node
 * rendered here carries `data-brevwick-skip=""` so a rogue capture that
 * fires while the overlay is still in the tree still excludes the overlay
 * chrome from the image (the capture path unmounts the overlay first — this
 * is defence-in-depth).
 */
function RegionCaptureOverlay({
  open,
  onClose,
  onConfirmRegion,
  onConfirmFull,
}: RegionCaptureOverlayProps): ReactElement {
  const [drag, setDrag] = useState<DragState | null>(null);
  const [shake, setShake] = useState(false);
  const draggingRef = useRef(false);
  // Tracks the in-flight "shake settle" setTimeout. We keep the handle so
  // (a) the effect below can cancel it when the overlay closes — otherwise
  // a shake queued immediately before Esc would fire a setState on an
  // unmounted subtree (strict-mode warning) — and (b) rapid-fire Capture
  // clicks on a degenerate selection replace the timer instead of stacking.
  const shakeTimerRef = useRef<number | null>(null);

  const clearShakeTimer = (): void => {
    if (shakeTimerRef.current !== null) {
      window.clearTimeout(shakeTimerRef.current);
      shakeTimerRef.current = null;
    }
  };

  // Reset both the drag state and the transient shake flag whenever the
  // overlay closes, so a re-open starts from a clean slate rather than the
  // last session's selection. Also cancels any in-flight shake timer so
  // the setState does not fire into a torn-down subtree.
  useEffect(() => {
    if (!open) {
      setDrag(null);
      setShake(false);
      draggingRef.current = false;
      clearShakeTimer();
    }
  }, [open]);

  // Belt-and-braces unmount cleanup: the overlay normally closes via
  // `open=false` before unmount (handled above), but an upstream tree
  // tear-down could unmount us mid-shake — cancel the timer so React
  // doesn't log a "state update on unmounted component" warning.
  useEffect(() => {
    return () => {
      clearShakeTimer();
    };
  }, []);

  const handlePointerDown = (e: PointerEvent<HTMLDivElement>): void => {
    // React delegation bubbles pointerdown from the Cancel / Capture /
    // Capture-full-page controls up through this handler. Without this
    // guard the bubbled event would reinitialise the drag state to a
    // zero-size rect right before the button's own click fires, sending
    // a valid selection into the degenerate-shake path. `currentTarget`
    // is always the overlay layer; only initiate a drag when the press
    // landed directly on it (not on a descendant control).
    if (e.target !== e.currentTarget) return;
    // Ignore non-primary buttons (right-click / middle-click). pointerType
    // 'touch' and 'pen' always issue button === 0.
    if (e.button !== 0) return;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    draggingRef.current = true;
    setDrag({
      startX: e.clientX,
      startY: e.clientY,
      x: e.clientX,
      y: e.clientY,
      w: 0,
      h: 0,
    });
  };

  const handlePointerMove = (e: PointerEvent<HTMLDivElement>): void => {
    if (!draggingRef.current) return;
    setDrag((prev) => {
      if (!prev) return prev;
      const x = Math.min(prev.startX, e.clientX);
      const y = Math.min(prev.startY, e.clientY);
      const w = Math.abs(e.clientX - prev.startX);
      const h = Math.abs(e.clientY - prev.startY);
      return { startX: prev.startX, startY: prev.startY, x, y, w, h };
    });
  };

  const handlePointerUp = (e: PointerEvent<HTMLDivElement>): void => {
    if (!draggingRef.current) return;
    e.currentTarget.releasePointerCapture?.(e.pointerId);
    draggingRef.current = false;
  };

  const confirm = (): void => {
    if (!drag || drag.w <= REGION_MIN_SIDE_PX || drag.h <= REGION_MIN_SIDE_PX) {
      setShake(true);
      // Replace any in-flight settle timer so rapid-fire clicks don't stack.
      clearShakeTimer();
      shakeTimerRef.current = window.setTimeout(() => {
        shakeTimerRef.current = null;
        setShake(false);
      }, 320);
      return;
    }
    onConfirmRegion({ x: drag.x, y: drag.y, w: drag.w, h: drag.h });
  };

  // Enter-on-Dialog.Content must only confirm the region when the overlay
  // root itself has focus. Tab-focusing a button inside the overlay and
  // pressing Enter bubbles up here; without this guard we would hijack the
  // button's own Enter activation (Cancel, Capture full page) and run the
  // region-confirm path instead — a real a11y defect. `e.target === e.currentTarget`
  // restricts the shortcut to the overlay root (focused via Radix focus-trap
  // when the Dialog opens and no button is yet tabbed into).
  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>): void => {
    if (e.key !== 'Enter') return;
    if (e.target !== e.currentTarget) return;
    e.preventDefault();
    confirm();
  };

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="brw-region-backdrop" data-brevwick-skip="" />
        <Dialog.Content
          className={`brw-root brw-region-layer${shake ? ' brw-region-shake' : ''}`}
          data-brevwick-skip=""
          data-testid="brw-region-overlay"
          aria-label="Select screenshot region"
          aria-describedby={undefined}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          onKeyDown={handleKeyDown}
        >
          {drag && drag.w > 0 && drag.h > 0 && (
            <div
              className="brw-region-selection"
              data-testid="brw-region-selection"
              style={{
                left: drag.x,
                top: drag.y,
                width: drag.w,
                height: drag.h,
              }}
            />
          )}
          <div className="brw-region-controls" data-brevwick-skip="">
            <button
              type="button"
              className="brw-btn brw-region-btn"
              onClick={onClose}
            >
              Cancel
            </button>
            <button
              type="button"
              className="brw-btn brw-region-btn"
              onClick={onConfirmFull}
            >
              Capture full page
            </button>
            <button
              type="button"
              className="brw-btn brw-btn-primary brw-region-btn"
              onClick={confirm}
            >
              Capture
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
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

function ScreenshotIcon(): ReactElement {
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
      <rect x="3" y="5" width="18" height="12" rx="2" />
      <rect x="7" y="8" width="10" height="6" rx="1" strokeDasharray="2 2" />
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
