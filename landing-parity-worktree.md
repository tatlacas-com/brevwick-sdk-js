# brevwick-sdk-js landing-parity Worktrees

4 issues across 2 worktrees in 1 tier. The brevwick-web landing page (PR #192) ships a marketing surface that promises capabilities the SDK does not currently match — console breadcrumbs across all levels, a network ring of *all* recent fetches (not just failures), broader PII redaction, and a staged-status feedback widget UX (`Captured ✓ / Sanitised ✓ / Formatting ⏳`). This file scopes the SDK-side work to bring reality in line with the messaging.

**Key references:**

- `CLAUDE.md` (this repo) — pnpm workspace publishing two npm packages (`@tatlacas/brevwick-sdk` core, `@tatlacas/brevwick-react` adapter); bundle budget DO NOT EXCEED (core ≤ 2.2 kB gzip, on-open ≤ 25 kB gzip); redaction mandatory; lockstep versioning; squash-merge only; no Co-Authored-By
- [SDD § 12 SDK contracts](https://github.com/tatlacas-com/brevwick-ops/blob/main/docs/brevwick-sdd.md#12-sdk-contracts) — public API contract every adapter must satisfy
- Driving brevwick-web PR: [tatlacas-com/brevwick-web#192](https://github.com/tatlacas-com/brevwick-web/pull/192) — the landing-revamp PR whose claims this initiative makes true
- Issues: [#74](https://github.com/tatlacas-com/brevwick-sdk-js/issues/74) React staged-status UX, [#75](https://github.com/tatlacas-com/brevwick-sdk-js/issues/75) Console breadcrumbs, [#76](https://github.com/tatlacas-com/brevwick-sdk-js/issues/76) Network ring all-fetches, [#77](https://github.com/tatlacas-com/brevwick-sdk-js/issues/77) Redact expansion
- Replaces (mis-filed): [tatlacas-com/brevwick-web#143](https://github.com/tatlacas-com/brevwick-web/issues/143) — the input-clear-on-send bug, redirected here

**Conventions (apply to every worktree):**

- pnpm workspace; tsup builds; vitest tests; size-limit enforces bundle budget
- Bundle budget DO NOT EXCEED — every change runs `__tests__/chunk-split.test.ts` + size-limit
- `sideEffects: false` in both packages
- Hand-written mocks (function-field style); no mocking frameworks
- Redaction mandatory — every payload through `redact()` before leaving device; new context fields ship with redaction tests
- Conventional commits, subject ≤ 72 chars; `feat:` prefix for these issues
- **No Co-Authored-By headers** anywhere
- CI gauntlet green locally before push: `pnpm install --frozen-lockfile && pnpm lint && pnpm type-check && pnpm test && pnpm build`
- Squash-merge into `main` only
- **Do not remove worktrees** — the user cleans them up

---

## Grouping rationale (why 2 worktrees, not 4)

**Bundle the 3 ring + redact issues into 1 worktree (WT-rings-redact)** because:

- All three live in `packages/sdk/src/` and edit the same neighbourhood:
  - #75 changes `rings/console.ts` + `types.ts BrevwickRingsConfig` + `config.ts` validation.
  - #76 changes `rings/network.ts` + `types.ts BrevwickRingsConfig` (same union) + `config.ts` validation + the wire field rename in `submit.ts`.
  - #77 changes `core/internal/redact.ts` + `types.ts BrevwickConfig` + `config.ts` validation.
- All three touch `BrevwickRingsConfig` / `BrevwickConfig` and `config.ts` — concurrent PRs would conflict on every commit.
- All three update `golden-payload.test.ts` / `redaction-matrix.test.ts` — same fixtures.
- A single PR delivers the message coherently: "the SDK matches every payload claim the landing makes." Splitting it would have three reviewers each saying "looks fine in isolation, but does the FAQ actually claim *this* set?" — bundling is the cure.

**Split the React widget UX into its own worktree (WT-react-staged-status)** because:

- It lives entirely in `packages/react/src/` (`feedback-button.tsx` + `use-feedback.ts` + tests + README).
- The only cross-package coupling is a small phase-event hook published from `packages/sdk/src/submit.ts` — small and append-only, no conflict with WT-rings-redact's edits to the same file.
- Reviewers for the widget UX are different from reviewers for the rings + redact (UX vs. capture / privacy), so per-PR review surface is cleaner.

**Shared-file conflict surface across both worktrees** (`packages/sdk/src/submit.ts`, `pnpm-workspace.yaml`, root `README.md`): WT-rings-redact lands first; WT-react-staged-status rebases and appends its phase-event hook. No structural conflicts expected.

---

## Dependency map

```
TIER 0 — Parallel from T+0 (2 parallel)
  WT-rings-redact:           #75 + #76 + #77 bundled (single PR)
                              - shared-file edit surface: types.ts, config.ts,
                                submit.ts, README.md
                              - companion brevwick-api PR for the
                                network_errors → network_calls rename
                                (tracked separately in brevwick-api)
  WT-react-staged-status:    #74  staged-status UX in @tatlacas/brevwick-react
                              - depends on a phase-event hook published from
                                packages/sdk/src/submit.ts; cleanest path is
                                to land WT-rings-redact first OR to add the
                                hook in WT-react-staged-status and rebase
```

Worktrees live alongside the main repo at
`/Users/tatlacas/repos/brevwick/brevwick-sdk-js-wt-landing-parity-{rings,react}`.

---

## TIER 0 — Parallel

### Worktree A: rings + redact alignment (#75 + #76 + #77)

Console ring captures every level (default 50). Network ring captures every fetch
(default 20, regardless of status; payload field renamed to `network_calls`).
Redactor expands to cover card / IP / SSN / phone / AWS / GitHub tokens, plus a
configurable `redact: { disable, custom }` extension hook on `BrevwickConfig`.

**Scope:** new + extended patterns in `redact.ts`; widened capture in `rings/console.ts` + `rings/network.ts`; union-shape updates to `BrevwickRingsConfig` + `BrevwickConfig`; payload key rename `network_errors` → `network_calls` paired with a brevwick-api PR; golden-payload + redaction-matrix integration tests; bundle-budget regen if size-limit nudges.

**Blocks:** brevwick-web FAQ tightening (or claim-honesty restoration); brevwick-api shape-lock guard until the wire rename ships.

**Can run in parallel with:** WT-react-staged-status (after rebasing on the shared `submit.ts` phase-event hook, OR by introducing the hook here).

```bash
cd /Users/tatlacas/repos/brevwick/brevwick-sdk-js
git fetch origin
git worktree add ../brevwick-sdk-js-wt-landing-parity-rings -b feat/landing-parity-rings origin/main
cd ../brevwick-sdk-js-wt-landing-parity-rings
```

### Worktree B: React staged-status feedback UX (#74)

Pressing **Send** clears the input, moves the typed text into a user bubble, then
ticks through three staged status rows (`Captured`, `Sanitised`, `Formatting`)
that mirror the brevwick-web AnimatedDemo. Reduced-motion users get all rows at
once; submission failures collapse to a single retry CTA.

**Scope:** `packages/react/src/feedback-button.tsx` + `use-feedback.ts` state-machine extension; phase-event subscription on the `@tatlacas/brevwick-sdk` core (added in this worktree if WT-rings-redact has not yet landed it); test coverage for the three rows + the reduced-motion + the failure path; README state-machine docs.

**Blocks:** brevwick-web AnimatedDemo continuing to ship as "live but aspirational" — once #74 lands the demo can drop the comment that calls it forward-looking.

**Can run in parallel with:** WT-rings-redact.

```bash
cd /Users/tatlacas/repos/brevwick/brevwick-sdk-js
git fetch origin
git worktree add ../brevwick-sdk-js-wt-landing-parity-react -b feat/landing-parity-react origin/main
cd ../brevwick-sdk-js-wt-landing-parity-react
```
