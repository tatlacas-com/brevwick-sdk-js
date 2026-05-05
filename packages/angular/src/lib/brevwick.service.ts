import {
  DestroyRef,
  Injectable,
  PLATFORM_ID,
  inject,
  signal,
  type Signal,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import {
  createBrevwick,
  type Brevwick,
  type FeedbackInput,
  type ProjectConfig,
  type SubmitError,
  type SubmitResult,
} from '@tatlacas/brevwick-sdk';
import { BREVWICK_CONFIG } from './brevwick.tokens';
import { getPhaseBus, type PhaseEvent } from './internal/phase-bus';

/**
 * Submission lifecycle exposed via {@link BrevwickService.status}. Mirrors
 * the React adapter's `FeedbackStatus` so consumers can reason about both
 * surfaces with one mental model.
 *
 * - `idle` — nothing in-flight.
 * - `submitting` — a `submit()` call is pending.
 * - `success` — the last `submit()` resolved with `{ ok: true }`.
 * - `error` — the last `submit()` resolved with `{ ok: false }`, threw, or
 *   was attempted on a non-browser platform (the call is a no-op on the
 *   server, but is reported as `error` so a UI can surface a "try again"
 *   message after hydration if the user clicks before client takeover).
 */
export type FeedbackStatus = 'idle' | 'submitting' | 'success' | 'error';

/**
 * Submit-pipeline phase the UI can render staged status against. Driven
 * by the SDK's internal `phase` bus event:
 *
 * - `idle` — initial state and after `reset()`.
 * - `capturing` — `submit()` has been called but no phase event has fired yet.
 * - `sanitising` — `capturing-done` event arrived (payload composed).
 * - `formatting` — `sanitising-done` event arrived (redact complete; the
 *   ingest POST is in flight).
 * - `sent` — `sent` event arrived after a 2xx ingest response.
 * - `error` — `submit()` resolved with `{ ok: false }` or rejected.
 *
 * Mirrors the React adapter's `FeedbackPhase` so a consumer who has read
 * the React documentation can drive the Angular widget unchanged.
 */
export type FeedbackPhase =
  | 'idle'
  | 'capturing'
  | 'sanitising'
  | 'formatting'
  | 'sent'
  | 'error';

const PHASE_EVENT_TO_NEXT_PHASE: Record<PhaseEvent['phase'], FeedbackPhase> = {
  'capturing-done': 'sanitising',
  'sanitising-done': 'formatting',
  sent: 'sent',
};

/**
 * Angular DI wrapper around the framework-agnostic `Brevwick` SDK instance.
 *
 * - `providedIn: 'root'` — single instance per Angular application; consumers
 *   inject it from any component / service.
 * - SSR-safe: when `isPlatformBrowser(PLATFORM_ID)` is false the constructor
 *   skips `createBrevwick()` so server renders never touch browser-only APIs.
 *   `submit()` then resolves with an `error` `SubmitResult` and the status
 *   signal stays at `idle` (nothing was actually attempted).
 * - Calls `install()` on construction in browser contexts and `uninstall()`
 *   on `DestroyRef.onDestroy()` so the global rings (console / network /
 *   route) only run while an Angular app is alive.
 *
 * Configuration is supplied by {@link provideBrevwick} via {@link BREVWICK_CONFIG}.
 */
@Injectable({ providedIn: 'root' })
export class BrevwickService {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly config = inject(BREVWICK_CONFIG);
  private readonly destroyRef = inject(DestroyRef);

  private readonly sdk: Brevwick | null;

  private readonly _status = signal<FeedbackStatus>('idle');
  /** Current submission lifecycle. Use directly in templates / effects. */
  readonly status: Signal<FeedbackStatus> = this._status.asReadonly();

  private readonly _phase = signal<FeedbackPhase>('idle');
  /**
   * Current submit-pipeline phase. Advances on the SDK's internal phase bus
   * so adapter UIs can render staged-status rows in step with the actual
   * pipeline boundaries (compose → redact → ingest).
   */
  readonly phase: Signal<FeedbackPhase> = this._phase.asReadonly();

  private readonly _error = signal<SubmitError | null>(null);
  /**
   * Tagged error from the last failed `submit()`. `null` until a submit
   * resolves with `{ ok: false }` or rejects (a chunk-load failure surfaces
   * as `{ code: 'INGEST_RETRY_EXHAUSTED', message: <Error.message> }`).
   * Cleared back to `null` on the next `submit()` or `reset()`.
   */
  readonly error: Signal<SubmitError | null> = this._error.asReadonly();

  /**
   * Snapshot of the input passed to the most recent `submit()` so `retry()`
   * can re-run the exact same payload without forcing the caller to hold it
   * for us. Cleared on `reset()`.
   */
  private lastInput: FeedbackInput | null = null;

  private destroyed = false;

  constructor() {
    if (isPlatformBrowser(this.platformId)) {
      this.sdk = createBrevwick(this.config);
      this.sdk.install();
      const bus = getPhaseBus(this.sdk);
      const onPhase = (event: PhaseEvent): void => {
        if (this.destroyed) return;
        this._phase.set(PHASE_EVENT_TO_NEXT_PHASE[event.phase]);
      };
      bus?.on('phase', onPhase);
      this.destroyRef.onDestroy(() => {
        this.destroyed = true;
        bus?.off('phase', onPhase);
        this.sdk?.uninstall();
      });
    } else {
      this.sdk = null;
    }
  }

  /**
   * Submit feedback through the underlying SDK. Resolves with the same tagged
   * union the SDK returns. On non-browser platforms (Angular Universal SSR,
   * tests with PLATFORM_ID overridden to `'server'`) returns the standard
   * "no-op on server" error so callers can branch without special-casing.
   */
  async submit(input: FeedbackInput): Promise<SubmitResult> {
    if (!this.sdk) {
      // Server-side render: the FAB never fires, but the API stays callable
      // for consumers who programmatically call submit() in shared code.
      this._status.set('error');
      this._phase.set('error');
      const ssrError: SubmitError = {
        code: 'INGEST_REJECTED',
        message: 'Brevwick SDK is not available on this platform.',
      };
      this._error.set(ssrError);
      return { ok: false, error: ssrError };
    }
    this.lastInput = input;
    this._status.set('submitting');
    this._phase.set('capturing');
    this._error.set(null);
    try {
      const result = await this.sdk.submit(input);
      if (result.ok === true) {
        this._status.set('success');
      } else {
        this._status.set('error');
        this._phase.set('error');
        this._error.set(result.error);
      }
      return result;
    } catch (err) {
      // `Brevwick.submit` only rejects when the lazy submit chunk itself
      // fails to load (deploy mismatch / offline). Mirror the React adapter
      // and surface 'error' so the UI does not hang on 'submitting'; rethrow
      // so callers can distinguish an environmental failure from an
      // ingest-level one.
      this._status.set('error');
      this._phase.set('error');
      this._error.set({
        code: 'INGEST_RETRY_EXHAUSTED',
        message: err instanceof Error ? err.message : String(err),
      });
      throw err;
    }
  }

  /**
   * Re-run the most recent `submit()` with the same input. Resolves to
   * `undefined` when no submit has been attempted yet (or after `reset()`).
   * Re-throws on a chunk-load rejection, just like {@link submit}.
   */
  async retry(): Promise<SubmitResult | undefined> {
    const last = this.lastInput;
    if (!last) return undefined;
    return this.submit(last);
  }

  /**
   * Capture a DOM screenshot via the core SDK. Resolves with `null` on
   * non-browser platforms (parallel to the rest of the surface — calling
   * code can still `await` without branching on PLATFORM_ID itself).
   */
  async captureScreenshot(): Promise<Blob | null> {
    if (!this.sdk) return null;
    return this.sdk.captureScreenshot();
  }

  /**
   * Fetch project-level AI config from `GET /v1/ingest/config`. Resolves to
   * `null` on non-browser platforms or when the SDK reports a fetch failure.
   * The widget uses this to decide whether to render the "Format with AI"
   * toggle in the composer.
   */
  async getConfig(): Promise<ProjectConfig | null> {
    if (!this.sdk) return null;
    return this.sdk.getConfig();
  }

  /**
   * Reset {@link status}, {@link phase} and {@link error} back to their
   * idle defaults. Does not cancel an in-flight submit; the next phase /
   * status mutation from the live submit will overwrite these.
   */
  reset(): void {
    this._status.set('idle');
    this._phase.set('idle');
    this._error.set(null);
    this.lastInput = null;
  }
}
