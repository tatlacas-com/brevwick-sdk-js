/**
 * Network ring — captures failed requests (status ≥ 400 or thrown) by
 * wrapping `window.fetch` and `XMLHttpRequest.prototype.open/send/setRequestHeader`.
 *
 * Redaction happens at the ring boundary: header allowlist, query-param
 * stripping, body caps, and `redact()` on any text body. Requests to the SDK's
 * own ingest endpoint (or carrying the `X-Brevwick-SDK` marker) are skipped to
 * avoid feedback loops when `submit()` itself posts a failing response.
 */
import type { NetworkEntry } from '../types';
import type { RingContext, RingDefinition } from '../core/internal';
import { redact } from '../core/internal/redact';

const REQUEST_BODY_CAP = 2048;
const RESPONSE_BODY_CAP = 4096;
const SDK_HEADER = 'x-brevwick-sdk';

const DROP_HEADER_PATTERNS: readonly RegExp[] = [
  /^authorization$/i,
  /^cookie$/i,
  /^set-cookie$/i,
  /^x-csrf/i,
];

const REDACT_QUERY_PARAM = /^(token|auth|key|session|sig).*/i;
const BINARY_CONTENT_TYPE = /(^image\/)|(^audio\/)|(^video\/)|octet-stream/i;

function shouldDropHeader(name: string): boolean {
  return DROP_HEADER_PATTERNS.some((p) => p.test(name));
}

function sanitiseHeaders(
  pairs: Iterable<readonly [string, string]>,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [name, value] of pairs) {
    if (shouldDropHeader(name)) continue;
    out[name.toLowerCase()] = value;
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

function redactUrl(raw: string): string {
  const parsed = resolveAbsolute(raw);
  if (!parsed) return raw;
  const toDelete: string[] = [];
  parsed.searchParams.forEach((_, key) => {
    if (REDACT_QUERY_PARAM.test(key)) toDelete.push(key);
  });
  for (const key of toDelete) parsed.searchParams.delete(key);
  // Preserve the input shape: if the caller passed a relative URL, return one.
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(raw)) return parsed.toString();
  const query = parsed.searchParams.toString();
  return parsed.pathname + (query ? `?${query}` : '') + parsed.hash;
}

function capBody(raw: string, cap: number): string {
  if (raw.length <= cap) return raw;
  const removed = raw.length - cap;
  return `${raw.slice(0, cap)}… [truncated ${removed} bytes]`;
}

function stringifyBody(body: unknown): string | undefined {
  if (body == null) return undefined;
  if (typeof body === 'string') return body;
  if (typeof URLSearchParams !== 'undefined' && body instanceof URLSearchParams) {
    return body.toString();
  }
  if (typeof Blob !== 'undefined' && body instanceof Blob) {
    return `[binary ${body.size} bytes]`;
  }
  if (typeof ArrayBuffer !== 'undefined' && body instanceof ArrayBuffer) {
    return `[binary ${body.byteLength} bytes]`;
  }
  if (ArrayBuffer.isView(body)) {
    return `[binary ${(body as ArrayBufferView).byteLength} bytes]`;
  }
  if (typeof FormData !== 'undefined' && body instanceof FormData) {
    return '[form-data]';
  }
  return undefined;
}

