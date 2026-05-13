# Contributing

Thanks for your interest in Brevwick. This repo publishes seven linked npm packages from a pnpm workspace: `@tatlacas/brevwick-sdk` (framework-agnostic core) plus six adapters (`-react`, `-solid`, `-vue`, `-svelte`, `-angular`, `-react-native`).

## Prerequisites

- Node.js **≥ 20**
- pnpm **10.x** (pinned via `packageManager` in `package.json`; Corepack will pick it up)

```bash
corepack enable
pnpm install
```

## Common commands

```bash
pnpm build           # build all packages (tsup)
pnpm test            # vitest in all packages
pnpm test:cover      # with coverage
pnpm lint            # eslint
pnpm type-check      # tsc --noEmit
pnpm format          # prettier write
pnpm format:check    # prettier check (runs in CI)
pnpm size            # size-limit gate
```

### Per-package

```bash
pnpm --filter @tatlacas/brevwick-sdk build
pnpm --filter @tatlacas/brevwick-react test
```

## Bundle budgets

Hard limits enforced by `size-limit` and unit tests. **Do not exceed.**

| Scope                                                                            | Budget (gzip) |
| -------------------------------------------------------------------------------- | ------------- |
| `@tatlacas/brevwick-sdk` eager core (`createBrevwick` + console + network rings) | ≤ 8 kB        |
| On widget open (`modern-screenshot` loaded)                                      | ≤ 25 kB       |
| On first `submit()` (presign + upload + ingest pipeline)                         | dynamic       |

The console + network rings sit on the eager path on purpose — they have to be live before the first user error or fetch fires, otherwise the issue you're trying to file arrives missing the very evidence the user opened the widget to report. Anything heavy that does NOT need to capture pre-submit (`modern-screenshot`, the submit pipeline, the project-config fetch) must be dynamic-imported (`await import('…')`) so it stays out of the initial bundle.

## Redaction is mandatory

Every payload that leaves the device runs through `redact()` first. Adding a new context field? **Add a redaction test for it.** Server-side sanitisation is defence-in-depth, not a substitute.

## Local testing in a host app (pre-publish)

Before a package hits npm, consume it from a sibling app checkout as a tarball. **On Next.js 16+ the `link:` / symlink route does not work** — Turbopack refuses to resolve packages outside the consumer's project root, even with `transpilePackages` or `turbopack.resolveAlias`. Tarballs avoid that.

```bash
pnpm -r pack          # builds each package and emits packages/{sdk,react}/*.tgz
```

Then in the consumer's `package.json`:

```json
{
  "dependencies": {
    "@tatlacas/brevwick-sdk": "1.0.0-beta.2",
    "@tatlacas/brevwick-react": "1.0.0-beta.2"
  },
  "pnpm": {
    "overrides": {
      "@tatlacas/brevwick-sdk": "file:/abs/path/to/brevwick-sdk-js/packages/sdk/brevwick-sdk-1.0.0-beta.2.tgz",
      "@tatlacas/brevwick-react": "file:/abs/path/to/brevwick-sdk-js/packages/react/brevwick-react-1.0.0-beta.2.tgz"
    }
  }
}
```

The `dependencies` entries stay after publish; the `pnpm.overrides` block **must be deleted before merging the consumer's PR** (CI installs from npm, not a local path). Re-run `pnpm -r pack` whenever SDK code changes — tarballs have no live-reload.

## Branching & PR workflow

Two long-lived branches:

| Branch          | npm dist-tag | Purpose                                                         |
| --------------- | ------------ | --------------------------------------------------------------- |
| `dev` (default) | `beta`       | Day-to-day integration; merges publish `-beta.N` to npm `beta`  |
| `main`          | `latest`     | Stable releases only — fed exclusively by `chore/promote-*` PRs |

```
dev (protected, default)
  └── feat/<short-description>
  └── fix/<short-description>
  └── chore/<short-description>

main (protected)
  └── chore/promote-<version>     ← only via scripts/promote-stable.sh
  └── changeset-release/main      ← only auto-opened by changesets/action
```

