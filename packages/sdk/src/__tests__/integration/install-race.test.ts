/**
 * Reproduction for the install-time capture race: errors and failing fetches
 * that happen *between* `install()` returning and the ring async-loaders
 * resolving must still land in the submitted payload. Pre-fix, the default
 * console + network rings were dynamic-imported, so anything fired on the
 * synchronous turn after `install()` was invisible because the patches had
 * not yet been applied. The user-visible symptom: bug reports submitted via
 * the widget arrived at the dashboard with empty `console_errors` and
 * `network_calls`, even though the user clearly saw both in DevTools.
 *
 * The test deliberately does NOT call `await internal.ready()` — that's the
 * whole point. Production callers (`BrevwickProvider`, the FAB submit path)
 * never await it either, and the SDK contract has to hold without the
 * test-only handle.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { http, HttpResponse } from 'msw';
import { createBrevwick } from '../../core/client';
import type { Brevwick } from '../../types';
import { __resetBrevwickRegistry, __setRingsForTesting } from '../../testing';
import {
  createIntegrationServer,
  ENDPOINT,
  installIngestHandlers,
  KEY,
} from './setup';

const server = createIntegrationServer();

// Track the live instance per-test so `afterEach` can always uninstall it,
// even when an assertion in the test body throws. Without this, a failing
// assertion would skip the inline `uninstall()` and leave `globalThis.fetch`
// + `console.*` patched, leaking into every subsequent test in the run.
let activeInstance: Brevwick | null = null;

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  if (activeInstance) {
    try {
      activeInstance.uninstall();
    } catch {
      // Uninstall failure must not mask the original test failure.
    }
    activeInstance = null;
  }
  server.resetHandlers();
  __resetBrevwickRegistry();
  __setRingsForTesting();
});
afterAll(() => server.close());

describe('integration — install-time capture race', () => {
  it('captures console.error fired immediately after install() without awaiting ready()', async () => {
    const captured = installIngestHandlers(server, () => 'issue_race_console');

    activeInstance = createBrevwick({
      projectKey: KEY,
      endpoint: ENDPOINT,
      environment: 'stg',
    });
    activeInstance.install();

    // SYNCHRONOUS turn after install() — no `await internal.ready()`. This
    // is the production path (Provider's useEffect → install() → user code
    // continues running, errors fire, eventually submit happens).
    console.error('race: synthetic console error fired pre-ready');

    const result = await activeInstance.submit({ description: 'race repro' });
    expect(result).toEqual({ ok: true, issue_id: 'issue_race_console' });

    const body = captured.json();
    const consoleErrors = body?.console_errors as Array<
      Record<string, unknown>
    >;
    expect(consoleErrors).toHaveLength(1);
    expect(consoleErrors[0]).toMatchObject({
      kind: 'console',
      level: 'error',
    });
    expect(consoleErrors[0]?.message).toMatch(
      /race: synthetic console error fired pre-ready/,
    );
  });

  it('captures a failing fetch fired immediately after install() without awaiting ready()', async () => {
    const USER_API = 'https://api.example.com/race/failing/endpoint';
    server.use(
      http.get(USER_API, () =>
        HttpResponse.json({ error: 'kaboom' }, { status: 500 }),
      ),
    );
    const captured = installIngestHandlers(server, () => 'issue_race_network');

    activeInstance = createBrevwick({
      projectKey: KEY,
      endpoint: ENDPOINT,
      environment: 'stg',
    });
    activeInstance.install();

    // No `await internal.ready()`. The fetch patch must already be in place.
    const userRes = await fetch(USER_API);
    expect(userRes.status).toBe(500);

    const result = await activeInstance.submit({
      description: 'race repro net',
    });
    expect(result).toEqual({ ok: true, issue_id: 'issue_race_network' });

    const body = captured.json();
    const networkCalls = body?.network_calls as Array<Record<string, unknown>>;
    const failure = networkCalls.find((e) => e.url === USER_API);
    expect(failure).toMatchObject({
      kind: 'network',
      method: 'GET',
      url: USER_API,
      status: 500,
    });
  });
});
