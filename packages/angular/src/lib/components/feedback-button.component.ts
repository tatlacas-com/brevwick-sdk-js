import { isPlatformBrowser } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  Input,
  Output,
  EventEmitter,
  PLATFORM_ID,
  computed,
  inject,
  signal,
  type Signal,
} from '@angular/core';
import type { SubmitResult } from '@tatlacas/brevwick-sdk';
import { BrevwickService } from '../brevwick.service';

/**
 * Pin corner for the FAB. Mirrors the React adapter's `FeedbackButtonProps.position`.
 */
export type BwFeedbackButtonPosition = 'bottom-right' | 'bottom-left';

/**
 * Standalone FAB component that opens the Brevwick feedback widget.
 *
 * This is a deliberately lean Angular surface — the full chat-style panel
 * (multi-screenshot, region-select capture, AI toggle, etc.) lives in
 * `@tatlacas/brevwick-react`'s `FeedbackButton`. The Angular component
 * renders a minimum-viable FAB + textarea + submit so consumers have a
 * working out-of-the-box widget; apps that need richer UX wrap
 * {@link BrevwickService} themselves. The component does NOT trigger
 * screenshot capture — it only submits a text-only `{ title, description }`
 * payload. Apps that need screenshots call
 * {@link BrevwickService.captureScreenshot} from their own component and
 * pass the resulting `Blob` through `BrevwickService.submit`'s
 * `attachments` field.
 *
 * SSR-safe: rendered nodes still appear server-side; the open/close toggle
 * short-circuits on non-browser platforms via `isPlatformBrowser`. The
 * other handlers can only fire from real DOM events, so they are
 * unreachable server-side regardless.
 */
