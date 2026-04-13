import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  __resetBrevwickRegistry,
  __setRingsForTesting,
  createBrevwick,
} from '../../core/client';
import { INTERNAL_KEY, type BrevwickInternal } from '../../core/internal';
import type { Brevwick, NetworkEntry } from '../../types';

const KEY = 'pk_test_aaaaaaaaaaaaaaaa01';
const ENDPOINT = 'https://api.brevwick.com';

function getInternal(instance: Brevwick): BrevwickInternal {
  return (instance as unknown as Record<typeof INTERNAL_KEY, BrevwickInternal>)[
    INTERNAL_KEY
  ];
}

function networkEntries(instance: Brevwick): readonly NetworkEntry[] {
  return getInternal(instance).buffers.network.snapshot();
}

/**
 * Await the async ring-loader promise so patched globals are deterministically
 * live before the test drives them. `install()` resolves the rings through
 * `import()`, so without this await tests race the dynamic-import microtask.
 */
async function installAndReady(instance: Brevwick): Promise<void> {
  instance.install();
  await getInternal(instance).ready();
}

/**
 * Minimal XHR stand-in so tests can drive readyState/status deterministically.
 * Prototype-shaped (methods live on the prototype) so the ring's
 * `XMLHttpRequest.prototype.open = ...` patch still swaps the right slot.
 */
class FakeXHR extends EventTarget {
  readyState = 0;
  status = 0;
  responseText = '';
  response: unknown = null;
  responseType: '' | 'text' | 'arraybuffer' | 'blob' | 'json' | 'document' = '';

  private _respHeaders: Record<string, string> = {};
  private _method = 'GET';
  private _url = '';
  private _body: unknown = undefined;

  /** Test hook: called from send() to simulate a response. */
  _respond: (xhr: FakeXHR) => void = () => {
    /* no-op by default */
  };

  open(method: string, url: string): void {
    this._method = method;
    this._url = url;
    this.readyState = 1;
  }

  setRequestHeader(_name: string, _value: string): void {
    /* swallowed — the ring's patched setRequestHeader captures the value itself */
  }

  send(body?: unknown): void {
    this._body = body;
    void Promise.resolve().then(() => this._respond(this));
  }

  getAllResponseHeaders(): string {
    return Object.entries(this._respHeaders)
      .map(([k, v]) => `${k}: ${v}`)
      .join('\r\n');
  }

  /** Test helper: flip to DONE and dispatch load with the given status/text. */
  finish(
    status: number,
    opts: { responseText?: string; headers?: Record<string, string> } = {},
  ): void {
    this.status = status;
    this.responseText = opts.responseText ?? '';
    if (opts.headers) this._respHeaders = opts.headers;
    this.readyState = 4;
    this.dispatchEvent(new Event('load'));
  }

  /** Test helper: dispatch a terminal error event (readyState 4, status 0). */
  failWith(event: 'error' | 'abort' | 'timeout'): void {
    this.status = 0;
    this.readyState = 4;
    this.dispatchEvent(new Event(event));
  }
}

let originalFetch: typeof window.fetch;
let originalXHR: typeof XMLHttpRequest;

beforeEach(() => {
  __resetBrevwickRegistry();
  __setRingsForTesting();
  originalFetch = window.fetch;
  originalXHR = globalThis.XMLHttpRequest;
  vi.stubGlobal('XMLHttpRequest', FakeXHR as unknown as typeof XMLHttpRequest);
});

afterEach(() => {
  __resetBrevwickRegistry();
  __setRingsForTesting();
  window.fetch = originalFetch;
  vi.stubGlobal('XMLHttpRequest', originalXHR);
  vi.unstubAllGlobals();
});

