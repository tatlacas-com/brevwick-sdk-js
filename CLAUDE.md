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

## Writing `<topic>-worktree.md` files

When the user asks to write or update a worktree.md, follow this convention. Existing examples in this repo: `landing-parity-worktree.md`, `launch-readiness-worktree.md`, `worktrees-feedback-ux.md`, `react-native-worktree.md`. Treat older examples as **legacy** — they predate this convention and may use patterns we now disallow (e.g. `landing-parity-worktree.md` uses `git add -A`, which the rules below replace with explicit paths). When touching a legacy file, opportunistically migrate it; do not copy its anti-patterns into new files.

**Filename:** `<topic>-worktree.md` at repo root. The topic matches the initiative (a phase, a feature, a launch milestone). Plural variant `worktrees-<topic>.md` is acceptable when there are many.

**Required structure (in order):**

1. **H1:** `# <repo-name> <topic> Worktrees`
2. **Opening paragraph:** count of issues / worktrees / tiers in the first sentence; one-sentence grouping rationale; one sentence on parallel-safety from T+0 (or where the gating is).
3. **Key references** (bullet list): `CLAUDE.md` (this repo), SDD section link, plan file path under `~/.claude/plans/`, every issue number with link, reference packages/files to mirror, cross-repo companion worktree.md files.
4. **Conventions** (bullet list): repeat the repo-specific rules that apply to every worktree in this initiative (bundle budget, redaction-mandatory, conventional commits, no Co-Authored-By, do-not-remove-worktrees). Don't paraphrase — restate so reviewers reading only this file get the rules.
5. **Grouping rationale:** prose paragraphs explaining why issues are bundled into the worktrees they are. Call out shared-file conflict surface (which files multiple worktrees touch) and how to resolve.
6. **Dependency map:** ASCII code block with `TIER N — <when>` headers and bulleted worktree entries. Show shared-file conflicts inline. End with the worktree path convention (`../<repo>-wt-<slug>`).
7. **Per-tier sections** as `## TIER N`, each containing one or more worktree subsections.
8. **Parallel execution cheat sheet** at the end: summarise what runs at T+0, what unblocks after each tier merges, cross-repo coordination notes.

**Per-worktree subsection format:**

- H3: `### Worktree <slug>: <title> (#<issue-numbers>)`
- 1–3 sentence description of what this PR does and why it's grouped this way.
- **Scope:** bullets or paragraph listing files/dirs touched. Be specific.
- **Out of scope:** optional bullets for explicit non-goals.
- **Depends on:** prior worktree slugs or "none".
- **Blocks:** downstream worktree slugs or "nothing".
- **Can run in parallel with:** sibling worktrees.
- A bash code block with this exact shape:

  ```bash
  cd ~/repos/brevwick/<repo>
  git fetch origin
  git worktree add ../<repo>-wt-<slug> -b <type>/<branch-name> origin/main
  cd ../<repo>-wt-<slug>

  claude --dangerously-skip-permissions "
  <Self-contained agent prompt with numbered STEP 1..N>
  "
  ```

**Per-worktree agent prompt (inside the `claude --dangerously-skip-permissions \"...\"` block):**

- STEP 1 — Read project context: `CLAUDE.md`, the issue body via `gh api repos/<owner>/<repo>/issues/<N> --jq '.body'`, plan file, every reference file/package.
- STEP 2..N-2 — Implementation steps: file paths, exact field names, snippet shapes, validation criteria. Reference Flutter/JS SDK precedent files by tilde-path when wire-format parity matters.
- STEP N-1 — Verify: full CI gauntlet from `.github/workflows/ci.yml` — `pnpm install --frozen-lockfile && pnpm format:check && pnpm lint && pnpm type-check && pnpm test:cover && pnpm build`. `pnpm lint` does not cover Prettier; `format:check` is mandatory. Add `pnpm size` if the change touches bundle-budgeted code.
- STEP N — Commit + PR: `git add` specific paths (no `-A`/`.`); `git commit -m '<conventional commit subject ≤72 chars>'`; `git push -u origin <branch>`; `gh pr create --title '...' --body "$(cat <<'PREOF'` … `PREOF\n)"`. PR body uses `Closes #<N>` per issue, has Summary / Out of scope / Test plan sections, no Co-Authored-By.

**Style notes:**

- Use tilde-prefixed paths (`~/repos/brevwick/...`, `~/.claude/plans/...`) for cross-repo references; tilde expands at shell time so the same docs work on any contributor's machine. Do **not** introduce new absolute paths like `/home/tatlacas/...` or `/Users/tatlacas/...`; legacy worktree files have them and should be migrated when touched.
- Prefer "Tier" terminology consistently — never "Phase" inside a worktree.md (that word belongs to ROADMAP.md).
- When bundling N issues into one worktree, explain the bundling rationale (shared files, review coherence) explicitly. When splitting issues across worktrees that could have been bundled, also explain why.
- Length: a one-issue worktree.md is ~150 lines. A 10-issue / 8-worktree initiative is ~700 lines. Don't aim for shorter — reviewers and future agents read this file end-to-end.

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
- Solid adapter `@tatlacas/brevwick-solid`: **< 5 kB gzip** (Solid runtime is small + the V1 FAB ships a strict subset of the React widget UI)

The console + network rings sit on the eager path on purpose: they have to be live before the first user error or fetch fires, otherwise the submitted issue is missing the very evidence the user opened the widget to report. Anything heavy that does NOT need to capture pre-submit (`modern-screenshot`, the submit pipeline, the project-config fetch) stays behind `await import('…')` so it doesn't ship until needed.

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
