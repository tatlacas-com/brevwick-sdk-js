---
'@tatlacas/brevwick-vue': minor
---

Bring `<FeedbackButton>` to UX parity with the React adapter (#112). The widget now renders the chat-thread panel (assistant + user bubbles, receipt with relative-time), expected-vs-actual disclosure, phase-driven status rows, retry row, discard-confirm flow, AI toggle render-policy matrix, autogrow composer, and minimize button. The Vue `useFeedback()` composable is extended with `phase`, `error`, `retry` accessors and a new `internal-bridge.ts` subscribes to the SDK's phase bus. Bundle budget bumped 5 kB → 10 kB.
