/**
 * Renders `<BrevwickProvider><FeedbackButton/></BrevwickProvider>` against
 * the REAL core SDK (no `vi.mock('brevwick-sdk', ...)`) and lets MSW
 * intercept the ingest wire. The existing suite in
 * `../feedback-button.test.tsx` mocks `createBrevwick` so it never
 * exercises the submit pipeline end-to-end; this file closes that gap by
 * asserting that a user opening the FAB, typing a draft, and hitting
 * Send produces a single POST to `/v1/ingest/issues` with the shape the
 * backend contract expects.
 */
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
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
 * value: timestamps, environment-sourced strings (UA, locale, viewport),
 * `route_path` (happy-dom default), and the `sdk.version` stamp.
 */
function freezeShape(body: Record<string, unknown>): Record<string, unknown> {
  const deviceCtx = body.device_context as Record<string, unknown>;
  const sdk = deviceCtx.sdk as Record<string, unknown>;
  return {
    title: body.title,
    description: body.description,
    build_sha: body.build_sha,
    release: body.release,
    environment: body.environment,
    user_context: body.user_context,
    device_context: {
      platform: deviceCtx.platform,
      sdk: { name: sdk.name, platform: sdk.platform },
    },
    console_errors: body.console_errors,
    network_errors: body.network_errors,
    route_trail: body.route_trail,
    attachments: body.attachments,
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

    await act(async () => {
      fireEvent.click(
        screen.getByRole('button', { name: /open feedback form/i }),
      );
    });

    const textarea = screen.getByRole('textbox', {
      name: /feedback message/i,
    }) as HTMLTextAreaElement;
    fireEvent.change(textarea, {
      target: {
        value: 'broken button on home\nsecond line for the description',
      },
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /^send$/i }));
    });

    // `submit()` lazy-imports the pipeline and then fans out (presign →
    // PUT → issue POST). `fireEvent.click` inside act only awaits the
    // microtask queue, not the subsequent network round-trips — wait for
    // the MSW server to actually see the terminal POST.
    await waitFor(() => expect(captured.count()).toBe(1));

    const body = captured.json();
    expect(body).toBeDefined();
    expect(freezeShape(body!)).toEqual(GOLDEN);

    // Panel flips into the success state when the POST resolves ok.
    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent(/on its way/i),
    );
  });
});
