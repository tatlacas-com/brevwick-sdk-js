/**
 * Golden-shape assertion for the composed ingest payload.
 *
 * Pinning the deterministic subset of the payload guarantees that any
 * structural drift (renamed key, dropped field, reordered nesting) shows
 * up here before it lands as an SDD § 7 contract violation. Volatile
 * fields (timestamps, generated IDs, environment-derived values like
 * `route_path`, `device_context.ua`, viewport) are stripped before the
 * deep-equal so the test stays portable across CI environments.
 *
 * Mirrors the wire shape captured at submit-time in
 * `packages/sdk/src/submit.ts::composePayload`.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { createBrevwick } from '../../core/client';
import { __resetBrevwickRegistry, __setRingsForTesting } from '../../testing';
import {
  createIntegrationServer,
  ENDPOINT,
  installIngestHandlers,
  KEY,
} from './setup';

const server = createIntegrationServer();

const GOLDEN = JSON.parse(
  readFileSync(
    resolve(__dirname, '__fixtures__/composed-payload.json'),
    'utf8',
  ),
) as Record<string, unknown>;

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  server.resetHandlers();
  __resetBrevwickRegistry();
  __setRingsForTesting();
});
afterAll(() => server.close());

/**
 * Strip the volatile keys so the deep-equal stays stable across CI
 * environments. Inverted projection (strip volatile, retain everything
 * else) so a future top-level field on the wire fails the assertion
 * loudly instead of being silently dropped — the golden's whole job
 * is to catch unannounced shape drift, and an allow-list projection
 * defeats that.
 *
 * Volatile keys stripped:
 * - top-level `route_path` — happy-dom default `'/'` here, real path in prod.
 * - top-level `ts` / `issue_id` — not currently emitted by composePayload but
 *   stripped defensively in case future versions add them; matches the
 *   `freezeShape` contract documented in the file header.
 * - `device_context.ua` / `locale` / `viewport` — host environment dependent.
 * - `device_context.sdk.version` — bumps every release.
 * - `attachments[*].sha256` / `size_bytes` — derived from the test blob
 *   bytes; the SHA collisions across CI hosts would be a coincidence, and
 *   the size digit count varies with PNG header tweaks. `object_key` and
 *   `mime` are stable per the presign handler contract.
 */
function freezeShape(body: Record<string, unknown>): Record<string, unknown> {
  // Top-level volatile keys.
  const {
    route_path: _routePath,
    ts: _ts,
    issue_id: _issueId,
    device_context: deviceCtxRaw,
    attachments: attachmentsRaw,
    ...rest
  } = body as {
    route_path?: unknown;
    ts?: unknown;
    issue_id?: unknown;
    device_context: Record<string, unknown>;
    attachments: Array<Record<string, unknown>>;
    [key: string]: unknown;
  };
  void _routePath;
  void _ts;
  void _issueId;

  const {
    ua: _ua,
    locale: _locale,
    viewport: _viewport,
    sdk: sdkRaw,
    ...deviceCtxRest
  } = deviceCtxRaw as {
    ua?: unknown;
    locale?: unknown;
    viewport?: unknown;
    sdk: Record<string, unknown>;
    [key: string]: unknown;
  };
  void _ua;
  void _locale;
  void _viewport;

  const { version: _sdkVersion, ...sdkRest } = sdkRaw as {
    version?: unknown;
    [key: string]: unknown;
  };
  void _sdkVersion;

  const attachments = attachmentsRaw.map((a) => {
    const {
      sha256: _sha256,
      size_bytes: _sizeBytes,
      ...attRest
    } = a as {
      sha256?: unknown;
      size_bytes?: unknown;
      [key: string]: unknown;
    };
    void _sha256;
    void _sizeBytes;
    return attRest;
  });

  return {
    ...rest,
    device_context: { ...deviceCtxRest, sdk: sdkRest },
    attachments,
  };
}

describe('integration — golden payload shape', () => {
  it('matches the pinned wire shape after stripping volatile fields', async () => {
    const captured = installIngestHandlers(server, () => 'issue_golden');

    const instance = createBrevwick({
      projectKey: KEY,
      endpoint: ENDPOINT,
      environment: 'stg',
      release: '1.2.3',
      buildSha: 'deadbeef',
      user: { id: 'u_42' },
    });
    const result = await instance.submit({
      title: 'integration: golden',
      description: 'see attached',
      expected: 'fixed',
      actual: 'broken',
      attachments: [
        new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], {
          type: 'image/png',
        }),
      ],
    });
    expect(result).toEqual({ ok: true, issue_id: 'issue_golden' });

    const body = captured.json();
    expect(body).toBeDefined();
    expect(freezeShape(body!)).toEqual(GOLDEN);
  });
});
