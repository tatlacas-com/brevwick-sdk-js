# brevwick-sdk-js Feedback Panel UX Worktrees

1 issue, 1 worktree. UI-only refactor of the React feedback panel into a continuous chat thread.

**Key references:**

- `CLAUDE.md` (this repo) — working style, bundle budgets, redaction mandate, conventional commits, no Co-Authored-By
- [SDD § 13](https://github.com/tatlacas-com/brevwick-ops/blob/main/docs/brevwick-sdd.md#13-widget-ux) — widget UX contract. This change updates panel behaviour; if § 13 codifies the takeover/composer-disabled flow it will need an update in the same PR (cross-repo)
- Issues: https://github.com/tatlacas-com/brevwick-sdk-js/issues

**Conventions (apply to every worktree):**

- pnpm workspace; two packages: `@tatlacas/brevwick-sdk` (core) and `@tatlacas/brevwick-react` (bindings)
- TypeScript strict, tsup for builds (ESM + CJS + dts), Vitest + happy-dom for tests
- Single quotes, semicolons, trailing commas (prettier); relative paths inside each package
- Conventional commits, subject ≤ 72 chars, **no Co-Authored-By headers**, no Claude attribution anywhere
- Branch from `origin/main` (never local `main`), squash-merge only

**Hard bundle budgets (CI-enforced):**

- `@tatlacas/brevwick-sdk` core initial chunk: **< 2.2 kB gzip**
- `@tatlacas/brevwick-react` on widget open (with `modern-screenshot` dynamic-imported): **< 25 kB gzip**

This worktree is UI-only — no new deps, no heavy imports. Bundle should not move.

**Redaction:** unchanged. No new payload fields leave the device; the only message text added (`'Thanks — your issue is on its way.'`) is a static literal generated client-side.

---

## Dependency map

```
TIER 0 — Single feature (1 worktree)
  WT-01: #52  feedback panel chat-thread continuation        [no dependencies]
```

Worktree lives alongside the main repo at `/home/tatlacas/repos/brevwick/brevwick-sdk-js-feedback-ux`.

---

## TIER 0 — Feedback panel redesign

---

### Worktree 01: feedback panel chat-thread continuation (#52)

Refactor the React feedback panel so the chat metaphor is only used where it earns its keep: drop the live-typing mirror bubble, replace the post-submit "Thanks" takeover with an inline assistant reply in the same thread, leave the composer active so users can chain submissions without an extra click. Each new submit still fires its own POST and creates its own ticket — UI continuity, not thread continuity. A small "Issue sent ✓" marker on each assistant bubble makes the boundary legible.

**Scope:** `packages/react/src/feedback-button.tsx` (introduce `messages` state array, delete `SuccessState`, remove live-mirror render, render bubbles from history, "Issue sent ✓" footer on receipt bubbles) plus matching test updates in `packages/react/src/__tests__/integration/render-submit.test.tsx` and `packages/react/src/__tests__/feedback-button.test.tsx`.

**Blocks:** none.

**Can run in parallel with:** nothing in this file (sole worktree). If other worktrees touching `feedback-button.tsx` open elsewhere, sequence after them to avoid conflict — this refactor rewrites large portions of that file.

```bash
cd /home/tatlacas/repos/brevwick/brevwick-sdk-js
git fetch origin
git worktree add ../brevwick-sdk-js-feedback-ux -b feat/issue-52-feedback-thread-continuation origin/main
cd ../brevwick-sdk-js-feedback-ux

claude --dangerously-skip-permissions "
You are redesigning the React feedback panel into a continuous chat thread. Your task is GitHub issue #52 on tatlacas-com/brevwick-sdk-js.

THIS REPO: \$(pwd)

STEP 1 — Read project context:
- Read CLAUDE.md fully — note bundle budgets, redaction mandate, conventional commits, no Co-Authored-By, no Claude attribution anywhere, never push to main directly.
- Run: gh issue view 52 --repo tatlacas-com/brevwick-sdk-js
- Read in full:
  - packages/react/src/feedback-button.tsx (~1100 lines — the whole file)
  - packages/react/src/use-feedback.ts
  - packages/react/src/__tests__/integration/render-submit.test.tsx
  - packages/react/src/__tests__/feedback-button.test.tsx
- Skim packages/react/src/styles.css (or wherever brw-bubble--* classes live) so you know where to add brw-bubble--receipt.

STEP 2 — Confirm SDD § 13 (widget UX) impact:
- gh api repos/tatlacas-com/brevwick-ops/contents/docs/brevwick-sdd.md --jq '.content' | base64 -d | sed -n '/^## 13/,/^## 14/p'
- If § 13 codifies the post-submit takeover or composer-disabled-after-send behaviour, prepare the SDD update — it must land in the same PR (cross-repo) before merge. If § 13 is silent on these specifics, this is a UI-only change and no SDD update is needed; note that in the PR body.

STEP 3 — Refactor packages/react/src/feedback-button.tsx:
- Add a Message type at module scope:
    type Message = {
      id: string;
      role: 'assistant' | 'user';
      text: string;
      sentAt?: number;
      issueSent?: boolean;
      attachments?: { screenshot?: ScreenshotAsset; files?: FeedbackAttachment[] };
    };
- Replace the 'succeeded' useState with a 'messages' useState seeded by a small factory:
    const initialMessages = (): Message[] => [{ id: 'greeting', role: 'assistant', text: GREETING }];
- Delete: SuccessState (lines ~1062–1084), handleSendAnother (~509–519), focusComposerPending state and its useIsomorphicLayoutEffect, the Thread/SuccessState ternary (~561–583).
- The render becomes: always <Thread messages={messages} ... /> + always <Composer />.
- In doSubmit success branch: append a user Message (text = current draft, attachments snapshot of screenshot+files) AND an assistant Message ('Thanks — your issue is on its way.', issueSent: true, sentAt: Date.now()). Then clear draft, screenshot, files, expected, actual — composer stays mounted, do NOT call resetAll() and do NOT touch focus.
- In doSubmit error branch: keep the existing inline error alert (do not push to messages).
- Refactor Thread to take messages as a prop and render them with messages.map(...). Below the messages, render: attachments preview block (screenshot + files), 'Add expected vs actual' disclosure (preserve existing toggle), error alert, 'Sending…' spinner — the order today minus the live-mirror UserBubble.
- DELETE the live-mirror render: 'trimmed.length > 0 && <UserBubble>{draft}</UserBubble>' at line ~722. Also delete the now-unused 'trimmed' const if it has no other consumer.
- Implement the assistant 'receipt' bubble — when message.issueSent, render the existing assistant bubble plus a small footer (check icon + relative timestamp like 'Issue sent ✓ · just now'). Use a relative-time helper (write a tiny one — Intl.RelativeTimeFormat is fine, or compute locally; do NOT add a date-fns dep). Apply a brw-bubble--receipt CSS class for the footer styling.

STEP 4 — Reset on panel close:
- Wherever the Radix Dialog onOpenChange fires (find it in feedback-button.tsx), when open transitions from true → false, reset messages to initialMessages() and clear draft/attachments. Reopening should show only the greeting.

STEP 5 — Styles:
- In packages/react/src/styles.css (or the equivalent file housing brw-bubble--*), add a .brw-bubble--receipt rule for the footer: small text, muted colour, inline-flex with the check icon. Reuse existing colour tokens; do not introduce new ones.
- The check icon: inline SVG (16×16, currentColor) — do NOT pull in lucide or another icon package.

STEP 6 — Update integration test (packages/react/src/__tests__/integration/render-submit.test.tsx):
- Replace the success-state visibility assertion (lines ~166–168) with assertions that:
  a) The submitted user message bubble is in the document.
  b) An assistant bubble containing 'Thanks — your issue is on its way.' is in the document with the receipt marker.
  c) The composer textarea is still rendered and not disabled.
- Add a follow-up to the same test (or a new one): type a second message, click send, await resolution, assert:
  a) A second POST hit /v1/ingest/issues with the second message's content.
  b) The thread now contains 2 user bubbles + 2 assistant 'Thanks…' bubbles + the greeting (5 bubbles total).
  c) Composer is empty and still active.

STEP 7 — Update unit tests (packages/react/src/__tests__/feedback-button.test.tsx):
- Remove or rewrite any tests asserting the live-mirror bubble (something like 'shows draft as a bubble while typing') or SuccessState / 'Send another' button.
- Add: 'typing into the composer does not append a bubble to the thread' — type some text, assert no UserBubble corresponding to the draft is rendered until send is clicked.
- Add: 'closing and reopening the panel resets the thread to just the greeting' — submit once, close panel, reopen, assert only greeting visible and composer empty.

STEP 8 — Verify everything green:
- pnpm install
- pnpm type-check
- pnpm lint
- pnpm test                                  (full workspace)
- pnpm --filter @tatlacas/brevwick-react test --reporter=verbose
- pnpm build
- Inspect packages/react/dist/index.js and confirm bundle size has not regressed (compare against main if size-limit is wired up; otherwise eyeball the file size).

STEP 9 — Manual exercise (skip if no dev runner exists):
- Look for examples/ or apps/ in the repo. If a Vite/Next playground exists, run it and exercise: open panel → type (no mirror) → send → user bubble persists, thank-you bubble appears with 'Issue sent ✓' marker → type and send a second message → both pairs visible → close panel → reopen → only greeting.
- If no playground exists, document in the PR body that manual UI verification was skipped and ask the reviewer to spin one up before merge.

STEP 10 — Commit and PR (no Co-Authored-By, no Claude attribution):
git add -A
git commit -m 'feat(react): redesign feedback panel as continuous chat thread (#52)'
git push -u origin feat/issue-52-feedback-thread-continuation
gh pr create --title 'feat(react): redesign feedback panel as continuous chat thread' --body \"\$(cat <<'PREOF'
Closes #52

Refactors the React feedback panel into a continuous chat thread. The live-typing mirror bubble is gone (was just rendering composer text twice) and the post-submit 'Thanks — your issue is on its way.' + 'Send another' takeover is replaced with an inline assistant reply that keeps the composer active for chained submissions. Each new submit still fires its own POST.

## Summary
- Introduced a \`messages\` state array; \`Thread\` now renders from history instead of a hardcoded layout
- Removed live-mirror \`<UserBubble>{draft}</UserBubble>\` render
- Deleted \`SuccessState\`, \`handleSendAnother\`, the \`succeeded\` flag, and the post-submit ternary
- Submit success appends user + assistant messages and clears the composer in place (no remount, no focus dance)
- Assistant 'thank-you' bubbles carry an 'Issue sent ✓ · timestamp' marker (\`brw-bubble--receipt\`)
- Closing the panel resets the thread to just the greeting

## Test plan
- [ ] \`pnpm type-check\`, \`lint\`, \`test\`, \`build\` all green
- [ ] Integration test: single submit shows persistent bubbles + active composer
- [ ] Integration test: second submit fires another POST and appends another pair of bubbles
- [ ] Unit test: typing does not append a bubble
- [ ] Unit test: close + reopen resets to greeting
- [ ] No bundle regression for \`@tatlacas/brevwick-react\`
- [ ] Manual UI walkthrough completed (or flagged for reviewer if no playground available)

## SDD impact
- See PR body for whether SDD § 13 needs an update; cross-repo PR linked here if so.
PREOF
)\"
"
```

---

## Notes for the operator

- **Do not remove the worktree** after the PR merges — the user manages worktree lifecycle (per `CLAUDE.md`).
- If the SDD § 13 check in STEP 2 reveals the post-submit takeover behaviour is documented in the SDD, the cross-repo `brevwick-ops` PR must land **before or with** this one. The sub-agent is responsible for opening that PR (`gh pr create --repo tatlacas-com/brevwick-ops ...`) and linking it from the SDK PR body.
- Bundle budget is enforced by CI; the sub-agent does not need to manually check size beyond a sanity glance.
