export type Environment = 'dev' | 'stg' | 'prod';

export interface BrevwickConfig {
  /** Public ingest key, e.g. `pk_live_xxx`. */
  projectKey: string;
  /** Override the default ingest endpoint (https://api.brevwick.com). */
  endpoint?: string;
  environment?: Environment;
  /** Set to false to make every method a no-op. Useful in tests. */
  enabled?: boolean;
  /** Build SHA — included in every report. */
  buildSha?: string;
  /** Resolved at submit time; merged into `user_context`. */
  userContext?: () => Record<string, unknown>;
  /** Send `X-Brevwick-Fingerprint-Optout: 1` to skip the salted fingerprint. */
  fingerprintOptOut?: boolean;
}

export interface FeedbackInput {
  title?: string;
  description: string;
  expected?: string;
  actual?: string;
  /** PNG / JPEG / WebP / WebM. ≤10 MB each, ≤5 total. */
  attachments?: Blob[];
}

export interface SubmitResult {
  reportId: string;
}

export interface Brevwick {
  submit(input: FeedbackInput): Promise<SubmitResult>;
  captureScreenshot(): Promise<Blob>;
  /** Installs console + fetch rings. Returns an uninstaller. */
  install(): () => void;
}