@Component({
  selector: 'bw-feedback-button',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (!hidden) {
      <button
        type="button"
        class="bw-fab"
        [class.bw-fab--bl]="position === 'bottom-left'"
        [attr.data-brevwick-skip]="''"
        [disabled]="disabled || isSubmitting()"
        [attr.aria-label]="
          open() ? 'Close feedback form' : 'Open feedback form'
        "
        (click)="toggle()"
      >
        {{ label }}
      </button>

      @if (open()) {
        <div
          class="bw-panel"
          [class.bw-panel--bl]="position === 'bottom-left'"
          role="dialog"
          aria-label="Send feedback"
          [attr.data-brevwick-skip]="''"
        >
          <textarea
            class="bw-input"
            rows="4"
            [value]="draft()"
            (input)="onDraftChange($any($event.target).value)"
            placeholder="Describe the bug or feedback…"
            aria-label="Feedback message"
          ></textarea>

          @if (errorMessage()) {
            <div class="bw-error" role="alert">{{ errorMessage() }}</div>
          }

          <div class="bw-actions">
            <button type="button" class="bw-btn" (click)="close()">
              Cancel
            </button>
            <button
              type="button"
              class="bw-btn bw-btn--primary"
              [disabled]="!canSubmit()"
              (click)="onSubmitClick()"
            >
              {{ isSubmitting() ? 'Sending…' : 'Send' }}
            </button>
          </div>
        </div>
      }
    }
  `,
  styles: [
    `
      :host {
        display: contents;
      }
      .bw-fab {
        position: fixed;
        bottom: 24px;
        right: 24px;
        padding: 10px 16px;
        border-radius: 999px;
        background: #111;
        color: #fff;
        border: 0;
        font: inherit;
        font-weight: 500;
        cursor: pointer;
        box-shadow: 0 6px 18px rgba(0, 0, 0, 0.18);
        z-index: 2147483646;
      }
      .bw-fab:disabled {
        opacity: 0.6;
        cursor: not-allowed;
      }
      .bw-fab--bl {
        right: auto;
        left: 24px;
      }
      .bw-panel {
        position: fixed;
        bottom: 80px;
        right: 24px;
        width: min(360px, calc(100vw - 32px));
        background: #fff;
        color: #111;
        border-radius: 12px;
        box-shadow: 0 10px 40px rgba(0, 0, 0, 0.2);
        padding: 12px;
        display: flex;
        flex-direction: column;
        gap: 8px;
        z-index: 2147483646;
      }
      .bw-panel--bl {
        right: auto;
        left: 24px;
      }
      .bw-input {
        width: 100%;
        font: inherit;
        resize: vertical;
        padding: 8px;
        border: 1px solid #ddd;
        border-radius: 6px;
        background: #fafafa;
        color: inherit;
      }
      .bw-actions {
        display: flex;
        justify-content: flex-end;
        gap: 8px;
      }
      .bw-btn {
        font: inherit;
        padding: 6px 12px;
        border-radius: 6px;
        border: 1px solid #ddd;
        background: #fff;
        cursor: pointer;
      }
      .bw-btn--primary {
        background: #111;
        color: #fff;
        border-color: #111;
      }
      .bw-btn:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }
      .bw-error {
        color: #b00020;
        font-size: 0.875rem;
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
   * Fired with the SDK's `SubmitResult` after every submit (success or
   * failure). Mirrors React adapter's `onSubmit` prop.
   */
  @Output() submit = new EventEmitter<SubmitResult>();

  private readonly platformId = inject(PLATFORM_ID);
  private readonly brevwick = inject(BrevwickService);
  private readonly destroyRef = inject(DestroyRef);

  /**
   * Tracks whether the host view has been torn down. Async submit work
   * checks this before touching component signals or emitting on `submit`,
   * preventing post-destroy `EventEmitter.emit` calls that would notify a
   * parent which has already unsubscribed.
   */
  private destroyed = false;

  protected readonly open = signal(false);
  protected readonly draft = signal('');
  protected readonly errorMessage = signal<string | null>(null);

  protected readonly isSubmitting: Signal<boolean> = computed(
    () => this.brevwick.status() === 'submitting',
  );
  protected readonly canSubmit: Signal<boolean> = computed(
    () => !this.isSubmitting() && this.draft().trim().length > 0,
  );

  constructor() {
    this.destroyRef.onDestroy(() => {
      this.destroyed = true;
    });
  }

  protected toggle(): void {
    if (!isPlatformBrowser(this.platformId)) return;
    this.open.update((v) => !v);
    if (!this.open()) {
      this.errorMessage.set(null);
    }
  }

  protected close(): void {
    this.open.set(false);
    this.errorMessage.set(null);
  }

  protected onDraftChange(value: string): void {
    this.draft.set(value);
  }

  /**
   * Submit handler bound to the panel's primary button. Validates a
   * non-empty draft, forwards `{ title, description }` to
   * {@link BrevwickService.submit}, surfaces ingest errors via the
   * `errorMessage` signal, and emits the SDK's `SubmitResult` on the
   * `submit` `@Output`. Skips state mutations and emission if the
   * component view is already destroyed.
   *
   * Marked `protected` so it is not part of the public TypeScript surface
   * — consumers should listen to `(submit)` rather than calling this
   * directly. Specs cast through a test-only interface to invoke it
   * without driving a real DOM event (the same casting trick the specs
   * already use to seed protected signals).
   */
  protected async onSubmitClick(): Promise<void> {
    const raw = this.draft();
    if (raw.trim().length === 0) return;

    this.errorMessage.set(null);

    // Title from the trimmed first line so leading whitespace doesn't
    // pollute the issue title; description sent raw to preserve the
    // user's intentional whitespace + newlines (parity with React).
    const title = raw.trim().split('\n', 1)[0]!.slice(0, 120);

    try {
      const result: SubmitResult = await this.brevwick.submit({
        title,
        description: raw,
      });
      if (this.destroyed) return;
      this.submit.emit(result);
      if (result.ok === true) {
        this.draft.set('');
        this.open.set(false);
      } else {
        this.errorMessage.set(result.error.message);
      }
    } catch (err) {
      if (this.destroyed) return;
      const message =
        err instanceof Error && err.message
          ? err.message
          : 'We could not submit your feedback. Please try again.';
      this.errorMessage.set(message);
    }
  }
}
