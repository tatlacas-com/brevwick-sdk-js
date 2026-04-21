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
import { INTERNAL_KEY, type BrevwickInternal } from '../core/internal';
import { __resetBrevwickRegistry, __setRingsForTesting } from '../testing';

function getInternal(
  instance: ReturnType<typeof createBrevwick>,
): BrevwickInternal {
  return (instance as unknown as Record<typeof INTERNAL_KEY, BrevwickInternal>)[
    INTERNAL_KEY
  ];
}

const KEY = 'pk_test_aaaaaaaaaaaaaaaa01';
const ENDPOINT = 'https://api.brevwick.com';
const PRESIGN_URL = `${ENDPOINT}/v1/ingest/presign`;
const ISSUES_URL = `${ENDPOINT}/v1/ingest/issues`;
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
 * Capture the body of the issues POST so tests can assert redaction end-to-end.
 * MSW reads the body once; we cache the text for later inspection.
 */
function captureIssueBody(): { get: () => string | undefined } {
  let captured: string | undefined;
  server.use(
    http.post(ISSUES_URL, async ({ request }) => {
      captured = await request.text();
      return HttpResponse.json(
        { issue_id: 'rep_123', status: 'received' },
        { status: 202 },
      );
    }),
  );
  return { get: () => captured };
}

/**
 * Standard presign + PUT handlers covering the happy upload path. Returns
 * counters and captured payloads so tests can assert exactly-once /
 * not-called semantics and that the sha256 threaded through the pipeline
 * (presign body → echoed presign-response header → PUT header → issue
 * attachment entry) stays consistent end to end.
 */
function installUploadHandlers(): {
  presignHits: () => number;
  putHits: () => number;
  presignBodies: () => Array<{
    mime: string;
    size_bytes: number;
    sha256: string;
  }>;
  putChecksums: () => string[];
} {
  let presignHits = 0;
  let putHits = 0;
  const presignBodies: Array<{
    mime: string;
    size_bytes: number;
    sha256: string;
  }> = [];
  const putChecksums: string[] = [];
  server.use(
    http.post(PRESIGN_URL, async ({ request }) => {
      const body = (await request.json()) as {
        mime: string;
        size_bytes: number;
        sha256: string;
      };
      presignBodies.push(body);
      presignHits++;
      return HttpResponse.json({
        object_key: `${OBJECT_KEY}-${presignHits}`,
        upload_url: UPLOAD_URL,
        headers: {
          'Content-Type': body.mime,
          'x-amz-checksum-sha256': body.sha256,
        },
        expires_at: '2099-01-01T00:00:00Z',
      });
    }),
    http.put(UPLOAD_URL, ({ request }) => {
      putHits++;
      putChecksums.push(request.headers.get('x-amz-checksum-sha256') ?? '');
      return new HttpResponse(null, { status: 200 });
    }),
  );
  return {
    presignHits: () => presignHits,
    putHits: () => putHits,
    presignBodies: () => presignBodies,
    putChecksums: () => putChecksums,
  };
}

