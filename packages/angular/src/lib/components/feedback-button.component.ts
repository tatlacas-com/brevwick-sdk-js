import { isPlatformBrowser } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  type ElementRef,
  EventEmitter,
  Input,
  Output,
  PLATFORM_ID,
  Renderer2,
  ViewEncapsulation,
  computed,
  effect,
  inject,
  signal,
  viewChild,
  type Signal,
} from '@angular/core';
import type {
  FeedbackAttachment,
  FeedbackInput,
  ProjectConfig,
  SubmitError,
  SubmitResult,
} from '@tatlacas/brevwick-sdk';
import { BrevwickService, type FeedbackPhase } from '../brevwick.service';
import { BREVWICK_ANGULAR_VERSION } from '../internal/version';

/**
 * Pin corner for the FAB. Mirrors the React adapter's `FeedbackButtonProps.position`.
 */
export type BwFeedbackButtonPosition = 'bottom-right' | 'bottom-left';

/**
 * Forced-palette choice. `'system'` defers to the OS-level
 * `prefers-color-scheme` media query (the default and pre-existing behaviour);
 * `'light'` / `'dark'` override it regardless of the OS setting.
 */
export type BwFeedbackButtonTheme = 'light' | 'dark' | 'system';

/**
 * Combined screenshot + file cap. Mirrored from the SDK's `MAX_ATTACHMENT_COUNT`
 * in `packages/sdk/src/submit.ts`. Enforced in the UI by disabling the
 * file-attach button once the combined total reaches this ceiling — that way
 * the user cannot queue an attachment the SDK would reject downstream.
 */
const MAX_ATTACHMENTS = 5;

/**
 * Maximum autogrow height of the composer textarea in pixels. Single source
 * of truth for both the JS effect (sets `style.height` against `scrollHeight`
 * bounded by this) and the CSS `max-height` rule.
 */
const COMPOSER_MAX_HEIGHT_PX = 120;

/**
 * Stagger between staged-status rows in milliseconds. Applied as
 * `style.animationDelay` per row (the rows mount with a CSS @keyframes
 * entrance, not a transition) so rows fade in sequentially even when
 * the underlying SDK phase events fire microseconds apart on a healthy
 * happy path. Honoured only when the user has not requested reduced motion.
 */
const STATUS_ROW_STAGGER_MS = 200;

const ASSISTANT_RECEIPT_TEXT = 'Thanks — your issue is on its way.';
const GREETING_TEXT =
  "Hi! Tell us what's happening. A screenshot helps if you have one.";

/**
 * One bubble in the conversation thread. The greeting and submitted-issue
 * receipt are `assistant` messages; submitted drafts become `user` messages.
 */
interface Message {
  readonly id: string;
  readonly role: 'assistant' | 'user';
  readonly text: string;
  readonly issueSent?: boolean;
  readonly sentAt?: number;
  /**
   * The exact, post-redaction payload the SDK POSTed for this message — set
   * only when the host enabled `config.debug`. When present, the bubble
   * renders a "copy raw payload" affordance so a developer can inspect
   * everything that left the device (rings/context the widget never shows).
   */
  readonly rawPayload?: Record<string, unknown>;
}

interface FileAttachment {
  readonly id: number;
  readonly file: File;
}

type ProjectConfigStatus = 'idle' | 'loading' | 'ready' | 'error';

interface ProjectConfigState {
  readonly status: ProjectConfigStatus;
  readonly config: ProjectConfig | null;
}

/**
 * Phase ordinal used by the staged-status rows to decide visibility. Row 1
 * ("Captured") shows from `'sanitising'` onwards, row 2 ("Sanitised") from
 * `'formatting'` onwards. Row 3 ("Formatting with AI…") has its own
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
 * Cheap relative-time formatter for the issue-sent receipt. The bubble
 * does not auto-refresh — once rendered the timestamp captures the moment
 * the issue was queued, which is the only thing that actually matters
 * (the user reads it within seconds of seeing it appear). Intentionally
 * does not pull in `Intl.RelativeTimeFormat` so the FESM bundle gzip
 * stays inside the §12 budget.
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

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} kB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Standalone feedback widget — a FAB plus a chat-style submission panel.
 *
 * Mirrors the React adapter's `FeedbackButton` (UI / UX / wire format)
 * minus the screenshot capture surface (region overlay, preview dialog).
 * Apps that need screenshots call {@link BrevwickService.captureScreenshot}
 * from their own component and pass the resulting `Blob` to
 * {@link BrevwickService.submit} via the `attachments` field.
 *
 * SSR-safe: rendered nodes still appear server-side; the open / close toggle
 * short-circuits on non-browser platforms via `isPlatformBrowser`. Other
 * handlers can only fire from real DOM events, so they are unreachable
 * server-side regardless.
 *
 * Theming follows the dual-variable pattern documented in the React
 * adapter's `styles.ts`: every rule reads `var(--brw-X, var(--brw-X-base))`
 * so a host `:root { --brw-X: ... }` override always wins, even under a
 * forced `theme="light|dark"` (which only rewrites the internal `-base`
 * defaults). See SDD § 12 for the public token list.
 */
