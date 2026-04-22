/**
 * Parameterised redaction guard. For every secret class scrubbed before
 * bytes leave the device, this matrix asserts:
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
 * Coverage relationship to `../submit.test.ts:434-485`:
 *
 * - The combined "redaction golden fixture" case there asserts every
 *   regex-class secret in one go; this matrix breaks each class into
 *   its own `it.each` row so a single-regex regression shows up as a
 *   focused failure with the offending class in the test name.
 * - The `user.email` mask case (`a***@d***.tld`) is covered as a
 *   dedicated `it` below so the matrix mirrors the full per-class
 *   coverage of the submit golden, not a strict subset of it.
 * - The `9001015800087`-style SA-ID string in the submit test name is
 *   *not* a separate redaction class — there is no SA-ID regex in
 *   `core/internal/redact.ts`. The submit test happens to include the
 *   string in its combined input but never asserts it is masked; the
 *   string survives unscrubbed today. This matrix does not invent a
 *   SA-ID assertion the production code does not back up.
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
  it.each(CASES)('redacts $label', async ({ label, raw, marker }) => {
    const captured = installIngestHandlers(
      server,
      () => `issue_redact_${label}`,
    );
    const instance = createBrevwick({ projectKey: KEY, endpoint: ENDPOINT });
    const result = await instance.submit({
      description: `prefix ${raw} suffix`,
    });
    expect(result.ok, `redaction matrix: ${label}`).toBe(true);
    const body = captured.body() ?? '';
    expect(body, `redaction matrix: ${label} marker`).toContain(marker);
    expect(body, `redaction matrix: ${label} raw leak`).not.toContain(raw);
  });

  it('masks user.email to a***@d***.tld in user_context but keeps id verbatim', async () => {
    // Distinct from the regex-driven `[email]` substitution above: the
    // `user_context.user.email` field uses the dedicated `maskEmail`
    // helper in `submit.ts` so the dashboard can still group by domain
    // without leaking the local part. This case mirrors the submit-test
    // assertion at `../submit.test.ts:466-485` so the integration matrix
    // also catches a regression in that masking transform.
    const captured = installIngestHandlers(
      server,
      () => 'issue_redact_user_email',
    );
    const instance = createBrevwick({
      projectKey: KEY,
      endpoint: ENDPOINT,
      user: { id: 'u_42', email: 'alice@example.com' },
    });
    const result = await instance.submit({ description: 'd' });
    expect(result.ok).toBe(true);
    const body = captured.json();
    expect(body).toBeDefined();
    const userCtx = body?.user_context as Record<string, unknown>;
    const user = userCtx.user as Record<string, unknown>;
    expect(user.id).toBe('u_42');
    expect(user.email).toBe('a***@e***.com');
    // Sanity-check the raw never leaked into any other field.
    const raw = captured.body() ?? '';
    expect(raw).not.toContain('alice@example.com');
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
