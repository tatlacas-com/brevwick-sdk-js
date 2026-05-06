/**
 * File-attachment picker abstraction for the React Native widget. Mirrors
 * the web React adapter's `<input type="file" multiple>` flow by surfacing
 * a single `pickFiles()` entry point that returns a normalised array of
 * picked file descriptors regardless of which native picker is available.
 *
 * Two optional peer dependencies are supported, in priority order:
 *
 *  1. **`expo-document-picker`** — the dominant picker for Expo-managed
 *     apps. Auto-installed by the `expo install` flow and works out of the
 *     box in Expo Go on iOS / Android. Picked first because Expo apps make
 *     up the bulk of new RN deployments.
 *
 *  2. **`react-native-document-picker`** — the bare React Native picker.
 *     Picked second so consumers who explicitly install it (e.g. ejected
 *     Expo apps or apps targeting fabric/turbomodules) get the bare path
 *     even if `expo-document-picker` is also transitively present.
 *
 * If neither peer is installed `pickFiles()` resolves to `null` and logs a
 * one-line console warning. The caller can use the `null` to surface an
 * inline note rather than failing silently — the screenshot peer follows
 * the same "graceful fallback + visible warning" pattern in
 * {@link `./screenshot.ts`}.
 *
 * Both peers are dynamically imported (`await import(...)` cached behind a
 * Promise-typed module slot) so the cost of holding a reference is paid
 * exactly once per app session, and only when the user actually taps the
 * paperclip — the modal does not fetch either picker on mount.
 */

/**
 * Normalised shape returned by {@link pickFiles}. Same field set the web
 * adapter's `File` carries (`name`, `size`, `type`) plus a `uri` so the
 * caller can later `fetch(uri).then(r => r.blob())` to materialise the
 * bytes for the SDK's submit pipeline.
 */
export interface PickedFile {
  uri: string;
  name: string;
  size: number;
  mimeType?: string;
}

/** Internal alias for the dynamic-import module slot. */
type ExpoModule = typeof import('expo-document-picker');
type BareModule = typeof import('react-native-document-picker');

let expoPromise: Promise<ExpoModule | null> | undefined;
let barePromise: Promise<BareModule | null> | undefined;

function loadExpo(): Promise<ExpoModule | null> {
  if (!expoPromise) {
    expoPromise = import('expo-document-picker').catch(() => null);
  }
  return expoPromise;
}

function loadBare(): Promise<BareModule | null> {
  if (!barePromise) {
    barePromise = import('react-native-document-picker').catch(() => null);
  }
  return barePromise;
}

function logPickerFailure(reason: unknown): void {
  const message =
    'brevwick: document picker failed' +
    (reason instanceof Error ? `: ${reason.message}` : '');
  globalThis.console?.warn?.(message);
}

/**
 * Open the platform document picker and resolve with the picked files,
 * an empty array if the user cancelled, or `null` if no compatible peer
 * is installed. Never rejects — preserves the SDK's never-throws contract
 * for surfaces the widget composes against.
 *
 * @param opts.multiple Whether to allow multi-select. Defaults to `true`
 *   so the picker matches the web adapter's `<input multiple>` semantics.
 */
export async function pickFiles(opts?: {
  multiple?: boolean;
}): Promise<readonly PickedFile[] | null> {
  const multiple = opts?.multiple ?? true;

  // ---- 1. Expo path -----------------------------------------------------
  const expo = await loadExpo();
  if (expo && typeof expo.getDocumentAsync === 'function') {
    try {
      const res = await expo.getDocumentAsync({
        multiple,
        copyToCacheDirectory: true,
      });
      if (res.canceled) return [];
      return (res.assets ?? []).map<PickedFile>((asset) => ({
        uri: asset.uri,
        name: asset.name,
        size: asset.size ?? 0,
        mimeType: asset.mimeType,
      }));
    } catch (err) {
      logPickerFailure(err);
      // Fall through — bare-RN may still be available below.
    }
  }

  // ---- 2. Bare React Native path ---------------------------------------
  const bare = await loadBare();
  if (bare && typeof bare.pick === 'function') {
    const allFiles =
      (bare.types as Record<string, string> | undefined)?.allFiles ?? '*/*';
    try {
      const res = await bare.pick({
        allowMultiSelection: multiple,
        type: [allFiles],
      });
      return res.map<PickedFile>((entry) => ({
        uri: entry.uri,
        name: entry.name ?? 'attachment',
        size: entry.size ?? 0,
        mimeType: entry.type ?? undefined,
      }));
    } catch (err) {
      // The bare picker rejects with a tagged error on cancellation; we
      // map that to an empty array (same shape as the expo `canceled`
      // branch) so the caller doesn't have to special-case the surface.
      if (typeof bare.isCancel === 'function' && bare.isCancel(err)) {
        return [];
      }
      logPickerFailure(err);
    }
  }

  // Neither peer installed — the caller surfaces the disabled affordance.
  globalThis.console?.warn?.(
    'brevwick: no document-picker peer installed (install expo-document-picker or react-native-document-picker to enable file attachments)',
  );
  return null;
}

/**
 * Resolve a `file://` (or `content://`) URI returned by the picker into a
 * `Blob` the SDK's submit pipeline can consume. Returns `null` on failure
 * — callers should drop the offending entry rather than aborting the
 * submit, mirroring the web adapter's permissive read-error handling.
 *
 * Implemented via `fetch(uri).then(r => r.blob())` because that's the only
 * standard surface RN's Hermes runtime exposes for arbitrary local-file
 * reads. Hermes ≥ 0.71 (the package's peer floor) supports `fetch` against
 * `file://` URIs out of the box; older runtimes are out of support per the
 * peer range in `package.json`.
 */
export async function uriToBlob(uri: string): Promise<Blob | null> {
  try {
    const res = await fetch(uri);
    return await res.blob();
  } catch (err) {
    logPickerFailure(err);
    return null;
  }
}

/**
 * Test-only seam — drops cached dynamic-import promises so the next call
 * re-runs the imports against whatever `vi.doMock` has been set up.
 */
export function __resetFilePickerModuleCacheForTest(): void {
  expoPromise = undefined;
  barePromise = undefined;
}
