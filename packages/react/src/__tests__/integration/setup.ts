/**
 * Shared MSW scaffolding for the React integration suite. Parallels
 * `packages/sdk/src/__tests__/integration/setup.ts`; the two files do not
 * share a module because each package owns its own vitest + module-graph
 * boundary and cross-package test imports would break the workspace
 * layout (`packages/react` does not depend on `packages/sdk` internals).
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
