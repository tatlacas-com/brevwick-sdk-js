# PR #93 Review — chore(react-native): scaffold packages/react-native

**Issue**: #82 — chore(react-native): scaffold packages/react-native — package skeleton + tsup + vitest
**Branch**: chore/issue-82-react-native-scaffold
**Reviewed**: 2026-05-02
**Verdict**: CHANGES REQUIRED

CI is red on `Require a changeset on PRs that touch packages/**`, and the published tarball ships test-only mock code. Both must be fixed before merge. A few smaller correctness and consistency issues are listed below.

---

## Completeness (NON-NEGOTIABLE)

- [x] **Missing changeset entry — CI gate failing.** Added `.changeset/react-native-scaffold.md` declaring `@tatlacas/brevwick-react-native: minor`, `@tatlacas/brevwick-sdk: minor`, `@tatlacas/brevwick-react: minor`. The `linked` group will pull all six other adapters along at the next Version Packages run. Verified locally with `pnpm changeset status` — the bump shows for every linked package.
- [x] **`@tatlacas/brevwick-react-native` is not in `.changeset/config.json` `linked` group.** Added `@tatlacas/brevwick-react-native` to the linked array in `.changeset/config.json` so the suite stays in lockstep going forward.
- [x] **`src/index.ts` exports a runtime symbol; issue spec said empty placeholder.** Kept the `BREVWICK_REACT_NATIVE_VERSION` export (mirrors React/Solid/Vue/Svelte/Angular and saves a follow-up scaffolding change) and called the deviation out explicitly in the updated PR body Summary section. Also added JSDoc on the export per the Public-API note.

## Clean Architecture (NON-NEGOTIABLE)

- [x] **`src/__mocks__/react-native.ts` is shipped in the published tarball.** Moved the mock from `packages/react-native/src/__mocks__/react-native.ts` to `packages/react-native/test/__mocks__/react-native.ts` (option 1 — outside `src/`). Updated the vitest alias in `vitest.config.ts` to point at the new path. `pnpm pack` now lists only `dist/`, `package.json`, `README.md`, and `src/index.ts` — no `__mocks__/` paths. Original heading retained for context:

  ```
  src/__mocks__/react-native.ts
  src/index.ts
  ```

  `files: ["dist", "src", ...]` (`packages/react-native/package.json:18-23`) globs the entire `src/` tree, including the vitest stub. Test scaffolding has no business in the public package — it leaks an unused module that consumers can `import '@tatlacas/brevwick-react-native/src/__mocks__/react-native'` against (no `exports` block guard for `./src/*` exists). Fix one of three ways:

  1. Move `__mocks__/` out of `src/` (e.g. `test/__mocks__/react-native.ts`, update the vitest alias path).
  2. Add a `.npmignore` listing `src/__mocks__` (npm respects `.npmignore` for what `files` includes).
  3. Switch `files` to a narrower glob (`"src/index.ts"`) — but this is fragile if more source files land in feature worktrees.

  Option 1 is the cleanest and matches Flutter/RN library convention.

- [x] **`react-native` field + shipping `src/` makes `src/index.ts` part of the public API surface.** Confirmed intentional per the worktree spec (Metro source-preference). With the `__mocks__/` relocation above, the only file under `src/` that ships is `src/index.ts` — the public entry. No further change needed.

## Clean Code (NON-NEGOTIABLE)

- [x] **`Platform.select` mock is broken for Android tests.** Rewrote `select` in the relocated mock to look up `Platform.OS` against the spec map at call time and fall back to `default` — matches upstream `react-native`. Widened the spec map to `ios | android | web | windows | macos | native | default`. Tests that flip `Platform.OS = 'android'` now see the matching branch.
- [x] **`Dimensions.get` ignores its argument.** Added a one-line comment in the relocated mock explaining the `screen` ≡ `window` equivalence is an intentional scaffold choice and pointing future feature worktrees at branching here when status-bar / safe-area math diverges.

## Public API & Types

- [x] **`BREVWICK_REACT_NATIVE_VERSION` lacks JSDoc and an explicit type alias.** Added a JSDoc block on the export documenting the build-time injection, parity with the sibling adapters, and the intentional deviation from issue #82's `export {}` wording.
- [x] **`peerDependencies` declares `react-native-view-shot: ">=3 <5"` while devDependencies pin `^4.0.0`.** Tightened the peer range to `>=4 <5` — consumers can no longer install a v3 we never test against. devDep stays at `^4.0.0`; meta still flags it `optional: true` so the lazy-import path remains opt-in.

## Cross-Runtime Safety

