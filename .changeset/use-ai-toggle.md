---
'@tatlacas/brevwick-react': minor
'@tatlacas/brevwick-sdk': minor
---

feat(react): submitter Use-AI toggle + project config fetch

Implements issue #26 per SDD § 12.

- `Brevwick.getConfig()` → `Promise<ProjectConfig | null>`. Dynamic-imported
  so the fetcher lives in a sibling chunk and never lands in the eager SDK
  bundle. Cached per session (the same stored promise collapses concurrent
  callers and retains a `null` result so failed or malformed responses are
  not retried).
- New `ProjectConfig` type (`{ ai_enabled, ai_submitter_choice_allowed }`)
  exported from `@tatlacas/brevwick-sdk`; `fetchConfig` never throws — non-2xx,
  malformed shape, and thrown fetch all resolve to `null`.
- `FeedbackInput` gains optional `use_ai: boolean`; `composePayload`
  threads it through to the ingest body when defined. Booleans skip
  `redact()` (non-string primitives are already passthrough).
- `<FeedbackButton>` lazy-fetches project config on first panel open
  (never on mount, never before open) and renders a `role="switch"`
  "Format with AI" toggle when both `ai_enabled` and
  `ai_submitter_choice_allowed` are `true`. In every other state
  (config fetch pending, rejected, resolved to `null`, either flag
  `false`) the toggle is hidden and the submit payload omits `use_ai`.
- Toggle defaults to on when visible; `resetAll()` ("Send another")
  returns it to the default. Space and click both flip the switch;
  `:focus-visible` ring and `prefers-reduced-motion` branch included.
- Config request stamps `Authorization: Bearer <projectKey>` and the
  `X-Brevwick-SDK` loop-guard header so the network ring does not
  recursively capture it.
- Eager SDK chunk stays under the 2.2 kB gzip budget (measured 2107 B).
