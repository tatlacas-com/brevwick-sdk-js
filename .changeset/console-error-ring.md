---
'@tatlacas/brevwick-sdk': minor
'@tatlacas/brevwick-react': minor
---

Add the console error ring: patches `console.error` / `console.warn` and listens for `window` `'error'` and `'unhandledrejection'` events, pushing redacted entries into a bounded FIFO buffer (cap 50). Messages and stacks run through `redact()` before storage, stacks are trimmed to the top 20 frames (leader preserved), and identical `message + first-frame` pairs within a 500 ms window dedupe in place via a new optional `count?: number` field on `ConsoleEntry`. The ring is wired into `DEFAULT_RINGS` by direct import so tree-shaking with `"sideEffects": false` stays safe; `uninstall()` restores originals, removes listeners, and clears internal dedupe state. Closes #2.
