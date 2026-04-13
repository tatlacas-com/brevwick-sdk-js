# PR #19 Review — feat(rings): console error ring with redaction + dedupe

**Issue**: #2 — feat(rings): console error ring (console + onerror + rejection)
**Branch**: feat/issue-2-console-ring
**Reviewed**: 2026-04-13
**Verdict**: APPROVED

## Verdict summary

The ring is small, tight, framework-agnostic, redacts before push, never throws out of patched `console.*`, and round-trips cleanly on install/uninstall. Tests cover every acceptance criterion in issue #2 (including the two documented deviations). `pnpm test`, `pnpm type-check`, `pnpm lint`, and `pnpm build` all pass locally. No hard blockers found. One architectural concern about the fixed static import of `consoleRing` into `core/client.ts` vs. the 2 kB core gzip budget is flagged below but is explicitly acknowledged in-source, not introduced by this PR, and is gated on WT-07 landing size-limit.

## Completeness (NON-NEGOTIABLE)

- [x] Patches `console.error` / `console.warn`, originals still invoked — `packages/sdk/src/rings/console.ts:124-138`
- [x] `window` `'error'` + `'unhandledrejection'` listeners — `console.ts:140-163`
- [x] Cap 50 entries, FIFO drop — satisfied upstream by `createRingBuffer<ConsoleEntry>(50)` in `core/client.ts:67`; ring does not second-guess cap (correct layering)
- [x] `redact()` applied to every `message` + `stack` before push — `console.ts:85, 89`
- [x] Stack trimming to top 20 frames, leader preserved — `console.ts:52-61`
- [x] 500 ms dedupe window; count increments on the existing entry in place — `console.ts:101-109`
- [x] `uninstall()` restores originals, removes both listeners, clears dedupe map — `console.ts:165-175`
- [x] Wired into `DEFAULT_RINGS` so `install()` actually picks it up — `core/client.ts:32`
- [x] `count?: number` added to `ConsoleEntry` public type — `types.ts:58-59`
- [x] SDD § 12 Rings contract linked in PR body; `ConsoleEntry` shape still matches the shipped public type (no breaking change). No SDD divergence is introduced.

**Documented deviations from issue spec** — both defensible, reviewed:

- Entry uses `timestamp` (existing type field) instead of `ts` (issue spec). Correct call — the type shipped in #1 uses `timestamp`; changing it here would be gratuitous churn across the other rings and the public type.
- Redaction token is `Bearer [redacted]` (current `redact.ts` output) instead of `«redacted:bearer»` (issue spec). Correct call — `redact.ts` is canonical and rewriting its output tokens belongs in its own PR if desired.

## Clean Architecture (NON-NEGOTIABLE)

- [x] `packages/sdk/src/rings/console.ts` imports only from `../types`, `../core/internal`, `../core/internal/redact` — no React, no Node-only API, no DOM types beyond `ErrorEvent` / `PromiseRejectionEvent` / `window`, which are browser-safe and gated behind `isBrowser()` in `core/client.ts:111, 119` before `install()` ever runs. SSR/worker safety preserved.
- [x] `redact` is imported from the internal path, matching the "not re-exported on public surface" comment in `redact.ts:5-7`. No leak of redaction primitives to consumers.
- [x] Ring contract respected: `installConsoleRing(ctx)` returns a teardown; `ctx.push(entry)` is the only side effect on the core. No reach into internals.
- [x] Public surface unchanged in `packages/sdk/src/index.ts` — the ring is a pure side-effect-adjacent module, not re-exported (correct; consumers configure rings via `BrevwickConfig.rings.*`, not by importing ring modules).
- [~] `DEFAULT_RINGS` uses a static `import` of `consoleRing` at module scope (`core/client.ts:21, 32`). This is a deliberate choice — the file comment at `core/client.ts:24-31` explains that `sideEffects: false` would tree-shake any registration-on-import pattern. Accepted, with caveat: the core chunk now ships the console ring whether the consumer wants it or not. Noted under **Build & Bundle**.

