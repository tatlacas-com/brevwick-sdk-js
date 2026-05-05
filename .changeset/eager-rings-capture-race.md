---
'@tatlacas/brevwick-sdk': patch
---

**fix:** the console + network rings now install **synchronously** inside `Brevwick.install()` instead of being dynamic-imported. The previous shape registered the rings as `() => import('../rings/console')` / `() => import('../rings/network')` thunks resolved by `install()`; until those chunks landed, `globalThis.fetch`, `XMLHttpRequest.prototype.*`, and `console.*` were unpatched, and any error / failing request fired in that window was lost. Symptom: bug reports arrived at the dashboard with empty `console_errors` / `network_calls` even when the user clearly saw both in DevTools, especially on first visits with a cold CDN.

The capture race is now covered by `packages/sdk/src/__tests__/integration/install-race.test.ts`, which fires a `console.error` and a failing `fetch` on the synchronous turn after `install()` (no `await internal.ready()`) and asserts both land in the submitted payload.

**Bundle budget bump:** the eager core gzip ceiling moves from 2.85 kB → 8 kB. The figure now reflects the _true_ eager weight (`index.js` plus every chunk it pulls in via static `import` / `export … from`) rather than `index.js` alone — `chunk-split.test.ts` and `.size-limit.js` were both updated to walk the static-import graph so the metric matches what consumers' bundlers actually inline. Mirrored in `CLAUDE.md`, `CONTRIBUTING.md`, and `packages/sdk/README.md`. The on-widget-open and per-adapter budgets are unchanged.
