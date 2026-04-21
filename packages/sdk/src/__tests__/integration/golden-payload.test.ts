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
 * Stable subset of the payload — keeps the keys a contract reader would
 * expect to remain identical across runs, drops the ones that vary by
 * environment or invocation timing.
 */
function freezeShape(body: Record<string, unknown>): Record<string, unknown> {
  const deviceCtx = body.device_context as Record<string, unknown>;
  const sdk = deviceCtx.sdk as Record<string, unknown>;
  const attachments = (body.attachments as Array<Record<string, unknown>>).map(
    (a) => ({ object_key: a.object_key, mime: a.mime }),
  );
  return {
    title: body.title,
    description: body.description,
    expected: body.expected,
    actual: body.actual,
    build_sha: body.build_sha,
    release: body.release,
    environment: body.environment,
    user_context: body.user_context,
    device_context: {
      platform: deviceCtx.platform,
      sdk: { name: sdk.name, platform: sdk.platform },
    },
    console_errors: body.console_errors,
    network_errors: body.network_errors,
    route_trail: body.route_trail,
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