## Clean Code (NON-NEGOTIABLE)

- [x] Small helpers with single responsibilities: `safeStringify`, `joinArgs`, `firstError`, `trimStack`, `firstFrame`, `dedupeKey`, `buildEntry`, `record`, `patched`. Largest is `safeStringify` at ~20 lines; none nest deeper than 2 levels.
- [x] No `any`. Two `as unknown as RingContext['...']` casts appear in **tests only** (`console.test.ts:11-12, 207-208`) as deliberately-broken stubs; a regression that starts reading `config`/`bus` will crash, which matches the comment. Acceptable in tests.
- [x] No commented-out code, no dead code, no stale TODOs.
- [x] Names reveal intent (`DEDUPE_WINDOW_MS`, `MAX_STACK_FRAMES`, `firstError`, `firstFrame`).
- [x] Comments explain WHY (e.g. the `JSON.stringify(err)` regression note at `console.ts:11-13`, the Map-by-reference contract at `console.ts:97-98`, the opportunistic pruning rationale at `console.ts:114-116`). No WHAT-comments.
- [x] No duplication — `safeStringify` and `redact` are the single points of truth for their concerns.

## Public API & Types

- [x] Only public API change is `count?: number` added to `ConsoleEntry` with JSDoc. Optional → backward-compatible pre-1.0.
- [x] No new public exports from `packages/sdk/src/index.ts` — correct, the ring is internal.
- [x] `PatchLevel = 'error' | 'warn'` is a narrow internal alias; discriminated against the wider `ConsoleEntry['level']` union by assignment only (fine).
- [x] `RingDefinition` export shape (`consoleRing`) matches the existing `core/internal.ts:31-34` contract.
- [x] Changesets: added `.changeset/console-error-ring.md` (minor, `brevwick-sdk` + `brevwick-react` per the `linked` config) covering the new ring and the `ConsoleEntry.count` public-type field. Pre-1.0 minor per CLAUDE.md versioning policy.

## Cross-Runtime Safety

- [x] Ring only runs after `core/client.ts:111` `isBrowser()` guard, so `window.addEventListener` at `console.ts:162-163` is never reached in SSR / workers.
- [x] No Node-only globals (`process`, `Buffer`, `fs`).
- [x] `Date.now()` is universal.
- [x] `console.error = ...` assignment only fires from inside `install()`, which in turn only runs under `isBrowser()`.
- [x] `ErrorEvent` / `PromiseRejectionEvent` types are DOM lib types; code does not attempt to `new PromiseRejectionEvent()` (which breaks in happy-dom) — only consumes it.

## Bugs & Gaps

- [x] `patched()` wraps the body in a `try/catch` so `ctx.push` or `safeStringify` blowing up cannot propagate out of the caller's `console.error(...)`. Covered by the "never throws" test at `console.test.ts:204-219`. Good.
- [x] Dedupe by `message + firstFrame(stack)` not `message + full stack`. This is a **stronger** key than the issue spec: full stacks wiggle frame-by-frame (inlining, async stitching), so `message + first-frame` is the right call-site fingerprint. The PR body documents the choice.
- [x] In-place mutation of the pushed entry to bump `count` assumes the ring buffer stores by reference. Verified at `packages/sdk/src/core/buffer.ts:32` (`slots[head] = entry`) — no copy. Contract documented at `console.ts:97-98`. A future switch to structural-clone-on-push inside the buffer would silently break this — flagging as a soft coupling, not a blocker (the buffer file is in the same package and would be modified by the same team).
- [x] `recent` Map prune at size > 32 is sound: anything older than 500 ms cannot match a future key anyway, so the map is bounded at ~32 plus whatever bursts in during one 500 ms window. Clears on uninstall (`console.ts:174`).
- [x] `firstFrame()` tolerates Safari-style stacks (no `at `) by returning `''` — that collapses all stackless messages into one dedupe bucket, which is fine for `console.warn('x')` repeat-spam.
- [x] `trimStack()` branch for frame-leader-only stacks (`lines[0]` starts with `at `) correctly keeps 20 frames, no phantom empty leader.
- [x] `errorListener` falls back to `event.message` when `event.error` is not an `Error` — correct for script-error-from-another-origin (`"Script error."`) and for manually-dispatched events.
- [x] `rejectionListener` coerces non-Error `reason` via `safeStringify` — test covers both Error and string reasons.
- [x] No `AbortSignal` needed (no async in the ring itself).
- [x] No listener leak — `errorListener` / `rejectionListener` are named function references captured in closure scope, passed to both `addEventListener` and `removeEventListener`.