- ~~**`tsconfig.json` `types: ["node"]` is correct, but the `tsconfig.base.json` it extends pulls in `lib: ["ES2020", "DOM", "DOM.Iterable"]`** — out-of-scope per the reviewer ("Out of scope for the scaffold PR but worth a follow-up note"). The DOM-lib leak is a base-config-wide concern that affects every adapter package equally; tightening it in the scaffold PR would either require per-package `lib` overrides for all adapters (significant churn touching 6+ packages outside this PR's stated scope) or a brand-new lint rule. The reviewer explicitly flagged this as a follow-up. The scaffold ships with `types: ["node"]` as a partial mitigation already.~~

## Bugs & Gaps

- No async / cancellation / retry surface in this PR (placeholder only).

## Security

- [x] No secrets, no `eval`, no `dangerouslySetInnerHTML`. No redaction surface yet (CLAUDE.md "redaction is mandatory" applies to payload-emitting code, none lands here). Confirmed no security regressions in the patched files.

## Tests

- [x] **`passWithNoTests: true` is a footgun for the feature worktrees.** Beefed up the rationale comment in `packages/react-native/vitest.config.ts` to name issue #83 explicitly: "The first feature worktree (#83 — provider + hook) MUST drop this flag and add the corresponding `coverage.thresholds` block (mirroring `packages/react/vitest.config.ts`)…". The comment now reads as a transitional escape hatch with a documented removal trigger, not a permanent permission.
- [x] **No coverage thresholds.** Folded into the `passWithNoTests` comment fix above — the same rationale block tells #83 to add the `coverage.thresholds` block when the first test lands. Adding empty thresholds in this PR would either fail (no source to cover) or be inert (vitest skips coverage with `passWithNoTests`). The single-source-of-truth comment ensures the next worktree wires both at once.

## Build & Bundle

- [x] Build green: `pnpm --filter @tatlacas/brevwick-react-native build` re-verified after the `minify: true` flip. ESM 98 B / CJS 605 B / DTS 522 B — empty-export shape, now minified.
- [x] **`tsup.config.ts` omits `minify: true`.** Added `minify: true` to `packages/react-native/tsup.config.ts` with a rationale comment pointing at the size-budget worktree (#91). Mirrors `packages/react/tsup.config.ts`.
- [x] **No `treeshake: false` directive — fine.** No change needed; confirmed via reviewer analysis.
- [x] **No size-limit entry yet.** Reviewer confirmed deferred to #91 per the worktree spec. Tracked in the updated PR body Summary so the gap is visible to future readers.

## PR Hygiene

- [x] Commit subject `chore(react-native): scaffold packages/react-native (#82)` — conventional, 56 chars. PASS (unchanged).
- [x] Commit author/email `Tatenda Caston <tathove@tatlacas.com>` — PASS, no Co-Authored-By trailers (also true of the new fixup commit).
- [x] PR body has Summary / Out of scope / Test plan and `Closes #82`. PASS — Summary updated to call out the `BREVWICK_REACT_NATIVE_VERSION` deviation and the deferred size-limit entry.
- [x] Branch name `chore/issue-82-react-native-scaffold` matches CLAUDE.md convention. PASS (unchanged).
- [x] `git add` scope clean. PASS — fixup commit stages only the seven files actually changed by the review fixes, no `-A` / `.`.
- [x] Lockfile diff. PASS — no lockfile churn introduced by the review fixes (peer-range tightening to `>=4 <5` is a manifest-only edit; the dev pin stayed at `^4.0.0` so resolution is unchanged).

## Files Reviewed

| file | status | notes |
| ---- | ------ | ----- |
| `packages/react-native/package.json` | CHANGES | `files: src` leaks `__mocks__/`; rn-view-shot peer range too loose; not in changesets `linked` group |
| `packages/react-native/tsup.config.ts` | CHANGES | add `minify: true` to match the suite |
| `packages/react-native/tsconfig.json` | OK | `types: ["node"]` correct; DOM lib leak is base-config-wide and out of scope |
| `packages/react-native/vitest.config.ts` | CHANGES | tighten the `passWithNoTests` removal plan; add coverage thresholds for feature worktrees |
| `packages/react-native/src/index.ts` | NIT | spec said `export {}`; current export is fine but flag the deviation in PR body |
| `packages/react-native/src/__mocks__/react-native.ts` | CHANGES | `Platform.select` is ios-only — bug; relocate file out of publish surface |
| `packages/react-native/README.md` | OK | stub matches spec |
| `pnpm-lock.yaml` | OK | clean rn-only additions, no unrelated drift |
| `.changeset/<missing>` | MISSING | required by `changeset-check.yml`, currently failing CI |
| `.changeset/config.json` (linked) | CHANGES | add `@tatlacas/brevwick-react-native` to linked array |

---

## Summary of required fixes (priority order)

1. Add changeset entry (`pnpm changeset add` with empty body, or document version policy if it ships now).
2. Stop publishing `src/__mocks__/react-native.ts` to npm (move out of `src/` is cleanest).
3. Fix `Platform.select` mock to honour `Platform.OS`.
4. Add `@tatlacas/brevwick-react-native` to `.changeset/config.json` linked array.
5. Tighten `react-native-view-shot` peer range to `>=4 <5` until a v3 compat test exists.
6. Add `minify: true` to `packages/react-native/tsup.config.ts`.
7. Either revert `BREVWICK_REACT_NATIVE_VERSION` to `export {}` or call out the deviation in the PR body.
8. Strengthen the `passWithNoTests` rationale comment with the issue number that removes it.
