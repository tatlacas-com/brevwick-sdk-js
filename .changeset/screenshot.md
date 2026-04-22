---
'@tatlacas/brevwick-sdk': minor
'@tatlacas/brevwick-react': minor
---

feat(screenshot): captureScreenshot() via dynamic import

Adds `captureScreenshot(opts?)` to `@tatlacas/brevwick-sdk`. The function dynamically
imports `modern-screenshot` so the base bundle stays below the 2 kB gzip
budget. `[data-brevwick-skip]` nodes are hidden during capture and restored
afterwards — even on failure. Capture never throws: a failure resolves with a
1×1 transparent WebP placeholder and logs a `warn` entry into the console
ring. `modern-screenshot` is declared as an optional peer dependency so
consumers that never call `captureScreenshot` skip the install.