describe('network ring — fetch', () => {
  it('captures a 404 fetch', async () => {
    const fakeFetch = vi.fn(
      async () => new Response('not found', { status: 404 }),
    );
    window.fetch = fakeFetch as unknown as typeof window.fetch;

    const instance = createBrevwick({ projectKey: KEY });
    await installAndReady(instance);

    await window.fetch('https://example.com/missing');
    const entries = networkEntries(instance);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      kind: 'network',
      method: 'GET',
      status: 404,
      url: 'https://example.com/missing',
    });
    expect(entries[0]?.responseBody).toBe('not found');
  });

  it('does not capture a 200 fetch', async () => {
    window.fetch = vi.fn(
      async () => new Response('ok', { status: 200 }),
    ) as unknown as typeof window.fetch;

    const instance = createBrevwick({ projectKey: KEY });
    await installAndReady(instance);

    await window.fetch('https://example.com/ok');
    expect(networkEntries(instance)).toHaveLength(0);
  });

  it('captures a thrown fetch with status 0', async () => {
    window.fetch = vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    }) as unknown as typeof window.fetch;

    const instance = createBrevwick({ projectKey: KEY });
    await installAndReady(instance);

    await expect(window.fetch('https://example.com/down')).rejects.toThrow(
      /Failed to fetch/,
    );
    const entries = networkEntries(instance);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ status: 0, error: 'Failed to fetch' });
  });

  it('skips requests to the SDK endpoint (loop guard)', async () => {
    window.fetch = vi.fn(
      async () => new Response('server err', { status: 500 }),
    ) as unknown as typeof window.fetch;

    const instance = createBrevwick({ projectKey: KEY, endpoint: ENDPOINT });
    await installAndReady(instance);

    await window.fetch(`${ENDPOINT}/v1/reports`);
    expect(networkEntries(instance)).toHaveLength(0);
  });

  it('does not confuse a sibling brand host with the ingest endpoint', async () => {
    // https://api.brevwick.company/ and https://api.brevwick.com.evil.com/
    // both start-with-match the endpoint string `https://api.brevwick.com`.
    // The origin-based loop guard must still capture these as user traffic.
    window.fetch = vi.fn(
      async () => new Response('err', { status: 500 }),
    ) as unknown as typeof window.fetch;

    const instance = createBrevwick({ projectKey: KEY, endpoint: ENDPOINT });
    await installAndReady(instance);

    await window.fetch('https://api.brevwick.company/v1/reports');
    await window.fetch('https://api.brevwick.com.evil.com/v1/reports');
    const urls = networkEntries(instance).map((e) => e.url);
    expect(urls).toContain('https://api.brevwick.company/v1/reports');
    expect(urls).toContain('https://api.brevwick.com.evil.com/v1/reports');
  });

  it('skips requests carrying X-Brevwick-SDK header', async () => {
    window.fetch = vi.fn(
      async () => new Response('server err', { status: 500 }),
    ) as unknown as typeof window.fetch;

    const instance = createBrevwick({ projectKey: KEY });
    await installAndReady(instance);

    await window.fetch('https://other.example/reports', {
      method: 'POST',
      headers: { 'X-Brevwick-SDK': '1' },
    });
    expect(networkEntries(instance)).toHaveLength(0);
  });

  it('strips Authorization / Cookie / X-CSRF and keeps Content-Type in request headers', async () => {
    window.fetch = vi.fn(
      async () => new Response('{"err":true}', { status: 500 }),
    ) as unknown as typeof window.fetch;

    const instance = createBrevwick({ projectKey: KEY });
    await installAndReady(instance);

    await window.fetch('https://example.com/data', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer xxx',
        'Content-Type': 'application/json',
        Cookie: 'session=abc',
        'X-CSRF-Token': 'nope',
      },
      body: '{}',
    });

    const [entry] = networkEntries(instance);
    expect(entry?.requestHeaders).toBeDefined();
    expect(entry?.requestHeaders?.authorization).toBeUndefined();
    expect(entry?.requestHeaders?.cookie).toBeUndefined();
    expect(entry?.requestHeaders?.['x-csrf-token']).toBeUndefined();
    expect(entry?.requestHeaders?.['content-type']).toBe('application/json');
  });

  it('drops non-allow-listed headers such as Forwarded', async () => {
    // Deny-list regressions would silently ship `Forwarded` — assert the
    // allow-list semantics by sending a future-style header and checking
    // only the explicitly-allowed ones survived.
    window.fetch = vi.fn(
      async () => new Response('err', { status: 500 }),
    ) as unknown as typeof window.fetch;

    const instance = createBrevwick({ projectKey: KEY });
    await installAndReady(instance);

    await window.fetch('https://example.com/data', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Forwarded: 'for=1.2.3.4',
        'Permissions-Policy-Report-Only': 'geolocation=()',
      },
      body: '{}',
    });

    const [entry] = networkEntries(instance);
    expect(entry?.requestHeaders?.['content-type']).toBe('application/json');
    expect(entry?.requestHeaders?.forwarded).toBeUndefined();
    expect(
      entry?.requestHeaders?.['permissions-policy-report-only'],
    ).toBeUndefined();
  });

  it('redacts sensitive query params in captured URL', async () => {
    window.fetch = vi.fn(
      async () => new Response('err', { status: 500 }),
    ) as unknown as typeof window.fetch;

    const instance = createBrevwick({ projectKey: KEY });
    await installAndReady(instance);

    await window.fetch('/search?token=abc&q=hello');
    const [entry] = networkEntries(instance);
    expect(entry?.url).toBe('/search?q=hello');
  });

  it('caps and redacts request body', async () => {
    window.fetch = vi.fn(
      async () => new Response('err', { status: 400 }),
    ) as unknown as typeof window.fetch;

    const instance = createBrevwick({ projectKey: KEY });
    await installAndReady(instance);

    // ~10 kB payload containing an email.
    const filler = 'x'.repeat(10_000);
    const body = JSON.stringify({ email: 'leak@example.com', filler });

    await window.fetch('/api', { method: 'POST', body });
    const [entry] = networkEntries(instance);
    expect(entry?.requestBody).toBeDefined();
    expect(entry!.requestBody!.length).toBeLessThanOrEqual(
      2048 + '… [truncated 99999 bytes]'.length,
    );
    expect(entry?.requestBody).toMatch(/… \[truncated \d+ bytes\]$/);
    expect(entry?.requestBody).not.toContain('leak@example.com');
    expect(entry?.requestBody).toContain('[email]');
  });

  it('records binary request bodies as [binary N bytes]', async () => {
    window.fetch = vi.fn(
      async () => new Response('err', { status: 500 }),
    ) as unknown as typeof window.fetch;

    const instance = createBrevwick({ projectKey: KEY });
    await installAndReady(instance);

    const blob = new Blob([new Uint8Array([1, 2, 3, 4, 5])]);
    await window.fetch('/upload', { method: 'POST', body: blob });

    const [entry] = networkEntries(instance);
    expect(entry?.requestBody).toBe(`[binary ${blob.size} bytes]`);
  });

  it('reads the request body off a Request-object input', async () => {
    window.fetch = vi.fn(
      async () => new Response('err', { status: 500 }),
    ) as unknown as typeof window.fetch;

    const instance = createBrevwick({ projectKey: KEY });
    await installAndReady(instance);

    const req = new Request('https://example.com/x', {
      method: 'POST',
      body: 'hello',
      headers: { 'Content-Type': 'text/plain' },
    });
    await window.fetch(req);

    const [entry] = networkEntries(instance);
    expect(entry?.method).toBe('POST');
    expect(entry?.requestBody).toBe('hello');
  });

  it('leaves the caller free to consume the response body after capture', async () => {
    window.fetch = vi.fn(
      async () => new Response('payload', { status: 404 }),
    ) as unknown as typeof window.fetch;

    const instance = createBrevwick({ projectKey: KEY });
    await installAndReady(instance);

    const res = await window.fetch('/missing');
    // Ring cloned the response; the caller's own body stream must still be
    // readable and must yield the full payload.
    await expect(res.text()).resolves.toBe('payload');
    const [entry] = networkEntries(instance);
    expect(entry?.responseBody).toBe('payload');
  });
});

