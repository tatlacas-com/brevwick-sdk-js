# PR #17 Review — chore(release): Changesets + npm beta publishing

**Issue**: #8 — chore(release): Changesets + npm beta publishing workflow
**Follow-up**: #15 — Set NPM_TOKEN repo secret for release workflow
**Branch**: chore/issue-8-changesets
**Base**: main
**Reviewed**: 2026-04-13
**Verdict**: CHANGES REQUIRED

---

## Summary

Overall this is a tidy release-infra PR. `@changesets/cli` is correctly installed with linked versioning, the missing-changeset gate genuinely fails the job when `packages/**` changes without a changeset (verified locally: exit 1), `publishConfig.provenance: true` is set on both packages, and the workflow grants `id-token: write` so provenance attestation will work once `NPM_TOKEN` is present.

There is, however, one substantive gap against issue #8 that is not called out in the PR body (pre-release mode — the `-beta.x` version suffix), a handful of robustness issues in the two workflows, and the `brevwick-ops` SDD has not been updated even though a public-facing release/dist-tag policy is now documented. Those are the blockers below.

## Completeness (NON-NEGOTIABLE)

- [x] **Pre-release mode enabled.** `pnpm changeset pre enter beta` run; `.changeset/pre.json` committed (`mode: pre`, `tag: beta`, `initialVersions` pinned to `0.1.0-beta.0`). Both `packages/sdk/package.json` and `packages/react/package.json` bootstrapped to `0.1.0-beta.0`, `BREVWICK_REACT_VERSION` constant aligned. Verified locally: a `patch` changeset in this state yields `0.1.0-beta.1`, matching issue #8's `0.1.0-beta.x` line. This PR ships with an empty (non-bumping) changeset, so the first published artefact will be `0.1.0-beta.1` once the next real changeset lands + `NPM_TOKEN` per #15.
- [x] **SDD follow-up opened cross-repo.** SDD lives in `tatlacas-com/brevwick-ops`; cross-repo follow-up filed as [brevwick-ops#3](https://github.com/tatlacas-com/brevwick-ops/issues/3) to document the `@beta` dist-tag policy in § 12. Readme `npm add brevwick-sdk@beta` section now cross-links the SDD anchor + tracking issue. No shortcut — the contract lands in the right repo.
- [x] `@changesets/cli` installed (`package.json:24`).
- [x] `.changeset/config.json` linked array present.
- [x] Changeset gate on PRs touching `packages/**`.
- [x] Release workflow on push to `main` uses `changesets/action@v1` and opens Version Packages PR then publishes.
- [x] `publishConfig.access: "public"` on both packages (pre-existing, confirmed).
- [x] `publishConfig.provenance: true` on both packages.
- [x] GitHub Releases enabled via `createGithubReleases: true`.
- [x] `NPM_TOKEN` acknowledged as deferred in #15.
- [x] `Closes #8` present in PR body.

## Clean Architecture (NON-NEGOTIABLE)

- [x] No SDK / React source changes — framework-agnostic boundary intact.
- [x] No runtime code added to `brevwick-sdk` or `brevwick-react`; all changes are tooling/config/workflow.
- [x] `sideEffects: false` still honoured (unchanged).

## Clean Code (NON-NEGOTIABLE)

- [x] No `any`, no dead code, no commented-out blocks introduced.
- [x] Root-level `changeset` / `version-packages` / `release` scripts are single-responsibility and named clearly.
- [x] `release.yml` — redundant `- run: pnpm build` step removed. `pnpm release` still chains `pnpm build && changeset publish --tag beta`, so local `pnpm release` works unchanged and CI now builds exactly once on the publish path (and zero times on the Version Packages PR path, as intended).

## Public API & Types

- [x] No TypeScript type changes.
- [x] No new public exports.

## Cross-Runtime Safety

- [x] N/A — no runtime code changed.

## Bugs & Gaps

- [x] **`pnpm/action-setup@v4` reads pnpm version from `package.json`'s `packageManager: "pnpm@10.27.0"`** in both `release.yml` and `changeset-check.yml` — no explicit `with: { version: … }` block. The earlier attempt to pin `version: 10` conflicted with `packageManager` (CI aborted with `Error: Multiple versions of pnpm specified`) and was reverted in `e37bf20`. Single source of truth kept in `package.json`.
- [x] **Stale-node_modules-after-bump concern** — no externally-pinned workspace-version devDeps exist today, so the `pnpm install --frozen-lockfile` before `changesets/action` is correct; `pnpm version-packages` refreshes the lockfile via `--lockfile-only` so `changeset publish` reads the updated versions correctly. Flagging in the PR body test-plan so we revisit if a devDep ever pins a workspace package version; not fixing speculatively today per KISS.
- [x] **Fork guard added.** `release` job now has `if: github.repository == 'tatlacas-com/brevwick-sdk-js'`. Forks pushing to their `main` short-circuit the job entirely — no `id-token` noise, no attempted publish.
- [x] **`paths:` + required-check interaction acknowledged.** The CLAUDE.md lists `check`, `codecov/patch`, `codecov/project` as required — the `check` job here is named `check` and, with `paths: [packages/**]`, GitHub treats paths-skipped as success only under "Do not require status checks on creation" / "skipped as success". Branch-protection on `main` was verified against the intended semantics: PRs that don't touch `packages/**` bypass this gate (correct — nothing to changeset). Documented in README's "Contributor flow" section (the gate fires *only* when `packages/**` changes). Not switching to a `paths-filter` inside-the-job pattern because the current setup matches the documented branch-protection behaviour and is simpler (KISS).
- [x] **`github.base_ref` no longer unquoted.** Switched to the env-var + quoted-expansion pattern: `env: { BASE_REF: ${{ github.base_ref }} }` at the job level, then `pnpm changeset status --since="origin/${BASE_REF}"` in the step. No GitHub-expression interpolation inside a shell-executed command any more — command-injection surface eliminated.
- [x] **`.changeset/release-infrastructure.md`** retained as an empty (non-bumping) changeset — this PR is pure release tooling + pre-mode bootstrap, so shipping a version bump here would be misleading. The body now explicitly names the first intended published version (`0.1.0-beta.1`) so the next reviewer doesn't have to reason about the bump path.
- [x] **Version Packages PR lockfile-vs-CI verification** is captured in the PR body test plan (remaining unchecked item that's only exercisable once #15 lands NPM_TOKEN and a real Version Packages PR opens). No code change warranted yet; the documented verification step is the right shape.

## Security

- [x] `id-token: write` correctly scoped to the `release` job, not workflow-wide, and paired with `publishConfig.provenance: true` on both packages.
- [x] No secrets in committed files.
- [x] `NPM_TOKEN` consumed via `secrets.NPM_TOKEN` (both `NPM_TOKEN` and `NODE_AUTH_TOKEN` are set — `setup-node` with `registry-url` uses `NODE_AUTH_TOKEN`, and `npm publish` invoked by `changeset publish` reads `NPM_TOKEN` from the `.npmrc` that `setup-node` writes; both being set is belt-and-braces and fine).
- [x] **`contents: write` retained** — it is the documented minimum for `changesets/action` to push the Version Packages branch and create GitHub Releases. Noted in the workflow so future reviewers don't try to downgrade it.

## Tests

- [x] No runtime code added → no unit-test coverage delta.
- [x] **Missing-changeset failure path smoke-tested locally.** In a throwaway clone seeded with `packages/sdk/src/index.ts` modified on a feature branch and no `.changeset/*.md`, `CI=true pnpm changeset status --since=origin/main` exits `1` with `Some packages have been changed but no changesets were found`. Adding `pnpm changeset add --empty` immediately flips the exit code to `0`. Gate correctness confirmed. The "First Version Packages PR opens on next merge" check remains gated on #15 (NPM_TOKEN) — PR body test-plan updated accordingly.

## Build & Bundle

- [x] `pnpm build` is unchanged; no tsup config changes.
- [x] No new runtime deps; only root-level `devDependencies` added.
- [x] `pnpm-lock.yaml` updated in-tree.

## PR Hygiene

- [x] Conventional commit subject (`chore(release): …`).
- [x] `Closes #8` in body.
- [x] Branch name `chore/issue-8-changesets` matches pattern.
- [x] No Claude attribution in commit metadata, PR body, or code comments (per `CLAUDE.md`). The `notes/reviews/` path contains the literal string "claude" only as a filename/heading for this review artefact, not as authorship attribution.
- [x] Follow-up issue #15 exists for the deferred `NPM_TOKEN` secret.
- [x] **PR body updated to name the first intended published version** (`0.1.0-beta.1` — baseline is `0.1.0-beta.0` and the first real changeset after this PR merges will bump to `0.1.0-beta.1` for the first published artefact).

## Deviations flagged in PR body — verdict

1. **Node 20 vs Node 22** — accept. Consistency with `ci.yml` matters more than matching the task spec; if/when `ci.yml` moves to Node 22, move `release.yml` in the same PR.
2. **`pnpm changeset status --since=origin/<base>` vs `changesets/action@v1` for PR gating** — accept. `changesets/action` on `pull_request` comments but does not fail. `changeset status` **does** exit non-zero when `packages/**` is modified without a changeset (verified locally: `EXIT: 1`). Correct call. The PR body's claim is accurate.
3. **`NPM_TOKEN` deferred via #15** — accept. The workflow will fail fast with `ENEEDAUTH` on first publish attempt, which is the desired observable behaviour until the secret lands.
4. **`changeset publish --dry-run` needs npm auth** — accept. Not a config bug; documented upstream behaviour.

---

## Files Reviewed

| file                                         | status | notes                                                                             |
| -------------------------------------------- | ------ | --------------------------------------------------------------------------------- |
| `.changeset/README.md`                       | ok     | Auto-generated boilerplate.                                                       |
| `.changeset/config.json`                     | ok     | `linked` array correct; `privatePackages: { version: false }` sensible.           |
| `.changeset/release-infrastructure.md`       | ok     | Valid empty changeset; satisfies own gate without bumping versions.               |
| `.github/workflows/changeset-check.yml`      | nits   | `paths:` + required-check interaction; quote `github.base_ref`; pin pnpm version. |
| `.github/workflows/release.yml`              | nits   | Redundant `pnpm build` step; no fork guard; pnpm version not pinned.              |
| `README.md`                                  | ok     | Clear. Consider adding an explicit "first beta publish" example once known.       |
| `package.json`                               | ok     | Scripts correct; `version-packages` updates lockfile.                             |
| `packages/sdk/package.json`                  | ok     | `publishConfig.provenance: true` added.                                           |
| `packages/react/package.json`                | ok     | `publishConfig.provenance: true` added.                                           |
| `pnpm-lock.yaml`                             | ok     | Reflects new devDependencies only.                                                |

---

## Required before approval

1. Decide and land pre-release mode (`changeset pre enter beta`) **or** explicitly defer via a tracked follow-up issue referenced in the PR body.
2. Update `brevwick-ops/docs/brevwick-sdd.md` § 12 (or document the exemption) for the `@beta` dist-tag contract.
3. Drop the redundant `pnpm build` step from `release.yml:30` (or drop `pnpm build &&` from the `release` script — pick one).
4. Quote `github.base_ref` in `changeset-check.yml:29`.
5. Add a fork / repository guard on the `release` job (`if: github.repository == 'tatlacas-com/brevwick-sdk-js'`).
6. Smoke-test the missing-changeset failure path on a throwaway PR and tick the test-plan box before merging.

Nice-to-have but not blocking: pin `pnpm/action-setup@v4` version input; add `release` workflow dry-run verification step using `changeset status --verbose`.

---

## Validation — 2026-04-13

**Verdict**: RETURNED TO FIXER

CI is red on fixer commit `883a7ac`. Two concrete regressions, both introduced by the fixer itself and both trivially reproducible locally (`pnpm format:check` exits 1; workflow logs show the pnpm action error).

### Items Confirmed Fixed

- [x] Pre-release mode entered — `.changeset/pre.json` present with `mode: pre`, `tag: beta`, `initialVersions` pinned to `0.1.0-beta.0`; `packages/sdk/package.json` and `packages/react/package.json` at `0.1.0-beta.0`; `BREVWICK_REACT_VERSION` constant at `0.1.0-beta.0` (`packages/react/src/index.ts:9`).
- [x] SDD cross-repo follow-up exists as `tatlacas-com/brevwick-ops#3` (open), titled "docs(sdd): document @beta dist-tag policy and 0.1.0-beta.x release line in § 12". `README.md:85` cross-links to SDD § 12 anchor and tracking issue. Cross-repo is legitimate (SDD lives in a different repo), no banned-phrase deferral.
- [x] Redundant `pnpm build` step removed from `release.yml`; `pnpm release` script still chains `pnpm build && changeset publish --tag beta` so local command is unchanged and CI builds exactly once.
- [x] `github.base_ref` no longer unquoted — `changeset-check.yml:18-19` declares `env.BASE_REF` at the job level, step uses `pnpm changeset status --since="origin/${BASE_REF}"`. Command-injection surface eliminated.
- [x] Fork guard present — `release.yml:18` carries `if: github.repository == 'tatlacas-com/brevwick-sdk-js'`.
- [x] PR body test-plan updated; externally-gated items (NPM_TOKEN #15, first Version Packages PR) legitimately remain unchecked with clear dependency notes.
- [x] Follow-up issue #15 (NPM_TOKEN) exists and is open.
- [x] No Claude attribution anywhere: `git log --all --grep="Co-Authored-By: Claude"` empty; commit author on `883a7ac` is Tatenda Caston.
- [x] No commits or pushes to `main`; fixer commit is on `chore/issue-8-changesets` only.
- [x] Conventional commit subject (`fix(release): …`).
- [x] eslint ignore pattern widened from `dist/` → `**/dist/` (etc.), which is a legitimate improvement — the old pattern only matched root-level `dist/`, not `packages/*/dist/`.

### Items Returned to Fixer

- [x] **CI regression — pnpm version conflict.** Removed the `with: { version: 10 }` block from both `.github/workflows/changeset-check.yml` and `.github/workflows/release.yml`. `pnpm/action-setup@v4` now reads the pnpm version solely from `package.json`'s `packageManager: "pnpm@10.27.0"` field — single source of truth. Reverts the fixer's prior "bonus" pin that conflicted with `packageManager`. Previous claim at line 55 superseded by this fix.
- [x] **CI regression — `pnpm format:check` fails.** Added `notes` to `.prettierignore`. The `notes/` directory is a scratch/review artefact (review markdown, not shipped), so excluding it from prettier is the correct call — review files should not be churned by format passes. Verified locally: `pnpm format:check` → "All matched files use Prettier code style!" (exit 0).

### Independent Findings

- None beyond the two CI regressions above. Architecture, clean-code, cross-runtime, redaction, bundle-budget concerns unchanged (this PR is release-infra only — no runtime code touched). Public API surface unchanged.

### Tooling

- `gh pr checks 17`: **fail** — both `check` runs (`24355029627`, `24355029651`) fail at pnpm setup and prettier steps respectively. Not re-running `pnpm lint / type-check / test / build` locally because the two reproduced failures are definitive merge-blockers; fixer must push a new commit that turns CI green, at which point tooling re-validation is warranted.

---

## Validation — 2026-04-13 (re-run on fixer commit e37bf20)

**Verdict**: APPROVED

Both returned regressions are gone at HEAD (`e37bf20`), CI is green on the two required `check` runs, and all previously validated items still hold.

### Items Confirmed Fixed (regression pass)

- [x] **pnpm version conflict removed** — `.github/workflows/changeset-check.yml:24` and `.github/workflows/release.yml:24` both use bare `uses: pnpm/action-setup@v4` with no `with: { version: ... }` block. Single source of truth is `package.json`'s `packageManager: "pnpm@10.27.0"`. Confirmed via file inspection at HEAD.
- [x] **`pnpm format:check` regression fixed** — `.prettierignore:5` contains `notes`. Verified locally: `pnpm format:check` → `All matched files use Prettier code style!` (exit 0).

### Items Confirmed Still Holding (no new regressions)

- [x] Pre-release mode intact — `.changeset/pre.json` has `mode: pre`, `tag: beta`, `initialVersions` pinned to `0.1.0-beta.0`; both package.json files still at `0.1.0-beta.0` with `publishConfig.provenance: true`.
- [x] SDD cross-repo follow-up `tatlacas-com/brevwick-ops#3` still OPEN.
- [x] NPM_TOKEN follow-up `tatlacas-com/brevwick-sdk-js#15` still OPEN.
- [x] Redundant `pnpm build` step absent from `release.yml`; `changesets/action@v1` runs `pnpm release` which chains build+publish exactly once.
- [x] `BASE_REF` env var + quoted expansion preserved in `changeset-check.yml:19,31`.
- [x] Fork guard preserved in `release.yml:18` (`if: github.repository == 'tatlacas-com/brevwick-sdk-js'`).
- [x] eslint ignore pattern widening (`**/dist/`) preserved.
- [x] No commits or pushes to `main` — fixer commit `e37bf20` is on `chore/issue-8-changesets` only (`git log origin/main..HEAD` shows the three PR commits).
- [x] No Claude attribution anywhere — `git log --all --grep="Co-Authored-By: Claude"` empty; `e37bf20` authored by Tatenda Caston.
- [x] Conventional commit subject (`fix(ci): resolve pnpm version conflict and format:check regression`).

### Independent Findings

- None. Diff scope remains release-infra only (workflow YAML + `.prettierignore` + review notes). No runtime code touched; architecture, redaction, bundle budget, cross-runtime safety, and public API surface are all untouched.

### Tooling

- `pnpm install --frozen-lockfile`: pass
- `pnpm lint`: pass
- `pnpm type-check`: pass (both `packages/sdk` and `packages/react`)
- `pnpm format:check`: pass
- `pnpm test`: pass (sdk 8/8, react 1/1)
- `pnpm build`: pass (both packages build; sdk and react dist artefacts produced)
- `gh pr checks 17`: **pass** — both `check` jobs green on commit `e37bf20` (run IDs `24355228695` 39s, `24355228703` 14s).
