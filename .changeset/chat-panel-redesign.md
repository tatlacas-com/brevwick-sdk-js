---
'brevwick-react': minor
'brevwick-sdk': minor
---

feat(react): chat-thread panel redesign for FeedbackButton

Reshapes the `<FeedbackButton>` widget from a centered modal into an
anchored, chat-style panel that slides up next to the FAB (bottom-right /
bottom-left).

- Layout: header (title, minimize, close) → scrollable bubble thread →
  sticky composer (icons + autogrowing textarea + Send).
- Composer: Enter sends; Shift/Ctrl/Meta/Alt + Enter inserts a newline;
  IME composition is respected. Autogrow ceiling is shared between CSS
  and JS via a single exported constant.
- Attachments: screenshot chip + file chips with stable monotonic ids so
  removing a middle file never flashes surviving chips into the wrong
  slot.
- Esc / overlay-click are mapped to "minimize with preserved state" (not
  destructive close); the × button explicitly runs the dirty-confirm
  flow, and is disabled while a submit is in-flight.
- Progressive disclosure for expected / actual; hidden behind a single
  "Add expected vs actual" button by default.
- Title field is derived from the first line of the description (max 120
  chars) — `FeedbackInput.title` wire shape is unchanged.
- Success state replaces the thread with a persistent confirmation
  bubble + "Send another"; no auto-close timer. "Send another" returns
  focus to the composer textarea for keyboard users. If a submit
  resolves while the panel is minimized, the success state is still
  rendered on reopen so the user sees their issue was received.
- Dark-mode chip background is one step brighter than the border so the
  chip outline stays visible.
- `prefers-reduced-motion` disables both the panel slide animation and
  the FAB hover transition; softens the spinner.
- `data-brevwick-skip=""` remains on the FAB and dialog content.
- No new dependencies. Widget ESM bundle ≈ 6.9 kB gzip (well under the
  25 kB budget); core SDK untouched at 2.0 kB gzip.

The `brevwick-sdk` bump is the lockstep pre-1.0 version (no code
changes in the SDK for this PR).
