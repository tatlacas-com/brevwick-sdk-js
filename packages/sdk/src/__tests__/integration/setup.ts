/**
 * Shared MSW scaffolding for the `__tests__/integration/` suite. The
 * unit-level tests in `../submit.test.ts` already exercise MSW against the
 * ingest wire in isolation; the integration suite layers on real ring
 * installation and runs end-to-end flows through `createBrevwick()`. Keeping
 * the handler factories here keeps each test file focused on assertions.
 *
 * Wire paths follow SDD § 7 ingest endpoints (`/v1/ingest/presign`,
 * `/v1/ingest/issues`) and the `issue_id` response shape — see
 * `packages/sdk/src/submit.ts` for the canonical source.
 *
 * The React package ships a near-twin of this file at
 * `packages/react/src/__tests__/integration/setup.ts`. The two are
 * intentionally not collapsed into a `@tatlacas/brevwick-sdk/testing/msw` subpath
 * export — see that file's header for the structural reason (React
 * variant adds a config handler the SDK suite has no use for).
 */
import { http, HttpResponse, type PathParams } from 'msw';
import { setupServer, type SetupServer } from 'msw/node';

export const KEY = 'pk_test_integration1234567890';
export const ENDPOINT = 'https://api.brevwick.com';
export const PRESIGN_URL = `${ENDPOINT}/v1/ingest/presign`;
export const ISSUES_URL = `${ENDPOINT}/v1/ingest/issues`;
export const UPLOAD_URL = 'https://r2.example.com/upload/integration-abc';
export const OBJECT_KEY_PREFIX = 'integration/p/01HV/at';

export interface CapturedIngest {
  /** Latest POST body text (for redaction substring assertions). */
  body: () => string | undefined;
  /** Latest POST body parsed as JSON, or undefined if none captured yet. */
  json: () => Record<string, unknown> | undefined;
  /** Total number of issues POSTs observed. */
  count: () => number;
  /** Every object_key returned by the presign handler, in call order. */
  objectKeys: () => readonly string[];
}

/**
 * Install the standard presign + PUT + issues handlers against the given
 * MSW server and return a capture handle for assertion.
 *
 * `issueIdSupplier` is a thunk so callers that want to assert retry
 * sequences can return different IDs per call.
 */
export function installIngestHandlers(
  server: SetupServer,
  issueIdSupplier: () => string = () => 'issue_integration_1',
): CapturedIngest {
  const objectKeys: string[] = [];
  let latestRaw: string | undefined;
  let count = 0;

  server.use(
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
        { issue_id: issueIdSupplier(), status: 'received' },
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

/**
 * Spin up an MSW server tailored to the integration suite. The suite
 * creates a fresh server per file rather than sharing a module-level one
 * because test files install distinct handler sets and sharing created
 * cross-file leakage during iteration. Per-file isolation also keeps each
 * file under the 15 s CI budget from issue #10.
 */
export function createIntegrationServer(): SetupServer {
  return setupServer();
}
