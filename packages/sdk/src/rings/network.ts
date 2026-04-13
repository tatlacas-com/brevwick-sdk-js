/**
 * Network ring — captures failed requests (status ≥ 400 or thrown) by
 * wrapping `globalThis.fetch` and `XMLHttpRequest.prototype.open/send/setRequestHeader`.
 *
 * Redaction happens at the ring boundary: header allow-list, query-param
 * stripping, body caps, and `redact()` on any text body. Requests to the SDK's
 * own ingest endpoint (or carrying the `X-Brevwick-SDK` marker) are skipped to
 * avoid feedback loops when `submit()` itself posts a failing response.
 *
 * This module is deliberately lazy-imported from `client.install()` so the
 * core eager chunk stays under the 2 kB gzip budget — none of the wrapping
 * code ships until the SDK is actually installed.
 */
import type { NetworkEntry } from '../types';
import type { RingContext, RingDefinition } from '../core/internal';
import { redact } from '../core/internal/redact';

const REQUEST_BODY_CAP = 2048;
const RESPONSE_BODY_CAP = 4096;
const SDK_HEADER = 'x-brevwick-sdk';

/**
 * Request headers we carry forward on captured entries. Allow-list (not a
 * deny-list) so any new browser- or framework-added header the app starts
 * sending in the future stays out by default — matches the SDD redaction
 * guidance of "explicitly safe values only".
 */
const HEADER_ALLOWLIST: ReadonlySet<string> = new Set([
  'accept',
  'accept-language',
  'content-language',
  'content-type',
  'x-request-id',
  'x-correlation-id',
  'x-trace-id',
]);

const REDACT_QUERY_PARAM = /^(token|auth|key|session|sig).*/i;
const BINARY_CONTENT_TYPE = /(^image\/)|(^audio\/)|(^video\/)|octet-stream/i;

function sanitiseHeaders(
  pairs: Iterable<readonly [string, string]>,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [name, value] of pairs) {
    const lower = name.toLowerCase();
    if (!HEADER_ALLOWLIST.has(lower)) continue;
    out[lower] = value;
  }
  return out;
}

function parseRawHeaders(raw: string): Array<[string, string]> {
  const out: Array<[string, string]> = [];
  for (const line of raw.trim().split(/\r?\n/)) {
    if (!line) continue;
    const idx = line.indexOf(':');
    if (idx < 0) continue;
    out.push([line.slice(0, idx).trim(), line.slice(idx + 1).trim()]);
  }
  return out;
}

function resolveAbsolute(url: string): URL | null {
  try {
    const base =
      typeof location !== 'undefined' ? location.href : 'https://_base_/';
    return new URL(url, base);
  } catch {
    return null;
  }
}

/**
 * Scheme-prefixed absolute URL, per RFC 3986. Includes both authority-bearing
 * (`http://`, `ws://`) and authority-less (`data:`, `blob:`, `mailto:`)
 * schemes, so the "preserve input shape" branch in {@link redactUrl} does not
 * mangle `fetch('data:text/plain,hello')` into a relative path.
 */
const ABSOLUTE_URL = /^[a-z][a-z0-9+.-]*:/i;

function redactUrl(raw: string): string {
  const parsed = resolveAbsolute(raw);
  if (!parsed) return raw;
  const toDelete: string[] = [];
  parsed.searchParams.forEach((_, key) => {
    if (REDACT_QUERY_PARAM.test(key)) toDelete.push(key);
  });
  for (const key of toDelete) parsed.searchParams.delete(key);
  // Preserve the input shape: if the caller passed a relative URL, return one.
  if (ABSOLUTE_URL.test(raw)) return parsed.toString();
  const query = parsed.searchParams.toString();
  return parsed.pathname + (query ? `?${query}` : '') + parsed.hash;
}

function capBody(raw: string, cap: number): string {
  if (raw.length <= cap) return raw;
  const removed = raw.length - cap;
  return `${raw.slice(0, cap)}… [truncated ${removed} bytes]`;
}

type StringifiedBody =
  | { kind: 'text'; raw: string }
  | { kind: 'synthetic'; marker: string }
  | { kind: 'empty' };

