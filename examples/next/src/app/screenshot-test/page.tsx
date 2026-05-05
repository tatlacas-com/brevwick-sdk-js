'use client';

/**
 * Real-browser test fixture for `captureScreenshot()` (issue #104). Mounts
 * deterministic, paint-stable DOM and exposes the SDK's top-level
 * `captureScreenshot` on `window` so a Playwright spec can drive it without
 * routing through a `BrevwickProvider` (which would force the spec to
 * stand up a valid project key + endpoint just to render a button).
 *
 * The page is intentionally _not_ linked from the example app's home page —
 * it exists only to be hit by `examples/next/e2e/screenshot.spec.ts`. Test
 * fixture, not a user-facing demo. Lives under the example app rather than
 * a standalone Vite shell because brevwick-web's recurring "blank
 * screenshot" reports all originated from a Next.js host, and reproducing
 * the failure mode against the same framework + version is the only honest
 * way to lock the regression.
 */

import { useEffect, type ReactElement } from 'react';
import { captureScreenshot } from '@tatlacas/brevwick-sdk';

declare global {
  interface Window {
    /**
     * Test bridge: Playwright calls this from `page.evaluate()`. Returns a
     * data-URL of the captured WebP so we can shuttle the bytes across the
     * Playwright RPC boundary as a string (Blob isn't structured-cloneable
     * in `evaluate` results).
     */
    __brevwickCapture?: (
      target?: 'body' | 'documentElement',
    ) => Promise<{ dataUrl: string; size: number; mime: string }>;
  }
}

export default function ScreenshotTestPage(): ReactElement {
  useEffect(() => {
    window.__brevwickCapture = async (target = 'body') => {
      const element =
        target === 'documentElement' ? document.documentElement : document.body;
      const blob = await captureScreenshot({ element });
      const dataUrl: string = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (): void => resolve(reader.result as string);
        reader.onerror = (): void =>
          reject(reader.error ?? new Error('FileReader error'));
        reader.readAsDataURL(blob);
      });
      return { dataUrl, size: blob.size, mime: blob.type };
    };
    // Marker the spec waits on before invoking the bridge — guarantees the
    // useEffect has run and `window.__brevwickCapture` is bound. Plain
    // dataset attribute, no React state, so it survives a hot-reload that
    // would otherwise re-mount the component mid-spec.
    document.body.dataset.brevwickReady = '1';
    return () => {
      delete window.__brevwickCapture;
      delete document.body.dataset.brevwickReady;
    };
  }, []);

  return (
    <main
      data-testid="capture-root"
      style={
        {
          // `:root`-scoped CSS custom properties resolve via getComputedStyle
          // on body descendants — modern-screenshot reads them when
          // rendering. Locking a known set here lets the spec compare
          // pixels in known regions.
          '--brand': '#ff3366',
          '--ink': '#102040',
          '--paper': '#fefcf7',
          minHeight: '100vh',
          background: 'var(--paper)',
          color: 'var(--ink)',
          fontFamily:
            'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
          padding: '2rem',
          margin: 0,
        } as React.CSSProperties
      }
    >
      <h1
        data-testid="capture-title"
        style={{
          color: 'var(--brand)',
          margin: 0,
          marginBottom: '1rem',
          fontSize: '3rem',
        }}
      >
        Brevwick screenshot test
      </h1>
      {/*
        Three solid coloured tiles at fixed positions. The spec samples
        one pixel inside each tile and asserts the channel that the tile
        is supposed to dominate is fully saturated — that's how we prove
        modern-screenshot actually rasterized the DOM and didn't fall
        back to a blank canvas.
      */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 200px)',
          gap: '1rem',
          marginTop: '2rem',
        }}
      >
        <div
          data-testid="tile-red"
          style={{
            width: 200,
            height: 200,
            background: '#ff0000',
          }}
        />
        <div
          data-testid="tile-green"
          style={{
            width: 200,
            height: 200,
            background: '#00ff00',
            // `position: relative` so the magenta `[data-brevwick-skip]`
            // child below positions itself against the tile, not the
            // viewport — keeps the elision sentinel pinned to the
            // sample point regardless of layout drift.
            position: 'relative',
          }}
        >
          <div
            data-brevwick-skip
            data-testid="skip-sentinel"
            style={{
              position: 'absolute',
              inset: 0,
              background: '#ff00ff',
            }}
          />
        </div>
        <div
          data-testid="tile-blue"
          style={{
            width: 200,
            height: 200,
            background: '#0000ff',
          }}
        />
      </div>

      {/*
        Sentinel for the data-brevwick-skip elision contract. Positioned
        as a child of the green tile (via the wrapping `position:
        relative` on the tile) so it sits *exactly* over the green tile's
        full area — no font / line-height arithmetic to drift on. The
        spec asks the green tile for its bounding rect at runtime and
        samples the centre, so if the SDK fails to elide this overlay,
        the sample will be #ff00ff (magenta) instead of #00ff00 (green)
        and the test fails with an unmistakable colour delta.
      */}
    </main>
  );
}
