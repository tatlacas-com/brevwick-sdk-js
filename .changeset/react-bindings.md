---
'@tatlacas/brevwick-react': minor
'@tatlacas/brevwick-sdk': minor
---

feat(react): BrevwickProvider + useFeedback + FeedbackButton

Ships the React bindings per SDD § 12:

- `<BrevwickProvider config>` — memoises `createBrevwick(config)` keyed on
  config identity, installs on mount, uninstalls on unmount.
- `useFeedback()` → `{ submit, captureScreenshot, status, reset }` with a
  four-state machine `'idle' | 'submitting' | 'success' | 'error'`.
- `<FeedbackButton>` — drop-in FAB + dialog with attachments, screenshot
  capture, double-submit guard, and unmount-safe async handlers. Props:
  `position`, `disabled`, `hidden`, `className`, `label`, `onSubmit`.
- `"use client"` banner preserved in both ESM and CJS bundles for Next.js
  App Router.
- `data-brevwick-skip` applied to FAB, overlay, and dialog so captured
  screenshots exclude Brevwick's own UI.

The `@tatlacas/brevwick-sdk` bump is the lockstep pre-1.0 version (no code change in
the SDK for this PR).
