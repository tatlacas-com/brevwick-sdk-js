/**
 * Parameterised redaction guard. For every secret class we want to scrub
 * before bytes leave the device, this matrix asserts:
 *
 * 1. The raw input never appears in the captured POST body.
 * 2. The expected masked marker (`[redacted]`, `[email]`, `[jwt]`,
 *    `[blob]`, `Bearer [redacted]`, `Authorization: [redacted]`) does.
 *
 * The `aaa.bbb.ccc` "JWT triplet" case from issue #10 is intentionally
 * absent: the redact pattern in `core/internal/redact.ts` requires the
 * `eyJ` base64-prefix that every real JWT carries. Matching `a.b.c`
 * without that prefix would chew through hostnames and IP literals,
 * producing far more false positives than legitimate matches. The
 * matrix below uses a realistic JWT and treats the prefix requirement
 * as the contract.
 *
 * Mirrors the redaction golden in `../submit.test.ts` but breaks each
 * class into its own case so a regression in any single regex shows up
 * as an isolated failure rather than a single combined assertion.
 */
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

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  server.resetHandlers();
  __resetBrevwickRegistry();
  __setRingsForTesting();
});
afterAll(() => server.close());

interface MatrixCase {
  /** Human label surfaced in the test name. */
  label: string;
  /** Raw secret to inject into `description`. */
  raw: string;
  /** Substring expected to appear in the redacted body. */
  marker: string;
}

const CASES: readonly MatrixCase[] = [
  {
    label: 'Authorization header',
    raw: 'Authorization: Bearer sk_live_authheader_secretXXXXXXXXXXX',
    marker: 'Authorization: [redacted]',
  },
  {
    label: 'raw bearer token',
    raw: 'token=Bearer sk_live_rawbearer_secretYYYYYYYYY',
    marker: 'Bearer [redacted]',
  },
  {
    label: 'realistic JWT (header.payload.signature with eyJ prefix)',
    raw: 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTYifQ.realistic_jwt_signature_segment_chars',
    marker: '[jwt]',
  },
  {
    label: 'email address',
    raw: 'tatlacas+admin@example.com',
    marker: '[email]',
  },
  {
    label: 'long base64 blob (>= 200 chars)',
    raw: 'A'.repeat(250),
    marker: '[blob]',
  },
];

describe('integration — redaction matrix', () => {
  it.each(CASES)('redacts %s', async ({ label, raw, marker }) => {
    const captured = installIngestHandlers(
      server,
      () => `issue_redact_${label}`,
    );
    const instance = createBrevwick({ projectKey: KEY, endpoint: ENDPOINT });
    const result = await instance.submit({
      description: `prefix ${raw} suffix`,
    });
    expect(result.ok).toBe(true);
    const body = captured.body() ?? '';
    expect(body).toContain(marker);
    expect(body).not.toContain(raw);
  });

  it('does not over-redact short triplets that lack the eyJ JWT prefix', async () => {
    // Defensive complement to the JWT case above: `a.b.c` is a very common
    // shape (hostnames, IPs, version specifiers) that must NOT be scrubbed.
    // If a future regex broadens past the `eyJ` prefix it will trip here.
    const captured = installIngestHandlers(server);
    const instance = createBrevwick({ projectKey: KEY, endpoint: ENDPOINT });
    const result = await instance.submit({
      description: 'service host: cache.shard.internal — version v1.2.3',
    });
    expect(result.ok).toBe(true);
    const body = captured.body() ?? '';
    expect(body).toContain('cache.shard.internal');
    expect(body).toContain('v1.2.3');
    expect(body).not.toContain('[jwt]');
  });
});