@Component({
  selector: 'bw-feedback-button',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  // ViewEncapsulation.None: the React widget ships a single global
  // stylesheet that targets `.brw-*` class names; replicating it under
  // emulated encapsulation would force every rule to be rewritten with
  // `:host ::ng-deep` (deprecated) or recolour the dark-mode media query
  // to leak across host boundaries. None keeps the rules identical to
  // the React adapter so a designer who tweaks one stylesheet does not
  // have to maintain two.
  encapsulation: ViewEncapsulation.None,
  template: `
    @if (!hidden) {
      <button
        type="button"
        class="brw-root brw-fab"
        [class.brw-fab-bl]="position === 'bottom-left'"
        [class.brw-fab-br]="position !== 'bottom-left'"
        [attr.data-brevwick-skip]="''"
        [attr.data-brw-theme]="theme"
        [disabled]="disabled || isSubmitting()"
        aria-label="Open feedback form"
        (click)="toggle()"
      >
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
        {{ label }}
      </button>

      @if (open()) {
        <div
          class="brw-root brw-panel"
          [class.brw-panel-bl]="position === 'bottom-left'"
          [class.brw-panel-br]="position !== 'bottom-left'"
          role="dialog"
          aria-label="Send feedback"
          [attr.data-brevwick-skip]="''"
          [attr.data-brw-theme]="theme"
        >
          <!-- Panel header -->
          <div class="brw-panel-header">
            <span class="brw-panel-avatar" aria-hidden="true">B</span>
            <h2 class="brw-panel-title">Send feedback</h2>
            <button
              type="button"
              class="brw-icon-btn"
              aria-label="Minimize"
              (click)="minimize()"
            >
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
            </button>
            <button
              type="button"
              class="brw-icon-btn"
              aria-label="Close"
              [disabled]="isSubmitting()"
              (click)="onCloseClick()"
            >
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
            </button>
          </div>

          <!-- Conversation thread -->
          <div
            class="brw-thread"
            role="log"
            aria-live="polite"
            aria-label="Conversation"
          >
            @for (msg of messages(); track msg.id) {
              @if (msg.role === 'assistant') {
                <div class="brw-bubble brw-bubble--assistant">
                  {{ msg.text }}
                  @if (msg.issueSent) {
                    <div class="brw-bubble--receipt">
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
                      Issue sent · {{ relativeTime(msg.sentAt) }}
                    </div>
                  }
                </div>
              } @else {
                <div class="brw-bubble brw-bubble--user">
                  {{ msg.text }}
                  @if (msg.rawPayload !== undefined) {
                    <button
                      type="button"
                      class="brw-copy-raw"
                      aria-label="Copy the raw payload sent to the API"
                      data-brw-copy-raw
                      (click)="copyRaw(msg)"
                    >
                      {{
                        copiedRawId() === msg.id
                          ? 'Copied!'
                          : 'Copy raw payload'
                      }}
                    </button>
                  }
                </div>
              }
            }

            <!-- File attachment chips (file-only; screenshot UI is out of scope) -->
            @for (att of files(); track att.id) {
              <div class="brw-chip">
                <span class="brw-chip-name">{{ att.file.name }}</span>
                <span class="brw-chip-size">{{ size(att.file.size) }}</span>
                <button
                  type="button"
                  class="brw-chip-remove"
                  [attr.aria-label]="'Remove ' + att.file.name"
                  (click)="removeFile(att.id)"
                >
                  ×
                </button>
              </div>
            }

            <!-- Expected vs Actual disclosure -->
            <button
              type="button"
              class="brw-disclosure"
              [attr.aria-expanded]="showExtras()"
              [attr.aria-controls]="disclosureId"
              (click)="toggleExtras()"
            >
              {{
                showExtras()
                  ? 'Hide expected vs actual'
                  : 'Add expected vs actual'
              }}
            </button>
            @if (showExtras()) {
              <div [id]="disclosureId" class="brw-disclosure-panel">
                <label>
                  <span class="brw-disclosure-label">Expected</span>
                  <textarea
                    class="brw-disclosure-input"
                    rows="2"
                    [value]="expected()"
                    (input)="expected.set($any($event.target).value)"
                  ></textarea>
                </label>
                <label>
                  <span class="brw-disclosure-label">Actual</span>
                  <textarea
                    class="brw-disclosure-input"
                    rows="2"
                    [value]="actual()"
                    (input)="actual.set($any($event.target).value)"
                  ></textarea>
                </label>
              </div>
            }

            <!-- Inline (validation / pre-pipeline) error -->
            @if (errorMessage(); as msg) {
              <div class="brw-error" role="alert">{{ msg }}</div>
            }

            <!-- Staged status rows: dashed-divider checklist wrapper -->
            @if (showCaptured() || showSanitised() || showFormattingRow()) {
              <div class="brw-status-rows">
                <!-- Row 1 (Captured) -->
                @if (showCaptured()) {
                  <div
                    class="brw-status-row"
                    data-brw-row="captured"
                    style="animation-delay: 0ms"
                  >
                    <span class="brw-status-row-check" aria-hidden="true">
                      <svg
                        width="12"
                        height="12"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2.5"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                      >
                        <path d="M5 12l5 5L20 7" />
                      </svg>
                    </span>
                    <span class="brw-status-row-label"
                      >Captured route, console, network, device</span
                    >
                  </div>
                }

                <!-- Row 2 (Sanitised) -->
                @if (showSanitised()) {
                  <div
                    class="brw-status-row"
                    data-brw-row="sanitised"
                    [style.animation-delay.ms]="sanitisedDelayMs()"
                  >
                    <span class="brw-status-row-check" aria-hidden="true">
                      <svg
                        width="12"
                        height="12"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2.5"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                      >
                        <path d="M5 12l5 5L20 7" />
                      </svg>
                    </span>
                    <span class="brw-status-row-label"
                      >PII-sanitised, packaged</span
                    >
                  </div>
                }

                <!-- Row 3 (Formatting with AI…) — exact-match formatting + AI on -->
                @if (showFormattingRow()) {
                  <div
                    class="brw-status-row"
                    data-brw-row="formatting"
                    [style.animation-delay.ms]="formattingDelayMs()"
                  >
                    <span class="brw-spinner" aria-hidden="true"></span>
                    <span class="brw-status-row-label"
                      >Formatting with AI…</span
                    >
                  </div>
                }
              </div>
            }

            <!-- Retry row -->
            @if (showRetryRow(); as err) {
              <div
                class="brw-status-row brw-status-row--error"
                role="alert"
                data-brw-row="error"
                [attr.data-brw-error-code]="err.code"
              >
                {{ err.message }}
                <button
                  type="button"
                  class="brw-btn brw-status-row-retry"
                  (click)="onRetryClick()"
                >
                  Retry
                </button>
              </div>
            }

            <!-- Discard confirm -->
            @if (confirmClose()) {
              <div class="brw-confirm" role="alert" aria-label="Discard draft?">
                <span class="brw-confirm-msg">Discard your feedback?</span>
                <button
                  #keepBtn
                  type="button"
                  class="brw-btn"
                  (click)="cancelClose()"
                >
                  Keep
                </button>
                <button
                  type="button"
                  class="brw-btn brw-btn-primary"
                  (click)="discard()"
                >
                  Discard
                </button>
              </div>
            }
          </div>

          <!-- Composer -->
          <div class="brw-composer">
            <div class="brw-composer-shell">
              <label class="brw-icon-btn">
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  aria-hidden="true"
                >
                  <path
                    d="M21 10.5l-8.5 8.5a5 5 0 0 1-7-7l9-9a3.5 3.5 0 0 1 5 5l-9 9a2 2 0 0 1-3-3l7.5-7.5"
                  />
                </svg>
                <input
                  type="file"
                  multiple
                  [attr.aria-label]="fileLabel()"
                  class="brw-file-input"
                  [disabled]="attachDisabled()"
                  (change)="onFileChange($event)"
                />
              </label>
              <textarea
                #composerEl
                class="brw-composer-input"
                rows="1"
                placeholder="Describe the bug or feedback…"
                aria-label="Feedback message"
                [value]="draft()"
                (input)="onDraftInput($event)"
                (keydown)="onComposerKeydown($event)"
              ></textarea>
              @if (showAiToggle()) {
                <span class="brw-aitoggle-wrap">
                  <button
                    type="button"
                    role="switch"
                    aria-label="Format with AI"
                    [attr.aria-checked]="useAi()"
                    class="brw-aitoggle"
                    [class.brw-aitoggle--on]="useAi()"
                    [disabled]="isSubmitting()"
                    (click)="toggleAi()"
                    (keydown)="onAiToggleKeydown($event)"
                  >
                    <span class="brw-aitoggle-thumb" aria-hidden="true"></span>
                  </button>
                  <span class="brw-aitoggle-text" aria-hidden="true">AI</span>
                </span>
              }
              <button
                type="button"
                class="brw-send-btn"
                aria-label="Send"
                [disabled]="!canSend()"
                (click)="onSendClick()"
              >
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
              </button>
            </div>
          </div>

          <!-- Footer -->
          <div class="brw-panel-footer">
            <a
              class="brw-panel-footer-link"
              href="https://brevwick.dev"
              target="_blank"
              rel="noopener noreferrer"
            >
              Brevwick v{{ version }}
            </a>
          </div>
        </div>
      }
    }
  `,
  styles: [
    `
      :where(:root) {
        --brw-panel-bg-base: #ffffff;
        --brw-bubble-assistant-bg-base: #f1f5f9;
        --brw-bubble-user-bg-base: #0f172a;
        --brw-bubble-user-fg-base: #ffffff;
        --brw-chip-bg-base: #f1f5f9;
        --brw-composer-bg-base: #ffffff;
        --brw-fg-base: #0f172a;
        --brw-fg-muted-base: #64748b;
        --brw-border-base: #e2e8f0;
        --brw-border-focus-base: #0f172a;
        --brw-divider-base: #e2e8f0;
        --brw-accent-base: #0f172a;
        --brw-accent-fg-base: #ffffff;
        --brw-shadow-base:
          0 20px 48px rgba(15, 23, 42, 0.18), 0 6px 12px rgba(15, 23, 42, 0.08);
        --brw-error-base: #b91c1c;
        /* Success / check colour for the staged-status checklist. Matches
           the emerald used in the marketing AnimatedDemo so the in-widget
           checklist reads as the same affordance the docs preview.
           Widget-internal: no public --brw-success alias by design —
           host overrides flow through --brw-accent for chrome and don't
           need a knob for the green tick. */
        --brw-success-base: #10b981;
      }
      @media (prefers-color-scheme: dark) {
        :where(:root) {
          --brw-panel-bg-base: #0b1220;
          --brw-bubble-assistant-bg-base: #1e293b;
          --brw-bubble-user-bg-base: #f8fafc;
          --brw-bubble-user-fg-base: #0f172a;
          --brw-chip-bg-base: #253044;
          --brw-composer-bg-base: #0b1220;
          --brw-fg-base: #f8fafc;
          --brw-fg-muted-base: #94a3b8;
          --brw-border-base: #1e293b;
          --brw-border-focus-base: #f8fafc;
          --brw-divider-base: #1e293b;
          --brw-accent-base: #f8fafc;
          --brw-accent-fg-base: #0f172a;
          --brw-shadow-base:
            0 20px 48px rgba(0, 0, 0, 0.55), 0 6px 12px rgba(0, 0, 0, 0.35);
          /* Brighter emerald (500→400) keeps the tick legible on dark panels. */
          --brw-success-base: #34d399;
        }
      }
      .brw-root[data-brw-theme='light'] {
        --brw-panel-bg-base: #ffffff;
        --brw-bubble-assistant-bg-base: #f1f5f9;
        --brw-bubble-user-bg-base: #0f172a;
        --brw-bubble-user-fg-base: #ffffff;
        --brw-chip-bg-base: #f1f5f9;
        --brw-composer-bg-base: #ffffff;
        --brw-fg-base: #0f172a;
        --brw-fg-muted-base: #64748b;
        --brw-border-base: #e2e8f0;
        --brw-border-focus-base: #0f172a;
        --brw-divider-base: #e2e8f0;
        --brw-accent-base: #0f172a;
        --brw-accent-fg-base: #ffffff;
        --brw-shadow-base:
          0 20px 48px rgba(15, 23, 42, 0.18), 0 6px 12px rgba(15, 23, 42, 0.08);
        --brw-success-base: #10b981;
      }
      .brw-root[data-brw-theme='dark'] {
        --brw-panel-bg-base: #0b1220;
        --brw-bubble-assistant-bg-base: #1e293b;
        --brw-bubble-user-bg-base: #f8fafc;
        --brw-bubble-user-fg-base: #0f172a;
        --brw-chip-bg-base: #253044;
        --brw-composer-bg-base: #0b1220;
        --brw-fg-base: #f8fafc;
        --brw-fg-muted-base: #94a3b8;
        --brw-border-base: #1e293b;
        --brw-border-focus-base: #f8fafc;
        --brw-divider-base: #1e293b;
        --brw-accent-base: #f8fafc;
        --brw-accent-fg-base: #0f172a;
        --brw-shadow-base:
          0 20px 48px rgba(0, 0, 0, 0.55), 0 6px 12px rgba(0, 0, 0, 0.35);
        --brw-success-base: #34d399;
      }
      .brw-root {
        font-family:
          -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto,
          'Helvetica Neue', Arial, sans-serif;
        color: var(--brw-fg, var(--brw-fg-base));
      }
      .brw-fab {
        position: fixed;
        z-index: 2147483000;
        bottom: 24px;
        height: 48px;
        min-width: 48px;
        padding: 0 18px;
        border-radius: 999px;
        border: 1px solid var(--brw-border, var(--brw-border-base));
        background: var(--brw-accent, var(--brw-accent-base));
        color: var(--brw-accent-fg, var(--brw-accent-fg-base));
        font-size: 14px;
        font-weight: 500;
        display: inline-flex;
        align-items: center;
        gap: 8px;
        cursor: pointer;
        box-shadow: var(--brw-shadow, var(--brw-shadow-base));
        transition: transform 120ms ease-out;
      }
      .brw-fab:hover:not(:disabled) {
        transform: translateY(-1px);
      }
      .brw-fab:disabled {
        cursor: not-allowed;
        opacity: 0.5;
      }
      .brw-fab-br {
        right: 24px;
      }
      .brw-fab-bl {
        left: 24px;
      }
      .brw-fab-icon {
        width: 18px;
        height: 18px;
      }
      .brw-panel {
        position: fixed;
        z-index: 2147483002;
        bottom: 24px;
        width: min(92vw, 400px);
        height: min(80vh, 640px);
        display: flex;
        flex-direction: column;
        background: var(--brw-panel-bg, var(--brw-panel-bg-base));
        color: var(--brw-fg, var(--brw-fg-base));
        border: 1px solid var(--brw-border, var(--brw-border-base));
        border-radius: 16px 16px 12px 12px;
        box-shadow: var(--brw-shadow, var(--brw-shadow-base));
        overflow: hidden;
        animation: brw-slide-up 200ms ease-out;
      }
      .brw-panel-br {
        right: 24px;
      }
      .brw-panel-bl {
        left: 24px;
      }
      @keyframes brw-slide-up {
        from {
          transform: translateY(16px);
          opacity: 0;
        }
        to {
          transform: none;
          opacity: 1;
        }
      }
      @media (prefers-reduced-motion: reduce) {
        .brw-panel {
          animation: none;
        }
        .brw-fab {
          transition: none;
        }
      }
      @media (max-width: 480px) {
        .brw-panel {
          width: calc(100vw - 32px);
          left: 16px;
          right: 16px;
        }
      }
      .brw-panel-header {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 12px 14px;
        border-bottom: 1px solid var(--brw-divider, var(--brw-divider-base));
        flex-shrink: 0;
      }
      .brw-panel-avatar {
        width: 28px;
        height: 28px;
        border-radius: 999px;
        background: var(--brw-accent, var(--brw-accent-base));
        color: var(--brw-accent-fg, var(--brw-accent-fg-base));
        display: inline-flex;
        align-items: center;
        justify-content: center;
        font-weight: 600;
        font-size: 12px;
        flex-shrink: 0;
      }
      .brw-panel-title {
        margin: 0;
        font-size: 14px;
        font-weight: 600;
        flex: 1;
        min-width: 0;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .brw-icon-btn {
        width: 28px;
        height: 28px;
        padding: 0;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        border: 1px solid transparent;
        background: transparent;
        color: var(--brw-fg-muted, var(--brw-fg-muted-base));
        border-radius: 6px;
        cursor: pointer;
        font: inherit;
        line-height: 1;
      }
      .brw-icon-btn:hover:not(:disabled) {
        background: var(--brw-chip-bg, var(--brw-chip-bg-base));
        color: var(--brw-fg, var(--brw-fg-base));
      }
      .brw-icon-btn:focus-visible {
        outline: 2px solid var(--brw-border-focus, var(--brw-border-focus-base));
        outline-offset: 1px;
      }
      .brw-icon-btn:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }
      .brw-icon-btn svg {
        width: 16px;
        height: 16px;
      }
      .brw-thread {
        flex: 1;
        min-height: 0;
        overflow-y: auto;
        padding: 16px 14px;
        display: flex;
        flex-direction: column;
        gap: 10px;
        background: var(--brw-panel-bg, var(--brw-panel-bg-base));
      }
      .brw-bubble {
        max-width: 85%;
        padding: 10px 12px;
        border-radius: 14px;
        font-size: 13px;
        line-height: 1.45;
        word-wrap: break-word;
        white-space: pre-wrap;
      }
      .brw-bubble--assistant {
        align-self: flex-start;
        background: var(
          --brw-bubble-assistant-bg,
          var(--brw-bubble-assistant-bg-base)
        );
        color: var(--brw-fg, var(--brw-fg-base));
        border-bottom-left-radius: 4px;
      }
      .brw-bubble--user {
        align-self: flex-end;
        background: var(--brw-bubble-user-bg, var(--brw-bubble-user-bg-base));
        color: var(--brw-bubble-user-fg, var(--brw-bubble-user-fg-base));
        border-bottom-right-radius: 4px;
      }
      .brw-bubble--receipt {
        display: flex;
        align-items: center;
        gap: 4px;
        margin-top: 6px;
        font-size: 11px;
        color: var(--brw-fg-muted, var(--brw-fg-muted-base));
      }
      .brw-bubble--receipt svg {
        flex-shrink: 0;
      }
      /* Dev-only "copy raw payload" button (config.debug). Sits under the
         bubble text, muted, so it never competes with real widget chrome. */
      .brw-copy-raw {
        display: block;
        margin-top: 6px;
        padding: 2px 6px;
        font: inherit;
        font-size: 11px;
        line-height: 1.4;
        background: transparent;
        border: 1px solid
          var(--brw-bubble-user-fg, var(--brw-bubble-user-fg-base));
        border-radius: 6px;
        color: var(--brw-bubble-user-fg, var(--brw-bubble-user-fg-base));
        opacity: 0.7;
        cursor: pointer;
      }
      .brw-copy-raw:hover {
        opacity: 1;
      }
      .brw-chip {
        align-self: flex-end;
        display: inline-flex;
        align-items: center;
        gap: 8px;
        padding: 6px 10px;
        background: var(--brw-chip-bg, var(--brw-chip-bg-base));
        color: var(--brw-fg, var(--brw-fg-base));
        border: 1px solid var(--brw-border, var(--brw-border-base));
        border-radius: 12px;
        font-size: 12px;
        max-width: 85%;
      }
      .brw-chip-name {
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        max-width: 180px;
      }
      .brw-chip-size {
        color: var(--brw-fg-muted, var(--brw-fg-muted-base));
      }
      .brw-chip-remove {
        width: 20px;
        height: 20px;
        padding: 0;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        border: none;
        background: transparent;
        color: var(--brw-fg-muted, var(--brw-fg-muted-base));
        border-radius: 999px;
        cursor: pointer;
        font: inherit;
        line-height: 1;
      }
      .brw-chip-remove:hover {
        background: var(--brw-border, var(--brw-border-base));
        color: var(--brw-fg, var(--brw-fg-base));
      }
      .brw-disclosure {
        align-self: flex-start;
        background: transparent;
        border: none;
        padding: 0;
        color: var(--brw-fg-muted, var(--brw-fg-muted-base));
        font: inherit;
        font-size: 12px;
        cursor: pointer;
        text-decoration: underline;
      }
      .brw-disclosure:hover {
        color: var(--brw-fg, var(--brw-fg-base));
      }
      .brw-disclosure-panel {
        align-self: stretch;
        display: flex;
        flex-direction: column;
        gap: 6px;
        padding: 8px 10px;
        background: var(--brw-chip-bg, var(--brw-chip-bg-base));
        border: 1px solid var(--brw-border, var(--brw-border-base));
        border-radius: 10px;
      }
      .brw-disclosure-label {
        font-size: 11px;
        font-weight: 600;
        color: var(--brw-fg-muted, var(--brw-fg-muted-base));
        text-transform: uppercase;
        letter-spacing: 0.04em;
      }
      .brw-disclosure-input {
        width: 100%;
        box-sizing: border-box;
        padding: 6px 8px;
        font: inherit;
        font-size: 12px;
        color: var(--brw-fg, var(--brw-fg-base));
        background: var(--brw-panel-bg, var(--brw-panel-bg-base));
        border: 1px solid var(--brw-border, var(--brw-border-base));
        border-radius: 6px;
        resize: vertical;
        min-height: 34px;
      }
      .brw-composer {
        flex-shrink: 0;
        padding: 8px 10px;
        background: var(--brw-composer-bg, var(--brw-composer-bg-base));
        border-top: 1px solid var(--brw-divider, var(--brw-divider-base));
      }
      .brw-composer-shell {
        display: flex;
        align-items: flex-end;
        gap: 4px;
        padding: 6px 8px;
        background: var(--brw-composer-bg, var(--brw-composer-bg-base));
        border: 1px solid var(--brw-border, var(--brw-border-base));
        border-radius: 12px;
        transition: border-color 120ms ease-out;
      }
      .brw-composer-shell:focus-within {
        border-color: var(--brw-border-focus, var(--brw-border-focus-base));
      }
      @media (prefers-reduced-motion: reduce) {
        .brw-composer-shell {
          transition: none;
        }
      }
      .brw-composer-input {
        flex: 1;
        min-height: 34px;
        max-height: 120px;
        box-sizing: border-box;
        padding: 8px 4px;
        font: inherit;
        font-size: 13px;
        color: var(--brw-fg, var(--brw-fg-base));
        background: transparent;
        border: none;
        resize: none;
        overflow-y: auto;
        line-height: 1.4;
      }
      .brw-composer-input:focus-visible {
        outline: none;
      }
      .brw-send-btn {
        width: 34px;
        height: 34px;
        padding: 0;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        border: 1px solid var(--brw-accent, var(--brw-accent-base));
        background: var(--brw-accent, var(--brw-accent-base));
        color: var(--brw-accent-fg, var(--brw-accent-fg-base));
        border-radius: 10px;
        cursor: pointer;
        flex-shrink: 0;
      }
      .brw-aitoggle-wrap {
        flex-shrink: 0;
        display: inline-flex;
        align-items: center;
        gap: 6px;
        height: 34px;
        padding: 0 4px;
      }
      .brw-aitoggle-text {
        font-size: 12px;
        font-weight: 500;
        color: var(--brw-fg-muted, var(--brw-fg-muted-base));
        line-height: 1;
        user-select: none;
        transition: color 120ms ease-out;
      }
      .brw-aitoggle-wrap:has(.brw-aitoggle--on) .brw-aitoggle-text {
        color: var(--brw-fg, var(--brw-fg-base));
      }
      .brw-aitoggle {
        position: relative;
        flex-shrink: 0;
        width: 30px;
        height: 18px;
        padding: 0;
        border-radius: 999px;
        border: 1px solid var(--brw-border, var(--brw-border-base));
        background: var(--brw-chip-bg, var(--brw-chip-bg-base));
        cursor: pointer;
        transition:
          background-color 120ms ease-out,
          border-color 120ms ease-out;
      }
      .brw-aitoggle:focus-visible {
        outline: 2px solid var(--brw-border-focus, var(--brw-border-focus-base));
        outline-offset: 2px;
      }
      .brw-aitoggle:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }
      .brw-aitoggle-thumb {
        position: absolute;
        top: 50%;
        left: 2px;
        width: 12px;
        height: 12px;
        border-radius: 999px;
        background: var(--brw-fg-muted, var(--brw-fg-muted-base));
        transform: translateY(-50%);
        transition:
          left 140ms ease-out,
          background-color 120ms ease-out;
      }
      .brw-aitoggle--on {
        background: var(--brw-accent, var(--brw-accent-base));
        border-color: var(--brw-accent, var(--brw-accent-base));
      }
      .brw-aitoggle--on .brw-aitoggle-thumb {
        left: calc(100% - 14px);
        background: var(--brw-accent-fg, var(--brw-accent-fg-base));
      }
      @media (prefers-reduced-motion: reduce) {
        .brw-aitoggle,
        .brw-aitoggle-thumb,
        .brw-aitoggle-text {
          transition: none;
        }
      }
      .brw-send-btn:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }
      .brw-send-btn svg {
        width: 16px;
        height: 16px;
      }
      .brw-file-input {
        display: none;
      }
      .brw-confirm {
        align-self: stretch;
        display: flex;
        gap: 8px;
        align-items: center;
        padding: 8px 10px;
        background: var(--brw-chip-bg, var(--brw-chip-bg-base));
        border: 1px solid var(--brw-border, var(--brw-border-base));
        border-radius: 10px;
        font-size: 12px;
      }
      .brw-confirm-msg {
        flex: 1;
      }
      .brw-btn {
        height: 30px;
        padding: 0 12px;
        border-radius: 8px;
        border: 1px solid var(--brw-border, var(--brw-border-base));
        background: var(--brw-panel-bg, var(--brw-panel-bg-base));
        color: var(--brw-fg, var(--brw-fg-base));
        font: inherit;
        font-size: 12px;
        cursor: pointer;
      }
      .brw-btn:hover:not(:disabled) {
        background: var(--brw-chip-bg, var(--brw-chip-bg-base));
      }
      .brw-btn-primary {
        background: var(--brw-accent, var(--brw-accent-base));
        color: var(--brw-accent-fg, var(--brw-accent-fg-base));
        border-color: var(--brw-accent, var(--brw-accent-base));
      }
      .brw-error {
        color: var(--brw-error-base);
        font-size: 12px;
        align-self: stretch;
      }
      /* Staged-status rows: progress indicators, not conversation bubbles.
         They sit under a dashed top divider as a compact stacked checklist,
         mirroring the marketing AnimatedDemo widget mock — and intentionally
         stay outside the .brw-bubble class family so message-count queries
         ignore them. .brw-status-rows is the grouping container that owns
         the divider + stacking; .brw-status-row is one ticked line. The
         animation-delay is set inline per row so the three rows fade in
         sequentially under the shared @keyframes entrance even when the
         underlying SDK phase events fire microseconds apart. The
         reduced-motion media query collapses the entrance to an instant
         fade, pairing with the inline 0ms delay the adapter passes when
         the user has prefers-reduced-motion: reduce. */
      .brw-status-rows {
        align-self: stretch;
        display: flex;
        flex-direction: column;
        gap: 6px;
        margin-top: 2px;
        padding-top: 8px;
        border-top: 1px dashed var(--brw-divider, var(--brw-divider-base));
      }
      .brw-status-row {
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: 12px;
        line-height: 1.4;
        color: var(--brw-fg-muted, var(--brw-fg-muted-base));
        animation: brw-status-row-in 220ms ease-out both;
      }
      .brw-status-row-check {
        display: inline-flex;
        width: 12px;
        height: 12px;
        align-items: center;
        justify-content: center;
        color: var(--brw-success-base);
        flex-shrink: 0;
      }
      .brw-status-row-check svg {
        width: 12px;
        height: 12px;
      }
      /* The shared .brw-spinner ships at 14px so it reads at full size in
         the composer; inside the staged-status checklist it has to match
         the 12px tick so the third row's indicator sits on the same
         baseline as the first two. */
      .brw-status-row .brw-spinner {
        width: 12px;
        height: 12px;
      }
      .brw-status-row-label {
        flex: 1;
      }
      /* The retry row is a standalone alert that sits outside the
         checklist container, so it carries its own chrome — padding,
         radius, border — instead of inheriting the checklist's tick-line
         minimalism. The background stays transparent so the red border
         + red label read as an alert overlay rather than a filled bubble
         surface. */
      .brw-status-row--error {
        align-self: stretch;
        padding: 10px 12px;
        border-radius: 10px;
        background: transparent;
        color: var(--brw-error-base);
        border: 1px solid var(--brw-error-base);
        font-size: 13px;
        line-height: 1.45;
      }
      .brw-status-row-retry {
        margin-left: auto;
        padding: 4px 10px;
        font-size: 12px;
      }
      @keyframes brw-status-row-in {
        from {
          opacity: 0;
          transform: translateY(4px);
        }
        to {
          opacity: 1;
          transform: none;
        }
      }
      @media (prefers-reduced-motion: reduce) {
        .brw-status-row {
          animation: none;
        }
      }
      .brw-panel-footer {
        flex-shrink: 0;
        padding: 6px 10px 8px;
        text-align: center;
        background: var(--brw-composer-bg, var(--brw-composer-bg-base));
      }
      .brw-panel-footer-link {
        font-size: 10px;
        letter-spacing: 0.02em;
        color: var(--brw-fg-muted, var(--brw-fg-muted-base));
        text-decoration: none;
        opacity: 0.75;
        transition:
          opacity 120ms ease-out,
          color 120ms ease-out;
      }
      .brw-panel-footer-link:hover,
      .brw-panel-footer-link:focus-visible {
        opacity: 1;
        color: var(--brw-fg, var(--brw-fg-base));
        text-decoration: underline;
      }
      @media (prefers-reduced-motion: reduce) {
        .brw-panel-footer-link {
          transition: none;
        }
      }
      .brw-spinner {
        display: inline-block;
        width: 14px;
        height: 14px;
        border: 2px solid currentColor;
        border-right-color: transparent;
        border-radius: 999px;
        animation: brw-spin 0.7s linear infinite;
      }
      @keyframes brw-spin {
        to {
          transform: rotate(360deg);
        }
      }
      @media (prefers-reduced-motion: reduce) {
        .brw-spinner {
          animation-duration: 1.6s;
        }
      }
    `,
  ],
})
export class BwFeedbackButtonComponent {
  /** Corner the FAB pins to. Default `'bottom-right'`. */
  @Input() position: BwFeedbackButtonPosition = 'bottom-right';
  /** When true, the FAB renders as disabled and cannot open the panel. */
  @Input() disabled = false;
  /** When true, the component renders nothing. Useful for feature-flagging. */
  @Input() hidden = false;
  /** FAB label. Default `'Feedback'`. */
  @Input() label = 'Feedback';
  /**
   * Forced palette. `'system'` defers to the OS-level `prefers-color-scheme`
   * media query (the default); `'light'` / `'dark'` override regardless of
   * the OS setting. Bound through `[attr.data-brw-theme]` on the FAB and
   * panel so the dual-variable theming pattern from `BREVWICK_CSS` applies.
   */
  @Input() theme: BwFeedbackButtonTheme = 'system';
  /**
   * Fired with the SDK's `SubmitResult` after every submit (success or
   * failure). Mirrors React adapter's `onSubmit` prop.
   */
  @Output() submit = new EventEmitter<SubmitResult>();

