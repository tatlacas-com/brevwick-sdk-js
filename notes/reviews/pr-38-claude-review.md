# PR #38 Review — chore(bundle): size-limit budgets + CI gate

**Issue**: #7 — chore(bundle): size-limit budgets (< 2 kB core, < 25 kB react)
**Branch**: chore/issue-7-size-limit
**Reviewed**: 2026-04-22
**Verdict**: CHANGES REQUIRED

The PR's goal is to enforce bundle budgets in CI so consumers don't get silently bloated. The local `pnpm size` command works, the configuration is reasonable, and the documentation/comment touch-ups are correct. However, **the CI gate this PR exists to add does not function** — the `size-check` job fails on every PR because `andresz1/size-limit-action@v1` rejects the inputs the workflow passes, and the screenshot-chunk budget protects the wrong artefact. Until the gate actually fails on overrun in CI, the issue's primary acceptance criterion ("Intentional +1 kB import in a draft PR makes the check red") is not satisfied end-to-end.

## Completeness (NON-NEGOTIABLE)

- [x] **CI gate is broken — does not enforce budgets on PRs.** Replaced `andresz1/size-limit-action@v1` with a manual pipeline: `actions/upload-artifact` hands `dist/` from `check` → `size-check` runs `pnpm install --frozen-lockfile` (devDeps only, no rebuild), captures `pnpm size --json`, renders a sticky PR comment via `marocchino/sticky-pull-request-comment@v2`, and finally runs `pnpm size` as the enforcement step. Verified locally that `pnpm size` exits 1 when any budget is breached and 0 when all green (lowered ceilings to 5 kB / 1.5 kB → exit=1 with `Package size limit has exceeded`; restored → exit=0).
- [x] **Screenshot chunk budget protects the wrong artefact.** Did both: tightened the wrapper-only file-mode entry to **1.5 kB gzip** (current 896 B + 600 B headroom — catches a wrapper bloat to 1.5 kB), AND added a new bundled-import entry `brevwick-sdk on widget open (screenshot + modern-screenshot)` that uses `@size-limit/esbuild` to re-bundle `import { captureScreenshot } from 'packages/sdk/dist/index.js'` with the resolved `modern-screenshot` peer the way a consumer's bundler delivers it. Currently measures **10.91 kB gzip** against the **25 kB** widget-open ceiling from CLAUDE.md / SDD § 11.8. A future `modern-screenshot` 0.9 → 17 kB bump would now light up red.
- [x] **SDD § 12 not updated to match the new budgets.** Cross-repo PR opened: [`brevwick-ops#26`](https://github.com/tatlacas-com/brevwick-ops/pull/26) — updates § 11.8 / § 12 to: core ≤ 2.2 kB gzip, screenshot wrapper ≤ 1.5 kB gzip, on-widget-open (re-bundled with `modern-screenshot`) ≤ 25 kB gzip, React ≤ 25 kB gzip ESM+CJS. PR body of #38 should be updated to link this.
- [x] **Missing changeset.** Added `.changeset/size-limit-budgets.md` — patch bump on both `brevwick-react` (minified tsup output is the user-observable artefact change) and `brevwick-sdk` (lockstep policy from CLAUDE.md).

## Clean Architecture (NON-NEGOTIABLE)

- [x] No new code shipped to either package's `src/` — only test-suite comment, tsup config tweak, and CI/build tooling changes. No React/DOM/Node leakage. Module boundaries unchanged.

## Clean Code (NON-NEGOTIABLE)

- [x] Migrated to `.size-limit.js` and DRYed the file-mode block via a `FILE_MODE` constant + `fileEntry()` helper. The bundled-import "widget-open" entry stands alone because its semantics differ.
- [x] No `any`, no commented-out code, no dead exports introduced.

## Public API & Types

- [x] No public API surface change. `packages/sdk/package.json` and `packages/react/package.json` `exports` blocks unchanged. `sideEffects: false` already correct on both packages (`packages/sdk/package.json:27`, `packages/react/package.json:22`).

## Cross-Runtime Safety

- [x] No runtime code changes. tsup `target: 'es2020'` and `format: ['esm', 'cjs']` unchanged for both packages. React `treeshake: false` is justified by the `"use client"` directive needing to survive — the comment at `packages/react/tsup.config.ts:15-17` explains it correctly.

## Bugs & Gaps

- [x] Added parallel CJS entries for SDK core, screenshot wrapper, and React bundle so both formats are gated.
- [x] Added `@size-limit/file@^12.1.0` as an explicit devDependency in `package.json` so a future `@size-limit/preset-small-lib` upgrade that drops file-mode can't silently swap the measurement engine.
- [x] `check` now uploads `packages/{sdk,react}/dist` via `actions/upload-artifact@v4`; `size-check` downloads it via `actions/download-artifact@v4` and skips the build entirely. Still runs `pnpm install --frozen-lockfile` because the on-widget-open size-limit entry uses `@size-limit/esbuild` to re-bundle (needs `node_modules`), but no rebuild.
- [x] Dropped the push-mode size-check entirely. Job is now PR-only (`if: github.event_name == 'pull_request'`). Justification: branch protection requires `size-check` to pass before merge, squash-merge means `main` only ever lands what passed the PR gate, and re-running on push is either silently lossy or duplicate work.

## Security

- [x] `size-limit`, `@size-limit/preset-small-lib` are devDependencies only — no impact on published `dist/`. No new secrets, no new network calls in CI beyond `${{ secrets.GITHUB_TOKEN }}` (correctly scoped to `pull-requests: write`).

## Tests

- [x] In-suite chunk-split test (`packages/sdk/src/__tests__/chunk-split.test.ts`) still asserts the 2200 byte ceiling — the comment at `:88-91` correctly notes this is now redundant with size-limit but kept as a fast-feedback local guard. Coherent.
- [x] Added `packages/react/src/__tests__/bundle-size.test.ts` — gzip-measures both `dist/index.js` and `dist/index.cjs` against the 25 kB ceiling; skips when `dist/` is absent so a plain `pnpm test` (no prior build) still passes. Mirrors the SDK's `chunk-split.test.ts` pattern. Required adding `"node"` to the React tsconfig `types` whitelist so the test file can import `node:fs`/`node:path`/`node:zlib` (the SDK package's tsconfig has no `types` whitelist so it auto-loads node).
- [x] Re-verified locally: lowering all 25 kB budgets to 5 kB causes `pnpm size` to exit 1 with `Package size limit has exceeded by ...` on the React + widget-open entries; restoring brings exit back to 0. CI verification will follow on push (the new pipeline runs `pnpm size` directly as the gate, no action-input shim involved).

