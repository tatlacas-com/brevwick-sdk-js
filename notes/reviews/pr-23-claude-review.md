# PR #23 Review — feat(react): BrevwickProvider + useFeedback + FeedbackButton

**Issue**: #6 — feat(react): BrevwickProvider + useFeedback + FeedbackButton FAB
**Branch**: feat/issue-6-react-bindings
**Reviewed**: 2026-04-13
**Verdict**: CHANGES REQUIRED

---

## Completeness (NON-NEGOTIABLE)

- [ ] **No changeset file added.** `.changeset/*.md` is absent for this PR. CI check "Require a changeset on PRs that touch packages/\*\*" fails — see run 24365076941. README.md § Releasing states `changeset-check` CI fails the PR if no changeset is present. The package contract is about to ship a major public API (provider, hook, button, 4 named types) — this requires a minor-bump changeset touching `brevwick-react` (and probably `brevwick-sdk` since versions move in lockstep per CLAUDE.md § Versioning).
- [ ] **SDD § 12 `@brevwick/react` section is still the 2-line stub.** The PR body claims it "Implements SDD § 12 React bindings", but brevwick-ops/docs/brevwick-sdd.md lines 987–999 do **not** enumerate the public API this PR ships: `BrevwickProviderProps`, `FeedbackButtonProps` (with `position | disabled | hidden | className | label | onSubmit`), `UseFeedbackResult` (`submit`, `captureScreenshot`, `status`, `reset`), `FeedbackStatus` (`'idle' | 'submitting' | 'success' | 'error'`), or the `"use client"` App Router contract. Either the SDD is the contract (and the cross-repo PR is missing) or it isn't — pick one and align. Per CLAUDE.md: "Public API changes require an SDD update in the same PR (cross-repo)."
- [ ] **Issue #6 scope: "position prop" — `bottom-left` branch is shipped but untested.** `feedback-button.tsx:166` selects `brw-fab-bl` when `position === 'bottom-left'` but no test exercises the branch; the `posClass` computation becomes dead code as far as CI coverage is concerned.
- [ ] **Issue #6 scope: "disabled / hidden prop" — `disabled` behaviour untested.** `FeedbackButton` forwards `disabled` to the `<button>` (`feedback-button.tsx:178`), but no test asserts the button is actually disabled, nor that clicking it while disabled does not open the dialog. Only `hidden` is covered.
- [ ] **Issue #6 scope: "react >= 18; no React 19-only APIs so it works with tradekit web if downgraded".** Peer deps correctly say `react ">=18 <20"`, but there is no smoke test / type-check with React 18 in this repo. PR body claims Next.js 14.2 + React 18 was smoke-built locally; not verified in CI. Soft-block only, but flag.

## Clean Architecture (NON-NEGOTIABLE)

- [x] `brevwick-react` depends on `brevwick-sdk` (peer + dev), never the reverse — verified.
- [x] No React / DOM / JSX leaks into `packages/sdk/src/` — grep confirms clean.
- [ ] **`BrevwickContextValue.brevwick: Brevwick | null` is architecturally loose.** `packages/react/src/context.ts:5` types the ctx as `Brevwick | null`, but `BrevwickProvider` (provider.tsx:16,25) always supplies a non-null `Brevwick`. The hook's null guard (`use-feedback.ts:22–32`) is therefore unreachable. Either tighten the type to `{ brevwick: Brevwick }` and delete the dead branch, or justify why null is reachable (it isn't — `createBrevwick` never returns null). This is a Single-Responsibility / no-dead-code violation.
- [x] Public surface is narrow and intentional: provider + hook + button + re-exported SDK types. No internal helpers leak — `BrevwickContext`, `useBrevwickInternal`, `BREVWICK_CSS`, `BREVWICK_STYLE_ID`, `formatSize` all stay internal.
- [x] `"sideEffects": false` honoured — no top-level side effects in any module; style injection happens inside `FeedbackButton` at render time, not at import time.
- [ ] **Bundled `@radix-ui/react-dialog` is a hard dep.** Intentional per PR design (drop-in, no CSS loader requirement), but this means consumers cannot swap Dialog. Acceptable for MVP; note that once the "custom render slot API" backlog item lands, the Radix dependency should be externalisable. Not a blocker.

## Clean Code (NON-NEGOTIABLE)

