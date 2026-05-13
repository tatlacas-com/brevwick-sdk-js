#!/usr/bin/env bash
# After a stable release lands on main, put dev back into pre mode.
#
# The npm prerelease dist-tag is `beta` (intentionally diverges from the
# branch name) — branch is for contributors, dist-tag is for installers.
# See CLAUDE.md "Release Channels".
#
# Run from a clean working tree on a fresh branch off origin/dev:
#   git fetch origin
#   git checkout -b chore/resume-dev-<version> origin/dev
#   ./scripts/resume-dev.sh
#
# What it does:
#   1. Merges origin/main into the current branch (brings stable versions in).
#   2. Runs `pnpm changeset pre enter beta` so future merges produce -beta.N versions.
#   3. Commits, pushes, opens a PR into dev.

set -euo pipefail

if [ -n "$(git status --porcelain)" ]; then
  echo "Working tree is not clean. Commit or stash first." >&2
  exit 1
fi

current_branch=$(git rev-parse --abbrev-ref HEAD)
if [ "$current_branch" = "main" ] || [ "$current_branch" = "dev" ]; then
  echo "Refusing to run on '$current_branch'. Create a chore/resume-dev-* branch first." >&2
  exit 1
fi

git fetch origin

echo "==> Merging origin/main into $current_branch"
git merge --no-ff origin/main -m "chore(release): merge main into dev after stable release"

echo "==> Re-entering changesets pre mode (beta dist-tag)"
pnpm changeset pre enter beta

git add .changeset/
git commit -m "chore(release): re-enter pre mode (beta dist-tag)"

echo "==> Pushing branch"
git push -u origin "$current_branch"

echo "==> Opening PR"
gh pr create \
  --base dev \
  --title "chore(release): resume dev channel" \
  --body "$(cat <<'PREOF'
## Summary
- Merges latest stable from `main` into `dev`.
- Re-enters changesets pre mode with `beta` tag so subsequent merges produce `-beta.N` versions on the npm `beta` dist-tag.

## Test plan
- [ ] CI passes.
- [ ] `.changeset/pre.json` exists with `mode: pre`, `tag: beta`.
PREOF
)"
