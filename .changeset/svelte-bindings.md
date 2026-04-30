---
'@tatlacas/brevwick-svelte': minor
'@tatlacas/brevwick-sdk': minor
'@tatlacas/brevwick-react': minor
---

feat(svelte): @tatlacas/brevwick-svelte adapter — context + FeedbackButton + getFeedback

Ships the Svelte bindings per SDD § 12:

- `setBrevwickContext(config)` — root-layout setter that creates the SDK
  instance, calls `install()`, and stores it on Svelte's context.
- `getFeedback()` — composable-style getter returning `{ submit,
captureScreenshot, status, reset }` with a Svelte `Readable` `status`
  store.
- `<FeedbackButton>` — drop-in floating action button + chat-style
  composer with screenshot capture, file attachments, theming via
  `--brw-*` CSS custom properties, and SSR-safe `onMount` guard.

Build pipeline: `svelte-package` (Svelte's official packager). Eager
gzip < 1 kB; on-widget-open weight is shared with the core SDK's
`modern-screenshot` dynamic chunk. Redaction tests cover the full
submit pipeline; chunk-split test asserts `modern-screenshot` never
leaks into emitted artefacts.

Includes a SvelteKit example app at `examples/svelte/` and a complete
README mirroring the React adapter's structure.