function stringifyBody(body: unknown): StringifiedBody {
  if (body == null) return { kind: 'empty' };
  if (typeof body === 'string') return { kind: 'text', raw: body };
  if (
    typeof URLSearchParams !== 'undefined' &&
    body instanceof URLSearchParams
  ) {
    return { kind: 'text', raw: body.toString() };
  }
  if (typeof Blob !== 'undefined' && body instanceof Blob) {
    return { kind: 'synthetic', marker: `[binary ${body.size} bytes]` };
  }
  if (typeof ArrayBuffer !== 'undefined' && body instanceof ArrayBuffer) {
    return {
      kind: 'synthetic',
      marker: `[binary ${body.byteLength} bytes]`,
    };
  }
  if (ArrayBuffer.isView(body)) {
    return {
      kind: 'synthetic',
      marker: `[binary ${(body as ArrayBufferView).byteLength} bytes]`,
    };
  }
  if (typeof FormData !== 'undefined' && body instanceof FormData) {
    return { kind: 'synthetic', marker: '[form-data]' };
  }
  return { kind: 'empty' };
}

function capturedBody(body: unknown, cap: number): string | undefined {
  const stringified = stringifyBody(body);
  switch (stringified.kind) {
    case 'empty':
      return undefined;
    case 'synthetic':
      // Binary + form-data markers are already synthetic — don't feed them to redact().
      return stringified.marker;
    case 'text':
      return redact(capBody(stringified.raw, cap));
  }
}

function extractMethod(
  input: RequestInfo | URL,
  init: RequestInit | undefined,
): string {
  if (init?.method) return init.method.toUpperCase();
  if (
    typeof input !== 'string' &&
    !(input instanceof URL) &&
    typeof input.method === 'string'
  ) {
    return input.method.toUpperCase();
  }
  return 'GET';
}

function extractRequestHeaders(
  input: RequestInfo | URL,
  init: RequestInit | undefined,
): Headers {
  if (init?.headers) return new Headers(init.headers);
  if (typeof input !== 'string' && !(input instanceof URL)) {
    return new Headers(input.headers);
  }
  return new Headers();
}

function extractUrl(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.toString();
  return input.url;
}

/**
 * Capture the body of a `fetch()` call. The body can ride on either `init`
 * (common case) or on a `Request` object passed as `input` (for
 * `fetch(new Request('/x', { body }))`). We prefer `init.body` because it
 * wins at runtime per the Fetch spec, falling back to reading a clone of
 * the Request's body stream when only a Request was given.
 */
async function resolveRequestBody(
  input: RequestInfo | URL,
  init: RequestInit | undefined,
): Promise<string | undefined> {
  if (init?.body != null) return capturedBody(init.body, REQUEST_BODY_CAP);
  if (typeof input === 'string' || input instanceof URL) return undefined;
  // Request object. Clone so the caller's downstream `.body` / `.text()` stays intact.
  try {
    const clone = input.clone();
    if (!clone.body) return undefined;
    const text = await clone.text();
    if (!text) return undefined;
    return redact(capBody(text, REQUEST_BODY_CAP));
  } catch {
    return undefined;
  }
}

interface EntryInputs {
  method: string;
  rawUrl: string;
  status: number;
  startWall: number;
  durationMs: number;
  reqHeaders: Record<string, string>;
  reqBody: string | undefined;
  respHeaders: Record<string, string>;
  respBody: string | undefined;
  error?: string;
}

/**
 * Single source of truth for the captured entry shape — fetch and XHR
 * paths both call through here so the "one shape" invariant is enforced
 * by types, not by convention.
 */
function buildNetworkEntry(inputs: EntryInputs): NetworkEntry {
  const entry: NetworkEntry = {
    kind: 'network',
    method: inputs.method,
    url: redactUrl(inputs.rawUrl),
    status: inputs.status,
    durationMs: inputs.durationMs,
    timestamp: inputs.startWall,
    requestBody: inputs.reqBody,
    responseBody: inputs.respBody,
    requestHeaders: inputs.reqHeaders,
    responseHeaders: inputs.respHeaders,
  };
  if (inputs.error !== undefined) entry.error = inputs.error;
  return entry;
}

function nowPerf(fallback: number): number {
  return typeof performance !== 'undefined' ? performance.now() : fallback;
}

/**
 * Decide whether a request is a feedback-loop back to the SDK's own ingest
 * endpoint. The endpoint URL is parsed once per install, and the comparison
 * is origin-match + path-boundary — NOT a naive `startsWith`, which would
 * also match `api.brevwick.company` or `api.brevwick.com.evil.com` and
 * silently drop legitimate user traffic from capture.
 */
function makeLoopGuard(endpoint: string): (absolute: URL | null) => boolean {
  let endpointUrl: URL | null = null;
  try {
    endpointUrl = new URL(endpoint);
  } catch {
    // Validator would have rejected this already — defence-in-depth only.
  }
  const endpointPath = endpointUrl?.pathname ?? '/';
  return (absolute) => {
    if (!endpointUrl || !absolute) return false;
    if (absolute.origin !== endpointUrl.origin) return false;
    if (absolute.pathname === endpointPath) return true;
    const boundary = endpointPath.endsWith('/')
      ? endpointPath
      : `${endpointPath}/`;
    return absolute.pathname.startsWith(boundary);
  };
}

