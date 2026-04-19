# brevwick-sdk-js AI-gating Worktrees

2 issues across 2 worktrees. Same conventions as `worktree.md`; this file only covers the AI-gating + chat-UI initiative (#25, #26).

**Key references:**

- `CLAUDE.md` (this repo) — working style, bundle budgets (< 2.2 kB core / < 25 kB on widget open), redaction mandate, conventional commits, no Co-Authored-By
- [SDD § 12](https://github.com/tatlacas-com/brevwick-ops/blob/main/docs/brevwick-sdd.md#12-client-sdk-contracts) — canonical Client SDK contracts
- Plan document: `/home/tatlacas/.claude/plans/at-the-moment-all-mighty-crescent.md`
- Issues: [#25](https://github.com/tatlacas-com/brevwick-sdk-js/issues/25), [#26](https://github.com/tatlacas-com/brevwick-sdk-js/issues/26)

**Conventions (apply to every worktree):**

- pnpm workspace; two packages: `brevwick-sdk` (core, framework-agnostic) and `brevwick-react` (bindings)
- TypeScript strict, tsup for builds (ESM + CJS + dts), Vitest + happy-dom for tests
- `sideEffects: false` in both packages; treeshake-friendly public surface
- Dynamic imports for anything heavy (`await import('...')`) so it never lands in the base bundle
- Single quotes, semicolons, trailing commas (prettier); relative paths inside each package
- Conventional commits, subject ≤ 72 chars, **no Co-Authored-By headers**, no Claude attribution
- Never log: project key plaintext, auth headers, bearer tokens, JWT contents, email bodies, raw report descriptions

**Hard bundle budgets — CI enforces via `packages/sdk/src/__tests__/chunk-split.test.ts`:**

- `brevwick-sdk` core initial chunk: **≤ 2.2 kB gzip**
- Screenshot chunk (`modern-screenshot`): **≤ 18 kB gzip** (budget already in place)
- `brevwick-react` entry: **≤ 25 kB gzip** (excluding peer deps)

**Redaction rules (apply to every worktree that touches payloads):**

- Every string that leaves the device runs through `packages/sdk/src/redact.ts` first
- Adding a new captured field? Add a redaction golden test for it in the same PR

---

## Grouping rationale (why 2 sequential worktrees, not 1 combined and not 2 parallel)

**Why not one combined PR:** #25 is a substantial UI rewrite of `packages/react/src/feedback-button.tsx` + a large expansion of `packages/react/src/styles.ts`. Bundling #26's small additive work (a toggle + config fetch) into the same PR would inflate the diff and slow review. They're separable in scope.

**Why not two parallel PRs:** #26 needs to attach its toggle to the redesigned composer footer introduced by #25 and add new `brw-*` classes to the same `styles.ts`. Running them in parallel guarantees merge conflicts on both files, and #26's toggle would need a placeholder attach-point that's wrong by the time #25 lands.

**Answer: sequential worktrees.** WT-A ships #25 first. WT-B branches from `origin/main` after WT-A merges and adds #26 on top.

#25 has zero API dependency (visual redesign only), so it can start at T+0 while the API work happens. #26 waits on both api#54 (ingest `use_ai`) and api#56 (public `/v1/ingest/config`).

---

## Dependency map

```
TIER 0 — Can start at T+0 (no API dependency)
  WT-A: #25  Chat-thread UI redesign for FeedbackButton

TIER 1 — After WT-A merges AND api#54 + api#56 merge
  WT-B: #26  Submitter 'Use AI' toggle + config fetch
```

Worktrees live alongside the main repo at `/home/tatlacas/repos/brevwick/brevwick-sdk-js-wt-*`.

---

## TIER 0

---

### Worktree A: Chat-thread UI redesign for FeedbackButton (#25)

Visual + UX rewrite of the React widget: FAB → slide-up anchored panel styled as a chat thread (header, scrollable bubble-stack, sticky composer). One-shot submission preserved; no backend changes.

**Scope:** refactor `packages/react/src/feedback-button.tsx` (panel + header + thread + composer); extend `packages/react/src/styles.ts` with `brw-panel-*`, `brw-thread-*`, `brw-bubble-*`, `brw-composer-*`, `brw-icon-btn` classes; minimize/restore state preserved; Enter-to-send + Shift+Enter newline; success bubble + 'Send another'; prefers-reduced-motion support; update tests and examples.

**Blocks:** WT-B (the toggle from #26 lives inside the composer layout this worktree creates).

**Can run in parallel with:** the API worktrees in brevwick-api — no shared state.

```bash
cd /home/tatlacas/repos/brevwick/brevwick-sdk-js
git fetch origin
git worktree add ../brevwick-sdk-js-wt-chat-ui -b feat/issue-25-chat-ui origin/main
cd ../brevwick-sdk-js-wt-chat-ui

claude --dangerously-skip-permissions "
You are redesigning the React widget into a chat-thread UI. Your task is GitHub issue #25 on tatlacas-com/brevwick-sdk-js.

THIS REPO: \$(pwd)

STEP 1 — Read project context:
- Read CLAUDE.md — bundle budgets, redaction mandate, no Co-Authored-By, relative paths.
- Run: gh api repos/tatlacas-com/brevwick-sdk-js/issues/25 --jq '.body'
- Read: packages/react/src/feedback-button.tsx (current modal form), packages/react/src/styles.ts (injected CSS pattern + existing brw-* classes + theme variables + dark-mode media query), packages/react/src/provider.tsx, packages/react/src/use-feedback.ts, packages/react/src/__tests__/feedback-button.test.tsx, packages/react/tsup.config.ts, packages/sdk/src/submit.ts (for payload shape — DO NOT change), packages/sdk/src/types.ts.
- Fetch SDD § 12 SDK contracts (widget UX) + § 13 dashboard (for visual language alignment):
  gh api repos/tatlacas-com/brevwick-ops/contents/docs/brevwick-sdd.md --jq '.content' | base64 -d | sed -n '/^## 12/,/^## 13/p'

STEP 2 — NO new dependencies. Everything is CSS + existing Radix Dialog.
- Confirm Radix @radix-ui/react-dialog is already a direct dep (preserves focus trap + Esc handling).

STEP 3 — Component architecture:
- Keep Radix Dialog.Root + Dialog.Trigger + Dialog.Portal + Dialog.Content as the outer frame — RESTYLE Dialog.Content as an anchored panel rather than centered modal. The overlay should be minimal (or omitted) — chat bubbles do not normally dim the page.
- Break feedback-button.tsx into local sub-components for clarity:
  * <Fab /> — the launcher button
  * <Panel /> — Dialog.Content wrapper with header, thread, composer
  * <PanelHeader /> — avatar/logo slot, title, minimize, close
  * <Thread /> — scrollable bubble list
  * <AssistantBubble /> — left-aligned; muted bg
  * <UserBubble /> — right-aligned; accent bg
  * <AttachmentChip /> — thumbnail/filename/remove (×)
  * <Composer /> — sticky footer: icon buttons (attach-screenshot, attach-file) + autogrowing textarea + send button
  * <DisclosureExpectedActual /> — collapsed by default; reveals two inline fields when clicked
  * <SuccessState /> — confirmation bubble + 'Send another' button

STEP 4 — Panel styling (packages/react/src/styles.ts — extend, don't replace):
- Add tokens: --brw-panel-bg, --brw-bubble-assistant-bg, --brw-bubble-user-bg, --brw-chip-bg, --brw-composer-bg, --brw-divider. Provide light + dark values via the existing @media (prefers-color-scheme: dark).
- .brw-panel:
  position: fixed;
  bottom: 24px;
  right: 24px;   /* flipped to 'left: 24px' when position prop is 'bottom-left' */
  width: min(92vw, 400px);
  height: min(80vh, 640px);
  border-radius: 16px 16px 12px 12px;
  box-shadow: large;
  display: flex;
  flex-direction: column;
  background: var(--brw-panel-bg);
  animation: brw-slide-up 200ms ease-out;
- @keyframes brw-slide-up { from { transform: translateY(16px); opacity: 0; } to { transform: none; opacity: 1; } }
- @media (prefers-reduced-motion: reduce) { .brw-panel { animation: none; } }
- .brw-panel-header, .brw-thread (flex: 1; overflow: auto), .brw-composer (sticky; flex-shrink: 0), .brw-bubble, .brw-bubble--assistant, .brw-bubble--user, .brw-chip, .brw-icon-btn, .brw-send-btn, .brw-disclosure.
- Mobile: at <= 480px panel covers full width minus 16px on each side.

STEP 5 — Interactions:
- Enter in composer submits (unless Shift is held → newline). Autogrow textarea between 1 and ~5 rows.
- Close (×) — if composer has non-empty content or any attachments, render a small shadcn-style confirm inline. If empty, close immediately and clear state.
- Minimize (_) — panel closes but state (typed content + attachments) is preserved. Reopen restores the exact state. Track state in the FeedbackButton component (not global).
- Escape closes (via Radix Dialog default); map to the 'minimize with preserved state' semantics rather than a destructive close to avoid losing typed content.
- Screen readers: aria-live='polite' on the thread container; each new assistant/user bubble announced.

STEP 6 — Progressive disclosure for expected/actual:
- Remove the always-visible Expected and Actual textareas from the cold form.
- Add a disclosure link 'Add expected vs actual' below the main textarea. When expanded, show two compact labelled inputs.
- Fields remain optional and flow into the existing payload shape (DO NOT change composePayload or FeedbackInput in this worktree — #26 owns the payload delta).

STEP 7 — Success state:
- After useFeedback().submit returns { ok: true }, replace the thread with a centered success bubble ('Thanks — your report is on its way.') + a primary 'Send another' button that clears local state and returns the thread to the empty/greeting view.
- Leave the panel open — do NOT auto-dismiss.

STEP 8 — Tests (packages/react/src/__tests__/feedback-button.test.tsx):
- Update the existing test file to the new component tree — remove dialog-centered assumptions, assert on the panel/thread/composer structure.
- New cases:
  * Enter in composer submits; Shift+Enter inserts newline (assert via textarea value)
  * Minimize preserves state: type a message → minimize → reopen → textarea still has the text
  * Close with dirty state renders a confirm; close when clean dismisses immediately
  * Success state swaps thread for the success bubble + 'Send another' resets to an empty thread
  * Disclosure: expected/actual hidden by default, revealed on click
  * a11y: happy-dom + vitest-axe — no violations in empty, typing, attached, and success states
  * prefers-reduced-motion: stub matchMedia to return matches=true and assert animation name is 'none' (or animation is absent)
- Keep all redaction / submit tests passing.

STEP 9 — Examples + docs:
- Update examples/next/src/app/configured-widget.tsx if any prop shape changes (it shouldn't — same public API).
- Update examples/vanilla if it demos the React widget.
- Update any README screenshots or doc snippets that show the old modal.

STEP 10 — Bundle budget:
- Run: pnpm --filter brevwick-react build && pnpm --filter brevwick-react test
- Confirm the react entry stays within ≤ 25 kB gzip. If the redesign pushes over, look for: inlined SVGs that should be CSS masks, duplicated class strings, avoid pulling in new Radix primitives.
- Confirm packages/sdk/src/__tests__/chunk-split.test.ts still passes — this worktree should not move the SDK core budget at all.

STEP 11 — CI gauntlet:
pnpm install \\\\
  && pnpm format \\\\
  && pnpm lint \\\\
  && pnpm type-check \\\\
  && pnpm test \\\\
  && pnpm build
All green before push.

STEP 12 — Manual smoke:
- pnpm dev:examples → Next.js example → open the widget on desktop + mobile viewport + light/dark.
- Verify focus trap (Tab cycles inside the panel), Esc minimizes, send + attachments flow end-to-end.

STEP 13 — Commit and PR:
git add -A
git commit -m 'feat(react): chat-thread panel redesign for FeedbackButton (#25)'
git push -u origin feat/issue-25-chat-ui
gh pr create --title 'feat(react): chat-thread panel redesign for FeedbackButton' --body \"\$(cat <<'PREOF'
Closes #25

Implements [SDD § 12 Widget UX](https://github.com/tatlacas-com/brevwick-ops/blob/main/docs/brevwick-sdd.md#12-client-sdk-contracts).

## Summary
- FAB opens an anchored slide-up panel (bottom-right/left) styled as a chat thread, not a centered modal
- Panel layout: header (title, minimize, close) → scrollable bubble thread → sticky composer (icons + autogrowing textarea + send)
- Progressive disclosure for expected/actual (hidden by default behind 'Add expected vs actual')
- Enter sends, Shift+Enter newline; minimize preserves state; close confirms when dirty
- Success state swaps the thread for a confirmation bubble + 'Send another'
- Light + dark polish; prefers-reduced-motion disables the slide animation
- NO new dependencies; bundle budgets preserved
- Public API (props, useFeedback, submit payload) unchanged — #26 owns the use_ai delta

## Test plan
- [ ] Enter/Shift+Enter behavior asserted in vitest
- [ ] Minimize round-trip preserves composer state
- [ ] Close-when-dirty confirms; close-when-clean dismisses
- [ ] Success + 'Send another' resets to empty thread
- [ ] vitest-axe passes on empty, typing, attached, and success states
- [ ] packages/react bundle under 25 kB gzip; SDK core budget untouched
PREOF
)\"
"
```

---

## TIER 1 — After WT-A merges + API dependencies ready

---

### Worktree B: Submitter 'Use AI' toggle + config fetch (#26)

Adds a small AI on/off toggle inside the composer footer from WT-A. Widget calls `GET /v1/ingest/config` lazily on first open to decide whether to render the toggle. Submission payload gains an optional `use_ai: boolean`.

**Scope:** `packages/sdk/src/types.ts` adds `use_ai` + `ProjectConfig`; new `packages/sdk/src/config.ts` (dynamic-imported) with `getConfig()`; `packages/sdk/src/submit.ts` `composePayload()` threads `use_ai`; `packages/react/src/feedback-button.tsx` lazy-fetches config on first open and conditionally renders the toggle; tests for the three config states (disabled / forced-on / submitter-choice).

**Depends on:**
- **WT-A (#25)** merged — this worktree mounts its toggle inside the composer footer WT-A created.
- **brevwick-api#54** merged — adds `use_ai` to the ingest payload contract.
- **brevwick-api#56** merged — adds the `GET /v1/ingest/config` endpoint.

All three must be merged before branching WT-B.

**Blocks:** none.

```bash
# Verify prerequisites.
gh pr list --repo tatlacas-com/brevwick-sdk-js --state merged --search 'chat-thread panel' --limit 5
gh pr list --repo tatlacas-com/brevwick-api     --state merged --search 'AI toggles' --limit 5
gh pr list --repo tatlacas-com/brevwick-api     --state merged --search 'ingest config' --limit 5
# Do not start until all three are merged.

cd /home/tatlacas/repos/brevwick/brevwick-sdk-js
git fetch origin
git worktree add ../brevwick-sdk-js-wt-use-ai-toggle -b feat/issue-26-use-ai-toggle origin/main
cd ../brevwick-sdk-js-wt-use-ai-toggle

claude --dangerously-skip-permissions "
You are adding the submitter 'Use AI' toggle and project config fetch. Your task is GitHub issue #26 on tatlacas-com/brevwick-sdk-js.

THIS REPO: \$(pwd)

STEP 1 — Read project context:
- Read CLAUDE.md — bundle budget (core ≤ 2.2 kB gzip), dynamic-import discipline, redaction mandate.
- Run: gh api repos/tatlacas-com/brevwick-sdk-js/issues/26 --jq '.body'
- Read: packages/sdk/src/index.ts (public Brevwick surface), packages/sdk/src/types.ts, packages/sdk/src/submit.ts (composePayload), packages/sdk/src/redact.ts, packages/sdk/src/__tests__/chunk-split.test.ts (budget test), packages/react/src/feedback-button.tsx (composer layout from WT-A), packages/react/src/styles.ts (brw-composer-* classes from WT-A), packages/react/src/provider.tsx.
- Fetch SDD § 7 ingest + § 12 SDK contracts:
  gh api repos/tatlacas-com/brevwick-ops/contents/docs/brevwick-sdd.md --jq '.content' | base64 -d | sed -n '/^## 7/,/^## 8/p'
  gh api repos/tatlacas-com/brevwick-ops/contents/docs/brevwick-sdd.md --jq '.content' | base64 -d | sed -n '/^## 12/,/^## 13/p'

STEP 2 — Types (packages/sdk/src/types.ts):
- Add interface ProjectConfig { ai_enabled: boolean; ai_submitter_choice_allowed: boolean; }
- Extend FeedbackInput with use_ai?: boolean
- Export ProjectConfig from packages/sdk/src/index.ts (keep the exports list frozen/explicit).

STEP 3 — Config fetcher (packages/sdk/src/config.ts — NEW, dynamic-imported):
- export async function fetchConfig(endpoint: string, projectKey: string): Promise<ProjectConfig | null>
- Use fetch with the same Authorization header as submit().
- 200 → parse and validate with a hand-rolled guard (no zod; core is bundle-budgeted). Type-check each field is a boolean; reject if not.
- non-200 or exception → return null. Do not throw.
- DO NOT put this in the eager chunk. It must be dynamic-imported by callers so chunk-split.test.ts still passes.

STEP 4 — Brevwick API surface (packages/sdk/src/index.ts / core/client.ts):
- Add method getConfig(): Promise<ProjectConfig | null> on the Brevwick interface.
- Implementation: const mod = await import('./config'); return mod.fetchConfig(...).
- Cache the result in an instance-level promise (Promise<ProjectConfig | null>) so a second call re-uses the first resolution. DO NOT invalidate within a page lifetime — the contract is 'per session'.

STEP 5 — Thread use_ai through submit:
- packages/sdk/src/submit.ts composePayload(): when input.use_ai !== undefined, set payload.use_ai = input.use_ai. Do NOT redact boolean fields.
- Add a test case to the existing submit golden (or adjacent test) covering use_ai=true / false / undefined.

STEP 6 — React widget toggle:
- In feedback-button.tsx, introduce useProjectConfig() — a small internal hook that:
  * Returns { status: 'idle' | 'loading' | 'ready' | 'error', config: ProjectConfig | null }
  * Triggers brevwick.getConfig() on the FIRST panel open (track with a ref). Subsequent opens do not re-fetch.
  * DO NOT fetch on mount — that would blow the 'zero-cost until opened' property.
- Render policy (inside the composer from WT-A):
  * status !== 'ready' → render nothing (no toggle, no skeleton — absence is fine; the config fetches quickly relative to human typing)
  * config === null OR ai_enabled === false → render nothing; DO NOT set use_ai on submission
  * ai_enabled === true && ai_submitter_choice_allowed === false → render nothing; DO NOT set use_ai (admin has forced AI on; no user choice)
  * ai_enabled === true && ai_submitter_choice_allowed === true → render <AIToggle defaultOn /> and thread its boolean into the submit() call as use_ai.
- AIToggle component: inline pill/switch (role='switch', aria-checked bound to state, aria-label='Format with AI'); label 'AI' visible next to the dot. Tap/click toggles. Keyboard: Space toggles when focused. CSS under new classes brw-aitoggle, brw-aitoggle--on in styles.ts.

STEP 7 — Tests:
- packages/sdk/src/config — unit tests:
  * 200 with valid shape parses to ProjectConfig
  * 200 with missing or non-boolean field → null
  * non-200 → null; thrown network error → null
  * Caches first result: second invocation does not re-fetch (spy on fetch)
- packages/sdk/src/submit — golden test update:
  * payload includes use_ai when provided, omits when undefined
- packages/react/src/__tests__/feedback-button.test.tsx — add:
  * config.ai_enabled=false → no toggle, submit omits use_ai
  * ai_enabled=true + choice_allowed=false → no toggle, submit omits use_ai
  * ai_enabled=true + choice_allowed=true → toggle renders on by default, submit payload has use_ai=true; clicking toggle sends use_ai=false
  * config fetch fails → widget still works, no toggle, submit omits use_ai
  * config only fetched on FIRST panel open; not on mount; not on second open
  * a11y (vitest-axe + role='switch' + aria-checked) for both toggle states

STEP 8 — Bundle budget (critical):
- Run: pnpm --filter brevwick-sdk build && pnpm --filter brevwick-sdk test
- Confirm chunk-split.test.ts still passes — the core bundle must stay ≤ 2.2 kB gzip. config.ts MUST be in a dynamic-import chunk, not the eager one.
- Confirm packages/react bundle stays ≤ 25 kB gzip.

STEP 9 — CI gauntlet:
pnpm install \\\\
  && pnpm format \\\\
  && pnpm lint \\\\
  && pnpm type-check \\\\
  && pnpm test \\\\
  && pnpm build

STEP 10 — Manual smoke against a staging API:
- Configure examples/next with a staging pk_live_*.
- Flip the admin toggle on brevwick-web for three states; reload the example app each time; verify the toggle visibility matches the matrix above and submission payload in network tab carries use_ai as expected.

STEP 11 — Commit and PR:
git add -A
git commit -m 'feat(react): submitter Use-AI toggle + project config fetch (#26)'
git push -u origin feat/issue-26-use-ai-toggle
gh pr create --title 'feat(react): submitter Use-AI toggle + project config fetch' --body \"\$(cat <<'PREOF'
Closes #26

Implements [SDD § 12 Client SDK contracts](https://github.com/tatlacas-com/brevwick-ops/blob/main/docs/brevwick-sdd.md#12-client-sdk-contracts).

Depends on:
- brevwick-sdk-js#25 (composer layout)
- brevwick-api#54 (\`use_ai\` on ingest)
- brevwick-api#56 (\`GET /v1/ingest/config\`)

## Summary
- New Brevwick.getConfig() — dynamic-imported; returns ProjectConfig | null; cached per session
- FeedbackInput gains optional \`use_ai: boolean\`; composePayload threads it when set
- Widget fetches config lazily on FIRST panel open; hides the toggle when the project disables submitter choice
- Toggle rendered as role='switch' inside the composer footer from #25; default on; click/Space toggles
- Core SDK chunk stays ≤ 2.2 kB gzip (config.ts in a dynamic-import chunk); React bundle ≤ 25 kB gzip

## Contract changes (SDD § 12)
- Ingest payload includes optional \`use_ai\`. Server-side contract already landed in brevwick-api#54.

## Test plan
- [ ] config parses valid shape; rejects malformed; returns null on non-200 or error
- [ ] config fetched on first open only; second open re-uses cache
- [ ] Three render states covered: disabled / forced-on / submitter-choice
- [ ] Failed config fetch degrades to no-toggle; submission still works
- [ ] chunk-split.test.ts green — SDK core ≤ 2.2 kB gzip
- [ ] vitest-axe + role='switch' + aria-checked both states
PREOF
)\"
"
```

---

## Parallel execution cheat sheet

- **At T+0:** WT-A (#25) — starts immediately, no API dependency.
- **While WT-A is in review:** the API initiative (brevwick-api#54, #55, #56) proceeds in parallel.
- **After WT-A merges AND api#54 + api#56 merge:** WT-B (#26) starts.
- **api#55 is not a dependency for this repo** — it powers web#57's usage panel; the SDK never calls `/ai-usage`.
