import {
  Show,
  createSignal,
  onCleanup,
  onMount,
  type Component,
  type JSX,
} from 'solid-js';
import type {
  FeedbackAttachment,
  FeedbackInput,
  SubmitResult,
} from '@tatlacas/brevwick-sdk';
import { useFeedback } from '../use-feedback';
import { BREVWICK_CSS, BREVWICK_STYLE_ID } from '../styles';
import { BREVWICK_SOLID_VERSION } from '../internal/version';

/**
 * Combined screenshot + file cap, mirrored from the SDK's
 * `MAX_ATTACHMENT_COUNT`. Prevents the user from queuing an attachment the
 * SDK would reject downstream.
 */
const MAX_ATTACHMENTS = 5;

export type BrevwickTheme = 'light' | 'dark' | 'system';

export interface FeedbackButtonProps {
  /** Corner the FAB pins to. Default `'bottom-right'`. */
  position?: 'bottom-right' | 'bottom-left';
  /** When true, the FAB renders as disabled and cannot open the dialog. */
  disabled?: boolean;
  /** When true, the component renders nothing. Useful for feature-flagging. */
  hidden?: boolean;
  /** Additional class appended to the FAB and dialog root for styling overrides. */
  class?: string;
  /** FAB label. Default `'Feedback'`. */
  label?: JSX.Element;
  /** Force a palette regardless of the OS `prefers-color-scheme` setting. */
  theme?: BrevwickTheme;
  /** Fired with the SDK's `SubmitResult` after every submit (success or failure). */
  onSubmit?: (result: SubmitResult) => void;
}

