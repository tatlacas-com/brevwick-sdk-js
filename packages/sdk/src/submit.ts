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

function err(code: SubmitErrorCode, message: string): SubmitResult {
  return { ok: false, error: { code, message } satisfies SubmitError };
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

function redactUser(
  user: Record<string, unknown>,
): Record<string, unknown> | undefined {
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
  if (!json.object_key || !json.upload_url) {
    throw new Error('presign response missing object_key / upload_url');
  }
  return json;
}

async function putAttachment(
  presign: PresignResponse,
  blob: Blob,
  signal: AbortSignal,
): Promise<void> {
  const res = await fetch(presign.upload_url, {
    method: 'PUT',
    signal,
    headers: presign.headers ?? { 'Content-Type': blob.type },
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
  for (let attempt = 0; attempt <= INGEST_BACKOFFS_MS.length; attempt++) {
    try {
      const { status, body, raw } = await fetchJson<IngestResponse>(
        url,
        init,
        signal,
      );
      if (status >= 200 && status < 300) {
        if (!body || typeof body.report_id !== 'string') {
          return err(
            'INGEST_INVALID_RESPONSE',
            `ingest returned ${status} with non-JSON / missing report_id`,
          );
        }
        return { ok: true, report_id: body.report_id };
      }
      if (status >= 400 && status < 500) {
        const detail = raw.length > 0 ? ` — ${raw.slice(0, 256)}` : '';
        return err('INGEST_REJECTED', `ingest ${status}${detail}`);
      }
      lastError = `ingest ${status}`;
    } catch (e) {
      if (signal.aborted) {
        return err('INGEST_TIMEOUT', `ingest exceeded ${TOTAL_BUDGET_MS}ms`);
      }
      lastError = e instanceof Error ? e.message : String(e);
    }
    const next = INGEST_BACKOFFS_MS[attempt];
    if (next === undefined) break;
    try {
      await wait(next, signal);
    } catch {
      return err('INGEST_TIMEOUT', `ingest exceeded ${TOTAL_BUDGET_MS}ms`);
    }
  }
  return err('INGEST_RETRY_EXHAUSTED', lastError);
}

function composePayload(
  internal: BrevwickInternal,
  input: FeedbackInput,
  resolved: ResolvedAttachment[],
): Record<string, unknown> {
  const { config, buffers } = internal;
  const userCtxExtra = config.userContext ? config.userContext() : undefined;
  const userCtx: Record<string, unknown> = {};
  if (config.user) {
    const redactedUser = redactUser(config.user);
    if (redactedUser) userCtx.user = redactedUser;
  }
  if (userCtxExtra) {
    Object.assign(userCtx, redactValue(userCtxExtra));
  }

  const viewport =
    typeof window !== 'undefined'
      ? { w: window.innerWidth, h: window.innerHeight }
      : undefined;
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : undefined;
  const locale =
    typeof navigator !== 'undefined' ? navigator.language : undefined;
  const routePath =
    typeof location !== 'undefined'
      ? `${location.pathname}${location.search}`
      : undefined;

  return {
    title: redactOptional(input.title),
    description: redact(input.description),
    expected: redactOptional(input.expected),
    actual: redactOptional(input.actual),
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
  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort(
      new DOMException(`submit exceeded ${TOTAL_BUDGET_MS}ms`, 'TimeoutError'),
    );
  }, TOTAL_BUDGET_MS);

  try {
    let resolved: ResolvedAttachment[];
    try {
      resolved = await uploadAttachments(
        config.endpoint,
        config.projectKey,
        input.attachments ?? [],
        controller.signal,
      );
    } catch (e) {
      if (controller.signal.aborted) {
        return err(
          'INGEST_TIMEOUT',
          `submit exceeded ${TOTAL_BUDGET_MS}ms during attachment upload`,
        );
      }
      const message = e instanceof Error ? e.message : String(e);
      return err('ATTACHMENT_UPLOAD_FAILED', message);
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