  protected readonly version = BREVWICK_ANGULAR_VERSION;
  private static idSeq = 0;
  /** Per-instance id for the disclosure aria-controls. */
  protected readonly disclosureId = `brw-disclosure-${++BwFeedbackButtonComponent.idSeq}`;

  private readonly platformId = inject(PLATFORM_ID);
  private readonly brevwick = inject(BrevwickService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly renderer = inject(Renderer2);

  /**
   * Tracks whether the host view has been torn down. Async submit work
   * checks this before touching component signals or emitting on `submit`,
   * preventing post-destroy mutations.
   */
  private destroyed = false;

  // ── Core state signals ───────────────────────────────────────────────────

  protected readonly open = signal(false);
  protected readonly draft = signal('');
  protected readonly expected = signal('');
  protected readonly actual = signal('');
  protected readonly showExtras = signal(false);
  protected readonly confirmClose = signal(false);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly useAi = signal(true);
  protected readonly messages = signal<readonly Message[]>([
    { id: 'greeting', role: 'assistant', text: GREETING_TEXT },
  ]);
  protected readonly files = signal<readonly FileAttachment[]>([]);
  /**
   * Last `FeedbackInput` passed to `BrevwickService.submit`. Stored locally
   * (not just on the service) so a retry can replay the exact same payload
   * even after the user starts typing a new draft.
   */
  protected readonly lastSubmittedInput = signal<FeedbackInput | null>(null);
  /**
   * Id of the user bubble for the most recent submit, so the retry path can
   * re-attach a freshly composed `rawPayload` to the same bubble.
   */
  private lastUserMessageId: string | null = null;
  /** Id of the bubble whose copy button is showing "Copied!" feedback. */
  protected readonly copiedRawId = signal<string | null>(null);
  private copiedRawTimeout: ReturnType<typeof setTimeout> | undefined;
  /**
   * Project-config state, lazy-fetched on the first panel open. Mirrors the
   * React adapter's `useProjectConfig` hook semantics: never fetches at mount.
   */
  protected readonly projectConfig = signal<ProjectConfigState>({
    status: 'idle',
    config: null,
  });
  /**
   * `prefers-reduced-motion: reduce` snapshot. Kept in a signal so the row
   * stagger reacts when the OS setting flips mid-session.
   */
  protected readonly reducedMotion = signal(false);

  // ── Derived signals ──────────────────────────────────────────────────────

  protected readonly status = this.brevwick.status;
  protected readonly phase = this.brevwick.phase;
  protected readonly tagged = this.brevwick.error;

  protected readonly isSubmitting: Signal<boolean> = computed(
    () => this.status() === 'submitting',
  );

  protected readonly attachmentsAtCap: Signal<boolean> = computed(
    () => this.files().length >= MAX_ATTACHMENTS,
  );

  protected readonly attachDisabled: Signal<boolean> = computed(
    () => this.isSubmitting() || this.attachmentsAtCap(),
  );

  protected readonly hasContent: Signal<boolean> = computed(
    () =>
      this.draft().trim().length > 0 ||
      this.expected().length > 0 ||
      this.actual().length > 0 ||
      this.files().length > 0,
  );

  protected readonly canSend: Signal<boolean> = computed(
    () => !this.isSubmitting() && this.draft().trim().length > 0,
  );

  /**
   * Render-policy matrix mirrored from the React adapter's SDD § 12 rule:
   * the toggle is visible exactly when the config has loaded successfully,
   * AI is enabled for the project, AND the admin has opted submitters into
   * the choice. Any other state hides the toggle and the payload omits
   * `use_ai` so the server-side default applies.
   */
  protected readonly showAiToggle: Signal<boolean> = computed(() => {
    const c = this.projectConfig();
    return (
      c.status === 'ready' &&
      c.config?.ai_enabled === true &&
      c.config.ai_submitter_choice_allowed === true
    );
  });

  // Phase-driven status row visibility — matches React adapter line-for-line.
  protected readonly showCaptured: Signal<boolean> = computed(
    () => PHASE_RANK[this.phase()] >= PHASE_RANK.sanitising,
  );
  protected readonly showSanitised: Signal<boolean> = computed(
    () => PHASE_RANK[this.phase()] >= PHASE_RANK.formatting,
  );
  protected readonly showFormattingRow: Signal<boolean> = computed(
    () =>
      this.phase() === 'formatting' &&
      this.projectConfig().config?.ai_enabled === true,
  );
  protected readonly showRetryRow: Signal<SubmitError | null> = computed(() => {
    const err = this.tagged();
    return this.phase() === 'error' && err !== null ? err : null;
  });

  // Stagger delays. When reduced-motion is active every row mounts at 0 ms
  // so all three rows appear together rather than cascading in.
  protected readonly sanitisedDelayMs: Signal<number> = computed(() =>
    this.reducedMotion() ? 0 : STATUS_ROW_STAGGER_MS,
  );
  protected readonly formattingDelayMs: Signal<number> = computed(() =>
    this.reducedMotion() ? 0 : STATUS_ROW_STAGGER_MS * 2,
  );

  protected readonly fileLabel: Signal<string> = computed(() =>
    this.attachmentsAtCap()
      ? `Maximum ${MAX_ATTACHMENTS} attachments reached`
      : 'Attach file',
  );

  // ── ID counters (refs in React; plain mutable fields here) ───────────────

  private fileIdSeq = 0;
  private messageIdSeq = 0;

  // Track the @ViewChild composer textarea for the autogrow effect.
  private readonly composerEl =
    viewChild<ElementRef<HTMLTextAreaElement>>('composerEl');
  private readonly keepBtn =
    viewChild<ElementRef<HTMLButtonElement>>('keepBtn');

  // Helpers exposed to the template — narrow wrappers around the module-level
  // formatters so the binding expressions stay short.
  protected relativeTime(ms: number | undefined): string {
    return formatRelativeTime(ms);
  }
  protected size(bytes: number): string {
    return formatSize(bytes);
  }

  constructor() {
    // Match the React adapter's reduced-motion gate: subscribe to the OS
    // media query and update the signal so a user toggling the setting
    // mid-submit picks up the change on the next render. SSR-safe — the
    // `window.matchMedia` call is gated on `isPlatformBrowser`.
    if (
      isPlatformBrowser(this.platformId) &&
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function'
    ) {
      const mql: MediaQueryList = window.matchMedia(
        '(prefers-reduced-motion: reduce)',
      );
      this.reducedMotion.set(mql.matches);
      const onChange = (e: MediaQueryListEvent): void => {
        if (this.destroyed) return;
        this.reducedMotion.set(e.matches);
      };
      // `addEventListener` is the modern API; older Safari only ships the
      // deprecated `addListener` fallback. Try the modern one first; the
      // legacy fallback keeps the widget working for Safari 13.
      if (typeof mql.addEventListener === 'function') {
        mql.addEventListener('change', onChange);
        this.destroyRef.onDestroy(() =>
          mql.removeEventListener('change', onChange),
        );
      } else if (
        typeof (mql as MediaQueryList & { addListener?: unknown })
          .addListener === 'function'
      ) {
        (
          mql as MediaQueryList & {
            addListener: (cb: (e: MediaQueryListEvent) => void) => void;
            removeListener: (cb: (e: MediaQueryListEvent) => void) => void;
          }
        ).addListener(onChange);
        this.destroyRef.onDestroy(() =>
          (
            mql as MediaQueryList & {
              removeListener: (cb: (e: MediaQueryListEvent) => void) => void;
            }
          ).removeListener(onChange),
        );
      }
    }

    // Composer autogrow: every time the draft signal mutates, snap the
    // textarea height to its scrollHeight bounded by COMPOSER_MAX_HEIGHT_PX.
    // The React adapter uses a layout effect; Angular's signal-driven
    // `effect()` runs after the DOM commit and is the equivalent hook.
    // Renderer2 (instead of direct DOM access) keeps the SSR build path
    // safe — Renderer2 abstracts over the platform server's no-op renderer.
    effect(() => {
      // Read the draft signal so the effect re-runs when it changes.
      this.draft();
      const ref = this.composerEl();
      const el = ref?.nativeElement;
      if (!el) return;
      this.renderer.setStyle(el, 'height', 'auto');
      const next = Math.min(el.scrollHeight, COMPOSER_MAX_HEIGHT_PX);
      this.renderer.setStyle(el, 'height', `${next}px`);
    });

    // Lazy project-config fetch on first panel open. Mirrors the React
    // adapter's `useProjectConfig` hook: explicitly does NOT fetch on mount,
    // so the widget's "zero-cost until opened" property holds.
    // `allowSignalWrites: true` is required because the synchronous transition
    // to `loading` and the async resolution / rejection branches all need to
    // mutate `projectConfig`. The effect only reads `open()`, so there is no
    // feedback loop — this opts out of the default NG0600 guard for a write
    // pattern that is intentional. Without it, dev-mode runs throw inside the
    // effect, the .then handler never fires, and `projectConfig` stays at
    // `'idle'` so the AI toggle never appears.
    let triggered = false;
    effect(
      () => {
        if (!this.open()) return;
        if (triggered) return;
        triggered = true;
        this.projectConfig.set({ status: 'loading', config: null });
        void this.brevwick
          .getConfig()
          .then((config) => {
            if (this.destroyed) return;
            this.projectConfig.set(
              config !== null
                ? { status: 'ready', config }
                : { status: 'error', config: null },
            );
          })
          .catch(() => {
            if (this.destroyed) return;
            this.projectConfig.set({ status: 'error', config: null });
          });
      },
      { allowSignalWrites: true },
    );

    // Move focus to the "Keep" button when the discard confirm appears,
    // mirroring the React adapter — the non-destructive default lands under
    // the keyboard so an accidental Enter preserves the draft.
    effect(() => {
      if (!this.confirmClose()) return;
      const btn = this.keepBtn()?.nativeElement;
      btn?.focus();
    });

    this.destroyRef.onDestroy(() => {
      this.destroyed = true;
      if (this.copiedRawTimeout) clearTimeout(this.copiedRawTimeout);
    });
  }

  // ── Open / close / reset ─────────────────────────────────────────────────

  protected toggle(): void {
    if (!isPlatformBrowser(this.platformId)) return;
    if (this.open()) {
      this.minimize();
    } else {
      this.open.set(true);
      this.errorMessage.set(null);
    }
  }

  /**
   * Close the panel without discarding draft content. Mirrors the React
   * adapter's `handleMinimize`: the user gets back to their work but the
   * composer state, attachments, and any in-flight error survive.
   */
  protected minimize(): void {
    this.open.set(false);
    this.confirmClose.set(false);
    this.errorMessage.set(null);
  }

  /**
   * Mapped from the panel header × button. When the draft has any content
   * the button shows the discard confirm; when it is empty the panel
   * closes immediately.
   */
  protected onCloseClick(): void {
    if (this.hasContent()) {
      this.confirmClose.set(true);
      return;
    }
    this.fullClose();
  }

  protected cancelClose(): void {
    this.confirmClose.set(false);
  }

  protected discard(): void {
    this.fullClose();
  }

  private fullClose(): void {
    this.open.set(false);
    this.resetAll();
  }

  private resetAll(): void {
    this.draft.set('');
    this.expected.set('');
    this.actual.set('');
    this.showExtras.set(false);
    this.files.set([]);
    this.confirmClose.set(false);
    this.errorMessage.set(null);
    this.messages.set([
      { id: 'greeting', role: 'assistant', text: GREETING_TEXT },
    ]);
    this.useAi.set(true);
    this.lastSubmittedInput.set(null);
    this.brevwick.reset();
  }

  protected toggleExtras(): void {
    this.showExtras.update((v) => !v);
  }

  // ── Composer events ──────────────────────────────────────────────────────

  protected onDraftInput(event: Event): void {
    const target = event.target as HTMLTextAreaElement;
    this.draft.set(target.value);
  }

  protected onComposerKeydown(event: KeyboardEvent): void {
    // Enter → submit; Shift+Enter (and any modifier combination) → newline.
    // `isComposing` filters IME composition events so a Japanese / Chinese
    // user converting kana to kanji with Enter does not accidentally send.
    if (
      event.key === 'Enter' &&
      !event.shiftKey &&
      !event.ctrlKey &&
      !event.metaKey &&
      !event.altKey &&
      !event.isComposing
    ) {
      event.preventDefault();
      void this.doSubmit();
    }
  }

  protected toggleAi(): void {
    this.useAi.update((v) => !v);
  }

  protected onAiToggleKeydown(event: KeyboardEvent): void {
    if (event.key === ' ') {
      event.preventDefault();
      this.toggleAi();
    }
  }

  protected onSendClick(): void {
    void this.doSubmit();
  }

  // ── Files ────────────────────────────────────────────────────────────────

  protected onFileChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.handleFiles(input.files);
    // Clear so re-selecting the same file fires `change` again.
    input.value = '';
  }

