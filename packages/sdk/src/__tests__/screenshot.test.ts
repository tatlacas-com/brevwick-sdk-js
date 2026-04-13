import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  __resetBrevwickRegistry,
  __setRingsForTesting,
  createBrevwick,
} from '../core/client';
import type { BrevwickInternal } from '../core/internal';

const KEY = 'pk_test_aaaaaaaaaaaaaaaa01';

function getInternal(instance: unknown): BrevwickInternal {
  return (instance as { _internal: BrevwickInternal })._internal;
}

beforeEach(() => {
  __resetBrevwickRegistry();
  __setRingsForTesting();
  vi.resetModules();
});

afterEach(() => {
  __resetBrevwickRegistry();
  __setRingsForTesting();
  vi.doUnmock('modern-screenshot');
});

describe('captureScreenshot', () => {
  it('resolves to an image/* Blob on success', async () => {
    vi.doMock('modern-screenshot', () => ({
      domToBlob: vi
        .fn()
        .mockResolvedValue(
          new Blob([new Uint8Array([1, 2, 3])], { type: 'image/webp' }),
        ),
    }));
    const { captureScreenshot } = await import('../screenshot');
    const blob = await captureScreenshot();
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type).toMatch(/^image\//);
  });

  it('hides [data-brevwick-skip] during capture and restores after', async () => {
    const skip = document.createElement('div');
    skip.setAttribute('data-brevwick-skip', '');
    document.body.appendChild(skip);
    // Pre-capture: no inline visibility set.
    expect(skip.style.visibility).toBe('');

    let observedDuringCapture = '';
    vi.doMock('modern-screenshot', () => ({
      domToBlob: vi.fn().mockImplementation(async () => {
        observedDuringCapture = skip.style.visibility;
        return new Blob([new Uint8Array([1])], { type: 'image/webp' });
      }),
    }));

    const { captureScreenshot } = await import('../screenshot');
    await captureScreenshot();

    expect(observedDuringCapture).toBe('hidden');
    // Post-capture: original ('') restored.
    expect(skip.style.visibility).toBe('');
    skip.remove();
  });

  it('restores [data-brevwick-skip] visibility even when capture throws', async () => {
    const skip = document.createElement('div');
    skip.setAttribute('data-brevwick-skip', '');
    skip.style.visibility = 'visible';
    document.body.appendChild(skip);

    vi.doMock('modern-screenshot', () => ({
      domToBlob: vi.fn().mockRejectedValue(new Error('boom')),
    }));
    const { captureScreenshot } = await import('../screenshot');
    const blob = await captureScreenshot();
    expect(blob).toBeInstanceOf(Blob);
    // Original 'visible' is restored after the rejection.
    expect(skip.style.visibility).toBe('visible');
    skip.remove();
  });

  it('returns a transparent placeholder Blob + warns via console.warn when capture rejects', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.doMock('modern-screenshot', () => ({
      domToBlob: vi.fn().mockRejectedValue(new Error('nope')),
    }));
    const { captureScreenshot } = await import('../screenshot');
    const blob = await captureScreenshot();
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type).toBe('image/webp');
    expect(blob.size).toBeGreaterThan(0);
    expect(warn).toHaveBeenCalled();
    const msg = String(warn.mock.calls[0]?.[0] ?? '');
    expect(msg).toMatch(/brevwick: screenshot capture failed/);
    warn.mockRestore();
  });

  it('returns a placeholder Blob when domToBlob yields null', async () => {
    vi.doMock('modern-screenshot', () => ({
      domToBlob: vi.fn().mockResolvedValue(null),
    }));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { captureScreenshot } = await import('../screenshot');
    const blob = await captureScreenshot();
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type).toBe('image/webp');
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('pushes a warn ConsoleEntry into the owning Brevwick instance on failure', async () => {
    vi.doMock('modern-screenshot', () => ({
      domToBlob: vi.fn().mockRejectedValue(new Error('boom')),
    }));
    const instance = createBrevwick({ projectKey: KEY });
    const blob = await instance.captureScreenshot();
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type).toBe('image/webp');

    const entries = getInternal(instance).buffers.console.snapshot();
    expect(entries).toHaveLength(1);
    expect(entries[0]?.level).toBe('warn');
    expect(entries[0]?.message).toMatch(/brevwick: screenshot capture failed/);
  });

  it('passes quality + image/webp type to modern-screenshot', async () => {
    const spy = vi
      .fn()
      .mockResolvedValue(
        new Blob([new Uint8Array([1])], { type: 'image/webp' }),
      );
    vi.doMock('modern-screenshot', () => ({ domToBlob: spy }));
    const { captureScreenshot } = await import('../screenshot');
    await captureScreenshot({ quality: 0.5 });
    expect(spy).toHaveBeenCalledWith(
      document.documentElement,
      expect.objectContaining({ quality: 0.5, type: 'image/webp' }),
    );
  });

  it('defaults quality to 0.85', async () => {
    const spy = vi
      .fn()
      .mockResolvedValue(
        new Blob([new Uint8Array([1])], { type: 'image/webp' }),
      );
    vi.doMock('modern-screenshot', () => ({ domToBlob: spy }));
    const { captureScreenshot } = await import('../screenshot');
    await captureScreenshot();
    expect(spy).toHaveBeenCalledWith(
      document.documentElement,
      expect.objectContaining({ quality: 0.85, type: 'image/webp' }),
    );
  });
});