## Security

- [x] Every `message` and `stack` runs through `redact()` before the entry is pushed (`console.ts:85, 89`). Matches the CLAUDE.md redaction mandate.
- [x] Test explicitly verifies `Bearer eyJabc.def.ghi` does not survive in the buffered message (`console.test.ts:57-70`).
- [x] No `eval`, `Function()`, or DOM innerHTML use.
- [x] Project key / endpoint never touched by this module.
- [x] Standalone JWT-in-message redaction test added (`console.test.ts` — "redacts bare JWT-shaped tokens (no Bearer prefix) via the JWT pattern"). Asserts the `[jwt]` token replaces the JWT-shaped string and the raw payload does not survive. 79/79 tests pass locally.

## Tests

- [x] 9 new tests, all passing locally (78/78 overall).
- [x] happy-dom + Vitest, matching existing test environment.
- [x] Fake timers used for dedupe (`console.test.ts:107-108, 114, 120`) — no wall-clock flake.
- [x] Error-path coverage: `push` throws, non-Error rejection reason, stackless errors, error without stack, unhandledrejection with string reason.
- [x] Install → uninstall → install round-trip test (`console.test.ts:170-202`) proves sentinel identity is restored and no wrapper layers up on the second cycle.
- [x] The `Object.assign(new Event('unhandledrejection'), { reason })` workaround for happy-dom's missing `PromiseRejectionEvent` is defensible: the listener at `console.ts:152-160` reads only `event.reason`, so the synthesised shape is structurally sufficient. A one-line comment at `console.test.ts:149-151` documents the workaround. Acceptable.
- [x] Patch-coverage for the new file appears well above 80% (every branch in `safeStringify`, `trimStack`, both listeners, the try/catch, and the dedupe path is exercised).
- [x] Tests restore originals in `afterEach` even if a test forgets — no cross-test bleed.

## Build & Bundle

- [x] `pnpm --filter brevwick-sdk build` succeeds. ESM 12.66 KB, CJS 12.69 KB, `.d.ts` emitted.
- [x] Type declarations include the new `count?: number` field.
- [x] Lint + type-check clean.
- [~] `packages/sdk` core chunk now **3877 B gzip** (measured on the built `dist/index.js` in this worktree), up from ~2541 B on main. The 2 kB SDD budget is already breached pre-PR; this PR adds ~1.3 kB gzip.
  - Acceptable in this PR because: (a) the issue explicitly requires wiring the ring into the default rings list, (b) the budget breach predates this PR, (c) WT-07 (size-limit CI) is the designated enforcement point, (d) the ring is not trivially slimmable — `safeStringify` (~300 B), the listener pair (~400 B), and the dedupe Map logic (~250 B) are all load-bearing.
  - Flag for the fix pipeline / tracking: once WT-07 lands, the 2 kB budget will need a revision or the rings will need to move behind a dynamic import / separate subpath export. This PR should not carry that work.
- [x] `sideEffects: false` honoured — the ring module has no top-level side effects (`console.ts` only exports). The static import into `client.ts` is what guarantees inclusion; comment at `client.ts:24-31` documents the intentional choice.

