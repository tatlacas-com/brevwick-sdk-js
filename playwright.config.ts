/**
 * Playwright config for the real-browser screenshot regression suite
 * (issue #104). Drives `examples/next` against Chromium and asserts that
 * `captureScreenshot()` actually rasterises pixels from the live DOM —
 * the property the happy-dom-based unit tests cannot prove because
 * happy-dom's `<canvas>` returns no 2D context.
 *
 * Wired only into the `e2e` script in this repo's root `package.json`,
 * not into `pnpm test:cover`, so the default test matrix stays fast and
 * does not require Chromium binaries.
 */
import { defineConfig, devices } from '@playwright/test';

const PORT = 3100;

export default defineConfig({
  testDir: './e2e',
  // Single project — the regression we're locking is purely a Chromium
  // rasterisation bug. Adding WebKit / Firefox here would test
  // modern-screenshot, not our consumption of it, and would force the
  // CI lane to install three browser engines for ~zero additional signal.
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  // Build + start the example, NOT `next dev`. Two reasons:
  //  1) The bug under test is a Chromium rasterisation issue against the
  //     compiled bundle the user actually ships — the dev bundle goes
  //     through Turbopack's HMR runtime, which adds layers (suspense
  //     boundaries, error overlays) that are NOT present in production.
  //     A "passes in dev / fails in prod" outcome is the exact failure
  //     mode this suite exists to prevent.
  //  2) Next 16 + Turbopack dev mode currently does not hydrate cleanly
  //     in CI-style headless Chromium runs (HMR websocket handshake
  //     fails, `useEffect` never runs, `window.__brevwickCapture` never
  //     binds). `next build && next start` sidesteps the whole HMR layer.
  // Port 3100 chosen to dodge the example app's default 3000 in case a
  // contributor has it running.
  webServer: {
    command: `pnpm --filter brevwick-example-next exec next start --port ${PORT}`,
    url: `http://127.0.0.1:${PORT}/screenshot-test`,
    reuseExistingServer: !process.env.CI,
    // The build is the slow step; `next start` itself is sub-second once
    // the build is cached. CI runs `next build` separately before the
    // suite (see `.github/workflows/playwright.yml`), so this timeout
    // only covers `next start`'s socket warmup.
    timeout: 60_000,
  },
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    // No traces in green CI — only on retry. Failed runs upload to the
    // workflow artifact bundle for triage.
    trace: 'on-first-retry',
  },
  reporter: process.env.CI ? 'github' : 'list',
  // Two retries on CI, none locally — local failures should be debugged,
  // not papered over. CI flake is usually Chromium / dev-server cold-start
  // jitter, both of which actually retry-clear.
  retries: process.env.CI ? 2 : 0,
});
