#!/usr/bin/env bash
# Custom status line: shows dir | branch | model and pins the PR for the branch.
# Reads the PR from the cache written by the SessionStart hook; refreshes at most
# once every 5 minutes so a status redraw never hammers the GitHub API.
set -uo pipefail

input=$(cat)
model=$(printf '%s' "$input" | jq -r '.model.display_name // empty' 2>/dev/null)
dir=$(printf '%s' "$input" | jq -r '.workspace.current_dir // .cwd // empty' 2>/dev/null)
[ -n "$dir" ] && cd "$dir" 2>/dev/null

branch=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || true)
base=$(basename "${dir:-$PWD}")

pr=""
gitdir=$(git rev-parse --absolute-git-dir 2>/dev/null || true)
if [ -n "$gitdir" ]; then
  cache="$gitdir/claude-pr.cache"
  if command -v gh >/dev/null 2>&1; then
    if [ ! -f "$cache" ] || [ -n "$(find "$cache" -mmin +5 2>/dev/null)" ]; then
      info=$(gh pr view --json number,state,url 2>/dev/null) || info=""
      if [ -n "$info" ]; then
        printf '%s' "$info" | jq -r '"\(.number)\t\(.state)\t\(.url)"' > "$cache" 2>/dev/null || true
      else
        : > "$cache" 2>/dev/null || true
      fi
    fi
  fi
  if [ -s "$cache" ]; then
    num=$(cut -f1 "$cache"); state=$(cut -f2 "$cache")
    pr="PR #${num} ${state}"
  fi
fi

out="${base}"
[ -n "$branch" ] && out="${out} | ${branch}"
[ -n "$model" ] && out="${out} | ${model}"
[ -n "$pr" ] && out="${out} | ${pr}"
printf '%s' "$out"
