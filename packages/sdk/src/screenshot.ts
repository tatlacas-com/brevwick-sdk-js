import type { BrevwickInternal } from './core/internal';

export interface CaptureScreenshotOpts {
  element?: HTMLElement;
  quality?: number;
}

const DEFAULT_QUALITY = 0.85;
const MIME = 'image/webp';

// Base64-encoded 1×1 transparent VP8L WebP. Used when capture fails so
// callers that depend on `.attachments[].blob` still get a valid image type.
const PLACEHOLDER_WEBP_BASE64 =
  'UklGRhoAAABXRUJQVlA4TA0AAAAvAAAAEAcQERGIiP4HAA==';

function placeholderBlob(): Blob {
  const binary = atob(PLACEHOLDER_WEBP_BASE64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: MIME });
}

function isValidImageBlob(value: unknown): value is Blob {
  return (
    value instanceof Blob &&
    value.size > 0 &&
    typeof value.type === 'string' &&
    value.type.startsWith('image/')
  );
}

interface SkippedNode {
  element: HTMLElement;
  original: string;
}

function scrubSkippedNodes(root: Document | HTMLElement): SkippedNode[] {
  const nodes = root.querySelectorAll<HTMLElement>('[data-brevwick-skip]');
  const stashed: SkippedNode[] = [];
  nodes.forEach((el) => {
    stashed.push({ element: el, original: el.style.visibility });
    el.style.visibility = 'hidden';
  });
  return stashed;
}

function restoreSkippedNodes(nodes: SkippedNode[]): void {
  for (const { element, original } of nodes) {
    element.style.visibility = original;
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
    internal.push({
      kind: 'console',
      level: 'warn',
      message,
      timestamp: Date.now(),
    });
    return;
  }
  // Fallback when invoked outside a Brevwick instance — the console ring, once
  // installed, patches console.warn so the entry is still captured.
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
  const skipped = scrubSkippedNodes(element);

  try {
    const mod = await import('modern-screenshot');
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