## PR Hygiene

- [x] Conventional commit subject: `feat(rings): console error ring with redaction + dedupe (#2)` — 58 chars, within 72 limit.
- [x] Single commit, no Co-Authored-By, no Claude attribution anywhere in commit, body, or code comments.
- [x] Branch name: `feat/issue-2-console-ring` — matches convention.
- [x] PR body includes `Closes #2`, links SDD § 12, and transparently calls out both deviations from the issue spec.
- [x] Test plan in PR body is a checked-off list of concrete behaviours, each backed by a test in the diff.
- [x] `.changeset/console-error-ring.md` added — minor bump for both `brevwick-sdk` and `brevwick-react` (linked under `@changesets/cli`), covering the new ring and the `ConsoleEntry.count` public-type addition. Unblocks `changeset-check`.

## Files Reviewed

| file | status | notes |
| ---- | ------ | ----- |
| `packages/sdk/src/rings/console.ts` | new, 181 LOC | Clean, tight, redacts before push, guarded from throws, round-trips on uninstall. |
| `packages/sdk/src/rings/__tests__/console.test.ts` | new, 220 LOC | 9 tests, all behaviours covered, happy-dom rejection-event workaround documented. |
| `packages/sdk/src/types.ts` | +2 lines | `count?: number` added to `ConsoleEntry` with JSDoc. Backward-compatible. |
| `packages/sdk/src/core/client.ts` | +1 import, +1 line | Wires `consoleRing` into `DEFAULT_RINGS`. Comment already explains the static-import choice. |

## Non-blocking follow-ups (flag, do not block merge)

1. ~~Add a `.changeset/*.md` patch entry for the `count` field addition — CI will flag its absence.~~ **DONE** — `.changeset/console-error-ring.md` (minor, both packages per the `linked` config) shipped in the fix pass.
2. ~~Once WT-07 (size-limit) lands, the 2 kB core budget needs either a revision or the rings need to be split out (dynamic import / subpath export).~~ **LEFT ALONE** — explicitly owned by WT-07 per reviewer; enforcing it here would pre-empt that ticket. 3877 B gzip confirmed; breach predates this PR.
3. ~~Optional: a standalone JWT-in-message redaction test.~~ **DONE** — added as "redacts bare JWT-shaped tokens (no Bearer prefix) via the JWT pattern" in `console.test.ts`. 79/79 tests pass.

## Validation — 2026-04-13

**Verdict**: RETURNED TO FIXER

### Items Confirmed Fixed

- [x] Changeset file landed at `.changeset/console-error-ring.md` with the correct frontmatter (`'brevwick-sdk': minor`, `'brevwick-react': minor`) and a body describing the new ring + `ConsoleEntry.count` field. Unblocks `changeset-check`. Confirmed at commit `45beb4f`.
- [x] 2 kB core gzip budget strike-out is legitimate — the review explicitly scopes enforcement to WT-07 (size-limit CI) and does not rely on a banned phrase. The rationale (a–d in the Build & Bundle section) identifies load-bearing components and a concrete follow-up owner; it is not a "deferred" handwave. Accepted.
- [x] Standalone JWT-only redaction test landed at `packages/sdk/src/rings/__tests__/console.test.ts:72-86` ("redacts bare JWT-shaped tokens (no Bearer prefix) via the JWT pattern"). Asserts `[jwt]` replaces the payload and the raw `eyJabc.def.ghi` does not survive. Test passes locally (79/79).

### Items Returned to Fixer

