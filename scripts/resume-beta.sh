#!/usr/bin/env bash
# After a stable release lands on main, put beta back into pre mode.
#
# Run from a clean working tree on a fresh branch off origin/beta:
#   git fetch origin
#   git checkout -b chore/resume-beta-<version> origin/beta
#   ./scripts/resume-beta.sh
#
# What it does:
#   1. Merges origin/main into the current branch (brings stable versions in).
#   2. Runs `pnpm changeset pre enter beta` so future merges produce -beta.N versions.
#   3. Commits, pushes, opens a PR into beta.

set -euo pipefail

if [ -n "$(git status --porcelain)" ]; then
  echo "Working tree is not clean. Commit or stash first." >&2
  exit 1
fi

current_branch=$(git rev-parse --abbrev-ref HEAD)
if [ "$current_branch" = "main" ] || [ "$current_branch" = "beta" ]; then
  echo "Refusing to run on '$current_branch'. Create a chore/resume-beta-* branch first." >&2
  exit 1
fi

git fetch origin

echo "==> Merging origin/main into $current_branch"
git merge --no-ff origin/main -m "chore(release): merge main into beta after stable release"

echo "==> Re-entering changesets pre mode (beta)"
pnpm changeset pre enter beta

git add .changeset/
git commit -m "chore(release): re-enter pre mode (beta)"

echo "==> Pushing branch"
git push -u origin "$current_branch"

echo "==> Opening PR"
gh pr create \
  --base beta \
  --title "chore(release): resume beta channel" \
  --body "$(cat <<'PREOF'
## Summary
- Merges latest stable from `main` into `beta`.
- Re-enters changesets pre mode (`beta` tag) so subsequent merges produce `-beta.N` versions.

## Test plan
- [ ] CI passes.
- [ ] `.changeset/pre.json` exists with `mode: pre`, `tag: beta`.
PREOF
)"