describe('network ring — XHR', () => {
  it('captures an XHR 500', async () => {
    const instance = createBrevwick({ projectKey: KEY });
    await installAndReady(instance);

    const xhr = new XMLHttpRequest() as unknown as FakeXHR;
    xhr._respond = (x) =>
      x.finish(500, {
        responseText: 'server err',
        headers: { 'content-type': 'text/plain' },
      });
    xhr.open('POST', 'https://example.com/submit');
    xhr.setRequestHeader('Content-Type', 'application/json');
    xhr.send('{}');

    await new Promise((r) => setTimeout(r, 0));
    const [entry] = networkEntries(instance);
    expect(entry).toMatchObject({
      kind: 'network',
      method: 'POST',
      status: 500,
      url: 'https://example.com/submit',
    });
    expect(entry?.responseBody).toBe('server err');
    expect(entry?.requestHeaders?.['content-type']).toBe('application/json');
  });

  it('does not capture an XHR 200', async () => {
    const instance = createBrevwick({ projectKey: KEY });
    await installAndReady(instance);

    const xhr = new XMLHttpRequest() as unknown as FakeXHR;
    xhr._respond = (x) => x.finish(200, { responseText: 'ok' });
    xhr.open('GET', 'https://example.com/ok');
    xhr.send();

    await new Promise((r) => setTimeout(r, 0));
    expect(networkEntries(instance)).toHaveLength(0);
  });

  it('skips XHR requests to the SDK endpoint (loop guard)', async () => {
    const instance = createBrevwick({ projectKey: KEY, endpoint: ENDPOINT });
    await installAndReady(instance);

    const xhr = new XMLHttpRequest() as unknown as FakeXHR;
    xhr._respond = (x) => x.finish(500, { responseText: 'server err' });
    xhr.open('POST', `${ENDPOINT}/v1/reports`);
    xhr.send('{}');

    await new Promise((r) => setTimeout(r, 0));
    expect(networkEntries(instance)).toHaveLength(0);
  });

  it('skips XHR requests carrying X-Brevwick-SDK header', async () => {
    const instance = createBrevwick({ projectKey: KEY });
    await installAndReady(instance);

    const xhr = new XMLHttpRequest() as unknown as FakeXHR;
    xhr._respond = (x) => x.finish(500, { responseText: 'server err' });
    xhr.open('POST', 'https://other.example/reports');
    xhr.setRequestHeader('X-Brevwick-SDK', '1');
    xhr.send('{}');

    await new Promise((r) => setTimeout(r, 0));
    expect(networkEntries(instance)).toHaveLength(0);
  });

  it('captures XHR network errors as status 0 / "network error"', async () => {
    const instance = createBrevwick({ projectKey: KEY });
    await installAndReady(instance);

    const xhr = new XMLHttpRequest() as unknown as FakeXHR;
    xhr._respond = (x) => x.failWith('error');
    xhr.open('GET', 'https://example.com/down');
    xhr.send();

    await new Promise((r) => setTimeout(r, 0));
    const [entry] = networkEntries(instance);
    expect(entry).toMatchObject({ status: 0, error: 'network error' });
  });

  it('captures XHR aborts as status 0 / "aborted"', async () => {
    const instance = createBrevwick({ projectKey: KEY });
    await installAndReady(instance);

    const xhr = new XMLHttpRequest() as unknown as FakeXHR;
    xhr._respond = (x) => x.failWith('abort');
    xhr.open('GET', 'https://example.com/slow');
    xhr.send();

    await new Promise((r) => setTimeout(r, 0));
    const [entry] = networkEntries(instance);
    expect(entry).toMatchObject({ status: 0, error: 'aborted' });
  });

  it('captures XHR timeouts as status 0 / "timeout"', async () => {
    const instance = createBrevwick({ projectKey: KEY });
    await installAndReady(instance);

    const xhr = new XMLHttpRequest() as unknown as FakeXHR;
    xhr._respond = (x) => x.failWith('timeout');
    xhr.open('GET', 'https://example.com/stalled');
    xhr.send();

    await new Promise((r) => setTimeout(r, 0));
    const [entry] = networkEntries(instance);
    expect(entry).toMatchObject({ status: 0, error: 'timeout' });
  });
});

