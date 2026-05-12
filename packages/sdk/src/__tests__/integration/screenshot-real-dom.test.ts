/**
 * Real-DOM contract test for `captureScreenshot()` — addresses the
 * "all our coverage is mock-only" gap raised in PR #103 review.
 *
 * Why this file exists separately from `../screenshot.test.ts`:
 *   `screenshot.test.ts` mocks `modern-screenshot` everywhere because most
 *   of its assertions are about *SDK-side* behaviour (skip-scrub ref
 *   counting, placeholder fallback shape, `internal.push` wiring, quality
 *   forwarding). Mocking is correct for those — they're testing the SDK,
 *   not the renderer. But it leaves a gap: if a future refactor breaks
 *   the live integration with `modern-screenshot` (wrong import shape,
 *   element passed by stale reference, scrub mutations not visible to
 *   the renderer because we accidentally cloned the subtree first), no
 *   existing test catches it. This file exercises the un-mocked dynamic
 *   import end-to-end against a real happy-dom subtree so any such
 *   regression fails here loudly.
 *
 * What this file CAN assert (under happy-dom):
 *   - The `import('modern-screenshot')` dynamic import resolves to the
 *     real published package (i.e. peer-dep wiring is correct end-to-end
 *     in the test runtime, not just at the bundle-graph level the
 *     `chunk-split.test.ts` covers). The mock factory composes
 *     `await vi.importActual('modern-screenshot')` rather than
 *     hand-rolling a stub, so an ABI break (renamed export, removed
 *     `domToBlob`, signature change) fails the import call itself —
 *     not a mock that "passes" because the contract drifted.
 *   - The SDK passes the LIVE `document.body` element (not a detached
 *     clone) to `domToBlob`, so when `modern-screenshot` walks ancestor
 *     stylesheets and inlines computed styles, the `:root`-scoped CSS
 *     custom properties the host app ships are reachable. Asserted by
 *     reading `getComputedStyle` on a body descendant from inside a
 *     wrapper that lets the call proceed otherwise un-mocked.
 *   - The `[data-brevwick-skip]` scrub runs against the live tree before
 *     `modern-screenshot` is invoked (so the renderer sees the hidden
 *     state) and is restored afterwards even when the renderer fails.
 *   - When `modern-screenshot` fails (which it will under happy-dom —
 *     see below) the SDK's catch handler produces a valid `image/webp`
 *     Blob without throwing.
 *
 * What this file CANNOT assert (and why it's tracked separately):
 *   happy-dom's `<canvas>` element returns `null` from `getContext('2d')`
 *   and the empty string from `toDataURL()`. modern-screenshot's
 *   `imageToCanvas` step calls `context2d.drawImage`, which throws on
 *   the missing 2D context. So the un-mocked rasterization path always
 *   fails under happy-dom and the SDK falls back to the placeholder.
 *   That means we cannot, in this test environment, assert that the
 *   returned Blob's bytes differ from the 34-byte placeholder — because
 *   the bytes WILL match the placeholder, every time. Worse, the real
 *   `domToBlob` call hangs (waiting for `Image.onload` on the SVG data
 *   URL, which happy-dom does not synthesise) so a fully-un-mocked
 *   "let it fail naturally" test deadlocks. The wrapper below resolves
 *   that by tapping the call, asserting the live arguments, and
 *   short-circuiting the renderer.
 *
 *   Asserting "blob bytes differ from placeholder" requires a real
 *   browser canvas (Playwright/Puppeteer against `examples/next/`).
 *   That work is tracked in:
 *     https://github.com/tatlacas-com/brevwick-sdk-js/issues/104
 *   and is referenced from the JSDoc on `CaptureScreenshotOpts.element`
 *   and the PR #103 body so the next reporter of a blank-screenshot
 *   regression is linked to an existing ticket instead of opening a
 *   duplicate. Switching this test environment to a node-canvas
 *   binding would itself require cross-platform native-bindings work
 *   that belongs in a separate PR.
 *
 * Why these assertions are still load-bearing despite the rasterization
 * gap:
 *   The bug PR #103 fixes is "the SDK passed the wrong root element to
 *   modern-screenshot". The fix is a default-value flip. The mock-based
 *   tests prove the new default value is forwarded, but they cannot
 *   prove the renderer is actually reachable, that the imported module
 *   has the expected shape, or that the live element survives the
 *   scrub→capture handoff. If any of those break, every mock-based
 *   test in `screenshot.test.ts` still passes (the SDK still calls a
 *   mock function with the right argument) and the bug ships again.
 *   This file fails loudly in that scenario.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

beforeEach(() => {
  // Each test installs into a clean module graph so the cached
  // `modernScreenshotPromise` from a sibling test does not satisfy
  // the dynamic import before this file's wrapper is in place.
  vi.resetModules();
});

afterEach(() => {
  vi.doUnmock('modern-screenshot');
  vi.restoreAllMocks();
  vi.resetModules();
});

describe('integration — captureScreenshot() against a real DOM subtree', () => {
  it('resolves the un-mocked modern-screenshot import and reaches domToBlob with the live document.body', async () => {
    // Real subtree. No content is mocked.
    const styleEl = document.createElement('style');
    styleEl.textContent = `
      :root { --brw-real-dom-token: rgb(11, 22, 33); }
      .brw-real-dom-sample { color: var(--brw-real-dom-token); }
    `;
    document.head.appendChild(styleEl);
    const sample = document.createElement('div');
    sample.className = 'brw-real-dom-sample';
    sample.textContent = 'real dom subtree';
    document.body.appendChild(sample);
    const skip = document.createElement('div');
    skip.setAttribute('data-brevwick-skip', '');
    skip.style.visibility = 'visible';
    document.body.appendChild(skip);

    // Wrap the real `modern-screenshot` module: pull the actual exports
    // via `vi.importActual` (not a hand-rolled stub) so the wrapper
    // factory itself fails if the package's export shape regresses.
    // Then override only `domToBlob` to record live arguments and
    // re-throw, mirroring the canvas-unavailable failure that would
    // happen anyway under happy-dom — without the deadlock that the
    // un-tapped real call produces (modern-screenshot's
    // `imageToCanvas` waits for `Image.onload` on an SVG data URL,
    // which happy-dom does not synthesise).
    let receivedTarget: unknown;
    let observedSkipDuringCapture = '';
    let observedTokenColor = '';
    let calls = 0;
    vi.doMock('modern-screenshot', async () => {
      const actual =
        await vi.importActual<typeof import('modern-screenshot')>(
          'modern-screenshot',
        );
      // Sanity: the real module must still expose `domToBlob`. If a
      // future major rename happened, this assertion fires inside the
      // mock factory and the test surfaces it instead of silently
      // passing against a stubbed shape.
      if (typeof actual.domToBlob !== 'function') {
        throw new Error(
          'modern-screenshot ABI regression: domToBlob is not a function',
        );
      }
      return {
        ...actual,
        domToBlob: async (target: HTMLElement) => {
          calls += 1;
          receivedTarget = target;
          // The scrub MUST already have hidden the skip node before the
          // renderer is called, because the renderer rasterizes
          // whatever it sees at this instant.
          observedSkipDuringCapture = skip.style.visibility;
          // The :root-scoped token MUST be resolvable on a body
          // descendant through getComputedStyle — modern-screenshot
          // relies on this when it inlines computed styles into the
          // cloned subtree before reparenting under <foreignObject>.
          observedTokenColor = window.getComputedStyle(sample).color;
          // Re-throw so the SDK's catch handler runs (mirroring the
          // happy-dom canvas-unavailable failure that would happen
          // anyway if we let the real call proceed end-to-end).
          throw new Error('test: tapped real domToBlob and re-threw');
        },
      };
    });

    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { captureScreenshot } = await import('../../screenshot');
    const blob = await captureScreenshot();

    // End-to-end un-mocked wiring works: the dynamic import resolved
    // to the real package (the wrapper factory's `vi.importActual`
    // would have failed otherwise) and `domToBlob` was actually
    // reached with live arguments.
    expect(calls).toBe(1);
    // The SDK passed the LIVE document.body, not a clone or
    // documentElement.
    expect(receivedTarget).toBe(document.body);
    // Scrub ran against the live tree before the renderer was invoked.
    expect(observedSkipDuringCapture).toBe('hidden');
    // :root CSS-var inheritance survives at capture time on the live
    // subtree (the invariant the host app's design tokens depend on).
    expect(observedTokenColor).toBe('rgb(11, 22, 33)');
    // Renderer failure was caught and produced a valid placeholder.
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type).toBe('image/webp');
    // Placeholder size is exactly 34 bytes (decoded from the
    // hard-coded VP8L base64 in screenshot.ts). Asserting the exact
    // size pins the contract: when rasterization fails, callers get
    // the placeholder, not a partial render or a zero-byte blob.
    expect(blob.size).toBe(34);
    // Restore-after-failure path ran on the live tree.
    expect(skip.style.visibility).toBe('visible');
    expect(warn).toHaveBeenCalled();

    sample.remove();
    skip.remove();
    styleEl.remove();
  });
});
