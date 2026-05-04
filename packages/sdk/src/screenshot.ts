import type { BrevwickInternal } from './core/internal';

/**
 * Options for {@link captureScreenshot}. All fields are optional.
 */
export interface CaptureScreenshotOpts {
  /**
   * Sub-tree to capture. Defaults to `document.body` (the visible page
   * content). The default is `body` rather than `document.documentElement`
   * because `modern-screenshot`'s own README examples capture against
   * `document.body`, and the inner-scroll compensation pass (see the
   * `compensateInnerScrolls` helper below) is anchored at the capture
   * root — `body` is the largest tree where every overflow:auto/scroll
   * descendant the user can see should also be compensated.
   *
   * What was previously root-caused incorrectly: the lineage of
   * "blank capture" reports against this code path
   * (brevwick-web#254 → this repo's PR #103) was originally hypothesised
   * to be an `<html>`-inside-`<foreignObject>` flow-content interaction.
   * That hypothesis was wrong. The actual cause is that
   * `modern-screenshot` resets `scrollTop`/`scrollLeft` to (0, 0) on
   * every overflow:auto/scroll descendant when it clones into the
   * `<foreignObject>`, so a Tailwind-style `<main class="overflow-y-auto">`
   * shell rasterizes the *top* of its scroll extent rather than what
   * the user is looking at. Flipping the default root from
   * `documentElement` to `body` in PR #103 incidentally exposed a
   * different (sometimes acceptable) slice of the page but did not
   * address the underlying reset; that is what the compensation pass
   * does.
   *
   * Edge cases worth knowing:
   * - Capture invoked before `<body>` parses (a `<head>` script with no
   *   `defer`, or `document.body === null`) hits the placeholder path
   *   instead of throwing.
   * - Nodes portalled outside `<body>` (browser extensions injecting
   *   into `<html>`, atypical portal libraries) are no longer inside
   *   the capture tree. Most React/Solid/Vue portals land in
   *   `document.body` and are unaffected.
   * - Only *descendants* marked with `[data-brevwick-skip]` are scrubbed
   *   before capture — a skip marker on the root element itself is
   *   ignored (hiding the capture target would produce an empty image).
   *   Skip markers outside the sub-tree are left untouched.
   * - Inner overflow:auto/scroll containers are compensated for their
   *   live `scrollTop`/`scrollLeft` so the capture matches what the
   *   user sees. `position: sticky` direct children of those containers
   *   are translated like any other child and lose their sticky-binding
   *   in the rasterized output — see the `compensateInnerScrolls`
   *   JSDoc for the full limitation list.
   *
   * Real-browser test coverage: rasterized-output regressions can only
   * be caught by a real browser canvas (the SDK test suite runs under
   * happy-dom, which has no functional 2D context). Tracked in
   * https://github.com/tatlacas-com/brevwick-sdk-js/issues/104 — link
   * any new "blank screenshot" report there before opening a duplicate.
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

/**
 * Inner-scroll compensation. `modern-screenshot` clones the capture
 * subtree into an SVG `<foreignObject>`; the clone resets
 * `scrollTop`/`scrollLeft` on every overflow:auto/scroll descendant
 * to (0, 0), so a page whose visible content lives inside a Tailwind
 * `<main class="overflow-y-auto">` (or any in-app scroll container)
 * rasterizes the TOP of that container's scroll extent instead of what
 * the user is looking at. That manifests as a mostly-blank or
 * partial-content WebP — the failure mode reported repeatedly against
 * the React SDK (brevwick-web#254 lineage; PR #103 in this repo flipped
 * the default capture root from `documentElement` to `body` in response
 * but did not address the underlying inner-scroll reset).
 *
 * Approach: walk overflow:auto/scroll descendants of the capture root
 * with non-zero `scrollTop`/`scrollLeft`, leave their `overflow` clip
 * in place, and translate each direct element child by
 * `(-scrollLeft, -scrollTop)` with `transform-origin: 0 0`. The clone
 * inherits the live tree's computed styles (including this transform)
 * before reparenting, so the rasterized output matches what the user
 * sees — modulo the limitations called out below.
 *
 * Concurrency: same WeakMap ref-count pattern as `scrubSkippedNodes`.
 * Two overlapping captures see the same scroll offset (no paint occurs
 * between them), so the second pass is a no-op on already-translated
 * children, and the original transform is only restored when the last
 * concurrent capture releases its ref.
 *
 * Known limitations (called out for future iteration):
 *  - `position: sticky` direct children are translated like any other,
 *    losing their sticky-binding. The cloned tree has no scroll, so
 *    even leaving them un-translated would not preserve the stuck
 *    position. Faithful sticky reconstruction needs per-child geometry
 *    computation; deferred.
 *  - Existing inline `style.transform` on a direct child is composed
 *    by *prepending* the translate. Composition with a non-default
 *    `transform-origin` on the child can shift slightly versus the
 *    live tree — rare in practice, would surface as a small visual
 *    offset on transformed widgets, never as the blank-capture bug.
 *  - Window scroll (`html.scrollTop`/`body.scrollTop`) is left to
 *    `modern-screenshot`'s own viewport handling — only inner
 *    overflow containers are compensated here.
 */
interface ScrollCompensation {
  child: HTMLElement;
}

const scrollStashedTransform = new WeakMap<HTMLElement, string>();
const scrollStashedOrigin = new WeakMap<HTMLElement, string>();
const scrollCompRefCount = new WeakMap<HTMLElement, number>();

function isScrollableContainer(el: HTMLElement): boolean {
  if (el.scrollTop === 0 && el.scrollLeft === 0) return false;
  const view = el.ownerDocument?.defaultView;
  if (!view) return false;
  const cs = view.getComputedStyle(el);
  const overflow = `${cs.overflow} ${cs.overflowX} ${cs.overflowY}`;
  if (!/auto|scroll/.test(overflow)) return false;
  return (
    el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1
  );
}

function compensateInnerScrolls(
  root: Document | HTMLElement,
): ScrollCompensation[] {
  const candidates = root.querySelectorAll<HTMLElement>('*');
  const records: ScrollCompensation[] = [];
  candidates.forEach((el) => {
    if (!isScrollableContainer(el)) return;
    const dx = -el.scrollLeft;
    const dy = -el.scrollTop;
    if (dx === 0 && dy === 0) return;
    for (
      let child = el.firstElementChild;
      child;
      child = child.nextElementSibling
    ) {
      if (!(child instanceof HTMLElement)) continue;
      const count = scrollCompRefCount.get(child) ?? 0;
      if (count === 0) {
        scrollStashedTransform.set(child, child.style.transform);
        scrollStashedOrigin.set(child, child.style.transformOrigin);
        const existing = child.style.transform;
        child.style.transform = existing
          ? `translate(${dx}px, ${dy}px) ${existing}`
          : `translate(${dx}px, ${dy}px)`;
        child.style.transformOrigin = '0 0';
      }
      scrollCompRefCount.set(child, count + 1);
      records.push({ child });
    }
  });
  return records;
}

function restoreInnerScrolls(records: ScrollCompensation[]): void {
  for (const { child } of records) {
    const count = (scrollCompRefCount.get(child) ?? 1) - 1;
    if (count <= 0) {
      child.style.transform = scrollStashedTransform.get(child) ?? '';
      child.style.transformOrigin = scrollStashedOrigin.get(child) ?? '';
      scrollCompRefCount.delete(child);
      scrollStashedTransform.delete(child);
      scrollStashedOrigin.delete(child);
    } else {
      scrollCompRefCount.set(child, count);
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
        count: 1,
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

  // Default to `document.body`, not `document.documentElement`. The
  // brevwick-web reproduction in tatlacas-com/brevwick-web#254 yielded a
  // ~2 KiB blank image with the `documentElement` default; switching to
  // `body` fixes the symptom there and matches `modern-screenshot`'s
  // README examples. Hypothesis (unverified): `<html>` inside an SVG
  // `<foreignObject>` is not flow content and rasterizes blank in some
  // Chromium builds. See JSDoc on `CaptureScreenshotOpts.element` for
  // the provisional reasoning.
  const element = opts?.element ?? document.body;
  if (!element) {
    logFailure(internal, new Error('document.body is not available'));
    return placeholderBlob();
  }
  const quality = opts?.quality ?? DEFAULT_QUALITY;
  // Declared outside the try so `finally` can always run, even if the
  // initial scrub or scroll-compensation pass throws (malformed
  // selector / host-env quirks on a non-standard root).
  let skipped: SkippedNode[] = [];
  let scrollComps: ScrollCompensation[] = [];

  try {
    skipped = scrubSkippedNodes(element);
    scrollComps = compensateInnerScrolls(element);
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
    restoreInnerScrolls(scrollComps);
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
