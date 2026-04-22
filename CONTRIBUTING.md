# Contributing

Thanks for your interest in Brevwick. This repo publishes two npm packages (`@tatlacas/brevwick-sdk`, `@tatlacas/brevwick-react`) from a pnpm workspace.

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

| Scope                                       | Budget (gzip) |
| ------------------------------------------- | ------------- |
| `@tatlacas/brevwick-sdk` initial chunk      | ≤ 2.2 kB      |
| On widget open (`modern-screenshot` loaded) | ≤ 25 kB       |

Anything heavy must be dynamic-imported (`await import('modern-screenshot')`) so it stays out of the initial bundle.

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

```
main (protected)
  └── feat/<short-description>
  └── fix/<short-description>
  └── chore/<short-description>
```

1. `git fetch origin` then create a branch from `origin/main` (never from local `main` — may be stale).
2. Make changes, commit with conventional commits.
3. Push the branch and create a PR with `gh pr create`.
4. PR body references the issue (`Closes #<number>`) where applicable. Link SDD § 12 for public-API changes.
5. Wait for CI to pass. **Squash-merge** into `main` (the only allowed merge method).

### Commit conventions

- Conventional commits: `feat:`, `fix:`, `chore:`, `docs:`, `test:`, `refactor:`
- Subject ≤ 72 chars
- **Commits must be signed** (GPG or SSH). Unsigned commits fail `verify-signatures`.

### Branch protection on `main`

- Squash-merge only; no direct push, no force-push, no deletion.
- Required status checks: `check`, `codecov/patch`, `codecov/project`, `size-check`.
- Stale reviews dismissed on new push.

### Deploy branches

`beta` and `stable` (if/when introduced) are deploy branches — PRs to them must originate from `main` (enforced by `guard-deploy-branches.yml`).

## Changesets

Releases are driven by [Changesets](https://github.com/changesets/changesets). Both packages are **linked** (version in lockstep) pre-1.0 and currently in **pre-release mode** (`beta`) — `.changeset/pre.json` pins the tag so `changeset version` emits `1.0.0-beta.N` suffixes until the next `changeset pre exit`.

### Add a changeset

On any PR that changes `packages/**`:

```bash
pnpm changeset
```

Pick the affected package(s), the bump type, write a short summary. Commit the generated `.changeset/*.md` file.

CI's `changeset-check` fails the PR if no changeset is present (except when the PR author is `github-actions[bot]`, i.e. the automated Version Packages PR).

### Bump types (pre-1.0, `0.x.y` — historical guidance for when we exit beta)

- `patch` — bug fixes, internal refactors
- `minor` — anything else (no SemVer guarantee during `0.x`)

### Release flow

1. On merge to `main`, `changesets/action@v1` runs.
2. If pending changesets exist, the action opens (or updates) a **Version Packages** PR that consumes them, bumps both packages in lockstep, and updates changelogs.
3. **Squash-merging the Version Packages PR** triggers the release workflow on `main`, which runs `pnpm release` — building and publishing both packages to npm under the `beta` dist-tag with [provenance](https://docs.npmjs.com/generating-provenance-statements).
4. GitHub Releases are generated automatically from the changelog body.

### npm dist-tags

- `npm install @tatlacas/brevwick-sdk@beta` — canonical install during the beta line.
- `npm install @tatlacas/brevwick-sdk` — resolves to `latest` once stabilisation ships. `latest` is intentionally unpopulated during the beta line. Full policy in SDD § 12.

## Repo secrets

Configured under **Settings → Secrets and variables → Actions**.

| Secret          | Purpose                                                                                                                                                                                                                                                                      |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `NPM_TOKEN`     | Automation token with publish rights for `@tatlacas/brevwick-sdk` and `@tatlacas/brevwick-react`. `id-token: write` is also granted so npm provenance can attest the build. A move to [npm Trusted Publishing](https://docs.npmjs.com/trusted-publishers) is on the roadmap. |
| `GITHUB_TOKEN`  | Provided by Actions. The workflow requests `contents: write` and `pull-requests: write` so Changesets can open the Version Packages PR and create releases.                                                                                                                  |
| `CODECOV_TOKEN` | Coverage upload.                                                                                                                                                                                                                                                             |

## Questions?

Open an issue at [github.com/tatlacas-com/brevwick-sdk-js/issues](https://github.com/tatlacas-com/brevwick-sdk-js/issues).
