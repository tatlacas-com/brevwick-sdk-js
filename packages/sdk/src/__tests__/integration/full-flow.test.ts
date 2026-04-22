/**
 * End-to-end flow: install rings → capture a console error and a failed
 * fetch via the live ring patches → submit → assert the captured POST body
 * carries both ring entries plus the presigned attachment.
 *
 * Distinct from `../submit.test.ts`: those tests inject ring entries
 * directly via `internal.push(...)` to keep the unit-level scope tight.
 * This file proves the rings-as-installed actually feed the submit pipeline,
 * which is the property that breaks first when a refactor moves the ring
 * boundary or the buffer wiring.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { http, HttpResponse } from 'msw';
import { createBrevwick } from '../../core/client';
import { INTERNAL_KEY, type BrevwickInternal } from '../../core/internal';
import { __resetBrevwickRegistry, __setRingsForTesting } from '../../testing';
import {
  createIntegrationServer,
  ENDPOINT,
  installIngestHandlers,
  ISSUES_URL,
  KEY,
  OBJECT_KEY_PREFIX,
} from './setup';

const server = createIntegrationServer();

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  server.resetHandlers();
  __resetBrevwickRegistry();
  __setRingsForTesting();
});
afterAll(() => server.close());

function makePngBlob(): Blob {
  return new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], {
    type: 'image/png',
  });
}

describe('integration — install → ring capture → submit', () => {
  it('threads a console error and a 500 fetch into the submitted payload', async () => {
    // Inline so the test is self-contained: a single `it` does not earn a
    // `beforeEach` indirection. If a second flow lands here later that also
    // needs the failing user-origin handler, lift this back up.
    const USER_API = 'https://api.example.com/some/failing/endpoint';
    server.use(
      http.get(USER_API, () =>
        HttpResponse.json({ error: 'kaboom' }, { status: 500 }),
      ),
    );

    const captured = installIngestHandlers(server, () => 'issue_full_flow');

    const instance = createBrevwick({
      projectKey: KEY,
      endpoint: ENDPOINT,
      environment: 'stg',
      release: '0.1.0-beta.1',
    });
    instance.install();
    // The default ring loaders dynamically import console + network — wait
    // for both to mount before driving the patched globals, otherwise the
    // synthetic console.error fires against the un-patched original.
    const internal = (
      instance as unknown as Record<typeof INTERNAL_KEY, BrevwickInternal>
    )[INTERNAL_KEY];
    await internal.ready();

    // Synthetic console error — the patched console.error pushes a redacted
    // entry into the console ring buffer.
    console.error('integration: synthetic console error fired');

    // Failing fetch against a user origin (NOT the SDK ingest origin, which
    // the network ring's loop guard would skip). The 500 response must land
    // in `network_errors` on the captured payload.
    const userRes = await fetch(USER_API);
    expect(userRes.status).toBe(500);

    // Pre-submit ring-install assertion. If a future regression breaks the
    // network ring's installation order, the captured POST below will show
    // `network_errors: []` and the existing `toHaveLength(1)` assertion
    // will report against `submit()` rather than the real failure site.
    // Asserting the snapshot length here points the next failure message
    // squarely at the ring-install boundary.
    expect(internal.buffers.network.snapshot()).toHaveLength(1);

    const result = await instance.submit({
      title: 'integration smoke',
      description: 'see attached evidence',
      attachments: [makePngBlob()],
    });

    expect(result).toEqual({ ok: true, issue_id: 'issue_full_flow' });
    expect(captured.count()).toBe(1);

    const body = captured.json();
    expect(body).toBeDefined();

    const consoleErrors = body?.console_errors as Array<
      Record<string, unknown>
    >;
    expect(consoleErrors).toHaveLength(1);
    expect(consoleErrors[0]).toMatchObject({
      kind: 'console',
      level: 'error',
    });
    expect(consoleErrors[0]?.message).toMatch(
      /integration: synthetic console error fired/,
    );

    const networkErrors = body?.network_errors as Array<
      Record<string, unknown>
    >;
    expect(networkErrors).toHaveLength(1);
    expect(networkErrors[0]).toMatchObject({
      kind: 'network',
      method: 'GET',
      url: USER_API,
      status: 500,
    });

    const attachments = body?.attachments as Array<Record<string, unknown>>;
    expect(attachments).toHaveLength(1);
    // The presign handler returns a deterministic key per call; the issue
    // payload must echo the same key so ingest can link the R2 object.
    expect(attachments[0]?.object_key).toBe(`${OBJECT_KEY_PREFIX}-1`);
    expect(attachments[0]?.mime).toBe('image/png');

    instance.uninstall();
  });

  it('exhausts retries on persistent 503 and returns INGEST_RETRY_EXHAUSTED', async () => {
    // Failure-mode coverage at the integration layer. The unit suite in
    // `../submit.test.ts` drives this same path with a stub fetch; running
    // it through the real ring-installed pipeline + MSW catches a class of
    // regressions where the retry plumbing breaks ONLY when the rings are
    // mounted (e.g., a future fetch-patching ring inadvertently swallows
    // the 5xx as a thrown error and bypasses the backoff loop).
    const captured = installIngestHandlers(server, () => 'should_not_resolve');
    // Override the issues handler to return 503 unconditionally — the
    // pipeline must hit one initial attempt + two backoffs and then
    // surface INGEST_RETRY_EXHAUSTED.
    server.use(
      http.post(ISSUES_URL, () =>
        HttpResponse.json({ error: 'overloaded' }, { status: 503 }),
      ),
    );

    const instance = createBrevwick({
      projectKey: KEY,
      endpoint: ENDPOINT,
      environment: 'stg',
    });
    instance.install();
    const internal = (
      instance as unknown as Record<typeof INTERNAL_KEY, BrevwickInternal>
    )[INTERNAL_KEY];
    await internal.ready();

    const result = await instance.submit({ description: 'kaboom retry' });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unreachable');
    expect(result.error.code).toBe('INGEST_RETRY_EXHAUSTED');
    // The capture handler is overridden by the 503 handler above, so
    // `captured.count()` stays at 0 — the body capture only ran on a
    // 202. The retry exhaustion is the property under test here.
    expect(captured.count()).toBe(0);

    instance.uninstall();
  }, 10_000);
});
