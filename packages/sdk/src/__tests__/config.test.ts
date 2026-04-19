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
import { __resetBrevwickRegistry } from '../testing';

const KEY = 'pk_test_aaaaaaaaaaaaaaaa02';
const ENDPOINT = 'https://api.brevwick.com';
const CONFIG_URL = `${ENDPOINT}/v1/ingest/config`;

const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  server.resetHandlers();
  __resetBrevwickRegistry();
  vi.restoreAllMocks();
});
afterAll(() => server.close());

describe('fetchConfig / Brevwick.getConfig', () => {
  it('parses a well-shaped 200 response into ProjectConfig', async () => {
    server.use(
      http.get(CONFIG_URL, () =>
        HttpResponse.json(
          { ai_enabled: true, ai_submitter_choice_allowed: true },
          { status: 200 },
        ),
      ),
    );
    const instance = createBrevwick({ projectKey: KEY });
    const cfg = await instance.getConfig();
    expect(cfg).toEqual({
      ai_enabled: true,
      ai_submitter_choice_allowed: true,
    });
  });

  it('stamps Authorization: Bearer <projectKey> on the config request', async () => {
    let auth: string | null = null;
    server.use(
      http.get(CONFIG_URL, ({ request }) => {
        auth = request.headers.get('authorization');
        return HttpResponse.json({
          ai_enabled: false,
          ai_submitter_choice_allowed: false,
        });
      }),
    );
    const instance = createBrevwick({ projectKey: KEY });
    await instance.getConfig();
    expect(auth).toBe(`Bearer ${KEY}`);
  });

  it.each([
    ['missing ai_enabled', { ai_submitter_choice_allowed: true }],
    ['missing ai_submitter_choice_allowed', { ai_enabled: true }],
    [
      'ai_enabled not boolean',
      { ai_enabled: 'yes', ai_submitter_choice_allowed: true },
    ],
    [
      'ai_submitter_choice_allowed not boolean',
      { ai_enabled: true, ai_submitter_choice_allowed: 1 },
    ],
    ['null body', null],
    ['array body', []],
  ])('returns null when the response is malformed (%s)', async (_l, body) => {
    server.use(
      http.get(CONFIG_URL, () => HttpResponse.json(body, { status: 200 })),
    );
    const instance = createBrevwick({ projectKey: KEY });
    const cfg = await instance.getConfig();
    expect(cfg).toBeNull();
  });

  it.each([401, 403, 404, 500, 503])(
    'returns null on non-2xx (%s) without throwing',
    async (status) => {
      server.use(
        http.get(CONFIG_URL, () =>
          HttpResponse.json({ error: 'nope' }, { status }),
        ),
      );
      const instance = createBrevwick({ projectKey: KEY });
      const cfg = await instance.getConfig();
      expect(cfg).toBeNull();
    },
  );

  it('returns null on thrown fetch error', async () => {
    server.use(http.get(CONFIG_URL, () => HttpResponse.error()));
    const instance = createBrevwick({ projectKey: KEY });
    const cfg = await instance.getConfig();
    expect(cfg).toBeNull();
  });

  it('caches the first result — second call does not refetch', async () => {
    let hits = 0;
    server.use(
      http.get(CONFIG_URL, () => {
        hits++;
        return HttpResponse.json({
          ai_enabled: true,
          ai_submitter_choice_allowed: false,
        });
      }),
    );
    const instance = createBrevwick({ projectKey: KEY });
    const first = await instance.getConfig();
    const second = await instance.getConfig();
    expect(hits).toBe(1);
    expect(second).toEqual(first);
    expect(second).toEqual({
      ai_enabled: true,
      ai_submitter_choice_allowed: false,
    });
  });

  it('caches a null result so failures are not retried per session', async () => {
    let hits = 0;
    server.use(
      http.get(CONFIG_URL, () => {
        hits++;
        return HttpResponse.json({ error: 'down' }, { status: 503 });
      }),
    );
    const instance = createBrevwick({ projectKey: KEY });
    const first = await instance.getConfig();
    const second = await instance.getConfig();
    expect(first).toBeNull();
    expect(second).toBeNull();
    expect(hits).toBe(1);
  });

  it('collapses concurrent getConfig() calls into a single network round-trip', async () => {
    let hits = 0;
    server.use(
      http.get(CONFIG_URL, () => {
        hits++;
        return HttpResponse.json({
          ai_enabled: true,
          ai_submitter_choice_allowed: true,
        });
      }),
    );
    const instance = createBrevwick({ projectKey: KEY });
    const [a, b, c] = await Promise.all([
      instance.getConfig(),
      instance.getConfig(),
      instance.getConfig(),
    ]);
    expect(hits).toBe(1);
    expect(a).toEqual(b);
    expect(b).toEqual(c);
  });
});
