---
'@tatlacas/brevwick-solid': minor
---

feat(solid): widget UX parity with React adapter

The `<FeedbackButton>` Solid widget previously shipped a deliberately-
small textarea-only subset (panel header + composer + screenshot button +
send). It now renders the full chat-thread panel the React adapter does:

- Greeting + user/assistant bubbles with relative-time receipts on
  successful submits.
- Lazy `getConfig()` fetch on first panel open driving the AI toggle's
  render-policy matrix (`ai_enabled` + `ai_submitter_choice_allowed`).
- Composer with autogrow textarea, paperclip file-attach (multi-file),
  screenshot button, AI toggle (track-and-thumb switch with Space-to-
  toggle keyboard a11y), and send.
- Expected vs actual disclosure that piggybacks the submit payload.
- Staged-status rows (`Captured` → `Sanitised` → `Formatting with AI…`)
  driven by the SDK's internal phase bus through a new
  `packages/solid/src/internal-bridge.ts`.
- Tagged retry row on `ok: false` / chunk-load failures with a single
  Retry CTA that re-runs the original `FeedbackInput`.
- Discard-confirm modal on dirty close; Esc / minimize preserves draft.
- Reduced-motion gate (`prefers-reduced-motion: reduce`) flattens the
  staged-row stagger to instant.
- Forced-palette via `theme="light|dark|system"` data attribute on FAB
  - panel; CSS injection guarded by the `brevwick-solid-styles` id.
- Brevwick credit footer link below the composer.

`useFeedback()` grows three new accessors (`phase`, `error`, `retry`) so
the widget can drive the staged-status rows + retry CTA. The existing
`submit`, `captureScreenshot`, `status`, `reset` surface is unchanged.

Bundle budget bumped from 5 kB → 12 kB gzip to fit the larger UI surface;
still well under the React adapter's 25 kB ceiling because the Radix-
backed region-capture overlay + screenshot preview Dialog are out of
scope for the Solid V1.
