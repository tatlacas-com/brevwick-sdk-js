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

- [x] **`pnpm/action-setup@v4` now pins `version: 10`** in both `release.yml` and `changeset-check.yml`. Explicit coupling replaces the implicit `packageManager` read, so a future action major that reorders resolution can't silently break the publish path.
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
- [x] No Claude attribution anywhere in the diff.
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
