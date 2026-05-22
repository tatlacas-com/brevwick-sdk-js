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
#   1. Snapshots dev's pre.json#changesets[] (the IDs already rolled into a
#      beta version bump). Pre mode tracks consumed changesets here rather
#      than deleting the .md files, so we need this list before the merge
#      clobbers pre.json.
#   2. Merges origin/main into the current branch (brings stable versions in).
#   3. Auto-resolves the predictable conflicts that always arise here:
#        - package.json / CHANGELOG.md / version.ts → take main's stable side
#        - conflicted .changeset/* files → drop (pre.json gets recreated below;
#          conflicted .md files were rolled into a prior stable on main)
#        - .changeset/<id>.md files for IDs in the snapshot → drop. These are
#          zombies pre mode left behind; if kept they'd be re-consumed by the
#          next `changeset version` run and double-bump packages.
#   4. Runs `pnpm changeset pre enter beta` so future merges produce -beta.N
#      versions.
#   5. Commits, pushes, opens a PR into dev.

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

consumed_ids=""
if [ -f .changeset/pre.json ]; then
  consumed_ids=$(node -e "const p=require('./.changeset/pre.json'); process.stdout.write((p.changesets||[]).join(' '))")
fi

echo "==> Merging origin/main into $current_branch"
merge_status=0
git merge --no-ff origin/main -m "chore(release): merge main into dev after stable release" || merge_status=$?

if [ "$merge_status" -ne 0 ]; then
  echo "==> Auto-resolving expected conflicts"

  unmerged=$(git diff --name-only --diff-filter=U)

  version_files=$(printf '%s\n' "$unmerged" | grep -E '^packages/[^/]+/(package\.json|CHANGELOG\.md|src/.*version\.ts)$' || true)
  if [ -n "$version_files" ]; then
    printf '%s\n' "$version_files" | xargs git checkout --theirs --
    printf '%s\n' "$version_files" | xargs git add --
  fi

  conflicted_changesets=$(printf '%s\n' "$unmerged" | grep '^\.changeset/' || true)
  if [ -n "$conflicted_changesets" ]; then
    printf '%s\n' "$conflicted_changesets" | xargs git rm -f --
  fi

  for id in $consumed_ids; do
    if [ -f ".changeset/${id}.md" ]; then
      git rm -f ".changeset/${id}.md"
    fi
  done

  remaining=$(git diff --name-only --diff-filter=U)
  if [ -n "$remaining" ]; then
    echo "Unexpected conflicts remain. Resolve manually then re-run the script." >&2
    printf '%s\n' "$remaining" >&2
    exit 1
  fi

  git commit --no-edit
fi

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
- Merges latest stable from `main` into `dev` (auto-resolving the expected version/changeset conflicts that arise because pre mode keeps consumed `.changeset/*.md` files on disk).
- Re-enters changesets pre mode with `beta` tag so subsequent merges produce `-beta.N` versions on the npm `beta` dist-tag.

## Test plan
- [ ] CI passes.
- [ ] `.changeset/pre.json` exists with `mode: pre`, `tag: beta`, empty `changesets`, and `initialVersions` matching the published versions on main.
- [ ] `.changeset/` contains only `README.md`, `config.json`, `pre.json`, plus any genuinely new pending changesets added on dev after the last beta version run.
PREOF
)"
