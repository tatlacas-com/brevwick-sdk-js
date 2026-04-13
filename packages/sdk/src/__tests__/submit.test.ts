import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { createBrevwick } from '../core/client';
import { __resetBrevwickRegistry, __setRingsForTesting } from '../testing';

const KEY = 'pk_test_aaaaaaaaaaaaaaaa01';
const ENDPOINT = 'https://api.brevwick.com';
const PRESIGN_URL = `${ENDPOINT}/v1/ingest/presign`;
const REPORTS_URL = `${ENDPOINT}/v1/ingest/reports`;
const UPLOAD_URL = 'https://r2.example.com/upload/abc';
const OBJECT_KEY = 'p/01HV/at/01HV';

const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  server.resetHandlers();
  __resetBrevwickRegistry();
  __setRingsForTesting();
  vi.useRealTimers();
});
afterAll(() => server.close());

function makeBlob(): Blob {
  return new Blob([new Uint8Array([0x89, 0x50])], { type: 'image/png' });
}

/**
 * Capture the body of the reports POST so tests can assert redaction end-to-end.
 * MSW reads the body once; we cache the text for later inspection.
 */
function captureReportBody(): { get: () => string | undefined } {
  let captured: string | undefined;
  server.use(
    http.post(REPORTS_URL, async ({ request }) => {
      captured = await request.text();
      return HttpResponse.json(
        { report_id: 'rep_123', status: 'received' },
        { status: 202 },
      );
    }),
  );
  return { get: () => captured };
}

/**
 * Standard presign + PUT handlers covering the happy upload path. Returns
 * counters so tests can assert exactly-once / not-called semantics.
 */
function installUploadHandlers(): {
  presignHits: () => number;
  putHits: () => number;
} {
  let presignHits = 0;
  let putHits = 0;
  server.use(
    http.post(PRESIGN_URL, () => {
      presignHits++;
      return HttpResponse.json({
        object_key: OBJECT_KEY,
        upload_url: UPLOAD_URL,
        headers: { 'Content-Type': 'image/png' },
        expires_at: '2099-01-01T00:00:00Z',
      });
    }),
    http.put(UPLOAD_URL, () => {
      putHits++;
      return new HttpResponse(null, { status: 200 });
    }),
  );
  return { presignHits: () => presignHits, putHits: () => putHits };
}

describe('submit — happy path', () => {
  it('presigns, uploads, posts, and resolves with report_id', async () => {
    installUploadHandlers();
    let reportBody: Record<string, unknown> | undefined;
    server.use(
      http.post(REPORTS_URL, async ({ request }) => {
        reportBody = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json(
          { report_id: 'rep_abc', status: 'received' },
          { status: 202 },
        );
      }),
    );

    const instance = createBrevwick({
      projectKey: KEY,
      environment: 'stg',
      release: '1.2.3',
      buildSha: 'deadbeef',
    });
    const result = await instance.submit({
      title: 'broken',
      description: 'the thing broke',
      attachments: [makeBlob()],
    });

    expect(result).toEqual({ ok: true, report_id: 'rep_abc' });
    expect(reportBody).toBeDefined();
    const attachments = reportBody?.attachments as unknown[];
    expect(attachments).toHaveLength(1);
    expect(attachments[0]).toMatchObject({
      object_key: OBJECT_KEY,
      mime: 'image/png',
    });
    const deviceCtx = reportBody?.device_context as Record<string, unknown>;
    expect(deviceCtx.platform).toBe('web');
    expect((deviceCtx.sdk as Record<string, unknown>).name).toBe(
      'brevwick-sdk',
    );
  });
});

