import { PLATFORM_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  Brevwick,
  BrevwickConfig,
  SubmitResult,
} from '@tatlacas/brevwick-sdk';

const install = vi.fn();
const uninstall = vi.fn();
const submit = vi.fn<(input: unknown) => Promise<SubmitResult>>();
const captureScreenshot = vi.fn<() => Promise<Blob>>();
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

/**
 * Builds a structurally-complete `Brevwick` mock. The phase-bus listener the
 * service subscribes to needs `_internal.bus.on/off` to exist; otherwise the
 * service silently skips subscription. Tests that don't drive phase events
 * still benefit from a no-op bus so the registration path is exercised.
 */
const makeInstance = (): Brevwick => {
  const listeners = new Set<(payload: unknown) => void>();
  const bus = {
    on: (_: string, l: (payload: unknown) => void) => listeners.add(l),
    off: (_: string, l: (payload: unknown) => void) => listeners.delete(l),
    emit: (payload: unknown) => listeners.forEach((l) => l(payload)),
  };
  return {
    install,
    uninstall,
    submit,
    captureScreenshot,
    getConfig,
    _internal: { bus },
  } as unknown as Brevwick;
};

beforeEach(() => {
  // Clear in beforeEach (not afterEach) so the setup-file's afterEach hook,
  // which runs *after* this file's hooks and triggers TestBed.resetTestingModule
  // (and through it the service's onDestroy → uninstall), does not leave a
  // residual call count visible to the next test. clearAllMocks here resets
  // the slate at the *start* of every test, after any prior teardown call.
  vi.clearAllMocks();
  createBrevwick.mockReturnValue(makeInstance());
});

