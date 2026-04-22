/**
 * Runtime lazy-load guard for `modern-screenshot`.
 *
 * The static chunk-graph guard already lives in `../chunk-split.test.ts`
 * (which reads built `dist/index.{js,cjs}` and asserts the substring
 * `modern-screenshot` is absent). That covers the bundle-time invariant
 * but says nothing about runtime behaviour against an un-built source
 * tree. This test fills the runtime gap by mocking `modern-screenshot`
 * with a side-effect counter and asserting:
 *
 * 1. Importing the SDK + installing it + calling `submit()` never
 *    triggers the `modern-screenshot` mock factory.
 * 2. Calling `captureScreenshot()` does — and only then.
 *
 * If a future refactor pulls `screenshot.ts` (or its `import('modern-
 * screenshot')` line) into the eager surface, this test fails on the
 * first assertion long before the bundle audit catches the size
 * regression.
 *
 * Isolation requirement: the screenshot module's module-level promise
 * cache (`modernScreenshotPromise` at `../../screenshot.ts`) is reset
 * only by `vi.resetModules()` invalidating the screenshot module
 * record. If a future Vitest config drops to `pool: 'threads'` with
 * `isolate: false`, this test will start reading a cached real
 * `modern-screenshot` and `factoryRuns` will stay at 0 even when
 * `captureScreenshot()` is called. The `expect(domToBlobCalls)`
 * assertion below catches that transitively, but keeping per-file
 * isolation enabled at the Vitest level is the contract this test
 * relies on.
 */
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import {
  createIntegrationServer,
  ENDPOINT,
  installIngestHandlers,
  KEY,
} from './setup';

// Module-cache isolation note: `vi.resetModules()` lives ONLY in
// `afterEach`, after `vi.doUnmock`. Adding a second call in `beforeEach`
// would skip the `doUnmock` cleanup because resetModules runs before
// module registration in beforeEach, leaving the next test with the
// previous mock factory still bound. The first test in the file does
// not need a pre-test reset because nothing in the integration setup
// imports `modern-screenshot`. Cross-link: the static-graph counterpart
// is `chunk-split.test.ts::eager ESM chunk is under the 2.2 kB gzip
// budget` — do not delete one thinking it covers the other.

const server = createIntegrationServer();

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  server.resetHandlers();
  vi.doUnmock('modern-screenshot');
  vi.resetModules();
});
afterAll(() => server.close());

describe('integration — modern-screenshot lazy load', () => {
  it('does not import modern-screenshot until captureScreenshot() is called', async () => {
    let factoryRuns = 0;
    let domToBlobCalls = 0;
    vi.doMock('modern-screenshot', () => {
      factoryRuns += 1;
      return {
        domToBlob: vi.fn(async () => {
          domToBlobCalls += 1;
          return new Blob([new Uint8Array([1])], { type: 'image/webp' });
        }),
      };
    });

    // Re-import SDK after vi.resetModules so the cached `screenshot.ts`
    // module from earlier suites does not satisfy the dynamic import
    // before our mock is in place.
    const { createBrevwick } = await import('../../core/client');
    const { __resetBrevwickRegistry, __setRingsForTesting } =
      await import('../../testing');
    __resetBrevwickRegistry();
    __setRingsForTesting();

    const captured = installIngestHandlers(server, () => 'issue_lazy');
    const instance = createBrevwick({ projectKey: KEY, endpoint: ENDPOINT });
    instance.install();

    // Submit WITHOUT calling captureScreenshot — must not load the
    // screenshot peer dep.
    const submitResult = await instance.submit({ description: 'no shot' });
    expect(submitResult.ok).toBe(true);
    expect(factoryRuns).toBe(0);
    expect(captured.count()).toBe(1);

    // Now exercise the capture path — the mock factory must run.
    const blob = await instance.captureScreenshot();
    expect(blob).toBeInstanceOf(Blob);
    expect(factoryRuns).toBe(1);
    expect(domToBlobCalls).toBe(1);

    instance.uninstall();
  });
});
