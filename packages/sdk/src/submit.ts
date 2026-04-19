/**
 * `submit()` pipeline — presign attachments → PUT each to the returned URL →
 * POST `/v1/ingest/reports`. Loaded lazily from the core factory so the eager
 * bundle stays under the 2 kB gzip budget mandated by `CLAUDE.md` / SDD § 12.
 *
 * Wire shape follows SDD § 7 (not the looser task-prompt shape). Every
 * outgoing request carries `X-Brevwick-SDK` so the network ring's loop guard
 * short-circuits and we don't recurse on our own failure reports.
 */
import type { BrevwickInternal } from './core/internal';
import type {
  FeedbackAttachment,
  FeedbackInput,
  SubmitError,
  SubmitErrorCode,
  SubmitResult,
} from './types';
import { redact, redactValue } from './core/internal/redact';
import { SDK_USER_AGENT, SDK_VERSION } from './core/internal/sdk-version';

const TOTAL_BUDGET_MS = 30_000;
/**
 * Backoff schedule for the final ingest POST. One attempt + two retries = three
 * total. Matches WT-04: "up to 2 retries on network error / 5xx; never 4xx".
 */
const INGEST_BACKOFFS_MS = [250, 1000] as const;
/**
 * One initial attempt + one entry per backoff = total POST attempts. Hoisted
 * as a named constant so the loop guard reads as `attempt < MAX_ATTEMPTS`
 * rather than the off-by-one-looking `attempt <= INGEST_BACKOFFS_MS.length`.
 */
const MAX_INGEST_ATTEMPTS = INGEST_BACKOFFS_MS.length + 1;

/**
 * Per SDD § 7 presign validation. Mirrored client-side so we don't burn a
 * presign round-trip per attachment when the client knows the request will
 * be rejected.
 */
const ALLOWED_MIMES = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'video/webm',
]);
const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024; // 10 MB per SDD § 7
const MAX_ATTACHMENT_COUNT = 5; // ≤5 total per FeedbackAttachment JSDoc

interface PresignResponse {
  object_key: string;
  upload_url: string;
  headers?: Record<string, string>;
  expires_at?: string;
}

interface IngestResponse {
  report_id: string;
  status?: string;
}

interface ResolvedAttachment {
  object_key: string;
  mime: string;
  size_bytes: number;
}

function submitError(code: SubmitErrorCode, message: string): SubmitResult {
  return { ok: false, error: { code, message } satisfies SubmitError };
}

/**
 * Cross-runtime aborted-signal exception. `DOMException` is not a global on
 * Node < 17 and on a few minimal edge runtimes; fall back to a tagged Error
 * so AbortController.abort(reason) and the catch sites that read `.name`
 * still see `'TimeoutError'`.
 */
function makeTimeoutAbortReason(message: string): Error {
  if (typeof DOMException === 'function') {
    return new DOMException(message, 'TimeoutError');
  }
  const e = new Error(message);
  e.name = 'TimeoutError';
  return e;
}

/**
 * Safety net for rejections bubbling out of `runSubmit` after the submit
 * chunk has already loaded. The pipeline routes every expected failure
 * through `submitError()`, so this only fires on a programmer error inside
 * `runSubmit` itself. Living in the submit module keeps every error-code
 * literal off the eager surface. True chunk-load failures (offline, deploy
 * mismatch) happen in `core/client.ts` before this module is evaluated —
 * those reject the outer promise per the `SubmitErrorCode` docs.
 */
function unexpectedSubmitFailure(e: unknown): SubmitResult {
  const message = e instanceof Error ? e.message : String(e);
  return submitError('INGEST_RETRY_EXHAUSTED', message);
}

/**
 * Eager-wrapper entry point. Delegates to {@link runSubmit} and catches any
 * post-load rejection so the eager wrapper in `core/client.ts` can be a
 * single `import().then(m => m.dispatchSubmit(...))` — keeping all error
 * literals out of the 2 kB eager-budget chunk.
 */
export function dispatchSubmit(
  internal: BrevwickInternal,
  input: FeedbackInput,
): Promise<SubmitResult> {
  return runSubmit(internal, input).catch(unexpectedSubmitFailure);
}

function redactOptional(value: string | undefined): string | undefined {
  return value === undefined ? undefined : redact(value);
}