- [ ] **Dead branch in `use-feedback.ts:22–32`.** The `if (!brevwick)` arm cannot fire — `BrevwickProvider` always supplies a real instance and `useBrevwickInternal` throws if the ctx is missing. The synthetic `SubmitResult` with `code: 'INGEST_REJECTED'` is semantically wrong too (the SDD reserves `INGEST_REJECTED` for "server returned 4xx" — using it for a client-side "no instance" condition is a contract violation). Delete the branch or, if you insist on defensive coding, use a different code and mark it `/* istanbul ignore next */` with a comment.
- [ ] **`use-feedback.ts:42–44` throws generic `Error`.** `captureScreenshot` throws `new Error('Brevwick instance is not available.')` on the same unreachable null path. CLAUDE.md requires "no throwing generic `Error` for domain conditions". Same resolution as above — unreachable branch; delete it.
- [ ] **`feedback-button.tsx:32–41` comment is incorrect.** The comment claims "React de-dupes by id via dangerouslySetInnerHTML identity." React does **not** dedupe `<style>` tags by `id`. If a consumer renders two `<FeedbackButton>` instances (e.g. one per tab) the DOM ends up with two `<style id="brevwick-react-styles">` — duplicate ID in the document (invalid HTML) and redundant CSS work. Either (a) lift injection to a module-level `useEffect` that checks `document.getElementById(BREVWICK_STYLE_ID)` before inserting, (b) use React 19's `<style href precedence="...">` for automatic dedupe, or (c) document that only one `FeedbackButton` per tree is supported. Current comment is wrong and needs to be fixed regardless.
- [ ] **`feedback-button.tsx:102–109` `handleCaptureScreenshot` has no error handling.** If the SDK throws (offline, CSP, canvas tainted, dynamic import fails), the button click produces an unhandled promise rejection and the user sees nothing. Add try/catch that surfaces the error via `setSubmitError` or an equivalent UI signal.
- [ ] **`feedback-button.tsx:80–86` effect does double-duty.** The effect both manages `screenshotUrl` cleanup and `closeTimerRef` cleanup, but its dependency array is `[screenshotUrl]` alone. This means the timer-clear only runs when `screenshotUrl` changes, not every render — OK in practice, but the coupling is confusing and the setter at line 70–73 already revokes the prev URL before setting the new one, so every URL except the last one is revoked twice. Split into two effects or drop the redundant revoke in the effect cleanup.
- [ ] **Double-submit via Enter key.** The Send button is `disabled` when `status === 'submitting'`, but `handleSubmit` (feedback-button.tsx:116) does not guard against re-entry. Pressing Enter inside a textarea (not blocked by button-disabled) while a submit is in-flight fires a second submit. Add an early-return if `status === 'submitting'`.
- [ ] **`feedback-button.tsx:111–114` silently ignores file-picker cancel.** `handleFiles(null)` is a no-op and the existing `files` state is preserved; but selecting new files *appends*? Actually it replaces via `setFiles(Array.from(list))`. That's a UX surprise — the button label says "Attach file" but each new selection wipes the previous set. Either make the button a cumulative appender or rename to "Replace files". Not a blocker, but note.
- [ ] **`feedback-button.tsx:245` inline `style={{ display: 'inline-block' }}`** and `feedback-button.tsx:250` inline `style={{ display: 'none' }}` sit next to the CSS-in-JS that's supposed to own all styling. Move them into `BREVWICK_CSS` as named classes for consistency.

## Public API & Types

