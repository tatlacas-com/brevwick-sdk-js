---
'@tatlacas/brevwick-sdk': minor
'@tatlacas/brevwick-react': minor
'@tatlacas/brevwick-solid': minor
'@tatlacas/brevwick-vue': minor
'@tatlacas/brevwick-svelte': minor
'@tatlacas/brevwick-angular': minor
---

feat: restore the screenshot capture button in the widget composer

The screenshot capture button — removed in v1 behind a future-flag (PR #111) — is back across all five web widgets (React, Solid, Vue, Svelte, Angular), backed by the core SDK's lazy `captureScreenshot()` wrapper. Clicking the camera button captures the page via the dynamically imported `modern-screenshot` peer dep and attaches the resulting image to the submitted issue. The React, Vue, Svelte, and Angular widgets add a region-select overlay (drag to crop a viewport rectangle) and a preview dialog to confirm the capture before sending; the Solid widget deliberately ships full-page capture only for V1 — no region overlay, no preview modal — keeping its adapter well under the bundle ceiling.

`modern-screenshot` stays behind `await import('…')`, so the eager bundle cost is the UI surface only; bundle ceilings in `.size-limit.js` were raised accordingly (Vue 10 → 13 kB, Svelte SFC 14 → 22 kB, Angular 18 → 31 kB) and the on-widget-open budget remains under 25 kB gzip. React Native is unchanged — its widget intentionally ships no screenshot UI (issue #116).
