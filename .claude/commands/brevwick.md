---
description: brevwick-sdk-js — fetch, assess, and implement a tracker issue end-to-end (pnpm workspace) with full CI gauntlet (+pnpm size for bundle-budgeted code), worktree, and auto-PR.
argument-hint: '<issue-url — GitHub, Jira, or Linear>'
allowed-tools: Read, Write, Edit, Grep, Glob, Bash(git:*), Bash(gh:*), Bash(curl:*), Bash(jq:*), Bash(make:*), Bash(pnpm:*), Bash(npm:*), Bash(flutter:*), Bash(dart:*), Bash(go:*), Bash(test:*), Bash(grep:*), Bash(cat:*), Task, WebFetch, WebSearch
---

You are landing a single issue end-to-end. Parse `$ARGUMENTS` as an issue URL. If empty, ask the user for one and stop.

**Hard rules — do not violate, ever:**

- No `Co-Authored-By` trailer in commits. No Claude attribution anywhere.
- Never `git add -A` or `git add .` — stage specific paths only.
- Never remove a worktree. The user manages worktree lifecycle.
- Never skip hooks (`--no-verify`, `--no-gpg-sign`). Fix the root cause.
- The full CI gauntlet (per repo's `CLAUDE.md`) must pass locally before push. No partial pushes.
- Conventional-commit subject ≤ 72 characters.

---

## STEP 1 — Parse the URL

Detect the tracker from `$ARGUMENTS`:

| URL contains                                      | Tracker     | Extract                      |
| ------------------------------------------------- | ----------- | ---------------------------- |
| `github.com/<owner>/<repo>/issues/<N>`            | **github**  | `OWNER`, `REPO`, `N`         |
| `*.atlassian.net/browse/<KEY>-<N>` or `/jira/...` | **jira**    | `JIRA_KEY` (e.g. `ABC-123`)  |
| `linear.app/<workspace>/issue/<KEY>-<N>`          | **linear**  | `LINEAR_ID` (e.g. `ENG-456`) |
| anything else                                     | **generic** | full URL                     |

If the URL matches none of the above, abort and print: `Unsupported tracker. I support GitHub Issues, Jira, and Linear URLs.` Stop.

## STEP 2 — Fetch the issue

Run **only** the adapter for the detected tracker (skip the others). Capture: `TITLE`, `BODY`, `LABELS`, `STATE`, `COMMENTS`, linked PRs.

### Adapter: github

```bash
gh api "repos/${OWNER}/${REPO}/issues/${N}" --jq '{title, body, state, labels:[.labels[].name], assignees:[.assignees[].login]}'
gh api "repos/${OWNER}/${REPO}/issues/${N}/comments" --jq '[.[] | {user:.user.login, body}]'
```

If `gh auth status` is not green, abort with: `gh CLI not authenticated. Run "gh auth login".`

If an MCP server `mcp__github__*` is available in this session, prefer those tools — they return richer structured data. Fall back to `gh` otherwise.

### Adapter: jira

Prefer `mcp__atlassian__*` if available. Else:

```bash
: "${JIRA_BASE_URL:?set JIRA_BASE_URL (e.g. https://yourco.atlassian.net)}"
: "${JIRA_EMAIL:?set JIRA_EMAIL}"
: "${JIRA_API_TOKEN:?set JIRA_API_TOKEN — https://id.atlassian.com/manage-profile/security/api-tokens}"
curl -fsSL -u "${JIRA_EMAIL}:${JIRA_API_TOKEN}" \
  "${JIRA_BASE_URL}/rest/api/3/issue/${JIRA_KEY}?expand=renderedFields" \
  | jq '{title:.fields.summary, body:.fields.description, status:.fields.status.name, labels:.fields.labels, assignee:.fields.assignee.displayName}'
curl -fsSL -u "${JIRA_EMAIL}:${JIRA_API_TOKEN}" \
  "${JIRA_BASE_URL}/rest/api/3/issue/${JIRA_KEY}/comment" | jq '[.comments[] | {author:.author.displayName, body}]'
```

If env vars are unset and no Atlassian MCP is configured, abort with the exact missing-var message — do not create a worktree.

### Adapter: linear

Prefer `mcp__linear__*` if available. Else:

```bash
: "${LINEAR_API_KEY:?set LINEAR_API_KEY — https://linear.app/settings/api}"
curl -fsSL -X POST https://api.linear.app/graphql \
  -H "Authorization: ${LINEAR_API_KEY}" \
  -H "Content-Type: application/json" \
  --data "$(jq -nc --arg id "$LINEAR_ID" '{query:"query($id:String!){issue(id:$id){identifier title description state{name} labels{nodes{name}} assignee{name} comments{nodes{user{name} body}}}}", variables:{id:$id}}')"
```

### Adapter: generic

`WebFetch` the URL and extract title/body/state from the rendered page. Warn the user that structured fields (labels, comments) may be missing.

After fetch, if `STATE` is closed/done/cancelled/won't-fix → abort: `Issue is <state>. Refusing to implement a closed issue. Reopen it first if intentional.`

## STEP 3 — Assess (no edits yet)

Read the current repo's `CLAUDE.md` (`git rev-parse --show-toplevel` → `CLAUDE.md`). Read any `*-worktree.md` files at the repo root for active-initiative context.

Apply this decision matrix to the fetched issue:

| Condition                                                                                                                                                                                                   | Action                                                                                                                                |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Issue body or comments name a **different** repo as the implementation site                                                                                                                                 | Abort: `This issue belongs in <repo>, not here.` Stop.                                                                                |
| Issue is a question, support thread, or RFC discussion (no concrete change requested)                                                                                                                       | Abort: `This is a discussion, not an implementable change.` Stop.                                                                     |
| Issue body has < ~3 sentences AND no acceptance criteria, OR comments contradict the body, OR scope is undefined ("make it faster" with no metric), OR it references files/symbols not present in this repo | **Use AskUserQuestion** with 1–3 concrete scoping options. Append answers to `notes/issue-<N>-context.md`. Resume only after answers. |
| Issue is real, scoped, clear                                                                                                                                                                                | Proceed silently.                                                                                                                     |

Before any edit, print one paragraph: `Issue <id>: <title>. Plan: <2-3 sentences naming the files I will touch and the test approach>. Proceeding.`

## STEP 4 — Worktree + branch

Determine the branch prefix from issue labels and `CLAUDE.md` conventional-commit rules:

- Labels containing `bug` or `fix` → `fix/`
- Labels containing `chore` → `chore/`
- Labels containing `docs` → `docs/`
- Default → `feat/`

Compute `SLUG` = first 5 words of the title, lowercased, kebab-cased, alphanumerics + hyphens only.

Compute `ID`:

- github → `${N}` (numeric)
- jira → `${JIRA_KEY}` lowercased (e.g. `abc-123`)
- linear → `${LINEAR_ID}` lowercased

```bash
ROOT=$(git rev-parse --show-toplevel)
REPO_BASENAME=$(basename "$ROOT")
cd "$ROOT"
git fetch origin
git worktree add "../${REPO_BASENAME}-issue-${ID}" -b "${PREFIX}/issue-${ID}-${SLUG}" origin/main
cd "../${REPO_BASENAME}-issue-${ID}"
```

If the worktree path already exists, abort: `Worktree ../<…> already exists — resume in that directory or remove it first.`

## STEP 5 — Implement

Re-read `CLAUDE.md` in the worktree. Apply every rule it states (layer rules, sentinels, redaction, wire-contract mirrors, never-log lists, dependency allow-lists). These are non-negotiable.

Make the change. Add tests for every `if`/`switch`/`catch`/`for` branch you introduce. Update changelogs/SDD links if the issue or `CLAUDE.md` requires it.

Save any clarifications received in step 3 to `notes/issue-${ID}-context.md` so a re-run picks up the same context.

## STEP 6 — CI gauntlet

Read the CI command from this repo's `CLAUDE.md`. Brevwick repos:

| Repo                   | Command                                                                                                                |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `brevwick-api`         | `make lint && make test`                                                                                               |
| `brevwick-web`         | `pnpm install --frozen-lockfile && pnpm format:check && pnpm lint && pnpm type-check && pnpm test:cover && pnpm build` |
| `brevwick-sdk-js`      | same as `-web` (add `pnpm size` if change touches bundle-budgeted code per CLAUDE.md § bundle budgets)                 |
| `brevwick-sdk-flutter` | `flutter pub get && dart format --set-exit-if-changed . && dart analyze && flutter test --coverage`                    |
| `brevwick-ops`         | `/voice-check` on changed markdown                                                                                     |

For an unknown repo (customer install): `grep -E "CI gauntlet\|ci\.yml" CLAUDE.md`. If nothing usable, ask the user once via `AskUserQuestion`: which command mirrors `.github/workflows/ci.yml`? Save the answer to `notes/issue-${ID}-context.md` for future runs.

On any failure, fix the root cause and re-run the **full** chain. Never push partial-green.

## STEP 7 — Commit

```bash
git add <specific files>     # never -A or .
git commit -m "<prefix>: <imperative subject ≤ 72 chars>"
```

NO `Co-Authored-By`. NO Claude attribution. If a pre-commit hook fails, fix the underlying issue, re-stage, and create a NEW commit (never `--amend`).

## STEP 8 — Push + PR

```bash
git push -u origin "${PREFIX}/issue-${ID}-${SLUG}"
```

Open the PR. The body shape depends on tracker:

**GitHub** (auto-close keyword fires):

```
gh pr create --title "<commit subject>" --body "$(cat <<'PREOF'
Closes #<N>

## Summary
- <bullet 1>
- <bullet 2>

## Test plan
- [ ] <bullet 1>
- [ ] <bullet 2>
PREOF
)"
```

**Jira** (use Smart Commits keywords; branch name auto-links via Jira–GitHub integration):

```
gh pr create --title "[<JIRA_KEY>] <commit subject>" --body "$(cat <<'PREOF'
Refs <JIRA_KEY> — <JIRA_BASE_URL>/browse/<JIRA_KEY>

## Summary
- <bullet 1>

## Test plan
- [ ] <bullet 1>
PREOF
)"
```

**Linear** (magic words `Closes <ID>` auto-close when PR merges):

```
gh pr create --title "<commit subject>" --body "$(cat <<'PREOF'
Closes <LINEAR_ID>

## Summary
- <bullet 1>

## Test plan
- [ ] <bullet 1>
PREOF
)"
```

Print the PR URL. Suggest (do **not** auto-run): `Run /pr-review <PR-url> when ready for review.`

## STEP 9 — Done

Do not remove the worktree. Do not switch back to the main checkout. Stop here.

---

## Ambiguity policy (governs step 3)

Ask the user via `AskUserQuestion` **only** in step 3, **only** with concrete options (no free-form questions), and **only** if one of these holds:

- Body has < 3 sentences and no acceptance criteria.
- Body and comments contradict each other.
- Scope is undefined ("improve performance" with no metric).
- The issue references files/symbols absent from this repo.

In every other case proceed silently. Do not narrate deliberation. Do not ask the user "shall I proceed?" — proceed.