## Build & Bundle

- [x] `pnpm build` succeeds locally, `pnpm size` reports 2.12 kB / 896 B / 8.51 kB — well under the configured budgets (modulo the screenshot-budget concern above).
- [x] `packages/react/tsup.config.ts:14` adding `minify: true` is a clean win (~2 kB gzip savings on react). React's `treeshake: false` / `splitting: false` retention is justified at `:15-17` and consistent with the `"use client"` banner needs.
- [x] `packages/sdk/tsup.config.ts:13` comment correction from "2 kB" to "2.2 kB" matches CLAUDE.md.

## PR Hygiene

- [x] Conventional commit (`chore(bundle): size-limit budgets + CI gate`).
- [x] `Closes #7` in body.
- [x] No Claude attribution.
- [x] Branch matches `chore/issue-7-...` convention.
- [x] Gate is now structurally sound; PR body updated to (a) reference SDD PR brevwick-ops#26, (b) reflect the new on-widget-open figure (10.91 kB / 25 kB), and (c) restate the post-merge action item once `size-check` is observed green on this PR. Merge gating only after CI confirms `size-check` green.
- [x] Wrapper budget tightened to 1.5 kB (vs 896 B current); separate widget-open entry now carries the 25 kB umbrella. PR body updated with the new table.

## Files Reviewed

| file | status | notes |
| ---- | ------ | ----- |
| `.github/workflows/ci.yml` | CHANGES | `size-check` job structurally broken — `andresz1/size-limit-action@v1` rejects `package_manager` + `script` inputs, fails with "Unexpected end of JSON input". Job duplicates install/build from `check` — consider `actions/upload-artifact` handoff. Push-mode gate fails silently. |
| `.size-limit.json` | CHANGES | Screenshot chunk budget (18 kB) is 20× the actual 896 B artefact — gives no real protection. CJS bundles unmeasured. Otherwise clean. |
| `package.json` | OK | `size-limit` + `@size-limit/preset-small-lib` correctly devDependency-only. `pnpm size` script wired. |
| `packages/react/tsup.config.ts` | OK | `minify: true` addition is a clean win; existing `treeshake: false` rationale preserved. Triggers changeset gate (see "Missing changeset"). |
| `packages/sdk/src/__tests__/chunk-split.test.ts` | OK | Comment update correctly notes CI now enforces via size-limit; in-suite assertion correctly retained as fast-feedback guard. |
| `packages/sdk/tsup.config.ts` | OK | Comment-only fix from "2 kB" to "2.2 kB". |
| `pnpm-lock.yaml` | OK | Lockfile additions match the new devDependencies. Esbuild 0.28 introduced as transitive of `@size-limit/esbuild` — additional ~25 platform-specific binaries in the lockfile but all `optional`. No runtime impact. |
| `brevwick-ops/docs/brevwick-sdd.md` | MISSING | § 11.8 / § 12 budgets not updated to match the numbers `.size-limit.json` enforces. CLAUDE.md claims SDD was "mirrored" — it wasn't. Required cross-repo PR. |
| `.changeset/<new>.md` | MISSING | Changeset gate red because `packages/**` was touched (notably `packages/react/tsup.config.ts` minify change has user-observable artefact effect). |

## Required actions for the fixer

1. **Fix the broken `size-check` job.** Either: (a) bump the action to a SHA/tag that supports `package_manager` and `script` inputs (verify on `andresz1/size-limit-action` releases), (b) replace the action with manual `pnpm install --frozen-lockfile && pnpm build && pnpm size` steps + a `marocchino/sticky-pull-request-comment` step for the size-diff comment, or (c) drop the comment feature and just gate via `pnpm size` (lose the diff comment, keep the gate working). Verify the gate goes green on this PR after the fix.
2. **Tighten the screenshot-chunk budget.** Set it to ~1.5 kB (current 896 B + headroom) so the budget actually protects regression in the SDK's screenshot wrapper. Add a separate measurement (or document explicitly in `.size-limit.json` and CLAUDE.md) that the 25 kB "widget-open" umbrella is the consumer-bundle responsibility, not enforceable from this repo's `dist/`.
3. **Open the cross-repo SDD update PR** in `brevwick-ops` updating § 11.8 and § 12 to: core ≤ 2.2 kB gzip, screenshot chunk = whichever number you end up with, react ≤ 25 kB gzip. Link from this PR's description.
4. **Add `.changeset/<slug>.md`** bumping `brevwick-react` patch (minified bundle is user-observable) and optionally `brevwick-sdk` patch to maintain lockstep.
5. **Optionally** add CJS entries to `.size-limit.json` (or document the ESM-only choice).
6. **Re-verify the +1 kB gate** end-to-end in CI after the action fix (issue #7's explicit acceptance criterion).

---

NEXT: parent session MUST immediately launch `pr-review-fixer` with the checklist path — do not wait for user confirmation.