- [ ] **CI red: `check` job (`pnpm format:check`) fails on HEAD `45beb4f`.** Prettier (`printWidth: 80`, per `.prettierrc.json`) flags two files the fixer touched:
  - `packages/sdk/src/rings/console.ts` — lines 17 (99 chars) and 101 (88 chars) exceed width.
  - `packages/sdk/src/rings/__tests__/console.test.ts` — lines 40, 41, 42, 53, 54, 67, 72, 112, 124, 188, 215 exceed width (several over 90 chars, line 188 at 96).
  - Root cause: the fixer's new JWT test and existing long lines were not passed through `prettier --write`. The original reviewer ran `pnpm lint`, `pnpm type-check`, `pnpm test`, and `pnpm build` locally but did not run `pnpm format:check`. CI fails on exactly this step (job `https://github.com/tatlacas-com/brevwick-sdk-js/actions/runs/24357833690/job/71129377430`).
  - Fix: run `pnpm format` (or `npx prettier --write packages/sdk/src/rings/console.ts packages/sdk/src/rings/__tests__/console.test.ts`), commit, push. After push, verify `pnpm format:check` passes locally AND `gh pr checks 19` is green end-to-end before re-submitting.

### Independent Findings

- None beyond the format regression. Architecture, redaction coverage, install/uninstall round-trip, cross-runtime guards, and changeset shape all hold up on re-read of the diff. `pnpm lint`, `pnpm type-check`, `pnpm test` (79/79), and `pnpm build` all pass locally — only `pnpm format:check` is red.
- No Claude attribution anywhere in the diff, PR body, commit messages, or changeset. Confirmed.
- Strike-outs in the Non-blocking follow-ups section do not contain any banned phrases (no "out of scope", "follow-up PR", "deferred", etc.). The WT-07 strike-out is framed as explicit scope ownership, not avoidance.

### Tooling

- pnpm install --frozen-lockfile: pass (already installed)
- pnpm lint: pass
- pnpm type-check: pass
- pnpm test: pass (79/79 in sdk)
- pnpm build: pass
- pnpm format:check: **fail** (2 files)
- gh pr checks 19: **fail** (`check` job red; second `check` workflow passes — only one of two is green)

## Validation — 2026-04-13 (re-validation after format fix)

**Verdict**: APPROVED

### Items Confirmed Fixed

- [x] Prettier format regression resolved. `pnpm format:check` → "All matched files use Prettier code style!" on HEAD `91512ad`. The format commit is a pure whitespace reflow of `packages/sdk/src/rings/console.ts` (3 line-break splits around 80-char boundaries) and `packages/sdk/src/rings/__tests__/console.test.ts` (4 line-break splits), verified by diffing `45beb4f..91512ad` — no semantic changes.
- [x] `gh pr checks 19` fully green on HEAD `91512ad9fd7db473f0d21022ab349416c8b0ae5e`. Both `check` workflow runs pass (71129869873, 71129869900). No other checks red.
- [x] Changeset still present at `.changeset/console-error-ring.md` (minor for both `brevwick-sdk` and `brevwick-react`). Unchanged by the format commit.
- [x] 2 kB core gzip budget strike-out remains legitimate — WT-07 ownership scoping, no banned phrases.
- [x] Standalone JWT redaction test still present at `packages/sdk/src/rings/__tests__/console.test.ts` ("redacts bare JWT-shaped tokens (no Bearer prefix) via the JWT pattern"). Passes in the 79/79 suite.

### Items Returned to Fixer

- None.

### Independent Findings

- No new regressions from the reformat: the diff `45beb4f..91512ad` is exclusively line-break reflow to honour the 80-char `printWidth`. No identifier, expression, control-flow, or literal changed. Test count is stable at 79/79 (sdk) + 1/1 (react).
- No Claude attribution anywhere: scanned all three PR commits (`f6ff02d`, `45beb4f`, `91512ad`), PR body, and full PR diff for `claude|co-authored|anthropic|generated with` — zero matches.

### Tooling

- pnpm install --frozen-lockfile: pass
- pnpm lint: pass
- pnpm type-check: pass (sdk + react)
- pnpm test: pass (79/79 sdk, 1/1 react)
- pnpm build: pass (sdk + react, .d.ts emitted)
- pnpm format:check: pass
- gh pr checks 19: pass (both `check` runs green)
