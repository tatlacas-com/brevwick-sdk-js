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

export interface SubmitResult {
  reportId: string;
}

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

export interface NetworkEntry {
  kind: 'network';
  method: string;
  url: string;
  status?: number;
  durationMs?: number;
  error?: string;
  timestamp: number;
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
