/**
 * Real-browser regression suite for `captureScreenshot()` — issue #104.
 *
 * Why this exists
 * ---------------
 * The SDK unit tests run under happy-dom, whose `<canvas>` element has
 * no 2D context. modern-screenshot's `imageToCanvas` step therefore
 * always throws and the SDK falls back to its 26-byte placeholder WebP.
 * That means the unit suite cannot prove that real Chromium actually
 * paints non-blank pixels for the default-body capture path.
 *
 * `captureScreenshot()`'s default capture root has flipped multiple
 * times (most recently PR #103). Each fix landed against mock-only
 * coverage and each one eventually regressed with a fresh "blank
 * screenshot" report. This spec drives the live DOM against Chromium
 * so the next regression breaks CI before it reaches a user.
 *
 * Test fixture lives in `examples/next/src/app/screenshot-test/page.tsx`
 * — three solid coloured tiles (#ff0000, #00ff00, #0000ff) under a
 * red-on-cream heading, plus a magenta `[data-brevwick-skip]` overlay.
 * The page exposes `window.__brevwickCapture()` so we can call the SDK
 * from the page context and shuttle the WebP back as a data URL.
 */
import { expect, test, type Page } from '@playwright/test';

interface CaptureResult {
  dataUrl: string;
  size: number;
  mime: string;
}

interface DecodedPixel {
  r: number;
  g: number;
  b: number;
  a: number;
}

interface DecodedSample {
  width: number;
  height: number;
  pixels: Record<string, DecodedPixel>;
}

/**
 * Decode the data-URL'd WebP inside the browser context and pull a
 * named set of pixel samples back out. Doing the decode on the page
 * (rather than via a Node WebP decoder) keeps the dependency footprint
 * small — Chromium already knows how to decode WebP via `<img>`.
 *
 * `samples` is name → {x,y}; values come back in the same shape so the
 * spec can assert against meaningful labels rather than coordinate
 * arithmetic at the call site.
 */
async function decodePixels(
  page: Page,
  dataUrl: string,
  samples: Record<string, { x: number; y: number }>,
): Promise<DecodedSample> {
  return page.evaluate(
    async ([dataUrlIn, samplesIn]) => {
      const img = new Image();
      img.src = dataUrlIn as string;
      await img.decode();
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('2d context unavailable in test browser');
      ctx.drawImage(img, 0, 0);
      const out: Record<string, DecodedPixel> = {};
      for (const [name, point] of Object.entries(
        samplesIn as Record<string, { x: number; y: number }>,
      )) {
        const safeX = Math.min(
          Math.max(0, Math.floor(point.x)),
          canvas.width - 1,
        );
        const safeY = Math.min(
          Math.max(0, Math.floor(point.y)),
          canvas.height - 1,
        );
        const data = ctx.getImageData(safeX, safeY, 1, 1).data;
        out[name] = {
          r: data[0]!,
          g: data[1]!,
          b: data[2]!,
          a: data[3]!,
        };
      }
      return { width: canvas.width, height: canvas.height, pixels: out };
    },
    [dataUrl, samples] as const,
  );
}

/**
 * Size of the SDK's placeholder WebP. The placeholder is what the SDK
 * returns when capture fails. The exact byte count comes from decoding
 * the constant in `packages/sdk/src/screenshot.ts` —
 * `atob('UklGRhoAAABXRUJQVlA4TA0AAAAvAAAAEAcQERGIiP4HAA==')` is 26 raw
 * bytes. We assert > placeholder so any real capture (which is at
 * minimum a few hundred bytes for a non-empty viewport) clears it; a
 * regression that silently returns the placeholder fails this gate.
 */
const PLACEHOLDER_BYTES = 26;

