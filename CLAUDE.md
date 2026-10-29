# Brevwick JS SDK

pnpm workspace publishing seven npm packages: `@tatlacas/brevwick-sdk` (framework-agnostic core) plus `-react`, `-react-native`, `-solid`, `-vue`, `-svelte`, `-angular` adapters. Contributor guide: `CONTRIBUTING.md`.

## Commands

- `pnpm install` · `pnpm build` · `pnpm lint` · `pnpm type-check` · `pnpm format:check` · `pnpm size`
- Per package: `pnpm --filter @tatlacas/brevwick-<pkg> {build,test,type-check}`; single file: `pnpm --filter <pkg> exec vitest run <path>`
- Adapters resolve the core via `dist/`: run `pnpm --filter @tatlacas/brevwick-sdk build` before adapter type-check/tests.

## Before opening a PR

Run only what the change touches: build, lint, type-check, and the unit tests covering it; `pnpm size` if bundled code changed. Don't run the full suite or Playwright e2e (`pnpm test:e2e`) locally — CI runs them on every push. When CI fails, fix the named test.

## Workflow

- PR-only; `dev` and `main` are protected. Day-to-day PRs target `dev` (default). `main` only takes `chore/promote-*` (via `scripts/promote-stable.sh`, merged as a merge commit) and `changeset-release/main`.
- Small, single-concern PRs, opened ready (not draft). Squash-merge.
- Worktrees outside the repo, branched from `origin/dev`: `git worktree add ../brevwick-sdk-js-issue-<N> -b feat/issue-<N>-desc origin/dev`. Never remove worktrees.
- Branches `feat/` `fix/` `chore/` `docs/`; conventional commits (`feat:` `fix:` `chore:` `docs:` `test:` `refactor:`, optional scope), subject ≤ 72 chars.
- Commits must be signed (CI rejects unverified). Stage explicit paths, never `git add -A`.
- No AI attribution (no `Co-Authored-By`, no mentions in commits/PRs/comments).
- Never `--no-verify`, `--amend`, `--force`, `--admin`, or bypass rules; never weaken a CI gate, budget, or coverage threshold to pass.

## Hard rules

- **Redaction:** every payload leaving the device goes through `redact()`. New context field → new redaction test.
- **Bundle budgets** (gzip, enforced by `.size-limit.js` + `chunk-split.test.ts`; keep in sync): core eager `index` + static chunks < 8 kB; widget open (with `modern-screenshot`) < 25 kB; react / react-native < 25 kB; solid / vue < 13 kB; svelte eager < 5 kB, `FeedbackButton.svelte` < 22 kB; angular FESM2022 < 31 kB.
- Console + network rings stay eager (must capture before the first error/fetch). Everything else heavy (screenshot, submit, config fetch) stays behind `await import()`.
- **Changesets:** any change under `packages/**` needs one (`pnpm changeset`). All seven packages version together (`fixed` group). `feat` → minor, `fix`/`refactor` → patch, breaking → major (call it out).
- Release channels: `dev` → npm `beta` (pre mode, `release-dev.yml`); `main` → `latest` (`release.yml`). The branch/dist-tag name mismatch is intentional.

## Engineering rules

- Push back on wrong or over-engineered suggestions; fix root causes, no "for now" workarounds. If the fix belongs in another repo, say so and stop.
- Fix every real review finding in the same PR — no follow-up issues.
- Unknown state is never treated as safe: fail closed.
- Unit tests are hermetic: no network, real credentials, or real services where a fake (msw, happy-dom) will do; no sleeps — use fake timers.
- Code documents itself; comment only the non-obvious why.