interface ScreenshotAttachment {
  readonly id: string;
  readonly blob: Blob;
  readonly url: string;
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
 * Brevwick feedback widget — a FAB plus a popover composer.
 *
 * Solid V1 ships a deliberately small subset of the React widget's UI:
 * textarea + screenshot capture + send. Every extra surface (region crop,
 * attachment preview, AI toggle, expected/actual disclosure) lives in the
 * React adapter and is out of scope for the Solid V1 — see SDD § 12.
 *
 * SSR-safe: the entire component is gated behind `Show when={isClient}`, so
 * a SolidStart server render emits nothing and the hydration pass mounts
 * the FAB on the client.
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

const FeedbackButtonInner: Component<FeedbackButtonProps> = (props) => {
  const { submit, captureScreenshot, status, reset } = useFeedback();
  const [open, setOpen] = createSignal(false);
  const [draft, setDraft] = createSignal('');
  const [screenshots, setScreenshots] = createSignal<ScreenshotAttachment[]>(
    [],
  );
  const [capturing, setCapturing] = createSignal(false);
  const [errorMsg, setErrorMsg] = createSignal<string | null>(null);

  const fabPosClass = () =>
    props.position === 'bottom-left' ? 'brw-fab-bl' : 'brw-fab-br';
  const panelPosClass = () =>
    props.position === 'bottom-left' ? 'brw-panel-bl' : 'brw-panel-br';
  const rootClass = () => ['brw-root', props.class].filter(Boolean).join(' ');

  const handleCapture = async (): Promise<void> => {
    if (capturing()) return;
    if (screenshots().length >= MAX_ATTACHMENTS) {
      setErrorMsg(`Maximum ${MAX_ATTACHMENTS} attachments reached`);
      return;
    }
    setErrorMsg(null);
    setCapturing(true);
    try {
      const blob = await captureScreenshot();
      // `crypto.randomUUID()` (universal in modern browsers + Node ≥ 19) is
      // preferred over Solid's `createUniqueId()` here because the id is
      // generated inside an event handler, not during component setup.
      const id =
        typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
          ? crypto.randomUUID()
          : `brw-shot-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const url = URL.createObjectURL(blob);
      setScreenshots((prev) => [...prev, { id, blob, url }]);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Screenshot capture failed';
      setErrorMsg(message);
    } finally {
      setCapturing(false);
    }
  };

  const removeScreenshot = (id: string): void => {
    setScreenshots((prev) => {
      const target = prev.find((s) => s.id === id);
      if (target) URL.revokeObjectURL(target.url);
      return prev.filter((s) => s.id !== id);
    });
  };

  const handleSubmit = async (): Promise<void> => {
    if (status() === 'submitting' || capturing()) return;
    const text = draft().trim();
    if (!text) {
      setErrorMsg('Please describe what happened.');
      return;
    }
    setErrorMsg(null);

    // Snapshot the queued screenshots once at submit-time so a chip removal
    // mid-await (`removeScreenshot()`) can't desync the attachment payload
    // from the post-success revoke loop. The user's intent at the moment of
    // clicking Send is what we transmit.
    const queued = screenshots();
    const attachments: FeedbackAttachment[] = queued.map((s, idx) => {
      const ext = s.blob.type.split('/')[1]?.split('+')[0] || 'webp';
      const filename =
        queued.length === 1
          ? `screenshot.${ext}`
          : `screenshot-${idx + 1}.${ext}`;
      return { blob: s.blob, filename };
    });

    const derivedTitle = text.split('\n', 1)[0]!.slice(0, 120);
    // Trim the description to match `derivedTitle` — submitting raw
    // `draft()` would ship `"   hi   \n"` while the title shows `"hi"`,
    // surfacing leading whitespace to ingest. The React adapter's intent is
    // "no leading whitespace in submitted descriptions"; mirror it here.
    const input: FeedbackInput = {
      title: derivedTitle,
      description: text,
      attachments: attachments.length ? attachments : undefined,
    };

    try {
      const result = await submit(input);
      props.onSubmit?.(result);
      if (result.ok) {
        for (const s of queued) URL.revokeObjectURL(s.url);
        setScreenshots([]);
        setDraft('');
      } else {
        setErrorMsg(result.error.message);
      }
    } catch (err) {
      const message =
        err instanceof Error && err.message
          ? err.message
          : 'We could not submit your feedback. Please try again.';
      setErrorMsg(message);
    }
  };

  /**
   * Revoke every currently-queued blob URL and clear the screenshot list.
   * Object URLs persist for the document's lifetime unless explicitly
   * revoked — without this the close-without-submit and `ok:false` paths
   * leak one allocation per captured screenshot. `revokeObjectURL` on an
   * already-revoked URL is a no-op, so calling this from both `handleClose`
   * and `onCleanup` is safe.
   */
  const revokeAllScreenshots = (): void => {
    for (const s of screenshots()) URL.revokeObjectURL(s.url);
    setScreenshots([]);
  };

  // Catch the rare unmount-without-close path (route change, parent
  // re-render that swaps the FAB out, HMR teardown).
  onCleanup(() => {
    for (const s of screenshots()) URL.revokeObjectURL(s.url);
  });

  const handleClose = (): void => {
    setOpen(false);
    setErrorMsg(null);
    revokeAllScreenshots();
    if (status() !== 'submitting') reset();
  };

  return (
    <>
      <button
        type="button"
        data-brevwick-skip=""
        data-brw-theme={props.theme ?? 'system'}
        class={`${rootClass()} brw-fab ${fabPosClass()}`}
        disabled={props.disabled}
        aria-label="Open feedback form"
        aria-expanded={open()}
        onClick={() => setOpen((v) => !v)}
      >
        {props.label ?? 'Feedback'}
      </button>
      <Show when={open()}>
        <div
          role="dialog"
          aria-modal="false"
          aria-label="Send feedback"
          data-brevwick-skip=""
          data-brw-theme={props.theme ?? 'system'}
          class={`${rootClass()} brw-panel ${panelPosClass()}`}
        >
          <div class="brw-panel-header">
            <span class="brw-panel-title">Send feedback</span>
            <button
              type="button"
              class="brw-icon-btn"
              aria-label="Close"
              onClick={handleClose}
              disabled={status() === 'submitting'}
            >
              ×
            </button>
          </div>
          <div class="brw-body">
            <textarea
              class="brw-textarea"
              placeholder="Describe the bug or feedback…"
              aria-label="Feedback message"
              value={draft()}
              onInput={(e) => setDraft(e.currentTarget.value)}
              disabled={status() === 'submitting'}
            />
            <Show when={screenshots().length > 0}>
              <div class="brw-attachments">
                {screenshots().map((s, idx) => (
                  <span class="brw-chip">
                    {screenshots().length === 1
                      ? 'screenshot'
                      : `screenshot ${idx + 1}`}
                    <button
                      type="button"
                      class="brw-chip-remove"
                      aria-label="Remove screenshot"
                      onClick={() => removeScreenshot(s.id)}
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            </Show>
            <Show when={errorMsg()}>
              {(msg) => (
                <div class="brw-error" role="alert">
                  {msg()}
                </div>
              )}
            </Show>
            <Show when={status() === 'success'}>
              <div class="brw-success" role="status">
                Thanks — your issue is on its way.
              </div>
            </Show>
          </div>
          <div class="brw-actions">
            <button
              type="button"
              class="brw-btn"
              aria-label={
                screenshots().length >= MAX_ATTACHMENTS
                  ? `Maximum ${MAX_ATTACHMENTS} attachments reached`
                  : capturing()
                    ? 'Capturing screenshot…'
                    : 'Capture screenshot'
              }
              disabled={
                capturing() ||
                status() === 'submitting' ||
                screenshots().length >= MAX_ATTACHMENTS
              }
              onClick={() => {
                void handleCapture();
              }}
            >
              {capturing() ? 'Capturing…' : 'Screenshot'}
            </button>
            <button
              type="button"
              class="brw-btn brw-btn-primary"
              aria-label="Send"
              disabled={
                status() === 'submitting' ||
                capturing() ||
                draft().trim().length === 0
              }
              onClick={() => {
                void handleSubmit();
              }}
            >
              {status() === 'submitting' ? 'Sending…' : 'Send'}
            </button>
          </div>
          <div class="brw-footer">
            <a
              href="https://brevwick.dev"
              target="_blank"
              rel="noopener noreferrer"
            >
              Brevwick v{BREVWICK_SOLID_VERSION}
            </a>
          </div>
        </div>
      </Show>
    </>
  );
};
