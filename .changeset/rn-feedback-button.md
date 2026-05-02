---
'@tatlacas/brevwick-react-native': minor
---

feat(react-native): FeedbackButton + Modal (#88)

Drop-in FAB + Modal feedback form for React Native, mirroring the
`@tatlacas/brevwick-react` widget UX 1:1 with RN primitives:

- `<FeedbackButton />` — `Pressable` FAB with `position` (`'bottom-right' |
  'bottom-left' | { bottom?, right?, left? }`), `theme`, `style`, `label`,
  `hidden`, `disabled` props. Default label tracks the SDK submit phase
  (`Send feedback` → `Capturing…` → `Sending…` → `Sent ✓` / `Try again`).
  Accessible: `accessibilityLabel='Send feedback'` + `accessibilityRole='button'`.
- `<FeedbackModal />` — slide-up form: description / expected / actual
  fields, screenshot preview with a skip toggle, and a primary button
  that drives `useFeedback().submit`. Lazy-loads `getConfig()` on first
  open and renders the AI toggle only when the project enables
  `ai_enabled && ai_submitter_choice_allowed`. Auto-dismisses 2 s after
  a successful submit and preserves the draft across Cancel + reopen
  (modal-local `useState`). iOS gets `accessibilityViewIsModal` so
  VoiceOver scopes focus to the sheet.
- `BrevwickTheme` type re-exported from the package root for parity with
  the web React adapter.

Bundle: 5.72 kB gzip ESM / 5.95 kB gzip CJS — well under the 25 kB
budget documented in `CLAUDE.md`.
