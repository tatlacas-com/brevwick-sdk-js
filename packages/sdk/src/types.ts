export type Environment = 'dev' | 'stg' | 'prod';

export interface BrevwickRingsConfig {
  /** Capture uncaught errors and console.error calls for inclusion in submitted reports. Default true. */
  console?: boolean;
  /** Capture failed network calls so triagers see the request context of the bug. Default true. */
  network?: boolean;
  /** Record route transitions so reproduction steps include the path the user was on. Default true. */
  route?: boolean;
}

export interface BrevwickConfig {
  /** Public ingest key, e.g. `pk_live_xxx` or `pk_test_xxx`. */
  projectKey: string;
  /** Override the default ingest endpoint (https://api.brevwick.com). */
  endpoint?: string;
  environment?: Environment;
  /** Set to false to make every method a no-op. Useful in tests. */
  enabled?: boolean;
  /** Build SHA — included in every report. */
  buildSha?: string;
  /** Released app version — passed through on every report. */
  release?: string;
  /** Resolved at submit time; merged into `user_context`. */
  userContext?: () => Record<string, unknown>;
  /** Opaque user identity merged into reports (id + optional metadata). */
  user?: { id: string; [key: string]: unknown };
  /** Per-ring toggles. All default to true. */
  rings?: BrevwickRingsConfig;
  /** Send `X-Brevwick-Fingerprint-Optout: 1` to skip the salted fingerprint. */
  fingerprintOptOut?: boolean;
}

export interface FeedbackAttachment {
  /** PNG / JPEG / WebP / WebM; ≤10 MB each, ≤5 total per report. */
  blob: Blob;
  filename?: string;
}

export interface FeedbackInput {
  title?: string;
  description: string;
  expected?: string;
  actual?: string;
  attachments?: Array<Blob | FeedbackAttachment>;
}

/**
 * Discriminator for {@link SubmitError}. Every failure path in the submit
 * pipeline maps to exactly one of these codes.
 *
 * - `ATTACHMENT_UPLOAD_FAILED`: client-side validation rejected an
 *   attachment (count > 5, size > 10 MB, MIME outside the
 *   image/png|jpeg|webp + video/webm whitelist), or the presign / R2 PUT
 *   failed before the report POST was reached.
 * - `INGEST_REJECTED`: the ingest endpoint returned a 4xx (e.g. 422
 *   QUOTA_EXCEEDED, 413 PAYLOAD_TOO_LARGE). Not retried — the same payload
 *   would be rejected again. The server-echoed response body (capped at 256
 *   chars and run through `redact()`) is appended to the message.
 * - `INGEST_RETRY_EXHAUSTED`: the ingest POST hit the maximum retry count
 *   (one initial + two backoffs) on 5xx or thrown-fetch responses and never
 *   succeeded. Also fires for unrecoverable chunk-loading errors.
 * - `INGEST_TIMEOUT`: the 30 s total-budget AbortController fired before the
 *   pipeline (presign, PUT, POST, or backoff sleep) completed.
 * - `INGEST_INVALID_RESPONSE`: the ingest endpoint returned 2xx with a body
 *   that did not parse as JSON or did not include a string `report_id`.
 */
export type SubmitErrorCode =
  | 'ATTACHMENT_UPLOAD_FAILED'
  | 'INGEST_REJECTED'
  | 'INGEST_RETRY_EXHAUSTED'
  | 'INGEST_TIMEOUT'
  | 'INGEST_INVALID_RESPONSE';

export interface SubmitError {
  code: SubmitErrorCode;
  message: string;
}

/**
 * Tagged result. `submit()` never throws — callers discriminate on `ok`.
 * Matches SDD § 12 updated contract (cross-repo PR accompanies this change).
 */
export type SubmitResult =
  | { ok: true; report_id: string }
  | { ok: false; error: SubmitError };

export interface ConsoleEntry {
  kind: 'console';
  level: 'log' | 'info' | 'warn' | 'error' | 'debug';
  message: string;
  stack?: string;
  timestamp: number;
  /**
   * Always >= 1. Starts at 1 when the entry is first pushed and is incremented
   * in-place when an identical entry repeats inside the dedupe window.
   */
  count: number;
}

/**
 * Captured network request. Populated by the network ring for any request
 * that fails (status ≥ 400 or thrown). All text fields below are **already
 * redacted and capped at the ring boundary** — downstream code in the
 * submit pipeline must not re-redact or re-cap them. Field names follow
 * the TypeScript/camelCase convention; the submit pipeline translates to
 * wire-snake_case (`request_body`, etc.) at the network boundary.
 */
export interface NetworkEntry {
  kind: 'network';
  method: string;
  url: string;
  status?: number;
  durationMs?: number;
  error?: string;
  timestamp: number;
  /** Request body, redacted, capped at 2 kB with `… [truncated N bytes]`. */
  requestBody?: string;
  /** Response body, redacted, capped at 4 kB with `… [truncated N bytes]`. */
  responseBody?: string;
  /** Allow-listed request headers, lower-cased keys. */
  requestHeaders?: Record<string, string>;
  /** Allow-listed response headers, lower-cased keys. */
  responseHeaders?: Record<string, string>;
}

export interface RouteEntry {
  kind: 'route';
  path: string;
  timestamp: number;
}

export type RingEntry = ConsoleEntry | NetworkEntry | RouteEntry;

export interface Brevwick {
  /**
   * Install rings (console / network / route as configured) and begin capturing
   * entries. Safe to call more than once; subsequent calls are no-ops while
   * already installed. No-op entirely in non-browser contexts (SSR, workers).
   */
  install(): void;
  /**
   * Restore every patched global, drain internal buffers, and move the instance
   * to the `uninstalled` state. A second call is a no-op. After `uninstall()`,
   * calling `install()` again is not supported and will throw.
   */
  uninstall(): void;
  submit(input: FeedbackInput): Promise<SubmitResult>;
  captureScreenshot(): Promise<Blob>;
}
