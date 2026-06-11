# Brevwick JS SDK

## Working Style

Never blindly implement a suggestion. Apply critical thinking — push back when something is wrong, over-engineered, or has a better alternative. Ask clarifying questions. Offer alternatives. Collaborative, not a rubber stamp.

**No shortcuts or temporary fixes.** Do not implement workarounds or "for now" solutions that paper over a real problem. If the proper fix belongs in a different repo or requires upstream work, say so and stop. Every fix must address the root cause.

**Never commit and push directly to `main` or `dev`.** Both are protected — all changes go through a PR. No exceptions. Day-to-day work targets `dev` (the default branch); `main` only receives promotion PRs from `dev` (see Release Channels below).

**Auto-commit, push, and open PR on branches.** When working on a `feat/fix/chore` branch, commit, push, **and create a PR with `gh pr create`** without asking. Every push to a branch must result in a PR. If a PR already exists, just push.

**Never remove worktrees locally.** The user manages worktree lifecycle — do not run `git worktree remove` or instruct sub-agents to do so.

**No Claude attribution anywhere.** Do not add `Co-Authored-By: Claude` headers, and do not mention Claude in commit messages, PR titles, PR descriptions, or code comments.

## Check PR/CI

When asked to "check PR" or "check CI":

1. `gh pr status` — open PRs
2. `gh pr checks <number>` — CI status for a PR
3. `gh pr view <number>` — PR details

If CI is failing, **immediately investigate and fix** — do not ask whether to investigate. Fetch failure details, find the root cause, start fixing.

## Worktree Workflow

```bash
git fetch origin
# Branch from origin/dev, not local dev (may be stale). dev is the default branch.
git worktree add ../brevwick-sdk-js-issue-<N> -b feat/issue-<N>-short-desc origin/dev
cd ../brevwick-sdk-js-issue-<N>
```

**Do not remove worktrees** — the user cleans them up.

## Project Overview

pnpm workspace publishing three npm packages: `@tatlacas/brevwick-sdk` (core, framework-agnostic), `@tatlacas/brevwick-react` (React bindings), and `@tatlacas/brevwick-solid` (Solid bindings).

**GitHub:** https://github.com/tatlacas-com/brevwick-sdk-js

## Common Commands

```bash
pnpm install
pnpm build           # build all packages (tsup)
pnpm test            # vitest in all packages
pnpm lint
pnpm type-check
pnpm format
```

Per-package:

```bash
pnpm --filter @tatlacas/brevwick-sdk build
pnpm --filter @tatlacas/brevwick-react test
```

## Bundle Budget — DO NOT EXCEED