test.describe('captureScreenshot — real Chromium', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/screenshot-test');
    // The page sets `data-brevwick-ready=1` on body inside its useEffect —
    // waiting on it guarantees `window.__brevwickCapture` is bound before
    // the spec calls into it.
    await page.waitForFunction(
      () => document.body.dataset.brevwickReady === '1',
    );
    // Give the layout one rAF to settle. Without this, the very first
    // capture in CI occasionally lands while the tiles are still painting
    // their backgrounds, producing partially-transparent pixel samples.
    await page.evaluate(
      () =>
        new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        ),
    );
  });

  /**
   * Query the live tile centres from the page rather than hard-coding
   * pixel coordinates. The fixture's grid is laid out by CSS, so any
   * font / line-height / browser-version drift would shift the centres
   * a few pixels and silently invalidate hard-coded samples. Asking
   * Chromium for the actual `getBoundingClientRect` is one round-trip
   * and removes a whole class of drift flake.
   */
  async function tileCentres(
    page: Page,
  ): Promise<Record<'red' | 'green' | 'blue', { x: number; y: number }>> {
    return page.evaluate(() => {
      const centre = (sel: string): { x: number; y: number } => {
        const el = document.querySelector(sel);
        if (!el) throw new Error(`fixture missing: ${sel}`);
        const r = el.getBoundingClientRect();
        return {
          x: Math.round(r.left + r.width / 2),
          y: Math.round(r.top + r.height / 2),
        };
      };
      return {
        red: centre('[data-testid="tile-red"]'),
        green: centre('[data-testid="tile-green"]'),
        blue: centre('[data-testid="tile-blue"]'),
      };
    });
  }

  test('default body capture produces non-blank pixels in known regions', async ({
    page,
  }) => {
    const centres = await tileCentres(page);
    const result: CaptureResult = await page.evaluate(() =>
      window.__brevwickCapture!('body'),
    );

    expect(result.mime).toBe('image/webp');
    // Cleared the placeholder by a wide margin — typical real captures of
    // this fixture land in the tens-of-kB range. The exact lower bound is
    // intentionally loose so font / Chromium-version drift doesn't cause
    // flake; the meaningful gate is "not the 26-byte placeholder".
    expect(result.size).toBeGreaterThan(PLACEHOLDER_BYTES * 10);

    const decoded = await decodePixels(page, result.dataUrl, centres);

    // Bitmap should at least cover the blue tile's right edge — if the
    // capture clipped or fell back to the placeholder, the rasterised
    // size would not span the live layout we just measured.
    expect(decoded.width).toBeGreaterThanOrEqual(centres.blue.x);
    expect(decoded.height).toBeGreaterThanOrEqual(centres.blue.y);

    // Each tile should be saturated in its named channel and near-zero
    // in the other two. WebP is lossy so we tolerate a per-channel
    // wobble, but the *dominance* must be unambiguous.
    expect(decoded.pixels.red!.r).toBeGreaterThan(200);
    expect(decoded.pixels.red!.g).toBeLessThan(80);
    expect(decoded.pixels.red!.b).toBeLessThan(80);

    expect(decoded.pixels.green!.g).toBeGreaterThan(200);
    expect(decoded.pixels.green!.r).toBeLessThan(80);
    expect(decoded.pixels.green!.b).toBeLessThan(80);

    expect(decoded.pixels.blue!.b).toBeGreaterThan(200);
    expect(decoded.pixels.blue!.r).toBeLessThan(80);
    expect(decoded.pixels.blue!.g).toBeLessThan(80);

    // Every captured pixel should be fully opaque — a transparent / 0-alpha
    // bitmap is the most common "blank screenshot" failure mode.
    expect(decoded.pixels.red!.a).toBe(255);
    expect(decoded.pixels.green!.a).toBe(255);
    expect(decoded.pixels.blue!.a).toBe(255);
  });

  test('[data-brevwick-skip] elements do not appear in the captured pixels', async ({
    page,
  }) => {
    // The fixture stacks a magenta (#ff00ff) [data-brevwick-skip] overlay
    // *exactly* over the green tile (it's a child of the green tile with
    // `position:absolute; inset:0`). If the SDK's skip elision breaks,
    // that magenta dominates the green tile's centre sample. Asserting
    // "centre is still green-dominant after capture" therefore doubles
    // as an elision regression guard without a separate sentinel pixel.
    const centres = await tileCentres(page);
    const result: CaptureResult = await page.evaluate(() =>
      window.__brevwickCapture!('body'),
    );

    const decoded = await decodePixels(page, result.dataUrl, {
      overlayCentre: centres.green,
    });

    const px = decoded.pixels.overlayCentre!;
    // Green tile underneath is #00ff00. Magenta overlay would be #ff00ff.
    // Either the overlay was elided (we see green) or our skip contract
    // is broken (we see magenta). Encode the green-dominant assertion
    // explicitly so the failure message is meaningful.
    const sampledRgba = `rgba(${px.r},${px.g},${px.b},${px.a})`;
    expect(
      px.g,
      `overlay pixel was not elided: got ${sampledRgba}`,
    ).toBeGreaterThan(200);
    expect(
      px.r,
      `overlay pixel was not elided: got ${sampledRgba}`,
    ).toBeLessThan(80);
  });

  test('locks regression: documentElement capture differs from body capture', async ({
    page,
  }) => {
    // Why this test
    // -------------
    // PR #103 flipped the default capture root from `documentElement` to
    // `document.body` because some Chromium builds rasterise `<html>`
    // through a `<foreignObject>` that drops flow-content. The cheapest
    // honest regression guard is "the two roots produce demonstrably
    // different output". If a future refactor silently flips the default
    // back, the body capture will start matching the documentElement
    // capture and this test fires. We assert on size as the proxy:
    // body-rooted capture of this fixture is in the tens-of-kB; the
    // documentElement-rooted capture is either the placeholder (26 B) or
    // a meaningfully smaller / blank artefact in the affected Chromium
    // builds. Either case fails `bodyResult.size === documentElementResult.size`.
    const bodyResult: CaptureResult = await page.evaluate(() =>
      window.__brevwickCapture!('body'),
    );
    const docElResult: CaptureResult = await page.evaluate(() =>
      window.__brevwickCapture!('documentElement'),
    );

    expect(bodyResult.size).toBeGreaterThan(PLACEHOLDER_BYTES * 10);
    expect(
      bodyResult.size,
      `body and documentElement captures produced byte-identical output (${bodyResult.size} B); the default-root regression guard is no longer effective`,
    ).not.toBe(docElResult.size);
  });
});
