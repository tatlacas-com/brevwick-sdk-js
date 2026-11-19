# brevwick-sdk-js

A pnpm workspace publishing seven npm packages that version together: `@tatlacas/brevwick-sdk` (the framework-agnostic core) and the `-react`, `-react-native`, `-solid`, `-vue`, `-svelte` and `-angular` adapters. Contributor guide: `CONTRIBUTING.md`.

Area rules load from `.claude/rules/` when you touch matching files.

## Commands

- Install and build: `pnpm install`, `pnpm build`. Adapters resolve the core through its `dist/`, so run `pnpm --filter @tatlacas/brevwick-sdk build` before an adapter's type-check or tests.
- Before every push: `pnpm format:check`, `pnpm lint`, `pnpm type-check`, and the tests covering your change: `pnpm --filter @tatlacas/brevwick-<pkg> exec vitest run <path>`. Add `pnpm size` when bundled code changed.
- Changeset for any change under `packages/**`: `pnpm changeset`.

CI runs every package's suite with coverage, the size budgets and Playwright (`pnpm test:e2e`) on every push. Don't run them all locally. When CI fails, fix the test it names.

## How a change lands

- PRs target `dev` (the default branch) and are squash-merged. `main` takes only `chore/promote-*` PRs from `scripts/promote-stable.sh`, merged as a merge commit, and `changeset-release/main`. `dev` publishes to npm `beta`, `main` to `latest`; the name mismatch is intentional.
- One concern per PR, opened ready for review, from a branch `<feat|fix|chore|docs>/issue-<N>-<slug>` in a worktree outside the repo: `git worktree add ../brevwick-sdk-js-issue-<N> -b <branch> origin/dev`.
- Commit subjects are Conventional, at most 72 characters. Commits must be signed: CI rejects unverified ones. Stage paths by name. Commits, PRs and issues carry no AI attribution.
- A failing gate is fixed at its cause. `.claude/settings.json` denies skipping hooks, amending and force-pushing, because each pushed head must pass CI on its own. Raising a size budget or lowering coverage to get a pass is a review finding.

## Review findings

- A defect your change introduced is fixed in the same PR. An inline review comment counts as a change request.
- A defect that was already there gets its own issue with a failing test, linked from the PR. "Already there" means that test also fails on the merge base, and the reviewer decides it, not the author. It blocks the merge only if it makes the change itself unsafe. Small PRs are what keep review fast.

## Architecture

- The core owns capture, redaction, transport and the wire contract with brevwick-api. Adapters are thin bindings to a framework and hold no logic the core could hold, so all seven packages behave the same.
- The API is the source of truth for the wire shape. If the fix belongs in brevwick-api, say so and stop.

## Rules for every change

- Every payload leaving the device goes through `redact()`. A new context field gets a redaction test, because a leak here ships into customers' apps.
- Unknown is never safe: fail closed.
- Replace old paths outright, with no compatibility shims, unless the change is a published breaking change with its own major changeset.
- One source of truth: share logic instead of copying it.
- Comments say only what the code cannot: a non-obvious reason, an external contract, a trap.
