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
  type SubmitResult,
} from '@tatlacas/brevwick-sdk';
import { BREVWICK_CONFIG } from './brevwick.tokens';

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

  constructor() {
    if (isPlatformBrowser(this.platformId)) {
      this.sdk = createBrevwick(this.config);
      this.sdk.install();
      this.destroyRef.onDestroy(() => {
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
      return {
        ok: false,
        error: {
          code: 'INGEST_REJECTED',
          message: 'Brevwick SDK is not available on this platform.',
        },
      };
    }
    this._status.set('submitting');
    try {
      const result = await this.sdk.submit(input);
      this._status.set(result.ok ? 'success' : 'error');
      return result;
    } catch (err) {
      // `Brevwick.submit` only rejects when the lazy submit chunk itself
      // fails to load (deploy mismatch / offline). Mirror the React adapter
      // and surface 'error' so the UI doesn't hang on 'submitting'; rethrow
      // so callers can distinguish an environmental failure from an
      // ingest-level one.
      this._status.set('error');
      throw err;
    }
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

  /** Reset {@link status} back to `'idle'`. Does not cancel an in-flight submit. */
  reset(): void {
    this._status.set('idle');
  }
}
