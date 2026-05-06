---
'@tatlacas/brevwick-svelte': minor
---

feat(svelte): widget UX parity with React adapter

`<FeedbackButton>` now ships the full React-adapter UX surface:

- Header gains a minimize button (preserves draft) alongside close, and
  the close affordance routes through an inline discard-confirm whenever
  the composer is dirty.
- Chat-style thread renders assistant + user message bubbles, plus a
  successful-submit receipt bubble carrying a relative-time stamp.
- Expected vs Actual disclosure (`aria-expanded` + `aria-controls`); the
  trimmed values ride the `FeedbackInput` payload only when filled.
- Phase-driven staged-status rows (`Captured`, `PII-sanitised`, AI-gated
  `Formatting with AI…`) with reduced-motion stagger.
- Red retry row carrying the verbatim `SubmitError.message` + a Retry CTA;
  exposes `data-brw-error-code` for the test suite.
- AI toggle (`role="switch"`, Space-to-flip) gated by the project-config
  render-policy matrix; `use_ai` rides the payload only when the toggle
  is visible.
- Lazy `getConfig()` on first panel open, cached for subsequent opens.

`getFeedback()` is extended (not the SDK / provider boundary): now
returns `phase`, `error`, `retry`, and `getConfig` stores in addition to
the existing `submit` / `status` / `reset`. Phase events come off the
SDK's `_internal` bus through the same structural probe the React
adapter uses; the listener is auto-detached on component destroy.

Closes #114
