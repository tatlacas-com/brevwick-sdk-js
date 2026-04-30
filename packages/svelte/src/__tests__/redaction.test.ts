import { render, act } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { BrevwickConfig } from '@tatlacas/brevwick-sdk';

import ProviderConsumer from './fixtures/ProviderConsumer.svelte';
import type { FeedbackHandle } from '../lib/context';

/**
 * Adapter contract: every payload submitted via the Svelte handle must run
 * through the core SDK's redact pipeline before leaving the device. We use
 * the REAL `createBrevwick` (no `vi.mock('@tatlacas/brevwick-sdk')`) and
 * stub `global.fetch` to capture the wire body. Submitting a description
 * containing a JWT-shaped string and an Authorization header asserts the
 * adapter does not bypass the SDK's redaction.
 */

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('redaction — every payload passes through SDK redact()', () => {
  it('strips JWTs, Bearer tokens, and emails from the wire payload', async () => {
    const captured: { body?: string } = {};
    const fetchSpy = vi.fn(
      async (url: string | URL | Request, init?: RequestInit) => {
        const u = typeof url === 'string' ? url : url.toString();
        if (u.endsWith('/v1/ingest/issues')) {
          captured.body =
            typeof init?.body === 'string'
              ? init.body
              : await new Response(init?.body).text();
          return new Response(
            JSON.stringify({ issue_id: 'i_red_1', status: 'received' }),
            {
              status: 202,
              headers: { 'Content-Type': 'application/json' },
            },
          );
        }
        // Default 404 forces a clear failure if any unexpected URL is hit.
        return new Response('not found', { status: 404 });
      },
    );
    vi.stubGlobal('fetch', fetchSpy);

    let handle!: FeedbackHandle;
    render(ProviderConsumer, {
      props: {
        config: {
          projectKey: 'pk_test_redact1234567890ab',
          endpoint: 'https://api.brevwick.com',
          environment: 'stg',
        } satisfies BrevwickConfig,
        onHandle: (h: FeedbackHandle) => {
          handle = h;
        },
      },
    });

    const jwt =
      'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1c2VyIn0.s5Z2TL6cZcK2XbdyN1qf2x6KU6PnBbCq8nQbPnKXeNg';
    const email = 'leak.me@example.com';

    // Place each secret on its own line so the SDK's `Authorization:[^\n]+`
    // header pattern does not greedily swallow the JWT / email tokens before
    // their dedicated patterns fire.
    await act(async () => {
      const result = await handle.submit({
        description: `bug repro:\nsession token ${jwt}\ncontact: ${email}\nheader Authorization: Bearer abc.def`,
      });
      expect(result.ok).toBe(true);
    });

    expect(captured.body).toBeDefined();
    const body = captured.body!;

    // Original secrets must not appear on the wire.
    expect(body).not.toContain(jwt);
    expect(body).not.toContain(email);

    // Redaction markers from packages/sdk/src/core/internal/redact.ts.
    expect(body).toContain('[jwt]');
    expect(body).toContain('[email]');
    expect(body).toMatch(/Authorization: \[redacted\]/);
  });
});