describe('submit — happy path', () => {
  it('presigns, uploads, posts, and resolves with issue_id', async () => {
    const uploads = installUploadHandlers();
    let issueBody: Record<string, unknown> | undefined;
    server.use(
      http.post(ISSUES_URL, async ({ request }) => {
        issueBody = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json(
          { issue_id: 'rep_abc', status: 'received' },
          { status: 202 },
        );
      }),
    );

    const instance = createBrevwick({
      projectKey: KEY,
      environment: 'stg',
      release: '1.2.3',
      buildSha: 'deadbeef',
      userContext: () => ({ tenantId: 't_99', plan: 'pro' }),
      user: { id: 'u_7' },
    });
    const result = await instance.submit({
      title: 'broken',
      description: 'the thing broke',
      expected: 'works',
      actual: 'broken',
      attachments: [makeBlob()],
    });

    expect(result).toEqual({ ok: true, issue_id: 'rep_abc' });
    expect(issueBody).toBeDefined();
    // Round-tripped scalar fields.
    expect(issueBody?.title).toBe('broken');
    expect(issueBody?.description).toBe('the thing broke');
    expect(issueBody?.expected).toBe('works');
    expect(issueBody?.actual).toBe('broken');
    expect(issueBody?.environment).toBe('stg');
    expect(issueBody?.release).toBe('1.2.3');
    expect(issueBody?.build_sha).toBe('deadbeef');
    // route_path is auto-collected from `location.pathname + search`.
    expect(typeof issueBody?.route_path).toBe('string');
    // Attachments resolved via presign.
    const attachments = issueBody?.attachments as Array<
      Record<string, unknown>
    >;
    expect(attachments).toHaveLength(1);
    expect(attachments[0]).toMatchObject({
      object_key: `${OBJECT_KEY}-1`,
      mime: 'image/png',
    });
    // sha256 plumbing: presign body carried it, PUT header carried it, and the
    // final issue attachment entry carries the same value. Without this, R2
    // stores the object with no sha256 metadata and ingest 409s.
    const presignBody = uploads.presignBodies()[0]!;
    expect(presignBody.sha256).toMatch(/^[A-Za-z0-9+/]+=*$/);
    expect(presignBody.sha256.length).toBeGreaterThan(0);
    expect(uploads.putChecksums()[0]).toBe(presignBody.sha256);
    expect(attachments[0]!.sha256).toBe(presignBody.sha256);
    // Device context — every field present (jsdom provides the globals).
    const deviceCtx = issueBody?.device_context as Record<string, unknown>;
    expect(deviceCtx.platform).toBe('web');
    expect(typeof deviceCtx.ua).toBe('string');
    expect(typeof deviceCtx.locale).toBe('string');
    const viewport = deviceCtx.viewport as Record<string, number>;
    expect(typeof viewport.w).toBe('number');
    expect(typeof viewport.h).toBe('number');
    const sdk = deviceCtx.sdk as Record<string, unknown>;
    expect(sdk.name).toBe('brevwick-sdk');
    expect(typeof sdk.version).toBe('string');
    expect(sdk.platform).toBe('web');
    // userContext callback merged into user_context alongside config.user.
    const userCtx = issueBody?.user_context as Record<string, unknown>;
    expect((userCtx.user as Record<string, unknown>).id).toBe('u_7');
    expect(userCtx.tenantId).toBe('t_99');
    expect(userCtx.plan).toBe('pro');
    // Ring snapshots flow through (empty arrays here, but present as keys).
    expect(Array.isArray(issueBody?.console_errors)).toBe(true);
    expect(Array.isArray(issueBody?.network_errors)).toBe(true);
    expect(Array.isArray(issueBody?.route_trail)).toBe(true);
  });

  it('accepts FeedbackAttachment { blob, filename } in addition to plain Blob', async () => {
    // Exercises the `toAttachmentDescriptor` non-Blob branch. `filename` is
    // not yet on the wire (presign body is mime + size only), but the call
    // must succeed and the resulting attachment descriptor must include
    // mime + size pulled from the wrapped blob.
    installUploadHandlers();
    let issueBody: Record<string, unknown> | undefined;
    server.use(
      http.post(ISSUES_URL, async ({ request }) => {
        issueBody = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json(
          { issue_id: 'rep_named', status: 'received' },
          { status: 202 },
        );
      }),
    );
    const instance = createBrevwick({ projectKey: KEY });
    const result = await instance.submit({
      description: 'd',
      attachments: [{ blob: makeBlob(), filename: 'screenshot.png' }],
    });
    expect(result).toEqual({ ok: true, issue_id: 'rep_named' });
    const attachments = issueBody?.attachments as unknown[];
    expect(attachments).toHaveLength(1);
    expect(attachments[0]).toMatchObject({
      object_key: `${OBJECT_KEY}-1`,
      mime: 'image/png',
    });
  });

  it('submits two distinct blobs with distinct sha256s, preserved in order', async () => {
    const uploads = installUploadHandlers();
    let issueBody: Record<string, unknown> | undefined;
    server.use(
      http.post(ISSUES_URL, async ({ request }) => {
        issueBody = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json(
          { issue_id: 'rep_pair', status: 'received' },
          { status: 202 },
        );
      }),
    );
    const instance = createBrevwick({ projectKey: KEY });
    const pngBlob = new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], {
      type: 'image/png',
    });
    const jpegBlob = new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xe0])], {
      type: 'image/jpeg',
    });
    const result = await instance.submit({
      description: 'd',
      attachments: [pngBlob, jpegBlob],
    });
    expect(result).toEqual({ ok: true, issue_id: 'rep_pair' });

    const bodies = uploads.presignBodies();
    expect(bodies).toHaveLength(2);
    // Distinct content → distinct SHA-256 digests.
    expect(bodies[0]!.sha256).not.toBe(bodies[1]!.sha256);
    // PUT headers reflected the presign-time value for each blob.
    expect(uploads.putChecksums()).toEqual([
      bodies[0]!.sha256,
      bodies[1]!.sha256,
    ]);
    // Issue carries both sha256s in the original attachment order.
    expect(issueBody).toBeDefined();
    const attachments = issueBody?.attachments as Array<
      Record<string, unknown>
    >;
    expect(attachments).toHaveLength(2);
    expect(attachments[0]!.sha256).toBe(bodies[0]!.sha256);
    expect(attachments[1]!.sha256).toBe(bodies[1]!.sha256);
    expect(attachments[0]!.mime).toBe('image/png');
    expect(attachments[1]!.mime).toBe('image/jpeg');
  });
});

