---
'@tatlacas/brevwick-react': minor
'@tatlacas/brevwick-sdk': minor
---

feat(react): staged-status feedback widget UX (#74)

Pressing **Send** in the React feedback widget now clears the input and
moves the typed value into the conversation thread synchronously, then
animates a sequence of staged status rows through to the assistant
receipt: **Captured route, console, network, device** → **PII-sanitised,
packaged** → **Formatting with AI…**.

The submit pipeline drives the rows via a new internal `phase` event on
`@tatlacas/brevwick-sdk`'s ring bus (`'capturing-done' | 'sanitising-done'
| 'sent'`) — emitted at the `composePayload` / `redact()` / ingest-2xx
boundaries. The event is **internal-only**: not exposed on the public
SDK surface; framework adapters reach it through the existing
`_internal` backdoor.

`useFeedback()` gains:

- `phase`: `'idle' | 'capturing' | 'sanitising' | 'formatting' | 'sent'
| 'error'` — backwards-compatible alongside the existing `status`.
- `error`: tagged `SubmitError | null` from the most recent failed
  submit.
- `retry()`: re-runs the most recent `submit()` with the same input.

The "Formatting with AI…" row is gated on `getConfig().ai_enabled === true`
so non-AI projects don't claim work the SDK isn't doing. Reduced motion
(`prefers-reduced-motion: reduce`) collapses the cascade to a flat fade.
On failure, the in-progress rows collapse to a red retry row carrying
the `SubmitError.message` verbatim plus a one-click **Retry** CTA, for
every `SubmitErrorCode` the submit pipeline can produce.

Bundle: React adapter ESM 11.92 kB / CJS 12.3 kB (limit 25 kB). SDK core
eager 2.13 kB / 2.14 kB (limit 2.2 kB).