  private handleFiles(list: FileList | null): void {
    if (!list || list.length === 0) return;
    this.files.update((prev) => {
      // Cap the total at MAX_ATTACHMENTS. Drop the overflow tail rather
      // than silently dropping arbitrary entries — keeps prefix-of-input
      // semantics so the user can predict which files made it through.
      const remaining = MAX_ATTACHMENTS - prev.length;
      if (remaining <= 0) return prev;
      const next: FileAttachment[] = [];
      for (let i = 0; i < Math.min(list.length, remaining); i++) {
        const file = list.item(i);
        if (file) next.push({ id: ++this.fileIdSeq, file });
      }
      return [...prev, ...next];
    });
  }

  protected removeFile(id: number): void {
    this.files.update((prev) => prev.filter((f) => f.id !== id));
  }

  // ── Submit / retry ───────────────────────────────────────────────────────

  /**
   * Build the `FeedbackInput` from the current draft + extras + files +
   * AI-toggle render-policy. Title is the first non-empty line, sliced to
   * 120 chars; description is the **raw** draft (the trim-fix landed in
   * PR #111 — must not regress).
   */
  private buildInput(): FeedbackInput {
    const draftValue = this.draft();
    const trimmed = draftValue.trim();
    const title = trimmed.split('\n', 1)[0]!.slice(0, 120);
    const expectedTrim = this.expected().trim();
    const actualTrim = this.actual().trim();
    const attachments: Array<Blob | FeedbackAttachment> = this.files().map(
      ({ file }) => ({ blob: file, filename: file.name }),
    );
    return {
      title,
      description: draftValue,
      ...(expectedTrim ? { expected: expectedTrim } : {}),
      ...(actualTrim ? { actual: actualTrim } : {}),
      ...(attachments.length ? { attachments } : {}),
      ...(this.showAiToggle() ? { use_ai: this.useAi() } : {}),
    };
  }

