# Brevwick JS SDK

## Working Style

Never blindly implement a suggestion. Apply critical thinking — push back when something is wrong, over-engineered, or has a better alternative. Ask clarifying questions. Offer alternatives. Collaborative, not a rubber stamp.

**No shortcuts or temporary fixes.** Do not implement workarounds or "for now" solutions that paper over a real problem. If the proper fix belongs in a different repo or requires upstream work, say so and stop. Every fix must address the root cause.

**Never commit and push directly to `main`.** `main` is protected — all changes go through a PR. No exceptions.

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
# Branch from origin/main, not local main (may be stale)
git worktree add ../brevwick-sdk-js-issue-<N> -b feat/issue-<N>-short-desc origin/main
cd ../brevwick-sdk-js-issue-<N>
```

**Do not remove worktrees** — the user cleans them up.

## Project Overview

pnpm workspace publishing two npm packages: `brevwick-sdk` (core, framework-agnostic) and `brevwick-react` (React bindings).

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
pnpm --filter brevwick-sdk build
pnpm --filter brevwick-react test
```

## Bundle Budget — DO NOT EXCEED

- Core `brevwick-sdk` initial chunk: **< 2.2 kB gzip** (bumped from 2 kB in issue-9 with the loopback-http carve-out in `canonicaliseHttpsUrl`; enforced by `packages/sdk/src/__tests__/chunk-split.test.ts` and mirrored in SDD § 12)
- On widget open (`modern-screenshot` dynamic-imported): **< 25 kB gzip**

Anything heavy must be dynamic-imported (`await import('modern-screenshot')`) so it doesn't ship until the user clicks the FAB.

## Redaction Is Mandatory

Every payload that leaves the device runs through `redact()` first. Adding a new context field? Add a redaction test for it. Server-side sanitiser is defence-in-depth, not a substitute.

## Versioning

Both packages move together for now (kept in lockstep). Once Phase 4 ships and the API is stable, they may diverge — at that point introduce changesets.

Pre-1.0 (`0.x.y`):

- patch: bug fixes, internal refactors
- minor: anything else (no SemVer guarantee in 0.x)

## Branching & PR Workflow

```
main (protected)
  └── feat/<short-description>
  └── fix/<short-description>
  └── chore/<short-description>
```

### Workflow steps

1. `git fetch origin` then create branch from `origin/main` (never from local `main`).
2. Make changes, commit with conventional commits.
3. Push branch, create PR with `gh pr create`.
4. PR body references the issue (`Closes #<number>`) where applicable; link the SDD § 12 contract for public API changes.
5. Wait for CI to pass. Squash-merge into `main` (the only allowed merge method).

### Rules

- Conventional commits: `feat:`, `fix:`, `chore:`, `docs:`, `test:`, `refactor:`
- Subject ≤ 72 chars
- No `Co-Authored-By` headers — no Claude attribution anywhere

### Branch protection (`main`)

- Squash-merge only; no direct push, no force-push, no deletion.
- Required status checks: `check`, `codecov/patch`, `codecov/project`.
- Stale reviews dismissed on new push.

### Deploy branches

- `beta` and `stable` (if/when introduced) are deploy branches. PRs to them must originate from `main` (enforced by `guard-deploy-branches.yml`).
