import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  __resetBrevwickRegistry,
  __setRingsForTesting,
  createBrevwick,
} from '../../core/client';
import type { BrevwickInternal } from '../../core/internal';
import type { Brevwick, NetworkEntry } from '../../types';

const KEY = 'pk_test_aaaaaaaaaaaaaaaa01';
const ENDPOINT = 'https://api.brevwick.com';

function getInternal(instance: Brevwick): BrevwickInternal {
  return (instance as unknown as { _internal: BrevwickInternal })._internal;
}

function networkEntries(instance: Brevwick): readonly NetworkEntry[] {
  return getInternal(instance).buffers.network.snapshot();
}

/**
 * Minimal XHR stand-in so tests can drive readyState/status deterministically.
 * Prototype-shaped (methods live on the prototype) so the ring's
 * `XMLHttpRequest.prototype.open = ...` patch still swaps the right slot.
 */
class FakeXHR extends EventTarget {
  static readonly UNSENT = 0;
  static readonly OPENED = 1;
  static readonly HEADERS_RECEIVED = 2;
  static readonly LOADING = 3;
  static readonly DONE = 4;

  readyState = 0;
  status = 0;
  responseText = '';
  response: unknown = null;
  responseType: '' | 'text' | 'arraybuffer' | 'blob' | 'json' | 'document' =
    '';

  private _reqHeaders: Record<string, string> = {};
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

  setRequestHeader(name: string, value: string): void {
    this._reqHeaders[name] = value;
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

  setResponseHeaders(headers: Record<string, string>): void {
    this._respHeaders = headers;
  }

  /** Test helper: flip to DONE and dispatch readystatechange with the given status/text. */
  finish(
    status: number,
    opts: { responseText?: string; headers?: Record<string, string> } = {},
  ): void {
    this.status = status;
    this.responseText = opts.responseText ?? '';
    if (opts.headers) this._respHeaders = opts.headers;
    this.readyState = 4;
    this.dispatchEvent(new Event('readystatechange'));
  }

  errorOut(): void {
    this.status = 0;
    this.readyState = 4;
    this.dispatchEvent(new Event('error'));
  }
}

let originalFetch: typeof window.fetch;
let originalXHR: typeof XMLHttpRequest;

beforeEach(() => {
  __resetBrevwickRegistry();
  __setRingsForTesting();
  originalFetch = window.fetch;
  originalXHR = globalThis.XMLHttpRequest;
  vi.stubGlobal(
    'XMLHttpRequest',
    FakeXHR as unknown as typeof XMLHttpRequest,
  );
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
    const fakeFetch = vi.fn(async () =>
      new Response('not found', { status: 404 }),
    );
    window.fetch = fakeFetch as unknown as typeof window.fetch;

    const instance = createBrevwick({ projectKey: KEY });
    instance.install();

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
    instance.install();

    await window.fetch('https://example.com/ok');
    expect(networkEntries(instance)).toHaveLength(0);
  });

  it('captures a thrown fetch with status 0', async () => {
    window.fetch = vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    }) as unknown as typeof window.fetch;

    const instance = createBrevwick({ projectKey: KEY });
    instance.install();

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
    instance.install();

    await window.fetch(`${ENDPOINT}/v1/reports`);
    expect(networkEntries(instance)).toHaveLength(0);
  });

  it('skips requests carrying X-Brevwick-SDK header', async () => {
    window.fetch = vi.fn(
      async () => new Response('server err', { status: 500 }),
    ) as unknown as typeof window.fetch;

    const instance = createBrevwick({ projectKey: KEY });
    instance.install();

    await window.fetch('https://other.example/reports', {
      method: 'POST',
      headers: { 'X-Brevwick-SDK': '1' },
    });
    expect(networkEntries(instance)).toHaveLength(0);
  });

  it('strips Authorization but keeps Content-Type in request headers', async () => {
    window.fetch = vi.fn(
      async () => new Response('{"err":true}', { status: 500 }),
    ) as unknown as typeof window.fetch;

    const instance = createBrevwick({ projectKey: KEY });
    instance.install();

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

  it('redacts sensitive query params in captured URL', async () => {
    window.fetch = vi.fn(
      async () => new Response('err', { status: 500 }),
    ) as unknown as typeof window.fetch;

    const instance = createBrevwick({ projectKey: KEY });
    instance.install();

    await window.fetch('/search?token=abc&q=hello');
    const [entry] = networkEntries(instance);
    expect(entry?.url).toBe('/search?q=hello');
  });

  it('caps and redacts request body', async () => {
    window.fetch = vi.fn(
      async () => new Response('err', { status: 400 }),
    ) as unknown as typeof window.fetch;

    const instance = createBrevwick({ projectKey: KEY });
    instance.install();

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
});

describe('network ring — XHR', () => {
  it('captures an XHR 500', async () => {
    const instance = createBrevwick({ projectKey: KEY });
    instance.install();

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
  });

  it('does not capture an XHR 200', async () => {
    const instance = createBrevwick({ projectKey: KEY });
    instance.install();

    const xhr = new XMLHttpRequest() as unknown as FakeXHR;
    xhr._respond = (x) => x.finish(200, { responseText: 'ok' });
    xhr.open('GET', 'https://example.com/ok');
    xhr.send();

    await new Promise((r) => setTimeout(r, 0));
    expect(networkEntries(instance)).toHaveLength(0);
  });
});

describe('network ring — disable flag', () => {
  it('leaves window.fetch untouched when rings.network is false', () => {
    const before = window.fetch;
    const instance = createBrevwick({
      projectKey: KEY,
      rings: { network: false },
    });
    instance.install();
    expect(window.fetch).toBe(before);
    instance.uninstall();
  });
});

describe('network ring — uninstall identity', () => {
  it('restores window.fetch and XHR prototype methods by identity', () => {
    const beforeFetch = window.fetch;
    const beforeOpen = XMLHttpRequest.prototype.open;
    const beforeSend = XMLHttpRequest.prototype.send;
    const beforeSetHeader = XMLHttpRequest.prototype.setRequestHeader;

    const instance = createBrevwick({ projectKey: KEY });
    instance.install();

    // Sanity: all patched.
    expect(window.fetch).not.toBe(beforeFetch);
    expect(XMLHttpRequest.prototype.open).not.toBe(beforeOpen);
    expect(XMLHttpRequest.prototype.send).not.toBe(beforeSend);
    expect(XMLHttpRequest.prototype.setRequestHeader).not.toBe(
      beforeSetHeader,
    );

    instance.uninstall();

    expect(window.fetch).toBe(beforeFetch);
    expect(XMLHttpRequest.prototype.open).toBe(beforeOpen);
    expect(XMLHttpRequest.prototype.send).toBe(beforeSend);
    expect(XMLHttpRequest.prototype.setRequestHeader).toBe(beforeSetHeader);
  });

  it('install → uninstall → install leaves prototype identity intact on the second uninstall', () => {
    const beforeFetch = window.fetch;
    const beforeOpen = XMLHttpRequest.prototype.open;

    const a = createBrevwick({ projectKey: KEY });
    a.install();
    a.uninstall();

    const b = createBrevwick({ projectKey: KEY });
    b.install();
    b.uninstall();

    expect(window.fetch).toBe(beforeFetch);
    expect(XMLHttpRequest.prototype.open).toBe(beforeOpen);
  });
});
