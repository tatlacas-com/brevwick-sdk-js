---
'@tatlacas/brevwick-react-native': minor
---

feat(react-native): FeedbackButton + Modal (#88)

Drop-in FAB + Modal feedback form for React Native, mirroring the
`@tatlacas/brevwick-react` widget UX 1:1 with RN primitives:

- `<FeedbackButton />` — `Pressable` FAB with `position` (`'bottom-right' |
'bottom-left' | { bottom?, right?, left? }`), `theme`, `style`, `label`,
  `hidden`, `disabled` props. Default label tracks the full SDK submit
  lifecycle (`Send feedback` → `Capturing…` → `Sending…` → `Sent ✓` /
  `Try again`); the `Try again` and `Sent ✓` terminal states are reachable
  on the FAB because the FAB owns a single `useFeedback()` instance and
  forwards it to the modal — both render against the same status/phase
  tuple so the FAB observes terminal states the SDK's phase bus does not
  emit. Accessible: `accessibilityLabel='Send feedback'` +
  `accessibilityRole='button'`. The `disabled` prop is enforced both via
  `Pressable`'s native gating AND an explicit guard in `handleOpen`.
- `<FeedbackModal />` — slide-up form: description / expected / actual
  fields, screenshot preview with a skip toggle, and a primary button
  that drives `useFeedback().submit`. Lazy-loads `getConfig()` on first
  open and renders the AI toggle only when the project enables
  `ai_enabled && ai_submitter_choice_allowed`. Auto-dismisses 2 s after
  a successful submit and preserves the draft (text fields AND toggles)
  across Cancel + reopen (modal-local `useState`). The success-dismiss
  timer is cleared explicitly when the user taps Cancel during the
  confirmation dwell so it cannot fire on a hidden modal. The inline
  draft-error note clears on the first keystroke in any of the three
  text fields, matching the web composer behaviour. Screenshot capture
  failures surface as an inline note ("Couldn't attach screenshot —
  sending without one.") and emit a single `console.warn` matching the
  `screenshot.ts` `logFailure` pattern. Accepts an optional `feedback?:
UseFeedbackResult` prop so a parent can lift the hook (the FAB does
  this); standalone consumers can omit it. iOS gets
  `accessibilityViewIsModal` so VoiceOver scopes focus to the sheet.
- `BrevwickTheme` and `ProjectConfig` types re-exported from the package
  root for parity with the web React adapter — `ProjectConfig` is needed
  by any consumer composing their own modal alongside `useFeedback()`.

Bundle: 5.84 kB gzip ESM / 6.11 kB gzip CJS — well under the 25 kB
budget enforced by `.size-limit.js` and documented in `CLAUDE.md`.
