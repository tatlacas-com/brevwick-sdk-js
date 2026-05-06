/**
 * `pickFiles()` — RN file-picker abstraction. Required scenarios:
 *   - both peers absent → resolves to null + console warning
 *   - expo present + cancel → resolves to []
 *   - expo present + assets → normalised PickedFile[]
 *   - expo absent + bare present + assets → normalised PickedFile[]
 *   - bare present + cancel (isCancel) → resolves to []
 *   - both peers absent through expo's catch fallthrough → null
 *
 * Each test resets the module cache so the next `import()` sees the fresh
 * `vi.doMock` registration; the picker's internal Promise-typed module
 * slots would otherwise lock in the first scenario's surface.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

async function loadPicker(): Promise<typeof import('../file-picker')> {
  const mod = await import('../file-picker');
  mod.__resetFilePickerModuleCacheForTest();
  return mod;
}

beforeEach(() => {
  vi.resetModules();
});

afterEach(() => {
  vi.doUnmock('expo-document-picker');
  vi.doUnmock('react-native-document-picker');
  vi.restoreAllMocks();
});

describe('pickFiles — peer-dep absence', () => {
  it('resolves to null and warns when neither peer is installed', async () => {
    vi.doMock('expo-document-picker', () => {
      throw new Error('Cannot find module expo-document-picker');
    });
    vi.doMock('react-native-document-picker', () => {
      throw new Error('Cannot find module react-native-document-picker');
    });
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const { pickFiles } = await loadPicker();
    const result = await pickFiles();

    expect(result).toBeNull();
    expect(warnSpy).toHaveBeenCalled();
    expect(warnSpy.mock.calls[0]![0]).toMatch(
      /no document-picker peer installed/,
    );
  });
});

describe('pickFiles — expo path', () => {
  it('resolves to an empty array when the user cancels the picker', async () => {
    vi.doMock('expo-document-picker', () => ({
      getDocumentAsync: vi.fn().mockResolvedValue({ canceled: true }),
    }));
    const { pickFiles } = await loadPicker();
    const result = await pickFiles();
    expect(result).toEqual([]);
  });

  it('normalises picked assets into PickedFile descriptors', async () => {
    vi.doMock('expo-document-picker', () => ({
      getDocumentAsync: vi.fn().mockResolvedValue({
        canceled: false,
        assets: [
          {
            uri: 'file:///tmp/a.png',
            name: 'a.png',
            size: 123,
            mimeType: 'image/png',
          },
          // size + mimeType missing — defaults to 0 / undefined.
          { uri: 'file:///tmp/b.bin', name: 'b.bin' },
        ],
      }),
    }));
    const { pickFiles } = await loadPicker();
    const result = await pickFiles();
    expect(result).toEqual([
      {
        uri: 'file:///tmp/a.png',
        name: 'a.png',
        size: 123,
        mimeType: 'image/png',
      },
      {
        uri: 'file:///tmp/b.bin',
        name: 'b.bin',
        size: 0,
        mimeType: undefined,
      },
    ]);
  });

  it('falls through to the bare picker when the expo call rejects', async () => {
    vi.doMock('expo-document-picker', () => ({
      getDocumentAsync: vi.fn().mockRejectedValue(new Error('expo offline')),
    }));
    vi.doMock('react-native-document-picker', () => ({
      pick: vi.fn().mockResolvedValue([
        {
          uri: 'file:///tmp/c.txt',
          name: 'c.txt',
          size: 5,
          type: 'text/plain',
        },
      ]),
      types: { allFiles: '*/*' },
      isCancel: () => false,
    }));
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { pickFiles } = await loadPicker();
    const result = await pickFiles();
    expect(result).toEqual([
      {
        uri: 'file:///tmp/c.txt',
        name: 'c.txt',
        size: 5,
        mimeType: 'text/plain',
      },
    ]);
    expect(warnSpy).toHaveBeenCalled();
  });
});

describe('pickFiles — bare RN path', () => {
  it('resolves to an empty array when bare-RN reports cancellation via isCancel', async () => {
    vi.doMock('expo-document-picker', () => {
      throw new Error('not installed');
    });
    const cancelErr = new Error('cancelled');
    vi.doMock('react-native-document-picker', () => ({
      pick: vi.fn().mockRejectedValue(cancelErr),
      types: { allFiles: '*/*' },
      isCancel: (e: unknown) => e === cancelErr,
    }));
    const { pickFiles } = await loadPicker();
    const result = await pickFiles();
    expect(result).toEqual([]);
  });

  it('warns and resolves to null when bare-RN throws a non-cancel error', async () => {
    vi.doMock('expo-document-picker', () => {
      throw new Error('not installed');
    });
    vi.doMock('react-native-document-picker', () => ({
      pick: vi.fn().mockRejectedValue(new Error('intent broadcast failed')),
      types: { allFiles: '*/*' },
      isCancel: () => false,
    }));
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { pickFiles } = await loadPicker();
    const result = await pickFiles();
    expect(result).toBeNull();
    expect(warnSpy).toHaveBeenCalled();
  });
});

describe('uriToBlob', () => {
  it('reads the URI through fetch and resolves the response Blob', async () => {
    const fakeBlob = new Blob(['x'], { type: 'text/plain' });
    const fetchMock = vi.fn(
      async () =>
        ({
          blob: () => Promise.resolve(fakeBlob),
        }) as unknown as Response,
    );
    vi.stubGlobal('fetch', fetchMock);
    try {
      const { uriToBlob } = await loadPicker();
      const result = await uriToBlob('file:///tmp/a');
      expect(result).toBe(fakeBlob);
      expect(fetchMock).toHaveBeenCalledWith('file:///tmp/a');
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('returns null and warns when fetch rejects', async () => {
    const fetchMock = vi.fn(async () => {
      throw new Error('uri revoked');
    });
    vi.stubGlobal('fetch', fetchMock);
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const { uriToBlob } = await loadPicker();
      const result = await uriToBlob('file:///tmp/a');
      expect(result).toBeNull();
      expect(warnSpy).toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