describe('network ring — disable flag', () => {
  it('leaves window.fetch untouched when rings.network is false', async () => {
    const before = window.fetch;
    const instance = createBrevwick({
      projectKey: KEY,
      rings: { network: false },
    });
    await installAndReady(instance);
    expect(window.fetch).toBe(before);
    instance.uninstall();
  });
});

describe('network ring — uninstall identity', () => {
  it('restores window.fetch and XHR prototype methods by identity', async () => {
    const beforeFetch = window.fetch;
    const beforeOpen = XMLHttpRequest.prototype.open;
    const beforeSend = XMLHttpRequest.prototype.send;
    const beforeSetHeader = XMLHttpRequest.prototype.setRequestHeader;

    const instance = createBrevwick({ projectKey: KEY });
    await installAndReady(instance);

    // Sanity: all patched.
    expect(window.fetch).not.toBe(beforeFetch);
    expect(XMLHttpRequest.prototype.open).not.toBe(beforeOpen);
    expect(XMLHttpRequest.prototype.send).not.toBe(beforeSend);
    expect(XMLHttpRequest.prototype.setRequestHeader).not.toBe(beforeSetHeader);

    instance.uninstall();

    expect(window.fetch).toBe(beforeFetch);
    expect(XMLHttpRequest.prototype.open).toBe(beforeOpen);
    expect(XMLHttpRequest.prototype.send).toBe(beforeSend);
    expect(XMLHttpRequest.prototype.setRequestHeader).toBe(beforeSetHeader);
  });

  it('install → uninstall → install leaves prototype identity intact on the second uninstall', async () => {
    const beforeFetch = window.fetch;
    const beforeOpen = XMLHttpRequest.prototype.open;

    const a = createBrevwick({ projectKey: KEY });
    await installAndReady(a);
    a.uninstall();

    const b = createBrevwick({ projectKey: KEY });
    await installAndReady(b);
    b.uninstall();

    expect(window.fetch).toBe(beforeFetch);
    expect(XMLHttpRequest.prototype.open).toBe(beforeOpen);
  });

  it('uninstall before async ring loader resolves does not re-patch globals', async () => {
    // Simulates "user uninstalls synchronously after install()" — the lazy
    // import must detect the generation flip and skip ring.install().
    const beforeFetch = window.fetch;
    const beforeOpen = XMLHttpRequest.prototype.open;

    const instance = createBrevwick({ projectKey: KEY });
    instance.install();
    // Uninstall immediately, BEFORE `ready()` resolves. Generation bumps.
    instance.uninstall();
    await getInternal(instance).ready();

    expect(window.fetch).toBe(beforeFetch);
    expect(XMLHttpRequest.prototype.open).toBe(beforeOpen);
  });
});
