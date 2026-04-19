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
  SubmitResult,
} from 'brevwick-sdk';
import { useFeedback, type FeedbackStatus } from './use-feedback';
import {
  BREVWICK_CSS,
  BREVWICK_STYLE_ID,
  COMPOSER_MAX_HEIGHT_PX,
} from './styles';

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

/**
 * Monotonic id attached to each uploaded file at insert time. Using `name` or
 * the index as the React key would cause duplicate-named files or removals
 * of middle items to reconcile surviving chips against the wrong slots.
 */
interface FileAttachment {
  readonly id: number;
  readonly file: File;
}

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
  const mountedRef = useRef(true);
  const screenshotUrlRef = useRef<string | null>(null);
  const fileIdRef = useRef(0);
  const composerRef = useRef<HTMLTextAreaElement | null>(null);

  useBrevwickStyles();

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

  const handleCaptureScreenshot = useCallback(async () => {
    setSubmitError(null);
    try {
      const blob = await captureScreenshot();
      if (!mountedRef.current) return;
      setScreenshot((prev) => {
        if (prev) URL.revokeObjectURL(prev.url);
        return { blob, url: URL.createObjectURL(blob) };
      });
    } catch (err) {
      if (!mountedRef.current) return;
      const message =
        err instanceof Error ? err.message : 'Screenshot capture failed';
      setSubmitError(message);
    }
  }, [captureScreenshot]);

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
    };

    try {
      const result = await submit(input);
      if (!mountedRef.current) return;
      onSubmit?.(result);
      if (result.ok) {
        setSucceeded(true);
        // If the user minimized mid-submit, pop the panel back open so the
        // success confirmation is actually seen. A silent success while
        // hidden leaves the user unsure whether their report landed.
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
  }, [actual, draft, expected, files, onSubmit, screenshot, status, submit]);

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
              onDraftChange={setDraft}
              onSubmit={doSubmit}
              onAttachScreenshot={handleCaptureScreenshot}
              onAttachFiles={handleFiles}
            />
          )}
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
  onDraftChange: (v: string) => void;
  onSubmit: () => void;
  onAttachScreenshot: () => void;
  onAttachFiles: (list: FileList | null) => void;
}

const Composer = forwardRef<HTMLTextAreaElement, ComposerProps>(
  function Composer(
    {
      draft,
      submitting,
      onDraftChange,
      onSubmit,
      onAttachScreenshot,
      onAttachFiles,
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
        <button
          type="button"
          className="brw-icon-btn"
          aria-label="Attach screenshot"
          onClick={onAttachScreenshot}
          disabled={submitting}
        >
          <CameraIcon />
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
    );
  },
);

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
          Thanks — your report is on its way.
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

function CameraIcon(): ReactElement {
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
      <path d="M3 7h4l2-3h6l2 3h4v12H3z" />
      <circle cx="12" cy="13" r="4" />
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
