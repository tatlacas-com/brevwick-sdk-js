/**
 * Shared MSW scaffolding for the React integration suite. Parallels
 * `packages/sdk/src/__tests__/integration/setup.ts`.
 *
 * Why a separate file rather than a shared `brevwick-sdk/testing/msw`
 * subpath export (the precedent set by `brevwick-sdk/testing` for the
 * registry mutators):
 *
 * - The React variant adds a `GET /v1/ingest/config` handler returning
 *   `204 No Content`. `<FeedbackButton>` opens the panel by calling
 *   `brevwick.getConfig()` on first render to decide whether to show
 *   the "Format with AI" toggle; the 204 is the documented "no submitter
 *   choice" branch (see `packages/sdk/src/types.ts` `ProjectConfig` JSDoc).
 *   The SDK integration suite never opens a widget so it has no use for
 *   the config handler.
 * - Test-namespace identifiers diverge intentionally (`KEY`,
 *   `OBJECT_KEY_PREFIX`, default `issueId`) so a leak from one package's
 *   suite into the other shows up as a string mismatch rather than a
 *   silent collision.
 *
 * Parameterising the SDK helper with an "extra handlers" callback to
 * absorb both points would push more surface (the `extras` shape, the
 * ordering rules between extras and the core handlers) into the SDK's
 * public testing API than the copy-paste costs. If a third consumer
 * appears, revisit.
 */
import { http, HttpResponse, type PathParams } from 'msw';
import { setupServer, type SetupServer } from 'msw/node';

export const KEY = 'pk_test_reactintegration12345';
export const ENDPOINT = 'https://api.brevwick.com';
export const PRESIGN_URL = `${ENDPOINT}/v1/ingest/presign`;
export const ISSUES_URL = `${ENDPOINT}/v1/ingest/issues`;
export const CONFIG_URL = `${ENDPOINT}/v1/ingest/config`;
export const UPLOAD_URL = 'https://r2.example.com/upload/react-integration';
export const OBJECT_KEY_PREFIX = 'integration/react/at';

export interface CapturedIngest {
  body: () => string | undefined;
  json: () => Record<string, unknown> | undefined;
  count: () => number;
  objectKeys: () => readonly string[];
}

export function installIngestHandlers(
  server: SetupServer,
  issueId: string = 'issue_react_1',
): CapturedIngest {
  const objectKeys: string[] = [];
  let latestRaw: string | undefined;
  let count = 0;

  server.use(
    // `<FeedbackButton>` opens the panel → `brevwick.getConfig()` → GET
    // /v1/ingest/config. The null-toggle default keeps the render path
    // aligned with the "no AI submitter choice" branch.
    http.get(CONFIG_URL, () => new HttpResponse(null, { status: 204 })),
    http.post<PathParams, { mime: string; size_bytes: number; sha256: string }>(
      PRESIGN_URL,
      async ({ request }) => {
        const body = await request.json();
        const key = `${OBJECT_KEY_PREFIX}-${objectKeys.length + 1}`;
        objectKeys.push(key);
        return HttpResponse.json({
          object_key: key,
          upload_url: UPLOAD_URL,
          headers: {
            'Content-Type': body.mime,
            'x-amz-checksum-sha256': body.sha256,
          },
          expires_at: '2099-01-01T00:00:00Z',
        });
      },
    ),
    http.put(UPLOAD_URL, () => new HttpResponse(null, { status: 200 })),
    http.post(ISSUES_URL, async ({ request }) => {
      latestRaw = await request.text();
      count += 1;
      return HttpResponse.json(
        { issue_id: issueId, status: 'received' },
        { status: 202 },
      );
    }),
  );

  return {
    body: () => latestRaw,
    json: () =>
      latestRaw === undefined
        ? undefined
        : (JSON.parse(latestRaw) as Record<string, unknown>),
    count: () => count,
    objectKeys: () => objectKeys,
  };
}

export function createIntegrationServer(): SetupServer {
  return setupServer();
}