  protected async doSubmit(): Promise<void> {
    if (this.isSubmitting()) return;
    if (!this.draft().trim()) {
      this.errorMessage.set('Please describe what happened.');
      return;
    }
    this.errorMessage.set(null);

    const input = this.buildInput();
    const submittedDraft = this.draft();

    // Push the user's draft into the conversation immediately and clear
    // the composer BEFORE awaiting submit(). The synchronous bubble + clear
    // makes the wait feel fast — staged-status rows carry the rest of the
    // animation while the network round-trip is in flight (issue #74).
    const userMessageId = `msg-${++this.messageIdSeq}`;
    this.messages.update((prev) => [
      ...prev,
      {
        id: userMessageId,
        role: 'user',
        text: submittedDraft,
      },
    ]);
    this.draft.set('');
    this.expected.set('');
    this.actual.set('');
    this.showExtras.set(false);
    this.files.set([]);
    this.lastSubmittedInput.set(input);
    this.lastUserMessageId = userMessageId;

    try {
      const result = await this.brevwick.submit(input);
      if (this.destroyed) return;
      this.submit.emit(result);
      this.attachRawPayload(userMessageId, result);
      if (result.ok) {
        this.messages.update((prev) => [
          ...prev,
          {
            id: `msg-${++this.messageIdSeq}`,
            role: 'assistant',
            text: ASSISTANT_RECEIPT_TEXT,
            issueSent: true,
            sentAt: Date.now(),
          },
        ]);
      }
      // Pop the panel back open so the success bubble or retry row is
      // actually seen by a user who minimised mid-submit. Mirrors the
      // React adapter — a silent success while hidden leaves the user
      // unsure whether their issue landed.
      this.open.set(true);
    } catch (err) {
      if (this.destroyed) return;
      // Chunk-load failure path — the service has already flipped phase
      // to 'error' and stored the synthetic SubmitError. Just pop the
      // panel back open so the retry row is visible.
      void err;
      this.open.set(true);
    }
  }

