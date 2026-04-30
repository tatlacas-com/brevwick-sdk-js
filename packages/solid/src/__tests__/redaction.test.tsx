/**
 * Adapter-side redaction guard. The Solid adapter does NOT do its own
 * redaction — it delegates to `brevwick.submit()`, which runs every payload
 * through `redact()` inside the core SDK (covered by
 * `packages/sdk/src/__tests__/integration/redaction-matrix.test.ts`).
 *
 * What this test asserts is the **delegation invariant**: every `submit()`
 * call from the FAB and from `useFeedback()` lands on `brevwick.submit`
 * with the original input intact. If a future refactor adds a wrapper that
 * mutates / strips / re-encodes the input on the way through, the SDK's
 * redaction guarantees would silently regress because the wrapper would
 * see the unredacted payload first. Catching that drift here is cheap.
 */
import { fireEvent, render, screen, waitFor } from '@solidjs/testing-library';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  Brevwick,
  BrevwickConfig,
  FeedbackInput,
  SubmitResult,
} from '@tatlacas/brevwick-sdk';
import type { JSX } from 'solid-js';

const submit = vi.fn<(input: FeedbackInput) => Promise<SubmitResult>>();
const captureScreenshot = vi.fn<() => Promise<Blob>>();
const install = vi.fn();
const uninstall = vi.fn();

vi.mock('@tatlacas/brevwick-sdk', async () => {
  const actual = await vi.importActual<typeof import('@tatlacas/brevwick-sdk')>(
    '@tatlacas/brevwick-sdk',
  );
  return {
    ...actual,
    createBrevwick: (_config: BrevwickConfig) =>
      ({
        install,
        uninstall,
        submit,
        captureScreenshot,
      }) as unknown as Brevwick,
  };
});

import { BrevwickProvider } from '../provider';
import { FeedbackButton } from '../components/feedback-button';
import { useFeedback, type UseFeedbackResult } from '../use-feedback';

beforeEach(() => {
  if (typeof URL.createObjectURL !== 'function') {
    (
      URL as unknown as { createObjectURL: (b: Blob) => string }
    ).createObjectURL = () => 'blob:mock';
  }
  if (typeof URL.revokeObjectURL !== 'function') {
    (
      URL as unknown as { revokeObjectURL: (u: string) => void }
    ).revokeObjectURL = () => undefined;
  }
});

afterEach(() => {
  vi.clearAllMocks();
});

const SECRETS = [
  'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTYifQ.realistic_signature_chars',
  'sk_live_authheader_secretXXXXXX',
  'tatlacas+admin@example.com',
];

const SECRET_BODY = `JWT ${SECRETS[0]}\nbearer ${SECRETS[1]}\nemail ${SECRETS[2]}`;

describe('adapter redaction delegation', () => {
  it('FeedbackButton submit forwards the unmodified input to brevwick.submit', async () => {
    submit.mockResolvedValueOnce({ ok: true, issue_id: 'rep_redact' });
    render(() => (
      <BrevwickProvider config={{ projectKey: 'pk_test_redact_fab' }}>
        <FeedbackButton />
      </BrevwickProvider>
    ));

    fireEvent.click(
      await screen.findByRole('button', { name: /open feedback form/i }),
    );
    fireEvent.input(await screen.findByLabelText(/feedback message/i), {
      target: { value: SECRET_BODY },
    });
    fireEvent.click(screen.getByRole('button', { name: /send/i }));

    await waitFor(() => expect(submit).toHaveBeenCalledTimes(1));
    const [input] = submit.mock.calls[0]!;
    // The adapter must hand the raw, unredacted payload to the SDK so the
    // SDK's redact() pass is the single point of truth.
    expect(input.description).toBe(SECRET_BODY);
  });

  it('useFeedback().submit forwards the unmodified input to brevwick.submit', async () => {
    submit.mockResolvedValueOnce({ ok: true, issue_id: 'rep_redact_hook' });

    let captured: UseFeedbackResult | undefined;
    const Capture = (): JSX.Element => {
      captured = useFeedback();
      return null;
    };
    render(() => (
      <BrevwickProvider config={{ projectKey: 'pk_test_redact_hook' }}>
        <Capture />
      </BrevwickProvider>
    ));
    if (!captured) throw new Error('hook not mounted');

    const input: FeedbackInput = { description: SECRET_BODY };
    await captured.submit(input);
    expect(submit).toHaveBeenCalledWith(input);
  });
});
