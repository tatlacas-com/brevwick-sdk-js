#!/usr/bin/env bash
# Open a promotion PR from dev -> main.
#
# Run from a clean working tree on a fresh branch off origin/main:
#   git fetch origin
#   git checkout -b chore/promote-<version> origin/main
#   ./scripts/promote-stable.sh
#
# What it does:
#   1. Merges origin/dev into the current branch.
#   2. Auto-resolves the predictable conflicts that always arise here:
#        - package.json / CHANGELOG.md / version.ts → take main's stable side
#          (the next `changeset version` run on main will compute the new
#          stable bump from main's current versions + pending changesets)
#        - conflicted .changeset/* files → drop (these were rolled into a
#          prior stable on main; keeping them would double-bump)
#   3. Runs `pnpm changeset pre exit` if dev's pre.json got merged in, so the
#      next version run produces stable bumps.
#   4. Commits the result.
#   5. Pushes and opens a PR titled "chore(release): promote dev -> main".
#
# After the PR merges, release.yml on main will open a stable "Version Packages"
# PR. Merging that publishes to the npm `latest` dist-tag.
#
# Once stable has shipped, run scripts/resume-dev.sh to put dev back into pre mode.
# Note: the npm prerelease dist-tag is `beta` (intentionally diverges from the
# branch name) — see CLAUDE.md "Release Channels".

set -euo pipefail

if [ -n "$(git status --porcelain)" ]; then
  echo "Working tree is not clean. Commit or stash first." >&2
  exit 1
fi

current_branch=$(git rev-parse --abbrev-ref HEAD)
if [ "$current_branch" = "main" ] || [ "$current_branch" = "dev" ]; then
  echo "Refusing to run on '$current_branch'. Create a chore/promote-* branch first." >&2
  exit 1
fi

git fetch origin

echo "==> Merging origin/dev into $current_branch"
merge_status=0
git merge --no-ff origin/dev -m "chore(release): merge dev into main for promotion" || merge_status=$?

if [ "$merge_status" -ne 0 ]; then
  echo "==> Auto-resolving expected conflicts"

  unmerged=$(git diff --name-only --diff-filter=U)

  version_files=$(printf '%s\n' "$unmerged" | grep -E '^packages/[^/]+/(package\.json|CHANGELOG\.md|src/.*version\.ts)$' || true)
  if [ -n "$version_files" ]; then
    printf '%s\n' "$version_files" | xargs git checkout --ours --
    printf '%s\n' "$version_files" | xargs git add --
  fi

  # Only drop pre.json (handled by pre exit below) and per-changeset .md
  # files. Never touch .changeset/README.md or .changeset/config.json — if
  # those conflict it is a real config divergence the human needs to look
  # at, and the unexpected-conflicts guard below will surface it.
  conflicted_changesets=$(printf '%s\n' "$unmerged" \
    | grep -E '^\.changeset/(pre\.json|[^/]+\.md)$' \
    | grep -v '^\.changeset/README\.md$' \
    || true)
  if [ -n "$conflicted_changesets" ]; then
    printf '%s\n' "$conflicted_changesets" | xargs git rm -f --
  fi

  remaining=$(git diff --name-only --diff-filter=U)
  if [ -n "$remaining" ]; then
    echo "Unexpected conflicts remain. Resolve manually then re-run the script." >&2
    printf '%s\n' "$remaining" >&2
    exit 1
  fi

  git commit --no-edit
fi

if [ -f .changeset/pre.json ]; then
  echo "==> Exiting changesets pre mode"
  pnpm changeset pre exit
  git add .changeset/
  git commit -m "chore(release): exit pre mode for stable promotion"
else
  echo "==> Not in pre mode on this branch; skipping pre exit"
fi

echo "==> Pushing branch"
git push -u origin "$current_branch"

echo "==> Opening PR"
gh pr create \
  --base main \
  --title "chore(release): promote dev -> main" \
  --body "$(cat <<'PREOF'
## Summary
- Merges current `dev` into `main` (auto-resolving the expected version/changeset conflicts).
- Exits changesets pre mode so the next version run on `main` produces stable bumps.

## Next steps
- Merge this PR.
- `release.yml` on `main` will open a "Version Packages" PR with stable bumps.
- Merging that PR publishes to the npm `latest` dist-tag.
- After stable ships, **wait for the auto-opened Version Packages PR on `main` to merge** before running `scripts/resume-dev.sh`. Otherwise the resume will be based on a stale main and dev accumulates zombie changesets.

## Test plan
- [ ] CI passes on this PR.
- [ ] After merge, the auto-opened "Version Packages" PR shows non-`-beta` versions.
PREOF
)"