interface XhrState {
  method: string;
  url: string;
  startWall: number;
  startPerf: number;
  headers: Array<[string, string]>;
  body: unknown;
  skipped: boolean;
  captured: boolean;
}

const xhrState: WeakMap<XMLHttpRequest, XhrState> = new WeakMap();

function installFetch(ctx: RingContext): () => void {
  // Prefer `globalThis.fetch` — in polyfilled edge / worker shims the
  // replacement may only live on `globalThis`; we still mirror the write to
  // `window.fetch` for browsers where the two aliases must agree.
  const host = globalThis as typeof globalThis & { fetch: typeof fetch };
  const original = host.fetch;
  const isLoopUrl = makeLoopGuard(ctx.config.endpoint);

  const patched = async function patchedFetch(
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> {
    const rawUrl = extractUrl(input);
    const absolute = resolveAbsolute(rawUrl);
    const reqHeaders = extractRequestHeaders(input, init);
    if (isLoopUrl(absolute) || reqHeaders.has(SDK_HEADER)) {
      return original.call(globalThis, input, init);
    }

    const method = extractMethod(input, init);
    const startWall = Date.now();
    const startPerf = nowPerf(startWall);
    const reqBody = await resolveRequestBody(input, init);
    const reqHeaderRecord = sanitiseHeaders(reqHeaders.entries());

    let response: Response;
    try {
      response = await original.call(globalThis, input, init);
    } catch (err) {
      ctx.push(
        buildNetworkEntry({
          method,
          rawUrl,
          status: 0,
          startWall,
          durationMs: nowPerf(startWall) - startPerf,
          reqHeaders: reqHeaderRecord,
          reqBody,
          respHeaders: {},
          respBody: undefined,
          error: err instanceof Error ? err.message : String(err),
        }),
      );
      throw err;
    }

    // Freeze durationMs BEFORE the (potentially slow) body-clone read so it
    // measures request time only — not request + captured-body decode.
    const durationMs = nowPerf(startWall) - startPerf;

    if (response.status < 400) return response;

    let responseBody: string | undefined;
    try {
      const clone = response.clone();
      const contentType = response.headers.get('content-type') ?? '';
      if (BINARY_CONTENT_TYPE.test(contentType)) {
        const buf = await clone.arrayBuffer();
        responseBody = `[binary ${buf.byteLength} bytes]`;
      } else {
        const text = await clone.text();
        responseBody = redact(capBody(text, RESPONSE_BODY_CAP));
      }
    } catch {
      // Caller already consumed response.body or the stream errored — we still
      // emit the captured entry, just without the body. The caller's handle to
      // `response` is untouched; the clone is what failed.
    }

    ctx.push(
      buildNetworkEntry({
        method,
        rawUrl,
        status: response.status,
        startWall,
        durationMs,
        reqHeaders: reqHeaderRecord,
        reqBody,
        respHeaders: sanitiseHeaders(response.headers.entries()),
        respBody: responseBody,
      }),
    );
    return response;
  } as typeof fetch;

  host.fetch = patched;
  if (typeof window !== 'undefined') window.fetch = patched;
  return () => {
    host.fetch = original;
    if (typeof window !== 'undefined') window.fetch = original;
  };
}

/**
 * Real shape of `XMLHttpRequest.open` trailing args per the XHR spec. Typing
 * the spread explicitly avoids the untyped `unknown[]` rest parameter that
 * the looser signature would otherwise force on the patched handler.
 */
type XhrOpenRest = [
  async?: boolean,
  user?: string | null,
  password?: string | null,
];

/**
 * Narrow type for the original `open` so the spread call type-checks against
 * both the 2-arg and 5-arg overloads without an `unknown[]` cast.
 */
type XhrOpenLike = (
  this: XMLHttpRequest,
  method: string,
  url: string | URL,
  ...rest: XhrOpenRest
) => void;

function installXhr(ctx: RingContext): () => void {
  const proto = XMLHttpRequest.prototype;
  const origOpen = proto.open as XhrOpenLike;
  const origSend = proto.send;
  const origSetRequestHeader = proto.setRequestHeader;
  const isLoopUrl = makeLoopGuard(ctx.config.endpoint);

  function patchedOpen(
    this: XMLHttpRequest,
    method: string,
    url: string | URL,
    ...rest: XhrOpenRest
  ): void {
    const rawUrl = typeof url === 'string' ? url : url.toString();
    const absolute = resolveAbsolute(rawUrl);
    xhrState.set(this, {
      method: method.toUpperCase(),
      url: rawUrl,
      startWall: 0,
      startPerf: 0,
      headers: [],
      body: undefined,
      skipped: isLoopUrl(absolute),
      captured: false,
    });
    return origOpen.call(this, method, url, ...rest);
  }

  function patchedSetRequestHeader(
    this: XMLHttpRequest,
    name: string,
    value: string,
  ): void {
    // XHR only permits headers via `setRequestHeader` between `open()` and
    // `send()` — there is no constructor / init channel — so this single
    // hook catches every header the caller can legally attach, which is
    // why flipping `state.skipped` here is sufficient for the SDK's own
    // submit traffic to short-circuit capture.
    const state = xhrState.get(this);
    if (state) {
      state.headers.push([name, value]);
      if (name.toLowerCase() === SDK_HEADER) state.skipped = true;
    }
    return origSetRequestHeader.call(this, name, value);
  }

  function attachCapture(xhr: XMLHttpRequest, state: XhrState): void {
    const capture = (status: number, error?: string): void => {
      if (state.captured) return;
      state.captured = true;
      const durationMs = nowPerf(state.startWall) - state.startPerf;

      let respHeaders: Record<string, string> = {};
      try {
        respHeaders = sanitiseHeaders(
          parseRawHeaders(xhr.getAllResponseHeaders() ?? ''),
        );
      } catch {
        // pre-flight/CORS denied or not yet available — skip.
      }

      let responseBody: string | undefined;
      if (error === undefined && status > 0) {
        try {
          const type = xhr.responseType;
          if (type === '' || type === 'text') {
            const text = xhr.responseText;
            if (text) responseBody = redact(capBody(text, RESPONSE_BODY_CAP));
          } else if (type === 'arraybuffer' && xhr.response) {
            const buf = xhr.response as ArrayBuffer;
            responseBody = `[binary ${buf.byteLength} bytes]`;
          } else if (type === 'blob' && xhr.response) {
            responseBody = `[binary ${(xhr.response as Blob).size} bytes]`;
          }
        } catch {
          // responseText throws for non-text responseType — ignore.
        }
      }

      ctx.push(
        buildNetworkEntry({
          method: state.method,
          rawUrl: state.url,
          status,
          startWall: state.startWall,
          durationMs,
          reqHeaders: sanitiseHeaders(state.headers),
          reqBody: capturedBody(state.body, REQUEST_BODY_CAP),
          respHeaders,
          respBody: responseBody,
          error,
        }),
      );
    };

    // `load` fires exactly once on readyState === 4; `readystatechange` fires
    // four times per request. Using the specific terminal events keeps the
    // per-state-transition noise out of the capture path and gives us
    // distinct labels for the three failure modes XHR surfaces.
    xhr.addEventListener('load', () => {
      if (xhr.status >= 400) capture(xhr.status);
    });
    xhr.addEventListener('error', () => capture(0, 'network error'));
    xhr.addEventListener('abort', () => capture(0, 'aborted'));
    xhr.addEventListener('timeout', () => capture(0, 'timeout'));
  }

  function patchedSend(
    this: XMLHttpRequest,
    body?: Document | XMLHttpRequestBodyInit | null,
  ): void {
    const state = xhrState.get(this);
    // NOTE: if a caller never reaches `send()` after `open()`, the XhrState
    // stays in the WeakMap keyed on the XHR. No leak — GC of the XHR frees
    // both — but `patchedSetRequestHeader` would still push onto that dead
    // state. Harmless and documented.
    if (!state || state.skipped) {
      return origSend.call(this, body as Parameters<typeof origSend>[0]);
    }
    state.startWall = Date.now();
    state.startPerf = nowPerf(state.startWall);
    state.body = body;
    attachCapture(this, state);
    return origSend.call(this, body as Parameters<typeof origSend>[0]);
  }

  proto.open = patchedOpen as typeof proto.open;
  proto.setRequestHeader =
    patchedSetRequestHeader as typeof proto.setRequestHeader;
  proto.send = patchedSend as typeof proto.send;

  return () => {
    proto.open = origOpen;
    proto.setRequestHeader = origSetRequestHeader;
    proto.send = origSend;
  };
}

export const networkRing: RingDefinition = {
  name: 'network',
  install(ctx: RingContext): () => void {
    const teardownFetch = installFetch(ctx);
    const teardownXhr = installXhr(ctx);
    let torn = false;
    return () => {
      if (torn) return;
      torn = true;
      teardownXhr();
      teardownFetch();
    };
  },
};
