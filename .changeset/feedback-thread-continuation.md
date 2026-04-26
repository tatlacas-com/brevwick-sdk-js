---
'@tatlacas/brevwick-react': minor
'@tatlacas/brevwick-sdk': minor
---

feat(react): redesign feedback panel as continuous chat thread

Refactors `<FeedbackButton>` from a "thread + post-submit takeover" UI
into a continuous chat thread, closing #52.

- Introduces a module-scope `Message` type and a `messages` state array;
  `Thread` renders from history (`messages.map(...)`) instead of a
  hardcoded layout.
- Drops the live-mirror `<UserBubble>{draft}</UserBubble>` — typing into
  the composer no longer paints a bubble above it.
- Removes `SuccessState`, `handleSendAnother`, the `succeeded` flag,
  and the `focusComposerPending` layout-effect dance. The composer is
  always mounted; submit success appends a user bubble + an assistant
  "Thanks — your issue is on its way." bubble, then clears the composer
  in place. Focus stays put.
- The assistant receipt bubble carries an "Issue sent · timestamp"
  footer (`brw-bubble--receipt`) with an inline 16x16 SVG check icon. A
  tiny in-file `formatRelativeTime` helper avoids pulling in
  `Intl.RelativeTimeFormat` or `date-fns` so the bundle stays inside
  the §12 25 kB initial-gzip budget.
- Closing the panel via `×` (or via "Discard" in the dirty-confirm)
  resets the thread to just the greeting on next open. Minimize
  semantics are unchanged — that path skips `resetAll()` so the
  existing "minimize preserves draft + attachments" contract still
  holds.
- Removes the now-unused `.brw-bubble--success` and `.brw-success-wrap`
  CSS rules; adds `.brw-bubble--receipt` (small inline-flex footer
  reusing `--brw-fg-muted`, no new tokens).
- Each new submission still fires its own POST and creates its own
  ticket; UI continuity ≠ thread continuity, and the receipt marker
  between bubbles makes that legible.

The `@tatlacas/brevwick-sdk` bump is the lockstep pre-1.0 version (no
code changes in the SDK for this PR).