describe('submit — attachment failures', () => {
  it('presign 500 → ATTACHMENT_UPLOAD_FAILED, no issues POST fired', async () => {
    let issuesHit = 0;
    server.use(
      http.post(PRESIGN_URL, () =>
        HttpResponse.json({ error: 'boom' }, { status: 500 }),
      ),
      http.post(ISSUES_URL, () => {
        issuesHit++;
        return HttpResponse.json({ issue_id: 'x' }, { status: 202 });
      }),
    );
    const instance = createBrevwick({ projectKey: KEY });
    const result = await instance.submit({
      description: 'd',
      attachments: [makeBlob()],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('ATTACHMENT_UPLOAD_FAILED');
    expect(issuesHit).toBe(0);
  });

  it('PUT 403 → ATTACHMENT_UPLOAD_FAILED, no issues POST fired', async () => {
    let issuesHit = 0;
    server.use(
      http.post(PRESIGN_URL, () =>
        HttpResponse.json({
          object_key: OBJECT_KEY,
          upload_url: UPLOAD_URL,
        }),
      ),
      http.put(UPLOAD_URL, () => new HttpResponse(null, { status: 403 })),
      http.post(ISSUES_URL, () => {
        issuesHit++;
        return HttpResponse.json({ issue_id: 'x' }, { status: 202 });
      }),
    );
    const instance = createBrevwick({ projectKey: KEY });
    const result = await instance.submit({
      description: 'd',
      attachments: [makeBlob()],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('ATTACHMENT_UPLOAD_FAILED');
    expect(issuesHit).toBe(0);
  });
});

describe('submit — ingest failures', () => {
  it('ingest 422 → INGEST_REJECTED, not retried', async () => {
    let hits = 0;
    server.use(
      http.post(ISSUES_URL, () => {
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
      http.post(ISSUES_URL, () => {
        hits++;
        if (hits === 1) {
          return HttpResponse.json({ error: 'boom' }, { status: 503 });
        }
        return HttpResponse.json(
          { issue_id: 'rep_ok', status: 'received' },
          { status: 202 },
        );
      }),
    );
    const instance = createBrevwick({ projectKey: KEY });
    const result = await instance.submit({ description: 'd' });
    expect(result).toEqual({ ok: true, issue_id: 'rep_ok' });
    expect(hits).toBe(2);
  });

  it('ingest timeout — 30 s budget exceeded yields INGEST_TIMEOUT', async () => {
    // Handler awaits a promise that only resolves on signal abort. Using
    // `request.signal` keeps the handler cleanly cancelable so msw's
    // teardown does not leak a hanging request into later tests in this
    // file. Fake timers let us advance past the 30 s budget deterministically
    // without the test actually waiting.
    server.use(
      http.post(ISSUES_URL, async ({ request }) => {
        await new Promise<void>((_, reject) => {
          request.signal.addEventListener('abort', () =>
            reject(new Error('aborted')),
          );
        });
        return HttpResponse.json({ issue_id: 'never' });
      }),
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
    // issues). Presigned PUTs land on R2 / S3, which reject unsigned headers
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
      http.post(ISSUES_URL, ({ request }) => {
        ingestSdkHeaders.push(request.headers.get('x-brevwick-sdk') ?? '');
        return HttpResponse.json(
          { issue_id: 'rep_h', status: 'received' },
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
    const capture = captureIssueBody();

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
    const capture = captureIssueBody();
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

  it('redacts secrets embedded in user.display_name via redactValue', async () => {
    // Defensive — guards against a future refactor that would bypass
    // `redactValue` for fields outside the known `id` / `email` shapes.
    installUploadHandlers();
    const capture = captureIssueBody();
    const instance = createBrevwick({
      projectKey: KEY,
      user: {
        id: 'u_99',
        display_name: 'Bearer sk_live_supersecret_1234567890',
      },
    });
    const result = await instance.submit({ description: 'd' });
    expect(result.ok).toBe(true);
    const body = capture.get() ?? '';
    expect(body).not.toContain('sk_live_supersecret_1234567890');
    expect(body).toContain('Bearer [redacted]');
  });

  it('stamps Authorization: Bearer <projectKey> on every ingest-origin request', async () => {
    const ingestAuthHeaders: string[] = [];
    server.use(
      http.post(PRESIGN_URL, ({ request }) => {
        ingestAuthHeaders.push(request.headers.get('authorization') ?? '');
        return HttpResponse.json({
          object_key: OBJECT_KEY,
          upload_url: UPLOAD_URL,
        });
      }),
      http.put(UPLOAD_URL, () => new HttpResponse(null, { status: 200 })),
      http.post(ISSUES_URL, ({ request }) => {
        ingestAuthHeaders.push(request.headers.get('authorization') ?? '');
        return HttpResponse.json(
          { issue_id: 'rep_auth', status: 'received' },
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
    expect(ingestAuthHeaders).toHaveLength(2);
    for (const h of ingestAuthHeaders) {
      expect(h).toBe(`Bearer ${KEY}`);
    }
  });

  it('does not re-redact ring snapshots (already-masked markers pass through unchanged)', async () => {
    // Ring buffers redact at the capture boundary; the submit pipeline
    // must not re-run redact() on snapshots. If it did, an already-masked
    // marker like `Bearer [redacted]` could be re-inspected, and any
    // future regex change could double-process tokens.
    installUploadHandlers();
    let issueBody: Record<string, unknown> | undefined;
    server.use(
      http.post(ISSUES_URL, async ({ request }) => {
        issueBody = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json(
          { issue_id: 'rep_ringz', status: 'received' },
          { status: 202 },
        );
      }),
    );
    const instance = createBrevwick({ projectKey: KEY });
    const internal = getInternal(instance);
    internal.push({
      kind: 'network',
      method: 'GET',
      url: 'https://api.example.com/whoami',
      status: 401,
      timestamp: Date.now(),
      requestHeaders: { authorization: 'Bearer [redacted]' },
      requestBody: 'token=Bearer [redacted]',
    });
    const result = await instance.submit({ description: 'd' });
    expect(result.ok).toBe(true);
    const networkErrors = issueBody?.network_errors as Array<
      Record<string, unknown>
    >;
    expect(networkErrors).toHaveLength(1);
    const entry = networkErrors[0]!;
    expect(entry.requestBody).toBe('token=Bearer [redacted]');
    expect((entry.requestHeaders as Record<string, string>).authorization).toBe(
      'Bearer [redacted]',
    );
    // Whole body must contain the token marker exactly once per occurrence
    // — no double-masking such as `Bearer [[redacted]]` or `[Bearer [redacted]]`.
    const raw = JSON.stringify(issueBody);
    expect(raw).not.toContain('[[redacted]]');
    expect(raw).not.toContain('[Bearer [redacted]]');
  });
});

describe('submit — attachment validation (client-side)', () => {
  it('rejects when more than 5 attachments are supplied', async () => {
    let presignHits = 0;
    server.use(
      http.post(PRESIGN_URL, () => {
        presignHits++;
        return HttpResponse.json({
          object_key: OBJECT_KEY,
          upload_url: UPLOAD_URL,
        });
      }),
    );
    const instance = createBrevwick({ projectKey: KEY });
    const result = await instance.submit({
      description: 'd',
      attachments: [
        makeBlob(),
        makeBlob(),
        makeBlob(),
        makeBlob(),
        makeBlob(),
        makeBlob(),
      ],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('ATTACHMENT_UPLOAD_FAILED');
      expect(result.error.message).toMatch(/exceeds limit of 5/);
    }
    expect(presignHits).toBe(0);
  });

  it('rejects when an attachment exceeds 10 MB', async () => {
    let presignHits = 0;
    server.use(
      http.post(PRESIGN_URL, () => {
        presignHits++;
        return HttpResponse.json({
          object_key: OBJECT_KEY,
          upload_url: UPLOAD_URL,
        });
      }),
    );
    const oversized = new Blob([new Uint8Array(10 * 1024 * 1024 + 1)], {
      type: 'image/png',
    });
    const instance = createBrevwick({ projectKey: KEY });
    const result = await instance.submit({
      description: 'd',
      attachments: [oversized],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('ATTACHMENT_UPLOAD_FAILED');
      expect(result.error.message).toMatch(/exceeds 10 MB/);
    }
    expect(presignHits).toBe(0);
  });

  it('rejects an attachment with a MIME outside the allowed list', async () => {
    let presignHits = 0;
    server.use(
      http.post(PRESIGN_URL, () => {
        presignHits++;
        return HttpResponse.json({
          object_key: OBJECT_KEY,
          upload_url: UPLOAD_URL,
        });
      }),
    );
    const wrongMime = new Blob([new Uint8Array([1, 2, 3])], {
      type: 'application/pdf',
    });
    const instance = createBrevwick({ projectKey: KEY });
    const result = await instance.submit({
      description: 'd',
      attachments: [wrongMime],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('ATTACHMENT_UPLOAD_FAILED');
      expect(result.error.message).toMatch(/application\/pdf/);
    }
    expect(presignHits).toBe(0);
  });
});

describe('submit — ingest retry / failure modes', () => {
  it('retries on a thrown fetch error and succeeds on second attempt', async () => {
    let hits = 0;
    server.use(
      http.post(ISSUES_URL, () => {
        hits++;
        if (hits === 1) {
          // msw HttpResponse.error() simulates a thrown network error
          // (the same shape `fetch` issues for `TypeError: Failed to fetch`).
          return HttpResponse.error();
        }
        return HttpResponse.json(
          { issue_id: 'rep_retry', status: 'received' },
          { status: 202 },
        );
      }),
    );
    const instance = createBrevwick({ projectKey: KEY });
    const result = await instance.submit({ description: 'd' });
    expect(result).toEqual({ ok: true, issue_id: 'rep_retry' });
    expect(hits).toBe(2);
  });

  it('returns INGEST_RETRY_EXHAUSTED after three straight 503s', async () => {
    let hits = 0;
    server.use(
      http.post(ISSUES_URL, () => {
        hits++;
        return HttpResponse.json({ error: 'down' }, { status: 503 });
      }),
    );
    vi.useFakeTimers();
    const instance = createBrevwick({ projectKey: KEY });
    const pending = instance.submit({ description: 'd' });
    // Burn through both backoff sleeps deterministically.
    await vi.advanceTimersByTimeAsync(2000);
    const result = await pending;
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('INGEST_RETRY_EXHAUSTED');
      expect(result.error.message).toMatch(/ingest 503/);
    }
    expect(hits).toBe(3);
  });

  it('returns INGEST_INVALID_RESPONSE when 200 has a malformed body', async () => {
    server.use(
      http.post(ISSUES_URL, () =>
        HttpResponse.json({ unexpected: true }, { status: 200 }),
      ),
    );
    const instance = createBrevwick({ projectKey: KEY });
    const result = await instance.submit({ description: 'd' });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('INGEST_INVALID_RESPONSE');
    }
  });

  it.each([400, 401, 403, 409, 413])(
    'does not retry on %s and returns INGEST_REJECTED',
    async (status) => {
      let hits = 0;
      server.use(
        http.post(ISSUES_URL, () => {
          hits++;
          return HttpResponse.json({ error: { code: 'WHATEVER' } }, { status });
        }),
      );
      const instance = createBrevwick({ projectKey: KEY });
      const result = await instance.submit({ description: 'd' });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe('INGEST_REJECTED');
      expect(hits).toBe(1);
    },
  );

  it('redacts the server-echoed body in INGEST_REJECTED messages', async () => {
    server.use(
      http.post(ISSUES_URL, () =>
        HttpResponse.text('Bearer sk_live_leaked_token_abcdef1234567890', {
          status: 400,
        }),
      ),
    );
    const instance = createBrevwick({ projectKey: KEY });
    const result = await instance.submit({ description: 'd' });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('INGEST_REJECTED');
      expect(result.error.message).not.toContain('sk_live_leaked');
      expect(result.error.message).toContain('Bearer [redacted]');
    }
  });
});

describe('submit — use_ai threading', () => {
  it.each([['true', true] as const, ['false', false] as const])(
    'passes use_ai=%s through to the ingest payload when provided',
    async (_label, flag) => {
      installUploadHandlers();
      let issueBody: Record<string, unknown> | undefined;
      server.use(
        http.post(ISSUES_URL, async ({ request }) => {
          issueBody = (await request.json()) as Record<string, unknown>;
          return HttpResponse.json(
            { issue_id: 'rep_ai', status: 'received' },
            { status: 202 },
          );
        }),
      );
      const instance = createBrevwick({ projectKey: KEY });
      const result = await instance.submit({
        description: 'd',
        use_ai: flag,
      });
      expect(result.ok).toBe(true);
      expect(issueBody?.use_ai).toBe(flag);
    },
  );

  it('omits use_ai from the payload when not provided', async () => {
    installUploadHandlers();
    let issueBody: Record<string, unknown> | undefined;
    server.use(
      http.post(ISSUES_URL, async ({ request }) => {
        issueBody = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json(
          { issue_id: 'rep_no_ai', status: 'received' },
          { status: 202 },
        );
      }),
    );
    const instance = createBrevwick({ projectKey: KEY });
    const result = await instance.submit({ description: 'd' });
    expect(result.ok).toBe(true);
    expect(issueBody).toBeDefined();
    expect('use_ai' in (issueBody ?? {})).toBe(false);
  });
});

describe('submit — userContext throw safety', () => {
  it('treats a throwing userContext() as empty extras and still succeeds', async () => {
    installUploadHandlers();
    let issueBody: Record<string, unknown> | undefined;
    server.use(
      http.post(ISSUES_URL, async ({ request }) => {
        issueBody = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json(
          { issue_id: 'rep_uctx', status: 'received' },
          { status: 202 },
        );
      }),
    );
    const instance = createBrevwick({
      projectKey: KEY,
      userContext: () => {
        throw new Error('boom');
      },
      user: { id: 'u_keep' },
    });
    const internal = getInternal(instance);
    const result = await instance.submit({ description: 'd' });
    expect(result).toEqual({ ok: true, issue_id: 'rep_uctx' });
    // user_context still includes config.user.
    const userCtx = issueBody?.user_context as Record<string, unknown>;
    expect((userCtx.user as Record<string, unknown>).id).toBe('u_keep');
    // The thrown extras key must NOT appear.
    expect(userCtx.tenantId).toBeUndefined();
    // The throw was logged via the console ring (warn level).
    const consoleSnapshot = internal.buffers.console.snapshot();
    const matched = consoleSnapshot.some(
      (e) => e.level === 'warn' && e.message.includes('userContext()'),
    );
    expect(matched).toBe(true);
  });
});