/**
 * Mask an email to `a***@d***.tld` — keep the first char of local + domain
 * plus the TLD so triagers can still eyeball "is this our staff account or
 * a customer" without seeing the full address. Applied to `config.user.email`
 * on the way out; free-form text goes through `redact()` which collapses
 * the whole address to `[email]`.
 */
function maskEmail(email: string): string {
  const at = email.indexOf('@');
  if (at < 1) return '[email]';
  const local = email.slice(0, at);
  const domain = email.slice(at + 1);
  const dot = domain.lastIndexOf('.');
  if (dot < 1) return '[email]';
  const domainHead = domain.slice(0, dot);
  const tld = domain.slice(dot + 1);
  const firstLocal = local.charAt(0);
  const firstDomain = domainHead.charAt(0);
  return `${firstLocal}***@${firstDomain}***.${tld}`;
}

/**
 * Always returns a fresh object — the empty-object case is handled at the
 * call site by checking `config.user`, so this never needs a sentinel.
 */
function redactUser(user: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(user)) {
    if (k === 'id') {
      out[k] = v;
      continue;
    }
    if (k === 'email' && typeof v === 'string') {
      out[k] = maskEmail(v);
      continue;
    }
    out[k] = redactValue(v);
  }
  return out;
}

function toAttachmentDescriptor(entry: Blob | FeedbackAttachment): {
  blob: Blob;
  filename?: string;
} {
  if (entry instanceof Blob) return { blob: entry };
  return { blob: entry.blob, filename: entry.filename };
}

/**
 * Enforce the FeedbackAttachment public JSDoc contract + SDD § 7 presign
 * validation client-side, before any network round-trip. Returns the first
 * violation as a tagged failure; null on success.
 */
function validateAttachments(
  attachments: ReadonlyArray<Blob | FeedbackAttachment>,
): SubmitResult | null {
  if (attachments.length > MAX_ATTACHMENT_COUNT) {
    return submitError(
      'ATTACHMENT_UPLOAD_FAILED',
      `attachment count ${attachments.length} exceeds limit of ${MAX_ATTACHMENT_COUNT}`,
    );
  }
  for (let i = 0; i < attachments.length; i++) {
    const { blob } = toAttachmentDescriptor(attachments[i]!);
    if (blob.size > MAX_ATTACHMENT_BYTES) {
      return submitError(
        'ATTACHMENT_UPLOAD_FAILED',
        `attachment[${i}] size ${blob.size} exceeds 10 MB limit`,
      );
    }
    if (!ALLOWED_MIMES.has(blob.type)) {
      return submitError(
        'ATTACHMENT_UPLOAD_FAILED',
        `attachment[${i}] mime ${blob.type || '<empty>'} not in allowed list (image/png, image/jpeg, image/webp, video/webm)`,
      );
    }
  }
  return null;
}

/**
 * Stamp the project-key auth header + SDK marker on every request. The SDK
 * header is the *loop guard* the network ring checks — without it, `submit()`
 * calls would be captured as failed network entries on the very next submit.
 */
function authHeaders(projectKey: string): Record<string, string> {
  return {
    Authorization: `Bearer ${projectKey}`,
    'X-Brevwick-SDK': SDK_USER_AGENT,
  };
}

async function fetchJson<T>(
  url: string,
  init: RequestInit,
  signal: AbortSignal,
): Promise<{ status: number; body: T | undefined; raw: string }> {
  const res = await fetch(url, { ...init, signal });
  const raw = await res.text();
  let body: T | undefined;
  if (raw.length > 0) {
    try {
      body = JSON.parse(raw) as T;
    } catch {
      body = undefined;
    }
  }
  return { status: res.status, body, raw };
}

async function presignOne(
  endpoint: string,
  projectKey: string,
  blob: Blob,
  signal: AbortSignal,
): Promise<PresignResponse> {
  const res = await fetch(`${endpoint}/v1/ingest/presign`, {
    method: 'POST',
    signal,
    headers: {
      ...authHeaders(projectKey),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      mime: blob.type || 'application/octet-stream',
      size_bytes: blob.size,
    }),
  });
  if (!res.ok) {
    throw new Error(`presign ${res.status}`);
  }
  const json = (await res.json()) as PresignResponse;
  // Strict shape check, not a truthy peek — `{ object_key: 0 }` would slip
  // past `!json.object_key` and explode opaquely in `putAttachment`.
  if (
    typeof json.object_key !== 'string' ||
    typeof json.upload_url !== 'string'
  ) {
    throw new Error('presign response missing object_key / upload_url');
  }
  return json;
}

