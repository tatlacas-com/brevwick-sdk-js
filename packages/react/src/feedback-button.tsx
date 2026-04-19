'use client';

import * as Dialog from '@radix-ui/react-dialog';
import {
  useCallback,
  useEffect,
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
import { useFeedback } from './use-feedback';
import { BREVWICK_CSS, BREVWICK_STYLE_ID } from './styles';

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
 * Module-level guard so the <style> tag is inserted at most once per session
 * regardless of how many <FeedbackButton>s mount. React does not dedupe
 * `<style>` by id, so render-time injection would produce duplicates for
 * consumers who render multiple buttons.
 */
let hasInjectedStyles = false;

function useBrevwickStyles(): void {
  useIsomorphicLayoutEffect(() => {
    if (hasInjectedStyles) return;
    if (typeof document === 'undefined') return;
    if (document.getElementById(BREVWICK_STYLE_ID)) {
      hasInjectedStyles = true;
      return;
    }
    const el = document.createElement('style');
    el.id = BREVWICK_STYLE_ID;
    el.textContent = BREVWICK_CSS;
    document.head.appendChild(el);
    hasInjectedStyles = true;
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
  const [files, setFiles] = useState<File[]>([]);
  const [confirmClose, setConfirmClose] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [succeeded, setSucceeded] = useState(false);
  const mountedRef = useRef(true);
  const screenshotUrlRef = useRef<string | null>(null);

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
    setFiles((prev) => [...prev, ...Array.from(list)]);
  }, []);

  const removeScreenshot = useCallback(() => {
    setScreenshot((prev) => {
      if (prev) URL.revokeObjectURL(prev.url);
      return null;
    });
  }, []);

  const removeFile = useCallback((index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
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
    for (const f of files) attachments.push({ blob: f, filename: f.name });

    const trimmed = draft.trim();
    const derivedTitle = trimmed.split('\n', 1)[0]!.slice(0, 120);
    const input: FeedbackInput = {
      title: derivedTitle,
      description: trimmed,
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
      } else {
        setSubmitError(result.error.message);
      }
    } catch (err) {
      if (!mountedRef.current) return;
      const message =
        err instanceof Error && err.message
          ? err.message
          : 'We could not submit your feedback. Please try again.';
      setSubmitError(message);
    }
  }, [actual, draft, expected, files, onSubmit, screenshot, status, submit]);

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
          onInteractOutside={(e) => {
            // Overlay-click semantics: treat the same as Esc (minimize, preserve).
            // Radix already routes through onOpenChange, so no extra state work.
            e.preventDefault();
            handleMinimize();
          }}
        >
          <PanelHeader onMinimize={handleMinimize} onClose={handleCloseClick} />
          {succeeded ? (
            <SuccessState onSendAnother={resetAll} />
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
  onMinimize: () => void;
  onClose: () => void;
}

function PanelHeader({ onMinimize, onClose }: PanelHeaderProps): ReactElement {
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
  files: readonly File[];
  showExtras: boolean;
  expected: string;
  actual: string;
  confirmClose: boolean;
  submitError: string | null;
  status: 'idle' | 'submitting' | 'success' | 'error';
  onToggleExtras: () => void;
  onExpectedChange: (v: string) => void;
  onActualChange: (v: string) => void;
  onRemoveScreenshot: () => void;
  onRemoveFile: (index: number) => void;
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
      {files.map((f, i) => (
        <AttachmentChip
          key={`${f.name}-${i}`}
          name={f.name}
          size={f.size}
          onRemove={() => onRemoveFile(i)}
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
        <div
          className="brw-confirm"
          role="alertdialog"
          aria-label="Discard draft?"
        >
          <span className="brw-confirm-msg">Discard your feedback?</span>
          <button type="button" className="brw-btn" onClick={onCancelClose}>
            Keep
          </button>
          <button
            type="button"
            className="brw-btn brw-btn-primary"
            onClick={onConfirmDiscard}
          >
            Discard
          </button>
        </div>
      )}
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
  const panelId = 'brw-extras-panel';
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

function Composer({
  draft,
  submitting,
  onDraftChange,
  onSubmit,
  onAttachScreenshot,
  onAttachFiles,
}: ComposerProps): ReactElement {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  // Autogrow between ~1 and ~5 rows. Max-height from CSS bounds it; measuring
  // scrollHeight each keystroke is cheap next to React's own render cost.
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  }, [draft]);

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>): void => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
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
      <label className="brw-icon-btn" aria-label="Attach file">
        <PaperclipIcon />
        <input
          type="file"
          multiple
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