- [x] JSDoc on `BrevwickProviderProps` fields? No — `config` and `children` lack JSDoc. Low priority (types are obvious) but CLAUDE.md mentions "JSDoc on every public export".
- [ ] **`BREVWICK_REACT_VERSION` exported without JSDoc.** `packages/react/src/index.ts:9` exposes a public const — the SDK package does the same pattern, but neither has a doc comment explaining why it exists (typically: surface version at runtime for bug reports).
- [x] `FeedbackStatus` as discriminated state string is fine; no generic `string` leaks.
- [ ] **`SubmitResult` re-exported from `brevwick-sdk`** — good, but the re-exports block at index.ts:20–25 duplicates types available from `brevwick-sdk`. Consumers who install only `brevwick-react` still need `brevwick-sdk` (it's a peer). Accepted, but noted: this means consumers can do `import type { SubmitResult } from 'brevwick-react'` which bypasses the SDK's canonical export. Confirm this is the intent per SDD § 12.
- [x] Error types: `SubmitResult` is a tagged union from SDK; no domain-specific `throw`s that aren't already flagged above.

## Cross-Runtime Safety

- [x] `provider.tsx` — no `window`/`document` access in render. `install()` / `uninstall()` run inside `useEffect`, which only executes on the client. SSR-safe.
- [x] `feedback-button.tsx` — `URL.createObjectURL` / `URL.revokeObjectURL` are called only in callbacks (`handleCaptureScreenshot`, `resetForm`) and effect cleanups. Never during render. SSR-safe.
- [x] `useState` initialisers are pure; no DOM access.
- [x] Radix Dialog portals only render in `useEffect` / after the dialog is opened; initial render is inert. SSR-safe.
- [x] `"use client"` banner in tsup config correctly preserves the directive in the shipped ESM + CJS bundles (verified by reading `dist/index.js` line 1 and `dist/index.cjs` line 1).
- [ ] **`treeshake: false` trade-off is real and quantified.** Measured: with `treeshake: true` the gzip output is 4012 B; with `treeshake: false` (current), it's 4112 B — a **100-byte gzip cost** to preserve the `"use client"` banner. With `treeshake: true` the banner is stripped from both ESM and CJS outputs (confirmed by rebuilding with a flipped flag and inspecting `dist/index.js` / `dist/index.cjs` line 1). The comment at `tsup.config.ts:14–16` accurately describes the reason. This is sound. **No change required**; the trade-off is documented, the absolute size (4.1 kB / 25 kB budget) is deep under budget, and `@radix-ui/react-dialog`'s tree-shakeable named exports still eliminate unused Radix primitives inside esbuild.

## Bugs & Gaps

- [ ] **In-flight submit on unmount.** If `FeedbackButton` unmounts mid-submit (SPA route change, dialog closed hard), `setStatus` / `setSubmitError` will fire on the unmounted component when the promise resolves. React 18+ no-warns, but: (a) there's no `AbortSignal` plumbed into `submit()` so the network request keeps running; (b) the success path schedules `setTimeout` (feedback-button.tsx:142) which would then try to `setOpen(false)` on an unmounted component. Add a mounted-ref or use an `AbortController` once `submit()` accepts one. Today's SDK `submit()` signature doesn't take a signal, so this is a cross-package concern — note it here and file a follow-up issue to thread `AbortSignal` through `FeedbackInput` → ingest.
- [ ] **Memory: object-URL leak on captureScreenshot-then-unmount race.** If the user clicks "Attach screenshot" twice, `handleCaptureScreenshot` (feedback-button.tsx:102) awaits the first capture, then the setter's revoke-prev closure handles the first URL. But if component unmounts between `await captureScreenshot()` resolving and `setScreenshotUrl` running, the new blob URL is never created (setter no-ops on unmounted) — no leak there. Safe.
- [x] `data-brevwick-skip` applied correctly to FAB, overlay, and dialog content (feedback-button.tsx:176,186,190). SDK's screenshot.ts scrubs those during capture.
- [ ] **No cleanup-on-error for `closeTimerRef`.** If success handler sets timer (feedback-button.tsx:142), and user manually closes before 1.5 s, `handleOpenChange(false)` clears it (line 92–94). Good. But if error then success on the same dialog instance (retry scenario), prior timer state is correctly cleared by `resetForm` + `handleOpenChange`. Verified — no bug.
- [ ] **File validation gap.** SDD § 12 mandates ≤5 attachments, ≤10 MB each, MIME whitelist. Current UI accepts any files via `<input type="file" multiple>` with no client-side validation. The SDK's submit pipeline enforces at network time, so the user only sees `ATTACHMENT_UPLOAD_FAILED` after clicking Send. Add an inline validation message when the user picks files, OR file a follow-up to validate at the UI layer. Acceptable for MVP if tracked.

## Security

- [x] Redaction: the FeedbackButton calls `brevwick.submit()` with a plain `FeedbackInput`; the SDK's submit pipeline handles redaction. No new payload path bypasses `redact()`.
- [x] No `eval` / `Function()` / `dangerouslySetInnerHTML` on user input. `dangerouslySetInnerHTML` is used exactly once with a hardcoded compile-time constant (`BREVWICK_CSS`) — safe.
- [x] CSP-friendly for `<style>` injection (uses `style-src 'unsafe-inline'` requirement). Document this on the package README once one is added.
- [x] No secrets in code.
- [ ] **`projectKey` in tests is `pk_test_*` — fine — but there's no runtime warning/error if the config's `projectKey` is empty.** Not this PR's scope (enforced by `createBrevwick`), but worth a cross-check when fixer verifies.

## Tests

- [x] 4 vitest files, 13 tests all passing (confirmed locally). Provider unmount, use-feedback state machine, hidden prop, success+error paths, screenshot attach, error-keeps-dialog — all covered.
- [ ] **Missing: `disabled` prop test.** Assert button is `disabled` DOM attr when prop is true; assert click does not open dialog.
- [ ] **Missing: `position='bottom-left'` test.** Assert `.brw-fab-bl` class is present (currently only `'bottom-right'` is exercised).
- [ ] **Missing: screenshot URL revocation on unmount test.** Spy on `URL.revokeObjectURL` and assert it's called for the captured blob when the component unmounts while a screenshot was attached.
- [ ] **Missing: reset after success test.** After the 1.5 s auto-close fires, re-open the dialog and assert all fields (title, description, screenshot thumbnail, files list) are cleared.
- [ ] **Missing: form reopen clearing state test.** Close the dialog manually without submitting, re-open, and assert fields are cleared (exercises `handleOpenChange(false) → resetForm`).
- [ ] **Missing: captureScreenshot rejection test.** When `sdk.captureScreenshot()` rejects (offline / canvas taint), assert the UI surfaces an error and the thumbnail is not rendered.
- [ ] **Missing: `onSubmit` callback receives failure result.** Existing test asserts it's called on success; add the mirror for `ok: false` shape.
- [ ] **Missing: `useFeedback` outside provider is covered**, but no test asserts the exact error message shape (helpful for DX).
- [ ] **`provider.test.tsx` line 51–66 "reuses the same instance while config identity is stable"** is correct but misleading: if the consumer passes a new object literal every render (the common mistake), a new instance will be created — and `install`/`uninstall` will cycle. No test captures this footgun. Add a negative test demonstrating the failure mode, and/or document the memo-friendliness requirement in JSDoc on `BrevwickProviderProps.config`.

## Build & Bundle

- [x] `pnpm --filter brevwick-react build` succeeds. ESM 15.46 kB raw / 4112 B gzip; CJS 18.58 kB raw / 4785 B gzip. `.d.ts` emitted.
- [x] Well under the 25 kB gzip budget.
- [x] Dual ESM / CJS exports configured correctly in `package.json`.
- [x] `sideEffects: false` preserved.
- [ ] **`files` field in package.json lists `"README.md"` and `"LICENSE"`, but neither file exists in `packages/react/`.** Pre-existing issue (same gap in `packages/sdk/`), not introduced by this PR. Flag for the publish workflow — npm pack will silently skip the non-existent entries. Track as a follow-up.

## PR Hygiene

- [x] Conventional commit: `feat(react):` — correct scope, subject under 72 chars.
- [x] `Closes #6` in body.
- [x] Branch name `feat/issue-6-react-bindings` matches convention.
- [x] No Claude attribution in commits, PR body, or files.
- [ ] **CI `check` is failing on two required status checks** (run IDs 24365076903, 24365076941):
  - `pnpm format:check` fails on 5 files: `packages/react/src/__tests__/feedback-button.test.tsx`, `.../provider.test.tsx`, `.../use-feedback.test.tsx`, `packages/react/src/feedback-button.tsx`, `packages/react/src/provider.tsx`. Run `pnpm format` (prettier --write) to fix.
  - `changeset-check` fails — no `.changeset/*.md` for this PR. Run `pnpm changeset` and commit. Since both packages move in lockstep pre-1.0 per CLAUDE.md, the changeset should bump both `brevwick-react` (minor — new public API) and `brevwick-sdk` (patch — no change, but lockstep).
- [ ] **README not updated** with `useFeedback`, `FeedbackButton` prop table, or the `"use client"` note for Next.js App Router. Root README shows `BrevwickProvider + FeedbackButton` example but omits hook usage and props. Update root `/README.md` or add `packages/react/README.md`.

---

## Files Reviewed

| file | status | notes |
| ---- | ------ | ----- |
| `packages/react/package.json` | needs-work | Radix dep + README/LICENSE files-field drift (pre-existing) |
| `packages/react/tsup.config.ts` | ok | `treeshake: false` trade-off documented and quantified |
| `packages/react/tsconfig.json` | ok | jest-dom types included |
| `packages/react/vitest.config.ts` | ok | |
| `packages/react/vitest.setup.ts` | ok | cleanup wired |
| `packages/react/src/index.ts` | needs-work | add JSDoc on `BREVWICK_REACT_VERSION` |
| `packages/react/src/context.ts` | needs-work | `brevwick: Brevwick \| null` admits a null that never occurs — tighten type |
| `packages/react/src/provider.tsx` | ok | config-identity memoisation is correct; note footgun in JSDoc |
| `packages/react/src/use-feedback.ts` | needs-work | dead `if (!brevwick)` branches in `submit` and `captureScreenshot`; INGEST_REJECTED is contractually wrong |
| `packages/react/src/feedback-button.tsx` | needs-work | dedupe comment wrong; captureScreenshot error path missing; double-submit on Enter; inline styles out of CSS module |
| `packages/react/src/styles.ts` | ok | CSS clean; add `.brw-hidden` class and move inline styles here |
| `packages/react/src/__tests__/feedback-button.test.tsx` | needs-work | missing coverage: disabled, bottom-left, reopen-clears, screenshot-reject, onSubmit-failure, URL.revokeObjectURL on unmount |
| `packages/react/src/__tests__/provider.test.tsx` | needs-work | add negative test: new-config-object-per-render cycles install/uninstall |
| `packages/react/src/__tests__/use-feedback.test.tsx` | ok | happy + error + capture + no-provider all covered |
| `pnpm-lock.yaml` | ok | Radix lockfile churn is expected |
| (missing) `.changeset/*.md` | **BLOCKER** | changeset-check CI failure |
| (missing) SDD § 12 update in brevwick-ops | **BLOCKER** per CLAUDE.md | public API added without SDD diff |

---

## Validation — 2026-04-13

**Verdict**: RETURNED TO FIXER

### Items Confirmed Fixed

- [x] `.changeset/react-bindings.md` added — bumps `brevwick-react` minor + `brevwick-sdk` minor (lockstep per CLAUDE.md § Versioning). Content accurately describes shipped API.
- [x] Cross-repo SDD PR exists at tatlacas-com/brevwick-ops#8; § 12 now enumerates `BrevwickProviderProps`, `UseFeedbackResult`, `FeedbackStatus`, `FeedbackButtonProps` (with all six props), `"use client"` banner, `data-brevwick-skip` scrubbing, unmount-safety + double-submit contracts, and bundle budget restated. Matches shipped API with no drift. PR #23 body links it correctly.
- [x] `BrevwickContextValue.brevwick` tightened to `Brevwick` at `packages/react/src/context.ts:10`. `useBrevwickInternal` still throws when context is null (provider missing) — correct.
- [x] Dead `if (!brevwick)` branches + synthetic `INGEST_REJECTED` removed from `packages/react/src/use-feedback.ts:41-54`. `submit` now passes through directly; `captureScreenshot` no longer throws a generic `Error`.
- [x] Module-level `hasInjectedStyles` guard + `useIsomorphicLayoutEffect` (SSR-aliased to `useEffect` when `typeof window === 'undefined'`) at `feedback-button.tsx:42-74`. `document.getElementById(BREVWICK_STYLE_ID)` lookup handles the "another provider already injected" case. Misleading comment removed.
- [x] `handleCaptureScreenshot` wraps the SDK call in try/catch and surfaces via `setSubmitError` at `feedback-button.tsx:153-169`. Covered by new test `'surfaces an error in the dialog when captureScreenshot rejects'`.
- [x] `handleSubmit` early-returns on `status === 'submitting'` at `feedback-button.tsx:181`.
- [x] `mountedRef` + `screenshotUrlRef` added at `feedback-button.tsx:96-97`; unmount cleanup clears `closeTimerRef` and revokes the outstanding URL at `feedback-button.tsx:102-115`. Auto-close callback and both async setters guard on `mountedRef.current` before touching state.
- [x] Inline `style={{ display: '...' }}` removed from JSX; moved into `styles.ts` as `.brw-file-label`/`.brw-file-input` classes.
- [x] New tests added: disabled (`feedback-button.test.tsx:186`), bottom-left (`:194`), revokeObjectURL on unmount (`:201`), reopen-clears after success (`:229`), reopen-clears after manual cancel (`:263`), captureScreenshot rejection (`:285`), `onSubmit` with `{ok:false}` (`:157`), negative config-identity memoisation (`provider.test.tsx:67`). 21 react tests + 164 sdk tests pass locally.
- [x] Bundle: `packages/react/dist/index.js` gzip = **4277 B** (well under 25 kB budget).

### Items Returned to Fixer

- [x] **CI `check` job is failing on commit 76e24bd** — run 24365757598. `pnpm type-check` in `packages/react` cannot resolve `brevwick-sdk` because CI runs `type-check` *before* `build`, so `packages/sdk/dist/index.d.ts` (the target of `brevwick-sdk`'s `"types"` exports entry) does not yet exist on CI. **Fixed in 582d1d3**: `.github/workflows/ci.yml` now runs `pnpm --filter brevwick-sdk build` before `pnpm type-check` / `pnpm test:cover`, so both tsc and vitest can resolve the workspace dep via its published `exports` entry. Reproduced locally by `rm -rf packages/sdk/dist && pnpm type-check` (fails) then re-running after `pnpm --filter brevwick-sdk build` (passes). CI run 24366081188 / 24366081190 both green. Reproduced locally by deleting `packages/sdk/dist` and running `pnpm type-check` — identical TS2307 errors across every react file that imports from `brevwick-sdk`. This is a **new regression introduced by this PR**: before the react package existed, `pnpm -r type-check` only ran in `packages/sdk`, so the ordering was never exercised. Fix options (pick one): (a) add `pnpm --filter brevwick-sdk build` (or `build:types`) before `pnpm type-check` in `.github/workflows/ci.yml`; (b) add a TypeScript `paths` mapping in `packages/react/tsconfig.json` pointing `brevwick-sdk` to `../sdk/src/index.ts` so type-check resolves without a built `dist/`; (c) introduce project references (`composite: true` + `references`) so `tsc -b` builds the SDK declarations on demand. The PR body's claim "`pnpm type-check` green" is only accurate after a prior build has populated `packages/sdk/dist` — the CI run proves the actual green state is not reproducible from a clean checkout.

### Independent Findings

None beyond the CI regression above. Architecture, redaction, cross-runtime safety (no `window`/`document` in render), public API surface, and tree-shakeability all remain clean. `dangerouslySetInnerHTML` usage is a compile-time constant. Radix Dialog portals only mount inside `useEffect`. Inline style props fully removed.

### Tooling

- `pnpm install --frozen-lockfile`: pass
- `pnpm format:check`: pass
- `pnpm lint`: pass
- `pnpm type-check` (after local `brevwick-sdk` build): pass
- `pnpm type-check` (clean checkout, no prior build — simulates CI): **FAIL** (reproduces CI error)
- `pnpm test`: pass (164 sdk + 21 react)
- `pnpm --filter brevwick-react build`: pass; gzip 4277 B
- `gh pr checks 23`: **FAIL** — `check` workflow (CI) failing on type-check step; `check` (Changeset check) passing.

---

## Validation — 2026-04-13 (round 2, commit 582d1d3)

**Verdict**: APPROVED

### Items Confirmed Fixed

- [x] CI ordering regression resolved. `.github/workflows/ci.yml` adds `pnpm --filter brevwick-sdk build` between `pnpm lint` and `pnpm type-check` with an inline comment explaining why. Diff against `origin/main` is strictly additive (5 lines, 1 file); no stray workflow changes.
- [x] Local reproduction of the original failure: `rm -rf packages/sdk/dist && pnpm type-check` fails with TS2307 on every `from 'brevwick-sdk'` import across 11 call sites in `packages/react`. After `pnpm --filter brevwick-sdk build`, `pnpm type-check` passes. Confirms the new CI step is load-bearing, not cosmetic.
- [x] Required checks green on 582d1d3: both `check` jobs (runs 24366081188, 24366081190), `codecov/patch`, `codecov/project` all pass.

### Independent Findings

- Branch diff scope: `.changeset/react-bindings.md` + `.github/workflows/ci.yml` + react package only. No accidental edits to `packages/sdk/src/` or shared tooling.
- Commits on branch: aa3c460, 76e24bd, 582d1d3 — all conventional-commit compliant, no Claude attribution.
- SDD cross-repo PR tatlacas-com/brevwick-ops#8 remains OPEN; PR #23 body continues to link it in the "SDD alignment PR (cross-repo)" line.
- Bundle: `packages/react/dist/index.js` gzip = **4277 B** (budget 25 kB, 17 % of budget).

### Tooling

- `pnpm install --frozen-lockfile`: pass
- `pnpm lint`: pass
- `pnpm type-check` (after sdk build): pass
- `pnpm type-check` (clean, no prior build — reproduces original failure): fail as expected; CI fix mitigates
- `pnpm test`: pass (164 sdk + 21 react)
- `pnpm --filter brevwick-react build`: pass; gzip 4277 B
- `gh pr checks 23`: pass (all 4 required checks green)
