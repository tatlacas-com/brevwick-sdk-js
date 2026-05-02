/**
 * Native widget-tree capture for React Native. Mirrors the placeholder
 * semantics of {@link `packages/sdk/src/screenshot.ts`} so the never-throws
 * SDK contract (SDD § 12) holds across both the DOM and the RN paths:
 * a capture failure resolves to a 1×1 transparent PNG instead of rejecting,
 * and callers that always attach the result still see a valid image blob.
 *
 * The `react-native-view-shot` peer dep is OPTIONAL. In Expo Go (no custom
 * dev client) the native module is not available and `import('react-native-
 * view-shot')` throws — we catch and fall through to the placeholder. The
 * same path runs when the consumer simply has not installed the peer.
 *
 * Skip semantics: any `<BrevwickSkip>` subtrees registered at capture time
 * are hidden via `setNativeProps({ opacity: 0 })` for the rasterised frame
 * and restored on the way out, including on the failure path. The hide /
 * restore is refcount-aware so concurrent captures cannot strand the UI
 * hidden — see {@link `./skip`}.
 */
import type { RefObject } from 'react';
import type { View } from 'react-native';
import {
  hideRegisteredSkipViews,
  restoreSkippedViews,
  type SkipSnapshot,
} from './skip';

const MIME = 'image/png';
const DEFAULT_QUALITY = 0.9;

// Standard 1×1 transparent PNG (68 bytes after base64 decode). Used when
// capture fails so callers that depend on `.attachments[].blob` still get
// a valid `image/png` blob — the same rationale as the WebP placeholder in
// `packages/sdk/src/screenshot.ts`. The PNG MIME (vs the core's WebP) is
// chosen here because Hermes's image decoder support varies by version, but
// every supported RN release has a PNG decoder; downstream consumers (the
// Brevwick triage UI) accept both.
const PLACEHOLDER_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

const PLACEHOLDER_BUFFER: ArrayBuffer = ((): ArrayBuffer => {
  const binary = atob(PLACEHOLDER_PNG_BASE64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
})();

function placeholderBlob(): Blob {
  return new Blob([PLACEHOLDER_BUFFER], { type: MIME });
}

type ViewShotModule = typeof import('react-native-view-shot');

/**
 * Cached promise of the dynamic `react-native-view-shot` import. Mirrors the
 * `modernScreenshotPromise` cache in `packages/sdk/src/screenshot.ts`: the
 * host's module loader already memoises ES dynamic imports, but holding our
 * own reference avoids the test-runner edge case where concurrent imports of
 * the same specifier deadlock under aggressive module-cache reset, and it
 * lets `__resetScreenshotModuleCacheForTest()` reset state between cases.
 */
let viewShotPromise: Promise<ViewShotModule | null> | undefined;

function loadViewShot(): Promise<ViewShotModule | null> {
  if (!viewShotPromise) {
    viewShotPromise = import('react-native-view-shot').catch(() => null);
  }
  return viewShotPromise;
}

function logFailure(reason: unknown): void {
  const message =
    'brevwick: screenshot capture failed, using placeholder' +
    (reason instanceof Error ? `: ${reason.message}` : '');
  globalThis.console?.warn?.(message);
}

function dataUriToBlob(uri: string): Blob | null {
  const comma = uri.indexOf(',');
  if (comma < 0) return null;
  const header = uri.slice(0, comma);
  const payload = uri.slice(comma + 1);
  const mimeMatch = /^data:([^;,]+)/.exec(header);
  const type = mimeMatch?.[1] ?? MIME;
  // Mirror the core's `isValidImageBlob` invariant
  // (`packages/sdk/src/screenshot.ts`): if the data URI declares a non-image
  // MIME family (a buggy native `captureRef` or a payload swap), refuse it
  // here so the caller falls through to the placeholder instead of forwarding
  // arbitrary `text/plain` / `application/octet-stream` bytes downstream.
  if (!type.startsWith('image/')) return null;
  const isBase64 = /;base64/i.test(header);
  if (!isBase64) {
    return new Blob([decodeURIComponent(payload)], { type });
  }
  const binary = atob(payload);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes.buffer], { type });
}

/**
 * Options for {@link captureScreenshot}.
 */
export interface CaptureScreenshotOpts {
  /**
   * Encoder quality forwarded to `react-native-view-shot`'s `captureRef`.
   * Range `0..1`; defaults to `0.9`. Lossy formats only — PNG ignores it,
   * but the option is plumbed through anyway so the call site does not need
   * to branch on format.
   */
  quality?: number;
}

/**
 * Capture a screenshot of the React Native view tree rooted at `viewRef`.
 *
 * Returns a PNG `Blob` on success; a 1×1 transparent PNG placeholder when
 * the `react-native-view-shot` peer dep is not installed (Expo Go scenario)
 * or the capture itself fails. Never rejects — preserves the SDK's
 * never-throws contract from SDD § 12.
 *
 * `viewRef` may point to any RN View-like instance (`<View>`, a custom class
 * component with a forwarded ref, etc.). Passing `null`/an unmounted ref
 * returns the placeholder.
 *
 * @remarks
 * **Hermes `crypto.subtle` caveat (downstream).** The core submit pipeline
 * (`packages/sdk/src/submit.ts`) hashes attachment bytes via
 * `crypto.subtle.digest('SHA-256', buf)` to satisfy the presign integrity
 * contract. React Native's Hermes runtime does NOT ship `crypto.subtle`, so
 * once the RN provider (#83) and `useFeedback` hook (#84) wire this function
 * into the submit pipeline the hashing step will throw on device. This
 * function itself is unaffected — it only forwards a `Blob`. The integration
 * gap is tracked in #99: a host-supplied `digest` capability or pure-JS
 * fallback must land in core's submit before the RN adapter can submit.
 */
export async function captureScreenshot(
  viewRef: RefObject<View | null>,
  opts?: CaptureScreenshotOpts,
): Promise<Blob> {
  const quality = opts?.quality ?? DEFAULT_QUALITY;
  let snapshot: SkipSnapshot | null = null;

  try {
    const mod = await loadViewShot();
    if (!mod || typeof mod.captureRef !== 'function') {
      logFailure(new Error('react-native-view-shot peer not installed'));
      return placeholderBlob();
    }

    snapshot = hideRegisteredSkipViews();
    const dataUri = await mod.captureRef(viewRef, {
      format: 'png',
      quality,
      result: 'data-uri',
    });

    if (typeof dataUri !== 'string' || !dataUri.startsWith('data:')) {
      logFailure(new Error('captureRef returned unexpected payload'));
      return placeholderBlob();
    }

    const blob = dataUriToBlob(dataUri);
    if (!blob || blob.size === 0) {
      logFailure(new Error('captureRef returned empty bytes'));
      return placeholderBlob();
    }
    return blob;
  } catch (err) {
    logFailure(err);
    return placeholderBlob();
  } finally {
    if (snapshot !== null) restoreSkippedViews(snapshot);
  }
}

/**
 * Test-only seam — drops the cached `react-native-view-shot` import promise
 * so the next `captureScreenshot` re-runs the dynamic import (with whatever
 * `vi.doMock` has been set up). Production callers never invoke this.
 */
export function __resetScreenshotModuleCacheForTest(): void {
  viewShotPromise = undefined;
}
