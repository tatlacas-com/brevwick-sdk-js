import {
  Show,
  createSignal,
  onMount,
  type Component,
  type JSX,
} from 'solid-js';
import type { FeedbackInput, SubmitResult } from '@tatlacas/brevwick-sdk';
import { useFeedback } from '../use-feedback';
import { BREVWICK_CSS, BREVWICK_STYLE_ID } from '../styles';
import { BREVWICK_SOLID_VERSION } from '../internal/version';

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
 * textarea + send. Every extra surface (region crop, attachment preview, AI
 * toggle, expected/actual disclosure) lives in the React adapter and is out
 * of scope for the Solid V1 — see SDD § 12.
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
  const { submit, status, reset } = useFeedback();
  const [open, setOpen] = createSignal(false);
  const [draft, setDraft] = createSignal('');
  const [errorMsg, setErrorMsg] = createSignal<string | null>(null);

  const fabPosClass = () =>
    props.position === 'bottom-left' ? 'brw-fab-bl' : 'brw-fab-br';
  const panelPosClass = () =>
    props.position === 'bottom-left' ? 'brw-panel-bl' : 'brw-panel-br';
  const rootClass = () => ['brw-root', props.class].filter(Boolean).join(' ');

  const handleSubmit = async (): Promise<void> => {
    if (status() === 'submitting') return;
    const text = draft().trim();
    if (!text) {
      setErrorMsg('Please describe what happened.');
      return;
    }
    setErrorMsg(null);

    const derivedTitle = text.split('\n', 1)[0]!.slice(0, 120);
    const input: FeedbackInput = {
      title: derivedTitle,
      description: text,
    };

    try {
      const result = await submit(input);
      props.onSubmit?.(result);
      if (result.ok) {
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

  const handleClose = (): void => {
    setOpen(false);
    setErrorMsg(null);
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
              class="brw-btn brw-btn-primary"
              aria-label="Send"
              disabled={
                status() === 'submitting' || draft().trim().length === 0
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