async function putAttachment(
  presign: PresignResponse,
  blob: Blob,
  signal: AbortSignal,
): Promise<void> {
  // Merge instead of replace: presign-supplied headers (e.g. signed checksum)
  // win, but Content-Type always falls back to the blob's MIME so a presign
  // that returns `{ 'x-amz-checksum-sha256': '…' }` without a Content-Type
  // does not produce a typeless PUT that R2 would reject.
  const headers: Record<string, string> = {
    'Content-Type': blob.type,
    ...(presign.headers ?? {}),
  };
  const res = await fetch(presign.upload_url, {
    method: 'PUT',
    signal,
    headers,
    body: blob,
  });
  if (!res.ok) {
    throw new Error(`PUT ${res.status}`);
  }
}

async function uploadAttachments(
  endpoint: string,
  projectKey: string,
  attachments: ReadonlyArray<Blob | FeedbackAttachment>,
  signal: AbortSignal,
): Promise<ResolvedAttachment[]> {
  const out: ResolvedAttachment[] = [];
  for (const entry of attachments) {
    const { blob } = toAttachmentDescriptor(entry);
    const presign = await presignOne(endpoint, projectKey, blob, signal);
    await putAttachment(presign, blob, signal);
    out.push({
      object_key: presign.object_key,
      mime: blob.type,
      size_bytes: blob.size,
    });
    // Note: a partial-presign-then-abort scenario can leave an orphaned
    // R2 object — server-side GC sweeps these. Acceptable for MVP.
  }
  return out;
}

function wait(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(signal.reason ?? new Error('aborted'));
      return;
    }
    const id = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = (): void => {
      clearTimeout(id);
      reject(signal.reason ?? new Error('aborted'));
    };
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

/**
 * POST the composed report with retry-on-5xx-or-network semantics. 4xx is
 * treated as a caller contract violation and bubbles up as `INGEST_REJECTED`
 * without retry — retrying a 400 just burns quota for the same rejection.
 */
