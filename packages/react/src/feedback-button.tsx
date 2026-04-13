'use client';

import * as Dialog from '@radix-ui/react-dialog';
import {
  useCallback,
  useEffect,
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

export interface FeedbackButtonProps {
  position?: 'bottom-right' | 'bottom-left';
  disabled?: boolean;
  hidden?: boolean;
  className?: string;
  label?: ReactNode;
  onSubmit?: (result: SubmitResult) => void;
}

const AUTO_CLOSE_MS = 1500;

function BrevwickStyles(): ReactElement {
  return (
    <style
      id={BREVWICK_STYLE_ID}
      // CSS is a constant string we authored; no interpolation. Inlined once
      // per tree — React de-dupes by id via dangerouslySetInnerHTML identity.
      dangerouslySetInnerHTML={{ __html: BREVWICK_CSS }}
    />
  );
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

  useEffect(
    () => () => {
      if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
      if (screenshotUrl) URL.revokeObjectURL(screenshotUrl);
    },
    [screenshotUrl],
  );

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
    const blob = await captureScreenshot();
    setScreenshot(blob);
    setScreenshotUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return URL.createObjectURL(blob);
    });
  }, [captureScreenshot]);

  const handleFiles = useCallback((list: FileList | null) => {
    if (!list) return;
    setFiles(Array.from(list));
  }, []);

  const handleSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      setSubmitError(null);
      if (!title.trim()) {
        setTitleError('Title is required');
        return;
      }
      setTitleError(null);

      const attachments: Array<Blob | FeedbackAttachment> = [];
      if (screenshot)
        attachments.push({ blob: screenshot, filename: 'screenshot.png' });
      for (const f of files) attachments.push({ blob: f, filename: f.name });

      const input: FeedbackInput = {
        title: title.trim(),
        description,
        expected: expected || undefined,
        actual: actual || undefined,
        attachments: attachments.length ? attachments : undefined,
      };

      const result = await submit(input);
      onSubmit?.(result);
      if (result.ok) {
        closeTimerRef.current = setTimeout(() => {
          setOpen(false);
          resetForm();
        }, AUTO_CLOSE_MS);
      } else {
        setSubmitError(result.error.message);
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
      submit,
      title,
    ],
  );

  if (hidden) return null;

  const posClass =
    position === 'bottom-left' ? 'brw-fab-bl' : 'brw-fab-br';
  const rootClassName = ['brw-root', className].filter(Boolean).join(' ');

  return (
    <>
      <BrevwickStyles />
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
                  <label className="brw-btn" style={{ display: 'inline-block' }}>
                    Attach file
                    <input
                      type="file"
                      multiple
                      style={{ display: 'none' }}
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
                    {files.map((f) => `${f.name} (${formatSize(f.size)})`).join(', ')}
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
    </>
  );
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} kB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
