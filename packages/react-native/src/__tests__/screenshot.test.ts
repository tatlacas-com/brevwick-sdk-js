/**
 * captureScreenshot — RN path. Three required scenarios from issue #86:
 *   - peer absent → placeholder
 *   - peer present + captureRef succeeds → real bytes (≠ placeholder)
 *   - peer present + captureRef throws → placeholder
 * Plus a fourth case (module loaded but `captureRef` missing) — the import
 * succeeded but the optional peer's surface drifted; we treat it identically
 * to "absent" so the contract stays simple.
 *
 * Each test resets the module cache so a dynamic mock registered with
 * `vi.doMock` is honoured by the next `import('react-native-view-shot')` —
 * `vi.doMock` is not hoisted and the screenshot module memoises the import
 * promise, so without the reset every test after the first would see the
 * first one's mocked surface.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { __resetSkipRegistryForTest } from '../skip';

const PLACEHOLDER_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

// 4×2 transparent-ish PNG, ~120 bytes — visibly larger than the 1×1
// placeholder so the size delta is unambiguous in assertions.
const REAL_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAQAAAACCAYAAACgZTHsAAAAFElEQVR42mNkYPj/n4EIwDiqkKQQACkj9zdwGdsJAAAAAElFTkSuQmCC';

function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

// jsdom 24's Blob does not implement `arrayBuffer()`; the global `Response`
// constructor is happy to consume any Blob-shaped value and yields the same
// bytes via its own arrayBuffer() — the path used throughout the codebase.
async function blobBytes(blob: Blob): Promise<Uint8Array> {
  return new Uint8Array(await new Response(blob).arrayBuffer());
}

const PLACEHOLDER_BYTES = base64ToBytes(PLACEHOLDER_PNG_BASE64);

async function loadCaptureScreenshot(): Promise<
  typeof import('../screenshot').captureScreenshot
> {
  const mod = await import('../screenshot');
  mod.__resetScreenshotModuleCacheForTest();
  return mod.captureScreenshot;
}

beforeEach(() => {
  vi.resetModules();
  __resetSkipRegistryForTest();
});

afterEach(() => {
  vi.doUnmock('react-native-view-shot');
  vi.restoreAllMocks();
});

describe('captureScreenshot — peer-dep absence', () => {
  it('returns the placeholder PNG when the optional peer fails to import', async () => {
    vi.doMock('react-native-view-shot', () => {
      throw new Error('Cannot find module react-native-view-shot');
    });
    const captureScreenshot = await loadCaptureScreenshot();

    const blob = await captureScreenshot({ current: null });

    expect(blob.type).toBe('image/png');
    const bytes = await blobBytes(blob);
    expect(bytes).toEqual(PLACEHOLDER_BYTES);
  });

  it('returns the placeholder when the loaded module is missing captureRef', async () => {
    vi.doMock('react-native-view-shot', () => ({}));
    const captureScreenshot = await loadCaptureScreenshot();

    const blob = await captureScreenshot({ current: null });

    expect(blob.type).toBe('image/png');
    const bytes = await blobBytes(blob);
    expect(bytes).toEqual(PLACEHOLDER_BYTES);
  });
});

describe('captureScreenshot — peer present', () => {
  it('returns the real PNG bytes when captureRef resolves with a data URI', async () => {
    const captureRef = vi
      .fn()
      .mockResolvedValue(`data:image/png;base64,${REAL_PNG_BASE64}`);
    vi.doMock('react-native-view-shot', () => ({ captureRef }));
    const captureScreenshot = await loadCaptureScreenshot();

    const blob = await captureScreenshot({ current: null });

    expect(blob.type).toBe('image/png');
    expect(captureRef).toHaveBeenCalledTimes(1);
    expect(captureRef).toHaveBeenCalledWith(
      expect.objectContaining({ current: null }),
      { format: 'png', quality: 0.9, result: 'data-uri' },
    );

    const bytes = await blobBytes(blob);
    expect(bytes).toEqual(base64ToBytes(REAL_PNG_BASE64));
    expect(bytes).not.toEqual(PLACEHOLDER_BYTES);
  });

  it('forwards the caller-supplied quality to captureRef', async () => {
    const captureRef = vi
      .fn()
      .mockResolvedValue(`data:image/png;base64,${REAL_PNG_BASE64}`);
    vi.doMock('react-native-view-shot', () => ({ captureRef }));
    const captureScreenshot = await loadCaptureScreenshot();

    await captureScreenshot({ current: null }, { quality: 0.5 });

    expect(captureRef).toHaveBeenCalledWith(expect.anything(), {
      format: 'png',
      quality: 0.5,
      result: 'data-uri',
    });
  });

  it('returns the placeholder when captureRef rejects', async () => {
    const captureRef = vi.fn().mockRejectedValue(new Error('boom'));
    vi.doMock('react-native-view-shot', () => ({ captureRef }));
    const captureScreenshot = await loadCaptureScreenshot();

    const blob = await captureScreenshot({ current: null });

    expect(blob.type).toBe('image/png');
    const bytes = await blobBytes(blob);
    expect(bytes).toEqual(PLACEHOLDER_BYTES);
  });

  it('returns the placeholder when captureRef returns a non-data-URI string', async () => {
    const captureRef = vi.fn().mockResolvedValue('/tmp/some/tmpfile.png');
    vi.doMock('react-native-view-shot', () => ({ captureRef }));
    const captureScreenshot = await loadCaptureScreenshot();

    const blob = await captureScreenshot({ current: null });

    expect(blob.type).toBe('image/png');
    const bytes = await blobBytes(blob);
    expect(bytes).toEqual(PLACEHOLDER_BYTES);
  });

  it('caches the dynamic-import promise across captures', async () => {
    const factory = vi.fn(() => ({
      captureRef: vi
        .fn()
        .mockResolvedValue(`data:image/png;base64,${REAL_PNG_BASE64}`),
    }));
    vi.doMock('react-native-view-shot', factory);
    const captureScreenshot = await loadCaptureScreenshot();

    await captureScreenshot({ current: null });
    await captureScreenshot({ current: null });
    await captureScreenshot({ current: null });

    // The mock factory should run exactly once even though the screenshot
    // module ran three captures — the cached promise short-circuits the
    // dynamic import on every call after the first.
    expect(factory).toHaveBeenCalledTimes(1);
  });
});