- Core `@tatlacas/brevwick-sdk` eager total (`index.js` + every chunk it pulls in via static `import` / `export … from`): **< 8 kB gzip** (bumped from 2.85 kB when the console + network rings moved into the eager registry to close the install-time capture race; enforced by `packages/sdk/src/__tests__/chunk-split.test.ts` and `.size-limit.js`, mirrored in SDD § 12)
- On widget open (`modern-screenshot` dynamic-imported): **< 25 kB gzip**
- React adapter `@tatlacas/brevwick-react`: **< 25 kB gzip**
- Solid adapter `@tatlacas/brevwick-solid`: **< 12 kB gzip** (bumped from 5 kB in issue #113 when the Solid widget reached UX parity with the React adapter — chat-thread panel, AI toggle, staged-status rows, retry CTA. The screenshot capture button — restored after the v1 future-flag removal in PR #111 — fits within this ceiling; the Solid surface stays well below the React 25 kB ceiling.)
- Vue adapter `@tatlacas/brevwick-vue`: **< 13 kB gzip** (bumped from 10 kB when the screenshot capture button, region-select overlay, and preview dialog were restored; enforced by `packages/vue/src/__tests__/chunk-split.test.ts` and `.size-limit.js`)
- Svelte adapter `@tatlacas/brevwick-svelte`: eager entry **< 5 kB gzip**; `FeedbackButton.svelte` SFC source **< 22 kB gzip** (bumped from 14 kB when the screenshot capture UI was restored)
- Angular adapter `@tatlacas/brevwick-angular` (FESM2022): **< 31 kB gzip** (bumped from 18 kB when the screenshot capture UI was restored; Angular scaffolding carries 4-5 kB irreducible overhead)

The console + network rings sit on the eager path on purpose: they have to be live before the first user error or fetch fires, otherwise the submitted issue is missing the very evidence the user opened the widget to report. Anything heavy that does NOT need to capture pre-submit (`modern-screenshot`, the submit pipeline, the project-config fetch) stays behind `await import('…')` so it doesn't ship until needed.

## Redaction Is Mandatory

Every payload that leaves the device runs through `redact()` first. Adding a new context field? Add a redaction test for it. Server-side sanitiser is defence-in-depth, not a substitute.

## Versioning

All seven packages move together (`fixed` group in `.changeset/config.json`) — every release bumps every package to the same version, even if a changeset only mentions one of them, so consumers always install matching versions across the SDK + every adapter. Versions follow SemVer from `1.0.0` onward — the `1.0.0-beta.X` train is the lead-up to the first stable.

- `feat:` — minor bump
- `fix:` / `refactor:` — patch bump
- Breaking change — major bump (call it out in the changeset body)

## Release Channels

Two long-lived branches map to two npm dist-tags:

| Branch          | npm dist-tag | Purpose                                                           |
| --------------- | ------------ | ----------------------------------------------------------------- |
| `dev` (default) | `beta`       | Day-to-day integration; every merge can publish a new `-beta.N`   |
| `main`          | `latest`     | Stable releases only, fed exclusively by promotion PRs from `dev` |

> **Branch and dist-tag intentionally diverge on the prerelease channel.** The branch (`dev`) is for contributors; the dist-tag (`beta`) is for installers (`npm install @tatlacas/brevwick-sdk@beta`). Don't "fix" the mismatch — it's intentional.
>
> Concrete consequence: the workflow file is `release-dev.yml` (named for the source branch, like `release.yml`), but inside it `pnpm release:beta` runs `changeset publish --tag beta`. The pre-mode tag in `.changeset/pre.json` is also `beta`.

### Day-to-day flow (the 99% case)

1. `git fetch origin` then branch from `origin/dev` (the default branch).
2. Make changes; add a changeset (`pnpm changeset`).
3. Push branch, open PR into `dev` with `gh pr create`.
4. CI passes → squash-merge into `dev`.
5. `release-dev.yml` opens (or updates) a "Version Packages (dev)" PR. Merging it publishes `-beta.N` to the npm `beta` dist-tag.

### Stable promotion (occasional)

Run from a fresh chore branch off `origin/main`:

```bash
git fetch origin
git checkout -b chore/promote-<version> origin/main
./scripts/promote-stable.sh
```

The script merges `dev` into the branch, exits changesets pre mode, pushes, and opens a `dev → main` PR. After that PR merges, `release.yml` on `main` opens a "Version Packages" PR with stable bumps; merging it publishes to the `latest` dist-tag.

After stable ships, resume the prerelease channel:

```bash
git fetch origin
git checkout -b chore/resume-dev-<version> origin/dev
./scripts/resume-dev.sh
```

### Rules

- Conventional commits: `feat:`, `fix:`, `chore:`, `docs:`, `test:`, `refactor:`
- Subject ≤ 72 chars
- No `Co-Authored-By` headers — no Claude attribution anywhere
- Squash-merge only on both `dev` and `main`

### Branch protection

Both `dev` and `main` are protected:

- Squash-merge only; no direct push, no force-push, no deletion.
- Required status checks: `check`, `codecov/patch`, `codecov/project`.
- Stale reviews dismissed on new push.

`main` additionally enforces (via `guard-deploy-branches.yml`) that PRs into it must come from `dev`, a `chore/promote-*` branch, or `changeset-release/main` — use `scripts/promote-stable.sh`, do not open a feature-branch PR straight into `main`.
