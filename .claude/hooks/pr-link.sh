#!/usr/bin/env bash
# SessionStart / CwdChanged hook: surface the GitHub PR for the current branch.
# Emits hook JSON with a user-visible `systemMessage` (clickable PR URL) and
# `additionalContext` for Claude, and caches the PR for the statusline. No-ops
# silently when gh/jq are missing, the dir is not a git repo, or the branch has
# no PR. Always exits 0 so the JSON output is honored.
set -uo pipefail

# Hooks pass JSON on stdin; read it only when stdin is piped (not a TTY) so a
# bare manual run never hangs. Use it to label the event correctly.
event="SessionStart"
if [ ! -t 0 ]; then
  input=$(cat)
  ev=$(printf '%s' "$input" | jq -r '.hook_event_name // empty' 2>/dev/null)
  [ -n "$ev" ] && event="$ev"
fi

command -v gh >/dev/null 2>&1 || exit 0
command -v jq >/dev/null 2>&1 || exit 0
gitdir=$(git rev-parse --absolute-git-dir 2>/dev/null) || exit 0
cache="$gitdir/claude-pr.cache"

info=$(gh pr view --json number,state,url,title 2>/dev/null) || info=""
if [ -z "$info" ]; then
  : > "$cache" 2>/dev/null || true
  exit 0
fi

# Cache a statusline-friendly line: NUMBER<TAB>STATE<TAB>URL
printf '%s' "$info" | jq -r '"\(.number)\t\(.state)\t\(.url)"' > "$cache" 2>/dev/null || true

# Emit hook JSON: systemMessage (user-visible) + additionalContext (for Claude).
printf '%s' "$info" | jq -c --arg event "$event" '{
  systemMessage: ("PR #\(.number) [\(.state)]  \(.title)\n  \(.url)"),
  hookSpecificOutput: {
    hookEventName: $event,
    additionalContext: ("The current git branch has an associated GitHub PR: #\(.number) (\(.state)) \(.url) Title: \(.title). When the user refers to \"the PR\" in this worktree, this is it.")
  }
}'
