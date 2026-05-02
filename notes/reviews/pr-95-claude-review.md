# PR #95 Review — feat(react-native): route ring via React Navigation + Expo Router

**Issue**: #87 — feat(react-native): route ring — React Navigation + Expo Router via navigationRef
**Branch**: feat/issue-87-rn-route-ring
**Reviewed**: 2026-05-02
**Verdict**: CHANGES REQUIRED → **RESOLVED** (fixes pushed to branch)

The seam itself is sound (no shortcut, no provider stub-work papering over the missing #83), tests run green (7 pass), build is clean (967 B ESM / 1.47 KB CJS), type-check passes, and conventional commit + branch hygiene is correct. The blocker is **redaction completeness**: the PR redacts param *keys* by name but never runs resolved param *values* through the SDK's global `redact()`. CLAUDE.md says "Every payload that leaves the device runs through `redact()` first" — this PR ships a value-leaking path. Flutter's precedent (cited in the diff comments) does the global sweep; the JS port silently drops it. There are also two correctness bugs (hot-reload `current` swap, route-name `?` collision), test gaps, and a public-API-surface miss (`redactPathParams` should not be exported).

## Completeness (NON-NEGOTIABLE)

- [x] **Redaction-mandatory rule violated** — Fixed. `redact()` is now applied to every benign-keyed param value inside `redactPathParams` *before* `encodeURIComponent`. Order matters because `encodeURIComponent('user@example.com')` becomes `user%40example.com` and the email regex requires a literal `@` — encode-then-redact silently leaks. New test `runs the global redactor over benign-keyed param values (JWT / email / IP)` (`packages/react-native/src/rings/route.test.ts`) asserts JWT, email, and IP values carried by benign keys (`invoiceId`, `ref`, `peer`) are masked to `[jwt]` / `[email]` / `[ip]` (URL-encoded as `%5Bjwt%5D` / `%5Bemail%5D` / `%5Bip%5D` after the post-redaction encode). The `redact()` symbol was added to the public surface in `packages/sdk/src/index.ts`.
- [x] **Concrete fix** — Implemented exactly as described, with the addition that the redact step lives **inside** `redactPathParams` per-value rather than as a single sweep over the assembled path; this is required to keep the redactor's pattern set effective (encoding scrambles the matches).
- [x] **Defer-or-ship judgment** — Shipped, not deferred.

## Clean Architecture (NON-NEGOTIABLE)

- [x] `packages/react-native/src/rings/route.ts` — Inline `REDACT_KEY` regex removed. The package now imports the shared `SENSITIVE_PARAM_KEYS` regex from `@tatlacas/brevwick-sdk`. The single source-of-truth lives in `packages/sdk/src/core/internal/redact.ts`; `packages/sdk/src/rings/network.ts` was updated to consume the same constant in place of its old `REDACT_QUERY_PARAM` literal — both rings now drift-free.
- [x] `packages/sdk/src/index.ts` — Public surface widened deliberately and narrowly to `redact` and `SENSITIVE_PARAM_KEYS`. `Redactor` type and `createRedactor` factory remain internal until a concrete per-instance use-case lands. New JSDoc on each export documents the contract.

## Clean Code (NON-NEGOTIABLE)

- [x] `packages/react-native/src/rings/route.ts` — `name.includes(':')` shortcut dropped. The single `.split('/').map(...).join('/')` walk now handles every name uniformly; the per-segment regex test short-circuits cheaply.
- [x] `packages/react-native/src/rings/route.ts` — `JSON.stringify(v) ?? ''` replaced with `JSON.stringify(v) ?? '[unserializable]'`, with comment explaining the disambiguation from `key=` (which means `value: ''`). New test `falls back to [unserializable] when JSON.stringify returns undefined` covers the function-value case.
- [x] `packages/react-native/src/rings/route.test.ts` — Conditional-type cast removed. `NavigationContainerRefLike` is now exported from `route.ts` (still consumed only inside the package); the mock builder uses a plain `as NavigationContainerRefLike['addListener']` cast on the `vi.fn` definition.
- [x] `packages/react-native/src/rings/route.ts` — Triple-optional chain `navigationRef?.current?.getCurrentRoute?.()` replaced with `ref.getCurrentRoute?.()` — `ref` is captured at attach and reused for the read, so the only remaining optional is on the method itself (which the structural `NavigationContainerRefLike` slice marks as optional). Documented why in the JSDoc on `attachRouteRing`.

## Public API & Types

- [x] `packages/react-native/src/index.ts` — `redactPathParams` removed from public exports. It is still `export`ed from `route.ts` for unit-test access, but is not on the package's public surface (the index file is the only published re-export gate). Comment in index.ts documents the intent.
- [x] `packages/react-native/src/index.ts` — `RouteRingEntry` removed from public exports. `attachRouteRing`'s `push` callback now takes `RouteEntry` from `@tatlacas/brevwick-sdk` (which carries the `kind: 'route'` discriminator); the `push({ kind: 'route', path, timestamp })` call inside `attachRouteRing` was updated to match. Adapter + core types now unify in the `RingEntry` union. `RouteEntry` is also re-exported on the SDK public surface so consumers can compose against the same name.
- [x] `packages/react-native/src/rings/route.ts` — `addListener` event arg comment added documenting why we deliberately discard the event payload (we only need the firing signal, not `event.data.state`).
- [x] `packages/react-native/src/rings/route.ts` — `NavigationContainerRefLike` JSDoc now records the React Navigation versions this slice was authored against (v6.x and v7.x); the file-level docstring carries a "bumps to React Navigation that change the listener signature should update this slice" note for future contributors.

## Cross-Runtime Safety

- [x] No issues. Verified after the changes — no `window` / `document` / Node-only globals introduced. `Date.now()` and `encodeURIComponent` are both universal. Externals in `tsup.config.ts` unchanged.

## Bugs & Gaps

- [x] **Hot-reload `current` swap correctness gap** — Fixed via option (b). `attachRouteRing` now captures `ref = navigationRef?.current` once and the listener uses `ref.getCurrentRoute?.()` (not `navigationRef.current.getCurrentRoute()`), so subscribe + read always target the same navigator instance. Re-attachment across container remounts becomes the provider's responsibility (keyed `useEffect` on `navigationRef.current`, landing with #83). Documented in the `attachRouteRing` JSDoc.
- [x] **Route-name `?` collision** — Fixed via `encodeURIComponent`. `name`, keys, and values are all percent-encoded; `Search?` becomes `Search%3F`. New test `URL-encodes route names, keys, and values so separators cannot collide` asserts both the name encoding and the value encoding (`q=foo & bar=baz` becomes `q=foo%20%26%20bar%3Dbaz`).
- [x] **Object.keys ordering** — Fixed by sorting keys alphabetically inside `redactPathParams`. New test `sorts param keys alphabetically for stable triage paths` proves two distinct construction orders for the same logical params produce byte-identical paths. JSDoc on `redactPathParams` documents the sort.
- [x] **`addListener` returns non-function defensive guard** — Kept the guard for symmetry with the outer `typeof ref.addListener !== 'function'` check, and added the missing test `treats a non-function unsubscribe as a no-op without throwing` so it is no longer dead-coded.
- [x] **`attachRouteRing` not idempotent against double-call** — Documented as a contract limitation in the JSDoc (provider's `useEffect` only ever calls once per mount). Did **not** add WeakMap dedup since #83's provider hook is the right enforcement layer; doing it inside `attachRouteRing` would surface globally-cached state into a function the spec describes as a single-call attach. The detach return is now itself idempotent across multiple calls — see the `detach()` idempotency test below.

## Security

- [x] **Redaction completeness** — Resolved per the Completeness section above; `redact()` runs over every benign-keyed param value before encoding.
- [x] No `eval`, no `Function()`, no `dangerouslySetInnerHTML`, no new secrets in code. (Re-verified after refactor.)
- [x] No CSP-relevant code paths — RN doesn't have a CSP.

## Tests

- [x] **JWT/email value-redaction test** — Added `runs the global redactor over benign-keyed param values (JWT / email / IP)` covering all three redactor categories.
- [x] **JSON.stringify branch test** — Added `serialises object params via JSON.stringify`. Asserts the encoded form `Profile?meta=%7B%22foo%22%3A%22bar%22%2C%22n%22%3A1%7D` (the JSON serialisation, then percent-encoded).
- [x] **`[unserializable]` path test** — Added two: `falls back to [unserializable] for circular-reference values` (catch branch) and `falls back to [unserializable] when JSON.stringify returns undefined` (function-value branch). Both prove the function does not throw and produces the expected marker.
- [x] **20-cap test using inline FIFO stub** — Kept (with updated comment explaining the choice). Note: `createRingBuffer` is intentionally NOT on the SDK public surface — wiring up a real `Brevwick` instance for this assertion would mean exercising `createBrevwick` end-to-end, which the integration test surface for route capture lands with #83's provider once the bus accessor is stable. The unit-level contract assertion (N pushes drop the oldest N - cap entries) is what we can prove today against `attachRouteRing`'s public surface; the comment now spells this out.
- [x] **`detach()` idempotency** — Added `detach() is idempotent — second call is a no-op`. The route.ts implementation now wraps the unsubscribe in a `detached` boolean guard so triple-call only invokes the underlying unsubscribe once. The test asserts `mock.unsubscribe` was called exactly once after three `detach()` calls.
- [x] **Coverage thresholds** — `passWithNoTests: true` removed from `packages/react-native/vitest.config.ts`; added a `coverage.thresholds` block matching `packages/react/vitest.config.ts` (lines: 75, statements: 75, functions: 75, branches: 70). Coverage report after the new tests: 95.12% statements / 93.93% branches / 100% funcs / 100% lines — comfortably above floors. The original "drop in #83" comment in the vitest config is also gone since #87 is the worktree that actually shipped real test code.

## Build & Bundle

- [x] `pnpm --filter @tatlacas/brevwick-react-native build` now produces 1.08 KB ESM / 1.61 KB CJS / 4.45 KB DTS (small growth from importing `redact` + `SENSITIVE_PARAM_KEYS` symbols, plus the larger doc-strings and idempotent-detach closure). Tree-shakeable, no runtime deps. The SDK's eager-chunk gzip is 2784 bytes — under the 2850-byte budget enforced by `packages/sdk/src/__tests__/chunk-split.test.ts`.
- [x] `pnpm --filter @tatlacas/brevwick-react-native type-check` clean.
- [x] `dist/index.d.ts` now emits `attachRouteRing`, `NavigationContainerRefLike`, `NavigationRefLike`. `redactPathParams` and `RouteRingEntry` are no longer on the public surface (per the Public API & Types items above).

## PR Hygiene

- [x] Conventional commit subject for the fix commit is `fix(react-native): redact param values, encode path, fix attach (#87)` — 65 chars, under 72.
- [x] PR body still has `Closes #87`. (Existing PR — unchanged.)
- [x] Branch `feat/issue-87-rn-route-ring` matches the convention.
- [x] No `Co-Authored-By` headers. No Claude attribution.
- [x] Changeset added — `.changeset/react-native-route-ring.md` declares minor bumps on `@tatlacas/brevwick-react-native` (new `attachRouteRing` / `NavigationContainerRefLike` / `NavigationRefLike` public surface) and `@tatlacas/brevwick-sdk` (new public `redact` / `SENSITIVE_PARAM_KEYS` / `RouteEntry` re-exports). Per the `linked` group in `.changeset/config.json` the bump propagates across the suite. `pnpm changeset status --since="origin/main"` now reports the change locally; the `Changeset check / check` CI job will flip green on the next push (run 25248046853 was the last failing run).
- [x] README untouched — canonical README is owned by #90 per `react-native-worktree.md`.

## Files Reviewed

| file | status | notes |
| ---- | ------ | ----- |
| `packages/react-native/src/rings/route.ts` | RESOLVED | Redact-on-value before encode; hot-reload swap fixed by capturing `ref` once; `encodeURIComponent` on name/keys/values; `RouteEntry` (with `kind: 'route'` discriminator) replaces local `RouteRingEntry`; shared `SENSITIVE_PARAM_KEYS` from core; alphabetical key sort; idempotent detach. |
| `packages/react-native/src/rings/route.test.ts` | RESOLVED | Conditional-type cast removed; new tests for JWT/email/IP value-redaction, encoding collisions, JSON.stringify branch, `[unserializable]` (circular + function-value), key sort, detach idempotency, off-spec unsubscribe. |
| `packages/react-native/src/index.ts` | RESOLVED | `redactPathParams` and `RouteRingEntry` removed from public exports; `NavigationContainerRefLike` added to support type-correct mocks. |
| `packages/react-native/vitest.config.ts` | RESOLVED | `passWithNoTests: true` removed; `coverage.thresholds` (75/75/75/70) added mirroring `packages/react/vitest.config.ts`. |
| `packages/sdk/src/index.ts` | UPDATED | `redact` and `SENSITIVE_PARAM_KEYS` added to public surface (narrow, deliberate); `RouteEntry` re-exported so adapter packages compose against the same name. |
| `packages/sdk/src/core/internal/redact.ts` | UPDATED | `SENSITIVE_PARAM_KEYS` constant added (single source of truth, replaces the `REDACT_QUERY_PARAM` literal previously in `network.ts`). |
| `packages/sdk/src/rings/network.ts` | UPDATED | Inline `REDACT_QUERY_PARAM` removed; consumes shared `SENSITIVE_PARAM_KEYS` from `redact.ts`. Behaviour unchanged. |

## Validation — 2026-05-02 (round 1 — HISTORICAL)

> **Status: superseded by round 2 below.** Round 1 returned the PR to the
> fixer over a single missing-changeset regression. That regression was
> resolved in commit `f584636` and round 2 (further down this file) reports
> APPROVED. The "Items Returned to Fixer" section on this round records
> the original gap for audit-trail purposes only — the changeset is now
> present at `.changeset/react-native-route-ring.md` and `Changeset check`
> CI is green. Do **not** treat this section as a live action list.

**Verdict (at the time of writing)**: RETURNED TO FIXER

The 21 substantive review items resolve cleanly — code reads exactly as the fixer described, all gauntlet steps pass locally, and the bundle / coverage figures match what was claimed. **One regression** (since fixed): PR-hygiene item #5 ("No changeset entry") was struck through with a justification that does not survive contact with the actual CI policy or the precedent set by sibling react-native PRs.

### Items Confirmed Fixed

- [x] **Top blocker 1 — redaction value leak**. `packages/react-native/src/rings/route.ts:43` imports `redact` + `SENSITIVE_PARAM_KEYS` from `@tatlacas/brevwick-sdk`. `redactPathParams` (`route.ts:171`) calls `redact(stringifyParam(params[k]))` BEFORE `encodeURIComponent`. The fixer's order-of-operations argument (encoding before redacting would scramble the regex matches) is correct: confirmed against `core/internal/redact.ts:84` (email regex requires literal `@`) and the new test `route.test.ts:131` proves JWT / email / IP carried by benign keys (`invoiceId` / `ref` / `peer`) are masked rather than shipped raw.
- [x] **Top blocker 2 — hot-reload `current` swap**. `route.ts:89` captures `const ref = navigationRef?.current` once. The listener (`route.ts:96`) reads via the captured `ref.getCurrentRoute?.()` rather than `navigationRef.current.getCurrentRoute()`. JSDoc at `route.ts:74-79` documents why.
- [x] **Top blocker 3 — path encoding**. `route.ts:148-176` percent-encodes name segments (`route.ts:153`), keys (`route.ts:161`), and values (`route.ts:172`). Test `route.test.ts:175` covers `Search?` (route name with `?`) and `q=foo & bar=baz` (value with `&` / `=` / spaces). One nit: the test does not separately exercise `#` or `%` literals in values, but `encodeURIComponent` semantics are spec-defined and the existing assertions are sufficient evidence.
- [x] **Type changes**. `RouteEntry` imported from core (`route.ts:44`); local `RouteRingEntry` removed; push payload is `{ kind: 'route', path, timestamp }` (`route.ts:98-102`); `redactPathParams` is no longer in `packages/react-native/src/index.ts:17-21`; `NavigationContainerRefLike` is exported (`route.ts:57`, surfaced in `dist/index.d.ts:66`).
- [x] **Test additions**. JWT/email/IP value-redaction (`route.test.ts:131`); encoding-collision (`route.test.ts:175`); `JSON.stringify` object branch (`route.test.ts:183`); `[unserializable]` for circular ref (`route.test.ts:194`) and function-value (`route.test.ts:204`); key-sort stability (`route.test.ts:213`); `detach()` idempotency (`route.test.ts:262`); off-spec unsubscribe (`route.test.ts:274`). The conditional-type cast in the mock builder is gone — the cast is now a plain `as NavigationContainerRefLike['addListener']` (`route.test.ts:35-49`).
- [x] **Coverage thresholds**. `vitest.config.ts:35-40` carries `lines: 75 / statements: 75 / functions: 75 / branches: 70`. `passWithNoTests: true` is gone. Comment at `vitest.config.ts:33-34` correctly attributes the floor to #87 shipping the first real test code in the package.
- [x] **Coverage actually passes**. `pnpm test:cover` from the worktree reports `Statements: 95.12% (39/41), Branches: 93.93% (31/33), Functions: 100% (7/7), Lines: 100% (34/34)` — matches the fixer's claim exactly.
- [x] **Bundle budget**. `node -e "console.log(require('node:zlib').gzipSync(require('node:fs').readFileSync('packages/sdk/dist/index.js')).length)"` → `2784` bytes, under the 2850 budget. `pnpm --filter @tatlacas/brevwick-sdk test:cover` runs the chunk-split guard (`packages/sdk/src/__tests__/chunk-split.test.ts:94-99`) green; all 245 SDK tests across 16 files pass. CLAUDE.md does not need a bump (still under 2.85 kB).
- [x] **Architecture / clean-code**. No `for now` / `TODO` / `FIXME` / `HACK` markers in any changed file. `SENSITIVE_PARAM_KEYS` naming matches the SCREAMING_SNAKE convention used for other regex constants in `redact.ts` / `network.ts` (`IPV4`, `IPV6`, `BUILTIN`, `BINARY_CONTENT_TYPE`, `ABSOLUTE_URL`). No leftover `REDACT_QUERY_PARAM` or `REDACT_KEY` duplicates anywhere in `packages/`. `network.ts` retains `createRedactor` for per-instance config (correctly — only the regex constant was hoisted, behaviour byte-identical).
- [x] **Cross-runtime safety**. No `window` / `document` / Node-only globals in route.ts; `Date.now()` and `encodeURIComponent` are universal.

### Items Returned to Fixer (RESOLVED in round 2)

- [x] **Missing changeset entry — CI failure** (now fixed in `f584636`). `.github/workflows/changeset-check.yml:33-34` runs `pnpm changeset status --since="origin/main"` on every PR touching `packages/**` and exits non-zero if no `.changeset/*.md` was added. The `Changeset check / check` job was failing on PR #95 at commit `da5888f` (run 25248046853, `🦋 error Some packages have been changed but no changesets were found`). The fixer's earlier strike-through citing "by design per `react-native-worktree.md`" did not survive — `react-native-worktree.md` does not exempt feature worktrees from changesets, and sibling react-native PRs #96 (commit `3f3219d`) and #98 (commit `6e8f39e`) both shipped explicit changeset entries against the same CI policy. **Resolved by**: `.changeset/react-native-route-ring.md` declaring `@tatlacas/brevwick-react-native: minor` (new `attachRouteRing` public surface) and `@tatlacas/brevwick-sdk: minor` (new `redact` / `SENSITIVE_PARAM_KEYS` / `RouteEntry` re-exports). `gh pr checks 95` is green on `f584636`. See round 2 for full re-validation.

### Independent Findings

None beyond the changeset gap above. Spot-checks of duplicated `redact` implementations across all adapter packages came up clean. The fixer's narrative on `redact()`-before-`encodeURIComponent` ordering is technically right and well-documented in JSDoc + tests; this is a real correctness improvement over the original review's encode-then-redact suggestion.

### Tooling

- `pnpm install --frozen-lockfile` — pass
- `pnpm format:check` — pass
- `pnpm lint` — pass
- `pnpm --filter @tatlacas/brevwick-sdk build` — pass (eager ESM 2784 B gzip < 2850 budget)
- `pnpm --filter @tatlacas/brevwick-angular build` — pass
- `pnpm --filter @tatlacas/brevwick-react-native build` — pass (1.09 KB ESM / 1.63 KB CJS / 4.58 KB DTS)
- `pnpm type-check` — pass (all 7 packages)
- `pnpm test:cover` — pass (react-native 95.12% / 93.93% / 100% / 100%; sdk 245/245; all suites green)
- `gh pr checks 95` — **FAIL** (`Changeset check / check` job is non-zero; all other checks pass)

## Validation — 2026-05-02 (round 2)

**Verdict**: APPROVED

The single open regression from round 1 (missing changeset) is resolved. Commit `f584636` is scoped exactly to the changeset addition + checklist update; nothing else moved.

### Items Confirmed Fixed

- [x] **Changeset present and correct** — `.changeset/react-native-route-ring.md` exists. Frontmatter declares `@tatlacas/brevwick-react-native: minor` (new `attachRouteRing` / `NavigationContainerRefLike` / `NavigationRefLike` public surface) and `@tatlacas/brevwick-sdk: minor` (new public `redact` / `SENSITIVE_PARAM_KEYS` / `RouteEntry` re-exports). Body references issue #87, calls out the lockstep linked group from `.changeset/config.json`, and notes the network-ring deduplication that consumes the new constant.
- [x] **`pnpm changeset status --since="origin/main"` reports the change** — Reports all 7 linked packages bumped. The label says `major` rather than `minor`, but that is correct under pre-release `beta` mode (`.changeset/pre.json` mode: `pre` / tag: `beta`) — pre mode surfaces as a major bump in `status` output even when the source changeset is `minor`. Not a regression.
- [x] **CI fully green on `f584636`** — `gh pr checks 95` shows all 6 checks pass (`check` x2, `codecov/patch`, `codecov/project`, `size-check`, `verify-signatures`). The previously-failing `Changeset check / check` from round 1's run 25248046853 is now part of the `check` job and passing. No other check has regressed.
- [x] **Checklist hygiene** — Line 74 is `- [x]` with a substantive note describing the changeset frontmatter, body coverage, and CI flip. No item is left as `- [ ]` in the substantive review sections (only line 110's preserved record of what round 1 returned remains, which is the intended audit trail).
- [x] **Commit hygiene** — Subject `chore: add changeset for #87 react-native route ring` is 52 chars (≤72), conventional (`chore:`), single-line body. `git log -1 --format=%B f584636` shows no `Co-Authored-By`, no Claude attribution.
- [x] **Scope drift** — `git show f584636 --stat` confirms the commit only touches `.changeset/react-native-route-ring.md` (+37) and `notes/reviews/pr-95-claude-review.md` (+44/-1). The fixer's untracked `packages/angular/src/lib/internal/version.ts` (`1.0.0-beta.7` → `1.0.0-beta.8`) remains in the worktree's working tree only — `git diff origin/main..HEAD -- packages/angular/src/lib/internal/version.ts` returns empty, confirming it is NOT in the PR diff.

### Items Returned to Fixer

None.

### Independent Findings

None. No banned-phrase scapegoating in the new strike-out justification on line 74. Round 1's items 1–8 remain valid — spot-checked the line-anchored claims against the diff and they still match.

### Tooling

- `pnpm install --frozen-lockfile` — pass
- `pnpm format:check` — pass
- `pnpm lint` — pass
- `pnpm type-check` — pass (all 7 packages)
- `pnpm test` (across all `packages/**`) — pass (497 tests across 42 files: sdk 245, react 132, svelte 30, solid 29, angular 23, vue 23, react-native 15)
- `pnpm -r --filter "./packages/**" build` — pass (all 7 packages built; SDK eager chunk under 2.85 kB budget per chunk-split.test.ts; react-native 1.08 KB ESM / 1.61 KB CJS / 4.45 KB DTS)
- `gh pr checks 95` — pass (6/6)

Note: `pnpm build` at the workspace root fails inside `examples/next` and `examples/remix`. Both failures are pre-existing on `origin/main` (unrelated to this PR — see the `MODULE_NOT_FOUND` for `examples/svelte/tsconfig.json` originating from a Remix vite plugin tsconfig walk). CI does not run the example apps' builds. Confirmed not a regression introduced by `f584636`.
