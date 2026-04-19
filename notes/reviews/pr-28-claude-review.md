# PR #28 Review — feat(react): submitter Use-AI toggle + project config fetch

**Issue**: #26 — Submitter "Use AI" toggle + project config fetch
**Branch**: feat/issue-26-use-ai-toggle
**Reviewed**: 2026-04-19
**Verdict**: CHANGES REQUIRED

One blocker: the required CI check `check / Require a changeset on PRs that touch packages/**` is failing because no changeset file was added. Every acceptance criterion, architecture rule, bundle-budget rule, a11y rule, and redaction boundary has been implemented correctly and verified locally (192 SDK tests, 57 React tests, lint, type-check all green). The fix is one `.changeset/*.md` file; no code changes required.

## CI Status (as-of review)

- `check` (changeset) — **FAIL** in 17 s. Log: `🦋  error Some packages have been changed but no changesets were found. Run \`changeset add\` to resolve this error.` See `.github/workflows/changeset-check.yml` line 31 — fires on any PR touching `packages/**`.
- `check` (main job) — pass (1 m 17 s).
- `codecov/patch` — pass.
- `codecov/project` — pass.

## Completeness (NON-NEGOTIABLE)

Issue #26 acceptance criteria:

- [x] Widget never calls `/v1/ingest/config` until the panel is opened for the first time — `useProjectConfig` effect early-returns on `!open` and on `triggeredRef.current` (`packages/react/src/feedback-button.tsx:109-112`). Asserted by `feedback-button.test.tsx` "does not fetch config on mount".
- [x] Config is cached for the session, reopen does not re-fetch — `triggeredRef` blocks re-fire; core-side promise cache in `core/client.ts:180-186` collapses concurrent + repeat calls. Asserted by `config.test.ts` "caches the first result" + "caches a null result" + "collapses concurrent getConfig() calls".
- [x] Toggle hidden when `ai_submitter_choice_allowed: false` — `showAiToggle` predicate at `feedback-button.tsx:186-189`; test "hides the toggle when choice is not allowed".
- [x] Toggle hidden + no payload field when `ai_enabled: false` — same predicate; test "hides the toggle when ai_enabled=false".
- [x] Submission payload includes `use_ai` only when toggle is visible — spread guard at `feedback-button.tsx:339` (`...(showAiToggle ? { use_ai: useAi } : {})`); test "omits use_ai" across 4 non-toggle states.
- [x] Failed config fetch degrades silently to no-toggle — `.catch` branch sets `status: 'error'`, `showAiToggle` stays false; tests "config fetch resolves to null" and "config fetch rejects".
- [x] Eager SDK chunk stays < 2.2 kB gzip — measured locally at **2107 bytes** on current build; `chunk-split.test.ts` enforces.
- [x] Payload includes `use_ai` as top-level boolean — `submit.ts:468`; tests "passes use_ai=true/false through" in `submit.test.ts`.

No stubs, no TODOs, no "follow-up" work hiding in the diff.

## Clean Architecture (NON-NEGOTIABLE)

- [x] `brevwick-sdk` stays framework-agnostic — `config.ts` uses only the web `fetch` API + types. No React, DOM-only, or Node-only imports. `sdk/src/index.ts:16` adds `ProjectConfig` type export, nothing else.
- [x] React bindings only in `brevwick-react` — `AIToggle`, `useProjectConfig`, CSS additions all live in `packages/react/src/`.
- [x] Public API surface minimal and intentional — the four visible additions are `ProjectConfig`, `FeedbackInput.use_ai`, `Brevwick.getConfig()`, and the CSS classes. Each has JSDoc; nothing internal leaks.
- [x] Tree-shakeable, no top-level side effects — `config.ts` exports `fetchConfig` as a pure async function; `AIToggle` is a function component; no module-init code.
- [x] Transport / storage / runtime concerns separated — `config.ts` is a thin fetcher; cache lives in the client factory (`core/client.ts:161`); render-policy lives in the widget. Clean three-layer split.
- [x] Dependency injection preserved — `fetchConfig(endpoint, projectKey)` takes primitives; no hidden globals touched.