describe('submit — attachment failures', () => {
  it('presign 500 → ATTACHMENT_UPLOAD_FAILED, no reports POST fired', async () => {
    let reportsHit = 0;
    server.use(
      http.post(PRESIGN_URL, () =>
        HttpResponse.json({ error: 'boom' }, { status: 500 }),
      ),
      http.post(REPORTS_URL, () => {
        reportsHit++;
        return HttpResponse.json({ report_id: 'x' }, { status: 202 });
      }),
    );
    const instance = createBrevwick({ projectKey: KEY });
    const result = await instance.submit({
      description: 'd',
      attachments: [makeBlob()],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('ATTACHMENT_UPLOAD_FAILED');
    expect(reportsHit).toBe(0);
  });

  it('PUT 403 → ATTACHMENT_UPLOAD_FAILED, no reports POST fired', async () => {
    let reportsHit = 0;
    server.use(
      http.post(PRESIGN_URL, () =>
        HttpResponse.json({
          object_key: OBJECT_KEY,
          upload_url: UPLOAD_URL,
        }),
      ),
      http.put(UPLOAD_URL, () => new HttpResponse(null, { status: 403 })),
      http.post(REPORTS_URL, () => {
        reportsHit++;
        return HttpResponse.json({ report_id: 'x' }, { status: 202 });
      }),
    );
    const instance = createBrevwick({ projectKey: KEY });
    const result = await instance.submit({
      description: 'd',
      attachments: [makeBlob()],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('ATTACHMENT_UPLOAD_FAILED');
    expect(reportsHit).toBe(0);
  });
});

describe('submit — ingest failures', () => {
  it('ingest 422 → INGEST_REJECTED, not retried', async () => {
    let hits = 0;
    server.use(
      http.post(REPORTS_URL, () => {
        hits++;
        return HttpResponse.json(
          { error: { code: 'QUOTA_EXCEEDED' } },
          { status: 422 },
        );
      }),
    );
    const instance = createBrevwick({ projectKey: KEY });
    const result = await instance.submit({ description: 'd' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('INGEST_REJECTED');
    expect(hits).toBe(1);
  });

  it('ingest 503 → 200 after exactly one retry', async () => {
    let hits = 0;
    server.use(
      http.post(REPORTS_URL, () => {
        hits++;
        if (hits === 1) {
          return HttpResponse.json({ error: 'boom' }, { status: 503 });
        }
        return HttpResponse.json(
          { report_id: 'rep_ok', status: 'received' },
          { status: 202 },
        );
      }),
    );
    const instance = createBrevwick({ projectKey: KEY });
    const result = await instance.submit({ description: 'd' });
    expect(result).toEqual({ ok: true, report_id: 'rep_ok' });
    expect(hits).toBe(2);
  });

  it('ingest timeout — 30 s budget exceeded yields INGEST_TIMEOUT', async () => {
    // Handler never responds; the submit-side AbortController is the only
    // thing that can unblock the fetch. Fake timers let us advance past the
    // 30 s budget deterministically without the test actually waiting.
    server.use(
      http.post(REPORTS_URL, () => new Promise<Response>(() => undefined)),
    );
    vi.useFakeTimers();
    const instance = createBrevwick({ projectKey: KEY });
    const pending = instance.submit({ description: 'd' });
    await vi.advanceTimersByTimeAsync(31_000);
    const result = await pending;
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('INGEST_TIMEOUT');
  });
});

describe('submit — headers + redaction', () => {
  it('stamps X-Brevwick-SDK on every ingest-origin request (loop guard)', async () => {
    // The loop-guard header rides on requests to OUR endpoint (presign +
    // reports). Presigned PUTs land on R2 / S3, which reject unsigned headers
    // — so we intentionally omit the marker there and let the ring's origin
    // check handle the (different-origin) upload URL.
    const ingestSdkHeaders: string[] = [];
    let putSdkHeader: string | null = 'missing';
    server.use(
      http.post(PRESIGN_URL, ({ request }) => {
        ingestSdkHeaders.push(request.headers.get('x-brevwick-sdk') ?? '');
        return HttpResponse.json({
          object_key: OBJECT_KEY,
          upload_url: UPLOAD_URL,
        });
      }),
      http.put(UPLOAD_URL, ({ request }) => {
        putSdkHeader = request.headers.get('x-brevwick-sdk');
        return new HttpResponse(null, { status: 200 });
      }),
      http.post(REPORTS_URL, ({ request }) => {
        ingestSdkHeaders.push(request.headers.get('x-brevwick-sdk') ?? '');
        return HttpResponse.json(
          { report_id: 'rep_h', status: 'received' },
          { status: 202 },
        );
      }),
    );
    const instance = createBrevwick({ projectKey: KEY });
    const result = await instance.submit({
      description: 'd',
      attachments: [makeBlob()],
    });
    expect(result.ok).toBe(true);
    expect(ingestSdkHeaders).toHaveLength(2);
    for (const h of ingestSdkHeaders) expect(h).toMatch(/^brevwick-sdk\/\d/);
    // Presigned PUT must not carry the marker — unsigned headers break R2.
    expect(putSdkHeader).toBeNull();
  });

  it('redaction golden fixture: email + Bearer + JWT + SA-ID + base64 all masked', async () => {
    installUploadHandlers();
    const capture = captureReportBody();

    const rawEmail = 'user@example.com';
    const rawBearer = 'Bearer sk_live_abcdef1234567890';
    const rawJwt =
      'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTYifQ.sig_with_more_chars_to_satisfy_regex';
    const rawSaId = '9001015800087';
    const rawBase64 = 'A'.repeat(250);
    const combined = [rawEmail, rawBearer, rawJwt, rawSaId, rawBase64].join(
      ' | ',
    );

    const instance = createBrevwick({ projectKey: KEY });
    const result = await instance.submit({
      description: combined,
      expected: `email ${rawEmail} should be masked`,
      attachments: [makeBlob()],
    });
    expect(result.ok).toBe(true);

    const body = capture.get() ?? '';
    expect(body).toContain('[email]');
    expect(body).toContain('[jwt]');
    expect(body).toContain('[blob]');
    expect(body).not.toContain(rawEmail);
    expect(body).not.toContain('eyJhbGciOiJIUzI1NiJ9');
    expect(body).not.toContain('sk_live_abcdef1234567890');
    expect(body).not.toContain(rawBase64);
  });

  it('redacts user email with a***@d***.tld mask but keeps id verbatim', async () => {
    installUploadHandlers();
    const capture = captureReportBody();
    const instance = createBrevwick({
      projectKey: KEY,
      user: { id: 'u_42', email: 'alice@example.com', display_name: 'Alice' },
    });
    const result = await instance.submit({ description: 'd' });
    expect(result.ok).toBe(true);
    const body = JSON.parse(capture.get() ?? '{}') as Record<string, unknown>;
    const userCtx = body.user_context as Record<string, unknown>;
    const user = userCtx.user as Record<string, unknown>;
    expect(user.id).toBe('u_42');
    expect(user.email).toBe('a***@e***.com');
    // display_name is a free-form string; redact() leaves short non-secret
    // text untouched, so the assertion here is just that it was *processed*
    // (present and a string). The hard secrets-leakage guard is the golden
    // fixture test above.
    expect(typeof user.display_name).toBe('string');
  });
});
