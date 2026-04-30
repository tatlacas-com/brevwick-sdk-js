import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  Brevwick,
  BrevwickConfig,
  FeedbackInput,
  SubmitResult,
} from '@tatlacas/brevwick-sdk';

/**
 * Defence-in-depth check that the Angular adapter's submit path goes through
 * the core SDK's `submit()` and not some bespoke shortcut. The redaction
 * itself is the SDK's responsibility (verified by `packages/sdk` integration
 * tests); the assertion here is that the adapter never bypasses it.
 *
 * Strategy: spy on the mocked SDK's `submit`, fire a payload containing a
 * value that **looks** like a secret if redaction were missing, and assert
 * the spy received it intact (the SDK redacts after the call lands — the
 * adapter must hand the input over unmodified, not pre-process it). A
 * regression that, for example, JSON-stringifies the payload here in
 * Angular-land instead of forwarding it to the SDK would surface as a
 * different `submit` call shape.
 */

const install = vi.fn();
const uninstall = vi.fn();
const submit = vi.fn<(input: FeedbackInput) => Promise<SubmitResult>>();
const captureScreenshot = vi.fn();
const getConfig = vi.fn();
const createBrevwick = vi.fn<(config: BrevwickConfig) => Brevwick>();

vi.mock('@tatlacas/brevwick-sdk', async () => {
  const actual = await vi.importActual<typeof import('@tatlacas/brevwick-sdk')>(
    '@tatlacas/brevwick-sdk',
  );
  return {
    ...actual,
    createBrevwick: (config: BrevwickConfig) => createBrevwick(config),
  };
});

import { BrevwickService } from '../brevwick.service';
import { provideBrevwick } from '../provide-brevwick';

const makeInstance = (): Brevwick =>
  ({
    install,
    uninstall,
    submit,
    captureScreenshot,
    getConfig,
  }) as unknown as Brevwick;

beforeEach(() => {
  vi.clearAllMocks();
  createBrevwick.mockReturnValue(makeInstance());
  submit.mockResolvedValue({ ok: true, issue_id: 'r' });
});

describe('redaction surface', () => {
  it('forwards every submit() call through the SDK without mutating the input', async () => {
    TestBed.configureTestingModule({
      providers: [provideBrevwick({ projectKey: 'pk_test_redact' })],
    });
    const service = TestBed.inject(BrevwickService);

    const payload: FeedbackInput = {
      title: 'Bearer abc.def.ghi looks like a token',
      description: 'My API key is sk_live_REDACTABLE',
      expected: 'redaction happens downstream',
      actual: 'Authorization: Bearer abc.def.ghi',
    };

    await service.submit(payload);

    expect(submit).toHaveBeenCalledTimes(1);
    // The adapter must hand the SDK the exact object reference (or a
    // structurally identical object) — the SDK's redact() is the single
    // chokepoint and the adapter cannot be sneaking around it.
    const received = submit.mock.calls[0]![0];
    expect(received).toEqual(payload);
  });

  it('does not stash the submitted input in any new property (no extra context fields without a redaction test)', async () => {
    TestBed.configureTestingModule({
      providers: [provideBrevwick({ projectKey: 'pk_test_no_extra' })],
    });
    const service = TestBed.inject(BrevwickService);

    const baseline = { description: 'baseline body' } satisfies FeedbackInput;
    await service.submit(baseline);

    const received = submit.mock.calls[0]![0] as Record<string, unknown>;
    // CLAUDE.md mandates: any new context field that ships needs an explicit
    // redaction test. Snap on key parity so a future contributor adding a
    // new field has a forced moment to reckon with this contract.
    expect(Object.keys(received).sort()).toEqual(Object.keys(baseline).sort());
  });
});