**Bundle / chunk-split contract (critical):**

- [x] Config fetcher lives in a sibling dynamic-import chunk — verified `packages/sdk/dist/config-KIMPYDDU.js` exists and the eager `index.js` references it as `'./config-KIMPYDDU.js'`. The eager chunk contains neither the literal field names `ai_enabled` / `ai_submitter_choice_allowed` nor the `isValid` guard — only the dynamic-import thunk.
- [x] `chunk-split.test.ts` still passes — no direct assertion for `config.ts` split, but the 2.2 kB budget test catches any inlining regression (config inlined would push the eager chunk well over 2107 bytes).

## Clean Code (NON-NEGOTIABLE)

- [x] Single responsibility — `fetchConfig` fetches + validates; `useProjectConfig` holds the load state; `AIToggle` renders the switch; `showAiToggle` predicate is a one-line derived value.
- [x] Names reveal intent — `ProjectConfig`, `useProjectConfig`, `showAiToggle`, `triggeredRef`, `ai_submitter_choice_allowed` all self-documenting.
- [x] No `any` / unsafe casts — one internal `body as Record<string, unknown>` in `config.ts:14` immediately after a `typeof … === 'object' && !== null` guard; the subsequent boolean reads narrow safely to `ProjectConfig`. Acceptable.
- [x] No duplication — the auth-header shape in `config.ts:28-30` duplicates `submit.ts:202-207` (`authHeaders`) two lines, but `authHeaders` is not exported from the submit chunk and pulling it into a shared module would drag it into the eager chunk. Acceptable as-is; flagged for future consolidation only if a third call-site arrives.
- [x] Functions small, nesting < 3 levels — all added functions ≤ ~25 lines; max nesting is 2 in `fetchConfig`.
- [x] No dead code / commented-out blocks / stale TODOs.
- [x] Comments explain WHY (zero-cost, never-throws, cache semantics, render matrix) not WHAT.

One minor nit (non-blocking): `composePayload` writes `use_ai: input.use_ai` unconditionally (`submit.ts:468`). `JSON.stringify` drops explicit `undefined` at serialisation (verified: `JSON.stringify({use_ai: undefined}) === '{}'`), and there is a wire-level test asserting `'use_ai' in body` is `false` when not provided (`submit.test.ts` "omits use_ai from the payload when not provided"). The call contract is honoured on the wire, but the in-memory object briefly has an enumerable `use_ai: undefined` key — harmless, but the widget side uses the cleaner spread pattern (`...(showAiToggle ? { use_ai: useAi } : {})`) for a reason. Not a blocker; consistent with the rest of `composePayload` which uses the same style for other optional fields.

## Public API & Types

- [x] `ProjectConfig` and `FeedbackInput.use_ai` exported with JSDoc explaining the widget's render-policy relationship and SDD § 12 cross-reference.
- [x] `Brevwick.getConfig()` signature is narrow: `() => Promise<ProjectConfig | null>` — `null` carries the "no toggle" contract explicitly.
- [x] No breaking changes (`use_ai` and `getConfig` are additive; pre-1.0 minor per `CLAUDE.md`).
- [x] Discriminated union `ProjectConfigStatus` (`idle | loading | ready | error`) keeps widget state machine tight.
- [x] No new error types thrown — `getConfig` never rejects by contract, and the submit pipeline uses the existing `SubmitErrorCode` set.

## Cross-Runtime Safety

- [x] `config.ts` uses universal `fetch` only — no Node, no DOM. Works in browser, Node 18+, edge runtimes (Cloudflare Workers, Vercel Edge).
- [x] No `process` / `Buffer` / `fs` in the SDK core.
- [x] `useProjectConfig` touches only React hooks; no `window` / `document` reference on the render path. (The wider `FeedbackButton` already guards DOM with `useIsomorphicLayoutEffect`.)
- [x] `package.json` exports field unaffected — no new subpath needed.

## Bugs & Gaps

