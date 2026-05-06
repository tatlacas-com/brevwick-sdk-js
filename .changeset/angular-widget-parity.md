---
'@tatlacas/brevwick-angular': minor
---

Bring `<bw-feedback-button>` to UX parity with the React adapter (#115). The standalone component now renders the chat-thread panel (assistant + user bubbles, receipt with relative-time), expected-vs-actual disclosure, phase-driven status rows, retry row, discard-confirm flow, AI toggle render-policy matrix, autogrow composer, and minimize button. `BrevwickService` is extended with `phase`, `error`, `retry`, `getConfig` Signals subscribed via a new `phase-bus.ts`. Component uses `ViewEncapsulation.None` so the canonical `BREVWICK_CSS` rules apply. Bundle budget bumped 8 kB → 18 kB.
