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
#   2. Runs `pnpm changeset pre exit` so the next version run produces stable bumps.
#   3. Commits the result.
#   4. Pushes and opens a PR titled "chore(release): promote dev -> main".
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
git merge --no-ff origin/dev -m "chore(release): merge dev into main for promotion"

echo "==> Exiting changesets pre mode"
pnpm changeset pre exit

git add .changeset/
git commit -m "chore(release): exit pre mode for stable promotion"

echo "==> Pushing branch"
git push -u origin "$current_branch"

echo "==> Opening PR"
gh pr create \
  --base main \
  --title "chore(release): promote dev -> main" \
  --body "$(cat <<'PREOF'
## Summary
- Merges current `dev` into `main`.
- Exits changesets pre mode so the next version run on `main` produces stable bumps.

## Next steps
- Merge this PR.
- `release.yml` on `main` will open a "Version Packages" PR with stable bumps.
- Merging that PR publishes to the npm `latest` dist-tag.
- After stable ships, run `scripts/resume-dev.sh` to put `dev` back into pre mode.

## Test plan
- [ ] CI passes on this PR.
- [ ] After merge, the auto-opened "Version Packages" PR shows non-`-beta` versions.
PREOF
)"
