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

const makeInstance = (): Brevwick =>
  ({
    install,
    uninstall,
    submit,
    captureScreenshot,
    getConfig,
  }) as unknown as Brevwick;

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
});