1. `git fetch origin` then branch from `origin/dev` (never from local `dev` — may be stale).
2. Make changes, commit with conventional commits.
3. Push the branch and create a PR with `gh pr create` — base defaults to `dev`.
4. PR body references the issue (`Closes #<number>`) where applicable. Link SDD § 12 for public-API changes.
5. Wait for CI to pass. **Squash-merge** into `dev` (the only allowed merge method on either branch).

### Commit conventions

- Conventional commits: `feat:`, `fix:`, `chore:`, `docs:`, `test:`, `refactor:`
- Subject ≤ 72 chars
- **Commits must be signed** (GPG or SSH). Unsigned commits fail `verify-signatures`.

### Branch protection

Both `dev` and `main` are protected:

- Squash-merge only; no direct push, no force-push, no deletion.
- Required status checks: `check`, `codecov/patch`, `codecov/project`, `size-check`.
- Stale reviews dismissed on new push.

`main` additionally enforces (via `guard-deploy-branches.yml`) that incoming PRs come from `chore/promote-*` or `changeset-release/main` only — direct `dev → main` PRs are blocked.

## Releases

Driven by [Changesets](https://github.com/changesets/changesets). All seven packages are **linked** in `.changeset/config.json` and bump in lockstep.

### Add a changeset

On any PR that changes `packages/**`:

```bash
pnpm changeset
```

Pick the affected package(s), the bump type (`major` / `minor` / `patch`), write a short summary. Commit the generated `.changeset/*.md` file.

CI's `changeset-check` fails the PR if no changeset is present. For changes that genuinely don't need a release entry (typo fixes, doc-only merges), use `pnpm changeset add --empty`.

### Beta release (publish to npm `beta` dist-tag)

The 99% case. Merge feature PRs into `dev`. `release-dev.yml` opens or updates a **Version Packages (dev)** PR. Squash-merging that PR publishes the new `-beta.N` to the npm `beta` dist-tag with [provenance](https://docs.npmjs.com/generating-provenance-statements). GitHub Releases are generated automatically from the changelogs.

### Stable release (publish to npm `latest`)

When ready to cut a stable:

```bash
git fetch origin
git checkout -b chore/promote-<version> origin/main
./scripts/promote-stable.sh
```

The script merges `dev` into the chore branch, runs `pnpm changeset pre exit`, and opens a `chore/promote-<version> → main` PR. After it merges, `release.yml` on `main` opens an auto **Version Packages** PR with stable bumps; squash-merging that publishes to `latest`.

### Resume the beta channel after stable ships

```bash
git fetch origin
git checkout -b chore/resume-dev-<version> origin/dev
./scripts/resume-dev.sh
```

The script merges `main` into the chore branch (brings the stable baselines into `dev`), runs `pnpm changeset pre enter beta`, and opens a PR into `dev`. After it merges, the next feature changeset on `dev` produces `<next>.0-beta.0`.

### npm dist-tags

- `npm install @tatlacas/brevwick-sdk` — resolves to `latest` (current stable).
- `npm install @tatlacas/brevwick-sdk@beta` — current prerelease line.

## Repo secrets

Configured under **Settings → Secrets and variables → Actions**.

| Secret          | Purpose                                                                                                                                                                                                                                                                      |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `NPM_TOKEN`     | Automation token with publish rights for `@tatlacas/brevwick-sdk` and `@tatlacas/brevwick-react`. `id-token: write` is also granted so npm provenance can attest the build. A move to [npm Trusted Publishing](https://docs.npmjs.com/trusted-publishers) is on the roadmap. |
| `GITHUB_TOKEN`  | Provided by Actions. The workflow requests `contents: write` and `pull-requests: write` so Changesets can open the Version Packages PR and create releases.                                                                                                                  |
| `CODECOV_TOKEN` | Coverage upload.                                                                                                                                                                                                                                                             |

## Questions?

Open an issue at [github.com/tatlacas-com/brevwick-sdk-js/issues](https://github.com/tatlacas-com/brevwick-sdk-js/issues).
