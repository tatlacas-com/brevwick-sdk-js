'use client';

import * as Dialog from '@radix-ui/react-dialog';
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type FormEvent,
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

const AUTO_CLOSE_MS = 1500;

/**
 * `useLayoutEffect` is a no-op on the server (React warns but does not run
 * it). Alias to `useEffect` on the server so we can safely call it in code
 * that might hydrate without triggering a warning. The module-only SSR-safe
 * pattern.
 */
const useIsomorphicLayoutEffect =
  typeof window !== 'undefined' ? useLayoutEffect : useEffect;

/**
 * Module-level guard so the `<style>` tag is inserted into the document at
 * most once per session, regardless of how many `<FeedbackButton>` instances
 * mount. React does not dedupe `<style>` tags by `id`, so the previous
 * render-time approach could produce duplicate style nodes in consumers who
 * render multiple buttons.
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
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [expected, setExpected] = useState('');
  const [actual, setActual] = useState('');
  const [screenshot, setScreenshot] = useState<Blob | null>(null);
  const [screenshotUrl, setScreenshotUrl] = useState<string | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [titleError, setTitleError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);
  const screenshotUrlRef = useRef<string | null>(null);

  useBrevwickStyles();

  // Track mounted state so async handlers can bail out after unmount.
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (closeTimerRef.current) {
        clearTimeout(closeTimerRef.current);
        closeTimerRef.current = null;
      }
      if (screenshotUrlRef.current) {
        URL.revokeObjectURL(screenshotUrlRef.current);
        screenshotUrlRef.current = null;
      }
    };
  }, []);

  // Keep ref in sync so unmount cleanup revokes the current URL without
  // needing a `screenshotUrl` dependency (which would retrigger the effect).
  useEffect(() => {
    screenshotUrlRef.current = screenshotUrl;
  }, [screenshotUrl]);

  const resetForm = useCallback(() => {
    setTitle('');
    setDescription('');
    setExpected('');
    setActual('');
    setScreenshot(null);
    setScreenshotUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    setFiles([]);
    setTitleError(null);
    setSubmitError(null);
    reset();
  }, [reset]);

  const handleOpenChange = useCallback(
    (next: boolean) => {
      setOpen(next);
      if (!next) {
        if (closeTimerRef.current) {
          clearTimeout(closeTimerRef.current);
          closeTimerRef.current = null;
        }
        resetForm();
      }
    },
    [resetForm],
  );

  const handleCaptureScreenshot = useCallback(async () => {
    setSubmitError(null);
    try {
      const blob = await captureScreenshot();
      if (!mountedRef.current) return;
      setScreenshot(blob);
      setScreenshotUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return URL.createObjectURL(blob);
      });
    } catch (err) {
      if (!mountedRef.current) return;
      const message =
        err instanceof Error ? err.message : 'Screenshot capture failed';
      setSubmitError(message);
    }
  }, [captureScreenshot]);

  const handleFiles = useCallback((list: FileList | null) => {
    if (!list) return;
    setFiles(Array.from(list));
  }, []);

  const handleSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      // Guard against double-submit via Enter-in-textarea while the submit
      // button is disabled.
      if (status === 'submitting') return;
      setSubmitError(null);
      if (!title.trim()) {
        setTitleError('Title is required');
        return;
      }
      setTitleError(null);

      const attachments: Array<Blob | FeedbackAttachment> = [];
      if (screenshot) {
        // Derive the extension from the blob's MIME (the SDK produces
        // `image/webp`) so the attachment's filename matches its content.
        const ext = screenshot.type.split('/')[1]?.split('+')[0] || 'webp';
        attachments.push({ blob: screenshot, filename: `screenshot.${ext}` });
      }
      for (const f of files) attachments.push({ blob: f, filename: f.name });

      const input: FeedbackInput = {
        title: title.trim(),
        description,
        expected: expected || undefined,
        actual: actual || undefined,
        attachments: attachments.length ? attachments : undefined,
      };

      try {
        const result = await submit(input);
        if (!mountedRef.current) return;
        onSubmit?.(result);
        if (result.ok) {
          closeTimerRef.current = setTimeout(() => {
            closeTimerRef.current = null;
            if (!mountedRef.current) return;
            setOpen(false);
            resetForm();
          }, AUTO_CLOSE_MS);
        } else {
          setSubmitError(result.error.message);
        }
      } catch (err) {
        // `submit` only rejects when the lazy submit chunk fails to load
        // (deploy mismatch / offline). Surface a generic message so the
        // dialog can recover and the user can retry.
        if (!mountedRef.current) return;
        const message =
          err instanceof Error && err.message
            ? err.message
            : 'We could not submit your feedback. Please try again.';
        setSubmitError(message);
      }
    },
    [
      actual,
      description,
      expected,
      files,
      onSubmit,
      resetForm,
      screenshot,
      status,
      submit,
      title,
    ],
  );

  if (hidden) return null;

  const posClass = position === 'bottom-left' ? 'brw-fab-bl' : 'brw-fab-br';
  const rootClassName = ['brw-root', className].filter(Boolean).join(' ');

  return (
    <Dialog.Root open={open} onOpenChange={handleOpenChange}>
      <Dialog.Trigger asChild>
        <button
          type="button"
          data-brevwick-skip=""
          className={`${rootClassName} brw-fab ${posClass}`}
          disabled={disabled}
          aria-label="Open feedback form"
        >
          {label}
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay
          data-brevwick-skip=""
          className={`${rootClassName} brw-overlay`}
        />
        <Dialog.Content
          data-brevwick-skip=""
          className={`${rootClassName} brw-dialog`}
          aria-describedby={undefined}
        >
          <Dialog.Title className="brw-title">Send feedback</Dialog.Title>
          <form onSubmit={handleSubmit} noValidate>
            <label className="brw-field">
              <span className="brw-label">Title *</span>
              <input
                className="brw-input"
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                aria-invalid={titleError ? 'true' : undefined}
                aria-describedby={titleError ? 'brw-title-err' : undefined}
              />
              {titleError && (
                <span id="brw-title-err" className="brw-error" role="alert">
                  {titleError}
                </span>
              )}
            </label>
            <label className="brw-field">
              <span className="brw-label">Description</span>
              <textarea
                className="brw-textarea"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </label>
            <label className="brw-field">
              <span className="brw-label">Expected</span>
              <textarea
                className="brw-textarea"
                value={expected}
                onChange={(e) => setExpected(e.target.value)}
              />
            </label>
            <label className="brw-field">
              <span className="brw-label">Actual</span>
              <textarea
                className="brw-textarea"
                value={actual}
                onChange={(e) => setActual(e.target.value)}
              />
            </label>
            <div className="brw-field">
              <div className="brw-row">
                <button
                  type="button"
                  className="brw-btn"
                  onClick={handleCaptureScreenshot}
                >
                  Attach screenshot
                </button>
                <label className="brw-btn brw-file-label">
                  Attach file
                  <input
                    type="file"
                    multiple
                    className="brw-file-input"
                    onChange={(e) => handleFiles(e.target.files)}
                  />
                </label>
              </div>
              {screenshotUrl && screenshot && (
                <div className="brw-thumb">
                  <img src={screenshotUrl} alt="Screenshot preview" />
                  <span>{formatSize(screenshot.size)}</span>
                </div>
              )}
              {files.length > 0 && (
                <div className="brw-files">
                  {files
                    .map((f) => `${f.name} (${formatSize(f.size)})`)
                    .join(', ')}
                </div>
              )}
            </div>
            {submitError && (
              <div className="brw-error" role="alert">
                {submitError}
              </div>
            )}
            {status === 'success' && (
              <div className="brw-success" role="status">
                Thanks — report sent
              </div>
            )}
            <div className="brw-footer">
              <Dialog.Close asChild>
                <button type="button" className="brw-btn">
                  Cancel
                </button>
              </Dialog.Close>
              <button
                type="submit"
                className="brw-btn brw-btn-primary"
                disabled={status === 'submitting'}
              >
                {status === 'submitting' && (
                  <span className="brw-spinner" aria-hidden="true" />
                )}
                {status === 'submitting' ? 'Sending…' : 'Send'}
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} kB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
