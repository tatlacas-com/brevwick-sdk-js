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
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from 'vitest';
import { http, HttpResponse } from 'msw';
import { createBrevwick } from '../../core/client';
import { INTERNAL_KEY, type BrevwickInternal } from '../../core/internal';
import { __resetBrevwickRegistry, __setRingsForTesting } from '../../testing';
import {
  createIntegrationServer,
  ENDPOINT,
  installIngestHandlers,
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

const USER_API = 'https://api.example.com/some/failing/endpoint';

beforeEach(() => {
  // The integration flow exercises the network ring against a non-ingest
  // origin. Installing a 500 handler here keeps each test from repeating
  // the same boilerplate and guarantees `onUnhandledRequest: 'error'`
  // never fires for the user-origin call.
  server.use(
    http.get(USER_API, () =>
      HttpResponse.json({ error: 'kaboom' }, { status: 500 }),
    ),
  );
});

function makePngBlob(): Blob {
  return new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], {
    type: 'image/png',
  });
}

describe('integration — install → ring capture → submit', () => {
  it('threads a console error and a 500 fetch into the submitted payload', async () => {
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
});