describe('BrevwickService', () => {
  it('creates the SDK + calls install on construction in a browser context', () => {
    TestBed.configureTestingModule({
      providers: [provideBrevwick({ projectKey: 'pk_test_browser' })],
    });
    const service = TestBed.inject(BrevwickService);
    expect(service).toBeInstanceOf(BrevwickService);
    expect(createBrevwick).toHaveBeenCalledTimes(1);
    expect(createBrevwick).toHaveBeenCalledWith({
      projectKey: 'pk_test_browser',
    });
    expect(install).toHaveBeenCalledTimes(1);
    expect(uninstall).not.toHaveBeenCalled();
    expect(service.status()).toBe('idle');
  });

  it('flips status signal through submitting → success on a successful submit', async () => {
    submit.mockResolvedValueOnce({ ok: true, issue_id: 'abc' });
    TestBed.configureTestingModule({
      providers: [provideBrevwick({ projectKey: 'pk_test_ok' })],
    });
    const service = TestBed.inject(BrevwickService);
    expect(service.status()).toBe('idle');

    const promise = service.submit({ description: 'hello' });
    expect(service.status()).toBe('submitting');
    const result = await promise;
    expect(result).toEqual({ ok: true, issue_id: 'abc' });
    expect(service.status()).toBe('success');
  });

  it('flips status to error when the SDK reports an ingest failure', async () => {
    submit.mockResolvedValueOnce({
      ok: false,
      error: { code: 'INGEST_REJECTED', message: 'rejected' },
    });
    TestBed.configureTestingModule({
      providers: [provideBrevwick({ projectKey: 'pk_test_err' })],
    });
    const service = TestBed.inject(BrevwickService);
    const result = await service.submit({ description: 'oops' });
    expect(result).toEqual({
      ok: false,
      error: { code: 'INGEST_REJECTED', message: 'rejected' },
    });
    expect(service.status()).toBe('error');
  });

  it('rethrows + flips to error when the lazy submit chunk fails to load', async () => {
    submit.mockRejectedValueOnce(new Error('chunk load failed'));
    TestBed.configureTestingModule({
      providers: [provideBrevwick({ projectKey: 'pk_test_throw' })],
    });
    const service = TestBed.inject(BrevwickService);
    await expect(
      service.submit({ description: 'env failure' }),
    ).rejects.toThrow('chunk load failed');
    expect(service.status()).toBe('error');
  });

  it('reset() returns status to idle without affecting an in-flight submit', () => {
    TestBed.configureTestingModule({
      providers: [provideBrevwick({ projectKey: 'pk_test_reset' })],
    });
    const service = TestBed.inject(BrevwickService);
    submit.mockResolvedValueOnce({ ok: true, issue_id: 'r' });
    void service.submit({ description: 'in flight' });
    expect(service.status()).toBe('submitting');
    service.reset();
    expect(service.status()).toBe('idle');
  });

  it('no-ops on non-browser PLATFORM_ID — never calls createBrevwick or submit', async () => {
    TestBed.configureTestingModule({
      providers: [
        provideBrevwick({ projectKey: 'pk_test_ssr' }),
        { provide: PLATFORM_ID, useValue: 'server' },
      ],
    });
    const service = TestBed.inject(BrevwickService);
    expect(createBrevwick).not.toHaveBeenCalled();
    expect(install).not.toHaveBeenCalled();

    const result = await service.submit({ description: 'on server' });
    expect(submit).not.toHaveBeenCalled();
    expect(result.ok).toBe(false);
    expect(service.status()).toBe('error');
  });

  it('captureScreenshot returns null on non-browser platforms', async () => {
    TestBed.configureTestingModule({
      providers: [
        provideBrevwick({ projectKey: 'pk_test_ssr_capture' }),
        { provide: PLATFORM_ID, useValue: 'server' },
      ],
    });
    const service = TestBed.inject(BrevwickService);
    await expect(service.captureScreenshot()).resolves.toBeNull();
    expect(captureScreenshot).not.toHaveBeenCalled();
  });

  it('captureScreenshot delegates to the SDK in a browser context', async () => {
    captureScreenshot.mockResolvedValueOnce(
      new Blob(['x'], { type: 'image/png' }),
    );
    TestBed.configureTestingModule({
      providers: [provideBrevwick({ projectKey: 'pk_test_capture' })],
    });
    const service = TestBed.inject(BrevwickService);
    const blob = await service.captureScreenshot();
    expect(captureScreenshot).toHaveBeenCalledTimes(1);
    expect(blob).toBeInstanceOf(Blob);
  });

  it('phase advances on internal bus events and resets back to idle', () => {
    TestBed.configureTestingModule({
      providers: [provideBrevwick({ projectKey: 'pk_test_phase' })],
    });
    const service = TestBed.inject(BrevwickService);
    expect(service.phase()).toBe('idle');
    const sdk = createBrevwick.mock.results[0]!.value as unknown as {
      _internal: { bus: { emit: (payload: unknown) => void } };
    };
    sdk._internal.bus.emit({ phase: 'capturing-done' });
    expect(service.phase()).toBe('sanitising');
    sdk._internal.bus.emit({ phase: 'sanitising-done' });
    expect(service.phase()).toBe('formatting');
    service.reset();
    expect(service.phase()).toBe('idle');
    expect(service.error()).toBeNull();
  });

  it('error signal carries the SubmitError after a failed submit', async () => {
    submit.mockResolvedValueOnce({
      ok: false,
      error: { code: 'INGEST_REJECTED', message: 'rejected' },
    });
    TestBed.configureTestingModule({
      providers: [provideBrevwick({ projectKey: 'pk_test_err_signal' })],
    });
    const service = TestBed.inject(BrevwickService);
    await service.submit({ description: 'oops' });
    expect(service.error()).toEqual({
      code: 'INGEST_REJECTED',
      message: 'rejected',
    });
    expect(service.phase()).toBe('error');
  });

  it('retry replays the last submit with the same input', async () => {
    submit.mockResolvedValueOnce({
      ok: false,
      error: { code: 'INGEST_REJECTED', message: 'first' },
    });
    submit.mockResolvedValueOnce({ ok: true, issue_id: 'r2' });
    TestBed.configureTestingModule({
      providers: [provideBrevwick({ projectKey: 'pk_test_retry_svc' })],
    });
    const service = TestBed.inject(BrevwickService);
    const input = { description: 'replay me' } as const;
    await service.submit(input);
    const second = await service.retry();
    expect(second).toEqual({ ok: true, issue_id: 'r2' });
    expect(submit).toHaveBeenCalledTimes(2);
    expect(submit.mock.calls[1]![0]).toEqual(input);
  });

  it('retry resolves to undefined when no submit has been attempted', async () => {
    TestBed.configureTestingModule({
      providers: [provideBrevwick({ projectKey: 'pk_test_retry_none' })],
    });
    const service = TestBed.inject(BrevwickService);
    await expect(service.retry()).resolves.toBeUndefined();
    expect(submit).not.toHaveBeenCalled();
  });

  it('getConfig delegates to the SDK in browser context', async () => {
    getConfig.mockResolvedValueOnce({
      ai_enabled: true,
      ai_submitter_choice_allowed: true,
    });
    TestBed.configureTestingModule({
      providers: [provideBrevwick({ projectKey: 'pk_test_cfg' })],
    });
    const service = TestBed.inject(BrevwickService);
    await expect(service.getConfig()).resolves.toEqual({
      ai_enabled: true,
      ai_submitter_choice_allowed: true,
    });
    expect(getConfig).toHaveBeenCalledTimes(1);
  });

  it('getConfig returns null on non-browser PLATFORM_ID', async () => {
    TestBed.configureTestingModule({
      providers: [
        provideBrevwick({ projectKey: 'pk_test_cfg_ssr' }),
        { provide: PLATFORM_ID, useValue: 'server' },
      ],
    });
    const service = TestBed.inject(BrevwickService);
    await expect(service.getConfig()).resolves.toBeNull();
    expect(getConfig).not.toHaveBeenCalled();
  });

  it('uninstalls the SDK when the root injector is destroyed', () => {
    TestBed.configureTestingModule({
      providers: [provideBrevwick({ projectKey: 'pk_test_destroy' })],
    });
    TestBed.inject(BrevwickService);
    expect(install).toHaveBeenCalledTimes(1);
    expect(uninstall).not.toHaveBeenCalled();
    TestBed.resetTestingModule();
    expect(uninstall).toHaveBeenCalledTimes(1);
  });

  it('phase listener no-ops once the destroy hook has fired', () => {
    // Custom bus: off does NOT actually drop the listener, letting us
    // emit after destroy to prove the in-handler `destroyed` guard kicks in.
    let capturedListener: ((payload: unknown) => void) | null = null;
    const offFn = vi.fn();
    const customInstance = {
      install,
      uninstall,
      submit,
      captureScreenshot,
      getConfig,
      _internal: {
        bus: {
          on: (_: string, l: (payload: unknown) => void) => {
            capturedListener = l;
          },
          off: offFn,
        },
      },
    } as unknown as Brevwick;
    createBrevwick.mockReturnValueOnce(customInstance);
    TestBed.configureTestingModule({
      providers: [provideBrevwick({ projectKey: 'pk_test_phase_destroyed' })],
    });
    const service = TestBed.inject(BrevwickService);
    expect(capturedListener).not.toBeNull();
    TestBed.resetTestingModule();
    expect(offFn).toHaveBeenCalledTimes(1);
    // The captured reference is still live in the test even though `off`
    // ran — invoking it must hit the guard and leave phase at idle.
    capturedListener!({ phase: 'capturing-done' });
    expect(service.phase()).toBe('idle');
  });

  it('submit error message uses String() coercion for non-Error rejections', async () => {
    submit.mockRejectedValueOnce('plain string failure');
    TestBed.configureTestingModule({
      providers: [provideBrevwick({ projectKey: 'pk_test_string_throw' })],
    });
    const service = TestBed.inject(BrevwickService);
    await expect(service.submit({ description: 'x' })).rejects.toBe(
      'plain string failure',
    );
    expect(service.status()).toBe('error');
    expect(service.error()).toEqual({
      code: 'INGEST_RETRY_EXHAUSTED',
      message: 'plain string failure',
    });
  });
});