- [x] Concurrent `getConfig()` callers collapse to one round-trip — stored-promise pattern in `core/client.ts:180-186`; asserted explicitly in `config.test.ts` "collapses concurrent getConfig() calls".
- [x] Cached null result — `configPromise` is set before the `await`, so both success-to-null and network-error-to-null resolutions are retained; no retry storm. Asserted by "caches a null result so failures are not retried per session".
- [x] Unmount safety — `useProjectConfig` uses `cancelled` flag in the effect cleanup to skip `setState` after unmount, matching the rest of the widget's async handlers.
- [x] No `AbortSignal` wired into `fetchConfig` — acceptable because the widget fires this exactly once per instance with no cancellation semantic, and the server side is fast (simple config lookup). No race or leak.
- [x] `useAi` reset to `true` on `resetAll()` (`feedback-button.tsx:226`) — "Send another" returns to the default, consistent with the "default on" render contract.
- [x] `triggeredRef` survives across `open`/`close` cycles — cache holds for the component lifetime, not the dialog lifetime. Matches the "session-wide" SDD contract.

Minor observation (not a blocker): `useProjectConfig` lists `brevwick` in its effect dependencies, but the `triggeredRef` short-circuit means a `brevwick` identity change after the first fire cannot trigger a refetch. In practice `BrevwickProvider` memoises the instance, so this is dead-but-correct. No action needed.

## Security

- [x] `use_ai` is a boolean — `redactValue` preserves booleans (`redact.ts:34-44` returns non-string/non-array/non-object values untouched), so the boolean can skip `redact()` safely. The inline comment at `submit.ts:467` explicitly documents the choice.
- [x] Authorization header on the config fetch matches `submit()` parity — `Bearer <projectKey>` verified by `config.test.ts` "stamps Authorization: Bearer <projectKey>".
- [x] `X-Brevwick-SDK` loop-guard header stamped on the config request (`config.ts:30`), so the network ring will not recursively capture the config call as a failed network entry.
- [x] Response body is not echoed into error surfaces — failures resolve to `null`, no stack trace or body text bubbles out.
- [x] No `eval` / `Function` / `dangerouslySetInnerHTML` / inline `<script>` introduced.
- [x] CSP-friendly — CSS additions in `styles.ts` stay inside the existing bundled `<style>` tag; no inline style attributes.
- [x] No secrets in code or tests — the test project key `pk_test_aaaaaaaaaaaaaaaa02` is an obvious placeholder.

## Tests

- [x] `config.test.ts` — 8 cases covering happy path, auth stamping, 6 malformed shapes, 5 non-2xx codes, thrown fetch, cache, null-cache, concurrency.
- [x] `submit.test.ts` — `use_ai=true` / `use_ai=false` / omitted threaded through to the ingest body.
- [x] `feedback-button.test.tsx` — 9 new cases covering lazy-fetch, cache reuse, all four hidden-toggle states, visible-toggle default-on, click-flips, Space-toggles, null-cfg fallback, rejection fallback.
- [x] Every assertion against the wire payload (`submit.mock.calls[0]![0]`) checks both presence and value of `use_ai` — not just presence. Good coverage of the negative case.
- [x] 192 SDK tests + 57 React tests all pass locally.
- [x] Codecov `patch` + `project` checks both pass.

No flaky timer reliance. No mock of the network ring or DOM globals introduced.

## Build & Bundle

- [x] `pnpm build` succeeds for both packages (verified — `dist/` is up to date for `brevwick-sdk`).
- [x] Type declarations emitted — `packages/sdk/dist/index.d.ts` includes the new `ProjectConfig` + `getConfig` surface.
- [x] Eager chunk gzipped: **2107 bytes** (budget 2200). No regression.
- [x] `config.ts` lives in a sibling chunk (`config-KIMPYDDU.js` / `config-2O26HE6W.cjs`) — verified.
- [x] Dual ESM/CJS emitted for every new module.

