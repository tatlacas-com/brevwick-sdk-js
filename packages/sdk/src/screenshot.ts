import type { BrevwickInternal } from './core/internal';

/**
 * Options for {@link captureScreenshot}. All fields are optional.
 */
export interface CaptureScreenshotOpts {
  /**
   * Sub-tree to capture. Defaults to `document.documentElement` (the full
   * page). Only `[data-brevwick-skip]` nodes *within* this element are
   * scrubbed before capture — skip markers outside the sub-tree are left
   * untouched.
   */
  element?: HTMLElement;
  /**
   * WebP encoder quality in the range `0..1`. Forwarded verbatim to
   * `modern-screenshot`'s `domToBlob`. Defaults to `0.85`.
   */
  quality?: number;
}

const DEFAULT_QUALITY = 0.85;
const MIME = 'image/webp';

// Base64-encoded 1×1 transparent VP8L WebP. Used when capture fails so
// callers that depend on `.attachments[].blob` still get a valid image type.
const PLACEHOLDER_WEBP_BASE64 =
  'UklGRhoAAABXRUJQVlA4TA0AAAAvAAAAEAcQERGIiP4HAA==';

// Decode once at module load — the bytes are immutable, and every failure
// path previously re-ran `atob` + the byte-copy loop. The returned Blob must
// still be fresh per call because consumers may hold and revoke URLs from it.
// Store the underlying ArrayBuffer (not the view) so `new Blob([...])` types
// cleanly under TS `strict` without widening to `ArrayBufferLike`.
const PLACEHOLDER_BUFFER: ArrayBuffer = ((): ArrayBuffer => {
  const binary = atob(PLACEHOLDER_WEBP_BASE64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
})();

function placeholderBlob(): Blob {
  return new Blob([PLACEHOLDER_BUFFER], { type: MIME });
}

/**
 * Cache the first `import('modern-screenshot')` Promise so subsequent captures
 * reuse the resolved module. ES dynamic import is already host-cached, but
 * holding our own reference avoids a class of test-runner issues where
 * concurrent `await import` of the same specifier can deadlock under
 * aggressive module-cache reset.
 */
let modernScreenshotPromise:
  | Promise<typeof import('modern-screenshot')>
  | undefined;

function loadModernScreenshot(): Promise<typeof import('modern-screenshot')> {
  if (!modernScreenshotPromise) {
    modernScreenshotPromise = import('modern-screenshot');
  }
  return modernScreenshotPromise;
}

function isValidImageBlob(value: unknown): value is Blob {
  return (
    value instanceof Blob &&
    value.size > 0 &&
    typeof value.type === 'string' &&
    value.type.startsWith('image/')
  );
}

/**
 * Scrub/restore uses a reference-counted WeakMap keyed by element so concurrent
 * captures that touch overlapping skip sets remain correct:
 *
 * - The FIRST scrub stashes the real, caller-visible `style.visibility`.
 * - Subsequent concurrent scrubs see a live count > 0 and do NOT restash —
 *   otherwise they'd stash the already-mutated `'hidden'` and leave the node
 *   permanently hidden when the outer capture restores.
 * - The LAST restore (count drops to 0) writes the stashed value back.
 *
 * The maps are WeakMaps so detached elements are garbage-collected normally.
 */
const stashedOriginal = new WeakMap<HTMLElement, string>();
const skipRefCount = new WeakMap<HTMLElement, number>();

interface SkippedNode {
  element: HTMLElement;
}

function scrubSkippedNodes(root: Document | HTMLElement): SkippedNode[] {
  const nodes = root.querySelectorAll<HTMLElement>('[data-brevwick-skip]');
  const stashed: SkippedNode[] = [];
  nodes.forEach((el) => {
    const count = skipRefCount.get(el) ?? 0;
    if (count === 0) {
      stashedOriginal.set(el, el.style.visibility);
    }
    skipRefCount.set(el, count + 1);
    el.style.visibility = 'hidden';
    stashed.push({ element: el });
  });
  return stashed;
}

function restoreSkippedNodes(nodes: SkippedNode[]): void {
  for (const { element } of nodes) {
    const count = (skipRefCount.get(element) ?? 1) - 1;
    if (count <= 0) {
      const original = stashedOriginal.get(element) ?? '';
      element.style.visibility = original;
      skipRefCount.delete(element);
      stashedOriginal.delete(element);
    } else {
      skipRefCount.set(element, count);
    }
  }
}

function logFailure(
  internal: BrevwickInternal | undefined,
  reason: unknown,
): void {
  const message =
    'brevwick: screenshot capture failed, using placeholder' +
    (reason instanceof Error ? `: ${reason.message}` : '');
  if (internal) {
    try {
      internal.push({
        kind: 'console',
        level: 'warn',
        message,
        timestamp: Date.now(),
      });
      return;
    } catch {
      // A throwing `entry` bus listener must not escape the "never throws"
      // contract. Fall through to the global console so the message is not
      // silently dropped.
    }
  }
  // Fallback when invoked outside a Brevwick instance, or when the internal
  // push path rejected. The console ring, once installed, patches
  // console.warn so the entry is still captured in the happy case.
  globalThis.console?.warn?.(message);
}

async function capture(
  opts: CaptureScreenshotOpts | undefined,
  internal: BrevwickInternal | undefined,
): Promise<Blob> {
  if (typeof document === 'undefined') {
    logFailure(internal, new Error('document is not available'));
    return placeholderBlob();
  }

  const element = opts?.element ?? document.documentElement;
  const quality = opts?.quality ?? DEFAULT_QUALITY;
  // Declared outside the try so `finally` can always run, even if the
  // initial scrub throws (malformed selector / host-env quirks on a
  // non-standard root).
  let skipped: SkippedNode[] = [];

  try {
    skipped = scrubSkippedNodes(element);
    const mod = await loadModernScreenshot();
    const result = await mod.domToBlob(element, { quality, type: MIME });
    if (!isValidImageBlob(result)) {
      logFailure(internal, new Error('domToBlob returned no blob'));
      return placeholderBlob();
    }
    return result;
  } catch (err) {
    logFailure(internal, err);
    return placeholderBlob();
  } finally {
    restoreSkippedNodes(skipped);
  }
}

/**
 * Capture a screenshot of the current document (or a given element) as a WebP
 * Blob. Scrubs `[data-brevwick-skip]` nodes before capture and restores them
 * afterwards, even on failure. Never throws — a capture failure yields a 1×1
 * transparent placeholder so callers that always attach the result still get a
 * valid image/webp blob.
 */
export async function captureScreenshot(
  opts?: CaptureScreenshotOpts,
): Promise<Blob> {
  return capture(opts, undefined);
}

/**
 * Internal variant: pushes failure diagnostics into the owning Brevwick
 * instance's console ring instead of falling back to `console.warn`. Not part
 * of the public SDK surface — wired only from `Brevwick.captureScreenshot()`.
 */
export async function captureScreenshotForInstance(
  internal: BrevwickInternal,
  opts?: CaptureScreenshotOpts,
): Promise<Blob> {
  return capture(opts, internal);
}
