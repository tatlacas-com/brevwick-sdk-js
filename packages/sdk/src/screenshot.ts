import type { BrevwickInternal } from './core/internal';
import { placeholderBlob } from './screenshot-fallback';

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
   * "blank capture" reports against this code path (this repo's PR #103)
   * was originally hypothesised to be an `<html>`-inside-`<foreignObject>`
   * flow-content interaction.
   * That hypothesis was wrong. The empirically observed cloning
   * behaviour of `modern-screenshot` is that `scrollTop`/`scrollLeft`
   * land at (0, 0) on every overflow:auto/scroll descendant once the
   * subtree has been cloned into the `<foreignObject>` — so a
   * Tailwind-style `<main class="overflow-y-auto">` shell rasterizes
   * the *top* of its scroll extent rather than what the user is
   * looking at. (We have not pinned this to a Chromium issue or a
   * specific `modern-screenshot` source line; it is the observable
   * outcome the compensation pass below corrects for.) Flipping the
   * default root from `documentElement` to `body` in PR #103
   * incidentally exposed a different (sometimes acceptable) slice of
   * the page but did not address the underlying reset; that is what
   * the compensation pass does.
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
   * - Inner overflow:auto/scroll containers — including the capture
   *   root itself, when it is scrollable — are compensated for their
   *   live `scrollTop`/`scrollLeft` so the capture matches what the
   *   user sees. `position: sticky` and `position: fixed` direct
   *   children of those containers are explicitly skipped by the
   *   compensation pass — translating a pinned element by
   *   `-scrollTop` would rasterize it off the top of the captured
   *   frame; leaving them un-translated lets them render at their
   *   intrinsic flow position in the clone (roughly where the user
   *   sees a `top:0`-stuck header). See the `compensateInnerScrolls`
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

/**
 * Cache the first `import('modern-screenshot')` Promise so subsequent captures
 * reuse the resolved module. ES dynamic import is already host-cached, but
 * holding our own reference avoids a class of test-runner issues where
 * concurrent `await import` of the same specifier can deadlock under
 * aggressive module-cache reset.
 *
 * The cache is dropped again if the import REJECTS: a transient chunk-load
 * failure (flaky network, captive portal, mid-deploy 404 that later heals)
 * must not poison every subsequent capture for the lifetime of the page —
 * before this reset, one failed load meant placeholder screenshots forever,
 * even after connectivity recovered. The `.catch` below also guarantees the
 * cached rejection always has at least one handler, so it can never surface
 * as an unhandled rejection even if no capture is awaiting it.
 */
let modernScreenshotPromise:
  | Promise<typeof import('modern-screenshot')>
  | undefined;

function loadModernScreenshot(): Promise<typeof import('modern-screenshot')> {
  if (!modernScreenshotPromise) {
    const attempt = import('modern-screenshot');
    modernScreenshotPromise = attempt;
    attempt.catch(() => {
      // Only clear the cache if no newer attempt has replaced it.
      if (modernScreenshotPromise === attempt) {
        modernScreenshotPromise = undefined;
      }
    });
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
 * subtree into an SVG `<foreignObject>`; the empirically observed
 * clone-time outcome is that `scrollTop`/`scrollLeft` land at (0, 0)
 * on every overflow:auto/scroll descendant of the capture root. A
 * page whose visible content lives inside a Tailwind
 * `<main class="overflow-y-auto">` (or any in-app scroll container)
 * therefore rasterizes the TOP of that container's scroll extent
 * instead of what the user is looking at. That manifests as a
 * mostly-blank or partial-content WebP — the failure mode reported
 * repeatedly against the React SDK (PR #103 in this repo flipped the
 * default capture root from `documentElement` to `body` in response
 * but did not address the underlying inner-scroll reset). We have not pinned this to a Chromium issue
 * or a specific `modern-screenshot` source line; the compensation
 * pass corrects the observable symptom rather than the upstream cause.
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
 * Known limitations:
 *  - `position: sticky` and `position: fixed` direct children are
 *    explicitly skipped. Translating a `top:0`-stuck header by
 *    `-scrollTop` would rasterize it off the top of the captured
 *    frame entirely (re-introducing the partial-blank symptom this
 *    pass is here to fix). Skipping leaves them at their intrinsic
 *    flow position in the clone — not pixel-perfect, but strictly
 *    better than translating off-screen. Faithful sticky/fixed
 *    reconstruction needs per-child geometry computation.
 *  - Existing inline `style.transform` on a direct child is composed
 *    by *prepending* the translate. Composition with a non-default
 *    `transform-origin` on the child can shift slightly versus the
 *    live tree — rare in practice, would surface as a small visual
 *    offset on transformed widgets, never as the blank-capture bug.
 *  - The capture root's own scroll IS compensated, but indirectly:
 *    the root itself is never translated (it is the camera frame —
 *    translating it would shift the entire capture), its direct
 *    children are, exactly like any descendant container's.
 *    `root.querySelectorAll('*')` returns descendants only, so the
 *    root is checked explicitly before the descendant walk — without
 *    that check, passing a scrollable element as `opts.element`
 *    rasterized the TOP of its scroll extent (the same blank-capture
 *    symptom family this pass exists to fix).
 *  - RTL writing modes: browsers historically disagreed on
 *    `scrollLeft` semantics in RTL containers (negative-anchored vs
 *    positive-from-right vs positive-from-left). Modern Chromium
 *    normalises to negative-from-right, but mixed-mode pages can
 *    still see the wrong direction of compensation.
 *  - Window scroll (`html.scrollTop`/`body.scrollTop`) is left to
 *    `modern-screenshot`'s own viewport handling — only inner
 *    overflow containers are compensated here.
 */
const scrollStashedTransform = new WeakMap<HTMLElement, string>();
const scrollStashedOrigin = new WeakMap<HTMLElement, string>();
const scrollCompRefCount = new WeakMap<HTMLElement, number>();

function isScrollableContainer(el: HTMLElement): boolean {
  // Load-bearing early-out: this short-circuit keeps `getComputedStyle`
  // off the hot path for the typical 5k-node dashboard where only a
  // handful of containers have non-zero scroll offsets.
  if (el.scrollTop === 0 && el.scrollLeft === 0) return false;
  const view = el.ownerDocument?.defaultView;
  if (!view) return false;
  const cs = view.getComputedStyle(el);
  const overflow = `${cs.overflow} ${cs.overflowX} ${cs.overflowY}`;
  if (!/auto|scroll/.test(overflow)) return false;
  // `+ 1` epsilon: layout subpixel rounding noise. An element whose
  // content overflows by less than a pixel is not meaningfully
  // scrollable and should not trigger compensation.
  return (
    el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1
  );
}

function compensateContainer(el: HTMLElement, records: HTMLElement[]): void {
  if (!isScrollableContainer(el)) return;
  const dx = -el.scrollLeft;
  const dy = -el.scrollTop;
  if (dx === 0 && dy === 0) return;
  const view = el.ownerDocument?.defaultView;
  if (!view) return;
  for (
    let child = el.firstElementChild;
    child;
    child = child.nextElementSibling
  ) {
    if (!(child instanceof HTMLElement)) continue;
    // Skip sticky/fixed direct children: translating a pinned
    // element by -scrollTop would rasterize it off the top of the
    // frame (the failure mode this pass is meant to prevent).
    const childPos = view.getComputedStyle(child).position;
    if (childPos === 'sticky' || childPos === 'fixed') continue;
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
    records.push(child);
  }
}

function compensateInnerScrolls(root: Document | HTMLElement): HTMLElement[] {
  const records: HTMLElement[] = [];
  // The root's own scroll first: `querySelectorAll('*')` returns
  // descendants only, so a scrollable capture root would otherwise
  // rasterize the top of its scroll extent (the blank-capture symptom
  // family). The root itself is never translated — it is the camera
  // frame — but its direct children are compensated exactly like any
  // descendant container's. A `Document` root has no own scroll box
  // (window scroll is left to modern-screenshot's viewport handling).
  if (root instanceof HTMLElement) {
    compensateContainer(root, records);
  }
  root
    .querySelectorAll<HTMLElement>('*')
    .forEach((el) => compensateContainer(el, records));
  return records;
}

function restoreInnerScrolls(records: HTMLElement[]): void {
  for (const child of records) {
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

/**
 * Hard deadline on a single capture (module load + rasterization). A hung
 * `domToBlob` (pathological page, browser bug, wedged worker) or a stalled
 * dynamic import must never leave callers stuck in a `capturing` state —
 * adapters disable their Send button while a capture is in flight, so a
 * capture that never settles would wedge the composer. On deadline the
 * capture resolves through the normal failure path (1×1 placeholder +
 * console-ring warn) and all DOM mutations (skip-scrub, scroll
 * compensation) are restored in `finally`. The Flutter SDK applies the
 * same pattern with a 5 s deadline; DOM rasterization of large pages is
 * slower, so the JS deadline is 10 s.
 */
const CAPTURE_TIMEOUT_MS = 10_000;

function withCaptureDeadline<T>(
  work: Promise<T>,
  ms: number,
  onDeadline?: () => void,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      onDeadline?.();
      reject(
        new Error(`screenshot rasterization exceeded the ${ms}ms deadline`),
      );
    }, ms);
    // Both handlers are attached to `work` here, so a late settle (resolve
    // OR reject) after the deadline fired is consumed by an already-settled
    // outer promise — it can never surface as an unhandled rejection.
    work.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err: unknown) => {
        clearTimeout(timer);
        reject(err instanceof Error ? err : new Error(String(err)));
      },
    );
  });
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
  // previous `documentElement` default exposed the inner-scroll-reset
  // bug — see the `compensateInnerScrolls` JSDoc for the actual root
  // cause and `CaptureScreenshotOpts.element` for the contract.
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
  let scrollComps: HTMLElement[] = [];

  try {
    // The deadline spans the dynamic import AND the rasterization: a
    // cold-CDN import that never resolves wedges callers exactly the same
    // way a hung `domToBlob` does.
    //
    // The DOM mutations (skip-scrub + scroll compensation) are applied
    // AFTER the module load resolves, not before: on a cold cache the
    // chunk download can take seconds, and mutating up-front meant the
    // live page visibly jumped (scrolled containers translated by
    // -scrollTop) and the widget vanished for the whole download. It also
    // widened the race window in which a skip-marked node mounted after
    // the scrub-but-before-clone would be missed. Mutating in the same
    // microtask turn as the `domToBlob` call keeps the window minimal.
    let deadlineFired = false;
    const result = await withCaptureDeadline(
      (async () => {
        const mod = await loadModernScreenshot();
        // If the deadline already resolved this capture with the
        // placeholder, the outer `finally` has run (with nothing to
        // restore) — mutating the DOM now would hide widgets with nobody
        // left to unhide them. Bail before touching anything.
        if (deadlineFired) {
          throw new Error('module loaded after the capture deadline');
        }
        skipped = scrubSkippedNodes(element);
        scrollComps = compensateInnerScrolls(element);
        return mod.domToBlob(element, { quality, type: MIME });
      })(),
      CAPTURE_TIMEOUT_MS,
      () => {
        deadlineFired = true;
      },
    );
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
 *
 * A capture is also bounded by a hard 10 s deadline (engine load +
 * rasterization). A hung rasterization resolves through the same placeholder
 * path instead of leaving the returned promise pending forever, so UI that
 * tracks a `capturing` flag can never wedge.
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