  protected async onRetryClick(): Promise<void> {
    const last = this.lastSubmittedInput();
    if (!last) return;
    if (this.isSubmitting()) return;
    try {
      const result = await this.brevwick.retry();
      if (this.destroyed) return;
      if (result) {
        this.submit.emit(result);
        if (this.lastUserMessageId) {
          this.attachRawPayload(this.lastUserMessageId, result);
        }
        if (result.ok) {
          this.messages.update((prev) => [
            ...prev,
            {
              id: `msg-${++this.messageIdSeq}`,
              role: 'assistant',
              text: ASSISTANT_RECEIPT_TEXT,
              issueSent: true,
              sentAt: Date.now(),
            },
          ]);
        }
      }
      this.open.set(true);
    } catch (err) {
      if (this.destroyed) return;
      void err;
      this.open.set(true);
    }
  }

  /**
   * Stamp the dev-only raw payload onto a user bubble once `submit()`
   * resolves. No-op unless the host enabled `config.debug` (the SDK only
   * populates `result.debug` then), so this is inert in production.
   */
  private attachRawPayload(messageId: string, result: SubmitResult): void {
    const payload = result.debug?.payload;
    if (!payload) return;
    this.messages.update((prev) =>
      prev.map((m) => (m.id === messageId ? { ...m, rawPayload: payload } : m)),
    );
  }

  /**
   * Copy the dev-only raw payload (the exact, post-redaction JSON body POSTed
   * to the ingest endpoint) to the clipboard. Pretty-printed with two-space
   * indent; the content is identical to the wire bytes. Degrades to a no-op
   * where the async clipboard API is missing.
   */
  protected copyRaw(message: Message): void {
    if (!message.rawPayload) return;
    const json = JSON.stringify(message.rawPayload, null, 2);
    const clip = navigator.clipboard;
    if (!clip) return;
    void clip.writeText(json).then(
      () => {
        this.copiedRawId.set(message.id);
        if (this.copiedRawTimeout) clearTimeout(this.copiedRawTimeout);
        this.copiedRawTimeout = setTimeout(() => {
          this.copiedRawId.set(null);
        }, 1500);
      },
      () => {
        /* clipboard write rejected (permissions) — leave the label as is */
      },
    );
  }
}
