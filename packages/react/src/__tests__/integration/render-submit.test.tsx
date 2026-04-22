/**
 * Renders `<BrevwickProvider><FeedbackButton/></BrevwickProvider>` against
 * the REAL core SDK (no `vi.mock('brevwick-sdk', ...)`) and lets MSW
 * intercept the ingest wire. The existing suite in
 * `../feedback-button.test.tsx` mocks `createBrevwick` so it never
 * exercises the submit pipeline end-to-end; this file closes that gap by
 * asserting that a user opening the FAB, typing a draft, and hitting
 * Send produces a single POST to `/v1/ingest/issues` with the shape the
 * backend contract expects.
 *
 * On the React-bindings version (issue #10's "react golden differs from
 * the SDK golden by including a react-bindings-version field"): the
 * production `BrevwickProvider` (`packages/react/src/provider.tsx`) does
 * NOT thread `BREVWICK_REACT_VERSION` into the wire payload — the
 * constant is exported and rendered in the credit footer, but it never
 * lands on `device_context.sdk` or any sibling field. The issue spec
 * was speculative; encoding it would be a public-API change that
 * belongs in its own SDD § 12 amendment. The "no bindings_version on
 * the wire today" assertion below catches a silent regression where a
 * future Provider refactor leaks the React version into the payload
 * without an SDD update.
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { BREVWICK_REACT_VERSION } from '../../index';
import { BrevwickProvider } from '../../provider';
import { FeedbackButton } from '../../feedback-button';
import GOLDEN_RAW from './__fixtures__/composed-payload.json' with { type: 'json' };
import {
  createIntegrationServer,
  ENDPOINT,
  installIngestHandlers,
  KEY,
} from './setup';

const server = createIntegrationServer();

const GOLDEN = GOLDEN_RAW as Record<string, unknown>;

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

/**
 * Strip every field the integration test cannot pin to a deterministic
 * value. Inverted projection (strip volatile, retain everything else)
 * so a future top-level field on the wire fails the assertion loudly
 * instead of being silently dropped — matches the SDK-side
 * `freezeShape` in `packages/sdk/src/__tests__/integration/golden-payload.test.ts`.
 */
function freezeShape(body: Record<string, unknown>): Record<string, unknown> {
  const {
    route_path: _routePath,
    ts: _ts,
    issue_id: _issueId,
    device_context: deviceCtxRaw,
    ...rest
  } = body as {
    route_path?: unknown;
    ts?: unknown;
    issue_id?: unknown;
    device_context: Record<string, unknown>;
    [key: string]: unknown;
  };
  void _routePath;
  void _ts;
  void _issueId;

  const {
    ua: _ua,
    locale: _locale,
    viewport: _viewport,
    sdk: sdkRaw,
    ...deviceCtxRest
  } = deviceCtxRaw as {
    ua?: unknown;
    locale?: unknown;
    viewport?: unknown;
    sdk: Record<string, unknown>;
    [key: string]: unknown;
  };
  void _ua;
  void _locale;
  void _viewport;

  const { version: _sdkVersion, ...sdkRest } = sdkRaw as {
    version?: unknown;
    [key: string]: unknown;
  };
  void _sdkVersion;

  return {
    ...rest,
    device_context: { ...deviceCtxRest, sdk: sdkRest },
  };
}

describe('integration — Provider + FeedbackButton → MSW ingest', () => {
  it('click FAB → type → Send produces one POST with the expected shape', async () => {
    const captured = installIngestHandlers(server, 'issue_react_itest');

    render(
      <BrevwickProvider
        config={{
          projectKey: KEY,
          endpoint: ENDPOINT,
          environment: 'stg',
          release: '0.1.0-react-itest',
          buildSha: 'deadbeef',
          user: { id: 'u_react' },
        }}
      >
        <FeedbackButton />
      </BrevwickProvider>,
    );

    // `fireEvent.*` already wraps every dispatch in `act` synchronously
    // (testing-library/react ≥ 13), and `waitFor` handles the async
    // settle for the network round-trip below. An explicit `act(async
    // () => fireEvent.click(...))` wrapper would be misleading here —
    // it reads as if `fireEvent` does not handle React 19 batching,
    // which is wrong.
    fireEvent.click(
      screen.getByRole('button', { name: /open feedback form/i }),
    );

    const textarea = screen.getByRole('textbox', {
      name: /feedback message/i,
    }) as HTMLTextAreaElement;
    fireEvent.change(textarea, {
      target: {
        value: 'broken button on home\nsecond line for the description',
      },
    });

    fireEvent.click(screen.getByRole('button', { name: /^send$/i }));

    // `submit()` lazy-imports the pipeline and then fans out (presign →
    // PUT → issue POST). `fireEvent.click` resolves the synchronous
    // microtask queue but not the subsequent network round-trips —
    // wait for the MSW server to actually see the terminal POST.
    await waitFor(() => expect(captured.count()).toBe(1));

    const body = captured.json();
    expect(body).toBeDefined();
    expect(freezeShape(body!)).toEqual(GOLDEN);

    // Defensive: the React Provider does not currently emit a
    // `bindings_version` / `react_version` field on the wire (see file
    // header). If a future refactor adds one without an SDD § 12
    // amendment, both assertions below trip — the package-level
    // version string would land in the body via the new field name.
    const raw = captured.body() ?? '';
    expect(raw).not.toContain('bindings_version');
    expect(raw).not.toContain(`"react_version":"${BREVWICK_REACT_VERSION}"`);

    // Panel flips into the success state when the POST resolves ok.
    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent(/on its way/i),
    );
  });
});