function capturedBody(body: unknown, cap: number): string | undefined {
  const raw = stringifyBody(body);
  if (raw === undefined) return undefined;
  // Binary + form-data markers are already synthetic — don't feed them to redact().
  if (raw.startsWith('[binary ') || raw === '[form-data]') return raw;
  return redact(capBody(raw, cap));
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
  const original = window.fetch;
  const patched = async function patchedFetch(
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> {
    const rawUrl = extractUrl(input);
    const absolute = resolveAbsolute(rawUrl);
    const reqHeaders = extractRequestHeaders(input, init);
    const isLoop =
      !!absolute && absolute.toString().startsWith(ctx.config.endpoint);
    const isMarked = reqHeaders.has(SDK_HEADER);
    if (isLoop || isMarked) {
      return original.call(window, input, init);
    }

    const method = extractMethod(input, init);
    const startWall = Date.now();
    const startPerf =
      typeof performance !== 'undefined' ? performance.now() : startWall;

    let response: Response;
    try {
      response = await original.call(window, input, init);
    } catch (err) {
      const nowPerf =
        typeof performance !== 'undefined' ? performance.now() : Date.now();
      ctx.push({
        kind: 'network',
        method,
        url: redactUrl(rawUrl),
        status: 0,
        durationMs: nowPerf - startPerf,
        timestamp: startWall,
        requestBody: capturedBody(init?.body, REQUEST_BODY_CAP),
        requestHeaders: sanitiseHeaders(reqHeaders.entries()),
        responseHeaders: {},
        error: err instanceof Error ? err.message : String(err),
      });
      throw err;
    }

    if (response.status < 400) return response;

    // Clone to read the body without consuming it for the caller.
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
      // Body already consumed or stream errored — capture without it.
    }

    const nowPerf =
      typeof performance !== 'undefined' ? performance.now() : Date.now();
    const entry: NetworkEntry = {
      kind: 'network',
      method,
      url: redactUrl(rawUrl),
      status: response.status,
      durationMs: nowPerf - startPerf,
      timestamp: startWall,
      requestBody: capturedBody(init?.body, REQUEST_BODY_CAP),
      responseBody,
      requestHeaders: sanitiseHeaders(reqHeaders.entries()),
      responseHeaders: sanitiseHeaders(response.headers.entries()),
    };
    ctx.push(entry);
    return response;
  } as typeof window.fetch;

  window.fetch = patched;
  return () => {
    window.fetch = original;
  };
}

function installXhr(ctx: RingContext): () => void {
  const proto = XMLHttpRequest.prototype;
  const origOpen = proto.open;
  const origSend = proto.send;
  const origSetRequestHeader = proto.setRequestHeader;

  function patchedOpen(
    this: XMLHttpRequest,
    method: string,
    url: string | URL,
    ...rest: unknown[]
  ): void {
    const rawUrl = typeof url === 'string' ? url : url.toString();
    const absolute = resolveAbsolute(rawUrl);
    const skipped =
      !!absolute && absolute.toString().startsWith(ctx.config.endpoint);
    xhrState.set(this, {
      method: method.toUpperCase(),
      url: rawUrl,
      startWall: 0,
      startPerf: 0,
      headers: [],
      body: undefined,
      skipped,
      captured: false,
    });
    return (origOpen as (...a: unknown[]) => void).call(
      this,
      method,
      url,
      ...rest,
    );
  }

  function patchedSetRequestHeader(
    this: XMLHttpRequest,
    name: string,
    value: string,
  ): void {
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
      const nowPerf =
        typeof performance !== 'undefined' ? performance.now() : Date.now();

      let responseHeaders: Record<string, string> = {};
      try {
        responseHeaders = sanitiseHeaders(
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

      const entry: NetworkEntry = {
        kind: 'network',
        method: state.method,
        url: redactUrl(state.url),
        status,
        durationMs: nowPerf - state.startPerf,
        timestamp: state.startWall,
        requestBody: capturedBody(state.body, REQUEST_BODY_CAP),
        responseBody,
        requestHeaders: sanitiseHeaders(state.headers),
        responseHeaders,
      };
      if (error !== undefined) entry.error = error;
      ctx.push(entry);
    };

    xhr.addEventListener('readystatechange', () => {
      if (xhr.readyState === 4 && xhr.status >= 400) capture(xhr.status);
    });
    xhr.addEventListener('error', () => capture(0, 'network error'));
  }

  function patchedSend(
    this: XMLHttpRequest,
    body?: Document | XMLHttpRequestBodyInit | null,
  ): void {
    const state = xhrState.get(this);
    if (!state || state.skipped) {
      return origSend.call(this, body as XMLHttpRequestBodyInit | null);
    }
    state.startWall = Date.now();
    state.startPerf =
      typeof performance !== 'undefined'
        ? performance.now()
        : state.startWall;
    state.body = body;
    attachCapture(this, state);
    return origSend.call(this, body as XMLHttpRequestBodyInit | null);
  }

  proto.open = patchedOpen as typeof proto.open;
  proto.setRequestHeader = patchedSetRequestHeader as typeof proto.setRequestHeader;
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