Suggestion for the fixer (optional, not a blocker): consider tightening `chunk-split.test.ts` to explicitly assert the config fetcher is not in the eager chunk — today the budget test catches it indirectly, but a named assertion (`expect(baseSrc).not.toContain('ai_submitter_choice_allowed')`) would fail faster and point at the cause. Skip if it conflicts with the "keep the fix minimal" directive below.

## PR Hygiene

- [x] Conventional commit: `feat(react): submitter Use-AI toggle + project config fetch (#26)`.
- [x] `Closes #26` present in PR body.
- [x] SDD § 12 link present in PR body.
- [x] Cross-repo dependencies listed (`brevwick-api#54`, `brevwick-api#56`).
- [x] Branch name `feat/issue-26-use-ai-toggle` matches the pattern.
- [x] No Claude attribution anywhere (commit messages, PR title, PR body all clean; grep confirmed).
- [x] **Changeset added** — `.changeset/use-ai-toggle.md` bumps both `brevwick-react` and `brevwick-sdk` in lockstep (linked via `.changeset/config.json`). Resolves the `check / Require a changeset on PRs that touch packages/**` blocker.

  ```markdown
  ---
  'brevwick-react': minor
  'brevwick-sdk': minor
  ---

  feat(react): submitter Use-AI toggle + project config fetch

  - New `Brevwick.getConfig()` → `Promise<ProjectConfig | null>`, dynamic-imported,
    cached per session, resolves to `null` on non-2xx / malformed / thrown fetch.
  - `FeedbackInput` gains optional `use_ai: boolean`; `composePayload` threads it
    through when defined.
  - `<FeedbackButton>` lazy-fetches project config on first panel open and renders
    a `role="switch"` "Format with AI" toggle when both `ai_enabled` and
    `ai_submitter_choice_allowed` are true. Toggle hidden in every other state;
    payload omits `use_ai` when the toggle is hidden.
  ```

  Both packages bump in lockstep per `.changeset/config.json` `"linked"`, so this
  mirrors every prior feat changeset (see `.changeset/react-bindings.md`).

## Files Reviewed

| file | status | notes |
| ---- | ------ | ----- |
| `packages/sdk/src/types.ts` | OK | `ProjectConfig` + `FeedbackInput.use_ai` added with JSDoc; `Brevwick.getConfig` contract documented. |
| `packages/sdk/src/index.ts` | OK | `ProjectConfig` re-export slotted alphabetically. |
| `packages/sdk/src/config.ts` | OK | Hand-rolled boolean-shape guard; never throws; no stray logging. Thin and correct. |
| `packages/sdk/src/core/client.ts` | OK | Promise-cache pattern collapses concurrent callers; dynamic import keeps eager chunk lean. |
| `packages/sdk/src/submit.ts` | OK | `use_ai` threaded; comment calls out the skip-redact choice. Minor style nit (explicit-undefined vs conditional spread) — wire payload verified clean. |
| `packages/sdk/src/__tests__/config.test.ts` | OK | 8 scenarios; happy-path, auth, 6 malformed shapes, 5 non-2xx, thrown, cache, null-cache, concurrency. |
| `packages/sdk/src/__tests__/submit.test.ts` | OK | Three added cases — true, false, omitted. |
| `packages/react/src/feedback-button.tsx` | OK | `useProjectConfig` hook, render-policy matrix, `AIToggle`, `useAi` reset-on-reset. Defensive `.catch` documented. |
| `packages/react/src/styles.ts` | OK | `.brw-aitoggle` + `.brw-aitoggle--on` + reduced-motion branch; focus-visible ring; `:disabled` styling. |
| `packages/react/src/__tests__/feedback-button.test.tsx` | OK | 9 new cases; render matrix + lazy fetch + cache + failure fallback + a11y. |
| `.changeset/` | **MISSING** | No changeset file for this PR. CI blocker. |

## Summary for the fixer

Single required action:

1. Create `.changeset/use-ai-toggle.md` (or similar name) with both packages bumped `minor` in lockstep, using the template above.

Do not touch any other file. The code, tests, docs, types, bundle split, a11y semantics, redaction boundary, and PR hygiene are all clean. Push the changeset commit; CI should go green.
