/**
 * Phase-event ordering: the submit pipeline must emit
 * `capturing-done → sanitising-done → sent` on a happy-path issue POST,
 * AND the `sent` event must carry an accurate `aiEnabled` flag derived
 * from the cached `ProjectConfig`.
 *
 * The React adapter (and any future binding) animates a staged-status UI
 * against this signal sequence; a regression that reordered the emits or
 * dropped one would break that UX silently — the integration test guards
 * the contract end-to-end through the real ring-installed pipeline.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { http, HttpResponse } from 'msw';
import { createBrevwick } from '../../core/client';
import {
  INTERNAL_KEY,
  type BrevwickInternal,
  type PhaseEvent,
} from '../../core/internal';
import { __resetBrevwickRegistry, __setRingsForTesting } from '../../testing';
import {
  createIntegrationServer,
  ENDPOINT,
  installIngestHandlers,
  KEY,
} from './setup';

const server = createIntegrationServer();
const CONFIG_URL = `${ENDPOINT}/v1/ingest/config`;

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  server.resetHandlers();
  __resetBrevwickRegistry();
  __setRingsForTesting();
});
afterAll(() => server.close());

function getInternal(
  instance: ReturnType<typeof createBrevwick>,
): BrevwickInternal {
  return (instance as unknown as Record<typeof INTERNAL_KEY, BrevwickInternal>)[
    INTERNAL_KEY
  ];
}

describe('integration — submit-pipeline phase events', () => {
  it('emits capturing-done → sanitising-done → sent in order on a happy-path submit', async () => {
    installIngestHandlers(server, () => 'phase_issue_1');
    server.use(
      http.get(CONFIG_URL, () =>
        HttpResponse.json({
          ai_enabled: true,
          ai_submitter_choice_allowed: false,
        }),
      ),
    );

    const instance = createBrevwick({
      projectKey: KEY,
      endpoint: ENDPOINT,
      environment: 'stg',
    });
    instance.install();
    const internal = getInternal(instance);
    await internal.ready();

    const events: PhaseEvent[] = [];
    internal.bus.on('phase', (e) => events.push(e));

    const result = await instance.submit({ description: 'phase happy path' });
    expect(result).toEqual({ ok: true, issue_id: 'phase_issue_1' });

    expect(events.map((e) => e.phase)).toEqual([
      'capturing-done',
      'sanitising-done',
      'sent',
    ]);
    const sent = events[2];
    if (sent?.phase !== 'sent') throw new Error('expected sent event');
    expect(sent.aiEnabled).toBe(true);

    instance.uninstall();
  });

  it('sets aiEnabled=false on the sent event when the project config has AI off', async () => {
    installIngestHandlers(server, () => 'phase_issue_2');
    server.use(
      http.get(CONFIG_URL, () =>
        HttpResponse.json({
          ai_enabled: false,
          ai_submitter_choice_allowed: false,
        }),
      ),
    );

    const instance = createBrevwick({
      projectKey: KEY,
      endpoint: ENDPOINT,
      environment: 'stg',
    });
    instance.install();
    const internal = getInternal(instance);
    await internal.ready();

    const events: PhaseEvent[] = [];
    internal.bus.on('phase', (e) => events.push(e));

    await instance.submit({ description: 'phase non-ai project' });

    const sent = events.find((e) => e.phase === 'sent');
    if (!sent || sent.phase !== 'sent') throw new Error('expected sent event');
    expect(sent.aiEnabled).toBe(false);

    instance.uninstall();
  });

  it('does not emit sent on a 4xx ingest rejection', async () => {
    server.use(
      http.post(`${ENDPOINT}/v1/ingest/issues`, () =>
        HttpResponse.json({ error: 'quota' }, { status: 422 }),
      ),
    );
    server.use(
      http.get(CONFIG_URL, () =>
        HttpResponse.json({
          ai_enabled: false,
          ai_submitter_choice_allowed: false,
        }),
      ),
    );

    const instance = createBrevwick({
      projectKey: KEY,
      endpoint: ENDPOINT,
      environment: 'stg',
    });
    instance.install();
    const internal = getInternal(instance);
    await internal.ready();

    const events: PhaseEvent[] = [];
    internal.bus.on('phase', (e) => events.push(e));

    const result = await instance.submit({ description: 'phase rejected' });
    expect(result.ok).toBe(false);
    // The first two phases fire as soon as compose+redact complete; only
    // 'sent' is gated on a 2xx, so the failure path stops at the second.
    expect(events.map((e) => e.phase)).toEqual([
      'capturing-done',
      'sanitising-done',
    ]);

    instance.uninstall();
  });
});