async function postReport(
  endpoint: string,
  projectKey: string,
  payload: unknown,
  signal: AbortSignal,
): Promise<SubmitResult> {
  const url = `${endpoint}/v1/ingest/reports`;
  const init: RequestInit = {
    method: 'POST',
    headers: {
      ...authHeaders(projectKey),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  };
  let lastError = 'network error';
  for (let attempt = 0; attempt < MAX_INGEST_ATTEMPTS; attempt++) {
    try {
      const { status, body, raw } = await fetchJson<IngestResponse>(
        url,
        init,
        signal,
      );
      if (status >= 200 && status < 300) {
        if (!body || typeof body.report_id !== 'string') {
          return submitError(
            'INGEST_INVALID_RESPONSE',
            `ingest returned ${status} with non-JSON / missing report_id`,
          );
        }
        return { ok: true, report_id: body.report_id };
      }
      if (status >= 400 && status < 500) {
        // Run the server-echoed body through redact() — a misbehaving server
        // could otherwise reflect Bearer tokens or PII back into our error
        // message and from there into the caller's error log.
        const detail = raw.length > 0 ? ` — ${redact(raw.slice(0, 256))}` : '';
        return submitError('INGEST_REJECTED', `ingest ${status}${detail}`);
      }
      lastError = `ingest ${status}`;
    } catch (e) {
      if (signal.aborted) {
        return submitError(
          'INGEST_TIMEOUT',
          `ingest exceeded ${TOTAL_BUDGET_MS}ms`,
        );
      }
      lastError = e instanceof Error ? e.message : String(e);
    }
    const next = INGEST_BACKOFFS_MS[attempt];
    if (next === undefined) break;
    try {
      await wait(next, signal);
    } catch {
      return submitError(
        'INGEST_TIMEOUT',
        `ingest exceeded ${TOTAL_BUDGET_MS}ms`,
      );
    }
  }
  return submitError('INGEST_RETRY_EXHAUSTED', lastError);
}

/**
 * Read SSR-safe device context. Returns `undefined` per field when the
 * matching global is missing (Node, edge runtime) so JSON serialisation
 * omits the key — leaving `device_context` as a lower bound rather than
 * a hard contract.
 */
function readDeviceContext(): {
  ua: string | undefined;
  locale: string | undefined;
  viewport: { w: number; h: number } | undefined;
  routePath: string | undefined;
} {
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : undefined;
  const locale =
    typeof navigator !== 'undefined' ? navigator.language : undefined;
  const viewport =
    typeof window !== 'undefined'
      ? { w: window.innerWidth, h: window.innerHeight }
      : undefined;
  const routePath =
    typeof location !== 'undefined'
      ? `${location.pathname}${location.search}`
      : undefined;
  return { ua, locale, viewport, routePath };
}

/**
 * Resolve `config.userContext()` safely. A throwing user callback must not
 * crack the never-throws contract — log via the console ring and treat as
 * empty so the rest of `user_context` still ships.
 */
function readUserContextExtra(
  internal: BrevwickInternal,
): Record<string, unknown> | undefined {
  const { config } = internal;
  if (!config.userContext) return undefined;
  try {
    return config.userContext();
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    internal.push({
      kind: 'console',
      level: 'warn',
      message: `[brevwick] userContext() threw: ${message}`,
      timestamp: Date.now(),
      count: 1,
    });
    return undefined;
  }
}

function composePayload(
  internal: BrevwickInternal,
  input: FeedbackInput,
  resolved: ResolvedAttachment[],
): Record<string, unknown> {
  const { config, buffers } = internal;
  const userCtxExtra = readUserContextExtra(internal);
  const userCtx: Record<string, unknown> = {};
  if (config.user) {
    userCtx.user = redactUser(config.user);
  }
  if (userCtxExtra) {
    Object.assign(userCtx, redactValue(userCtxExtra));
  }

  const { ua, locale, viewport, routePath } = readDeviceContext();

  return {
    title: redactOptional(input.title),
    description: redact(input.description),
    expected: redactOptional(input.expected),
    actual: redactOptional(input.actual),
    // Submitter's per-report AI preference (widget toggle). The key is
    // present only when the caller supplied it so the in-memory payload
    // matches the wire shape — a later `'use_ai' in payload` check should
    // mean the same thing before and after JSON.stringify. Booleans are
    // intentionally NOT run through redact().
    ...(input.use_ai !== undefined ? { use_ai: input.use_ai } : {}),
    route_path: routePath,
    build_sha: config.buildSha,
    release: config.release,
    environment: config.environment,
    user_context: Object.keys(userCtx).length > 0 ? userCtx : undefined,
    device_context: {
      ua,
      locale,
      viewport,
      platform: 'web',
      sdk: { name: 'brevwick-sdk', version: SDK_VERSION, platform: 'web' },
    },
    // Ring buffers are authoritative for redaction at the capture boundary —
    // do NOT re-run redact() here; that would risk double-masking already
    // redacted markers and introduce drift from the network ring's output.
    console_errors: buffers.console.snapshot(),
    network_errors: buffers.network.snapshot(),
    route_trail: buffers.route.snapshot(),
    attachments: resolved,
  };
}

export async function runSubmit(
  internal: BrevwickInternal,
  input: FeedbackInput,
): Promise<SubmitResult> {
  const { config } = internal;
  const attachments = input.attachments ?? [];
  // Validate before the first presign round-trip so a bad attachment list
  // never burns server quota or partially allocates R2 object keys.
  const validation = validateAttachments(attachments);
  if (validation) return validation;

  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort(
      makeTimeoutAbortReason(`submit exceeded ${TOTAL_BUDGET_MS}ms`),
    );
  }, TOTAL_BUDGET_MS);

  try {
    let resolved: ResolvedAttachment[];
    try {
      resolved = await uploadAttachments(
        config.endpoint,
        config.projectKey,
        attachments,
        controller.signal,
      );
    } catch (e) {
      if (controller.signal.aborted) {
        return submitError(
          'INGEST_TIMEOUT',
          `submit exceeded ${TOTAL_BUDGET_MS}ms during attachment upload`,
        );
      }
      const message = e instanceof Error ? e.message : String(e);
      return submitError('ATTACHMENT_UPLOAD_FAILED', message);
    }

    const payload = composePayload(internal, input, resolved);
    return await postReport(
      config.endpoint,
      config.projectKey,
      payload,
      controller.signal,
    );
  } finally {
    clearTimeout(timer);
  }
}
