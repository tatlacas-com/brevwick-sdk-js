# brevwick-sdk-js landing-parity Worktrees

4 issues across 2 worktrees in 1 tier. WT-rings-redact bundles the 3 SDK-payload issues (#75 console breadcrumbs + #76 network ring all-fetches + #77 redact expansion) into one PR because they all edit `BrevwickRingsConfig` / `BrevwickConfig`, `config.ts` validation, and the same golden-payload + redaction-matrix integration tests. WT-react-staged-status (#74) is its own worktree because it lives almost entirely in `packages/react/` and the only cross-package coupling is a small append-only phase-event hook on `packages/sdk/src/submit.ts`.

Both worktrees can run in parallel from T+0; the only shared file is `packages/sdk/src/submit.ts` and the edits are append-only (rings-redact renames the wire field `network_errors → network_calls`; react-staged-status emits phase events at three known boundaries). Whichever PR lands first sets the precedent; the second rebases and re-applies.

**Key references:**

- `CLAUDE.md` (this repo) — pnpm workspace publishing three npm packages (`@tatlacas/brevwick-sdk` core, `@tatlacas/brevwick-react` adapter, `@tatlacas/brevwick-solid` adapter); bundle budget DO NOT EXCEED (core ≤ 2.2 kB gzip, on-open ≤ 25 kB gzip, react adapter ≤ 25 kB, solid adapter ≤ 5 kB); redaction mandatory; lockstep versioning; squash-merge only; no Co-Authored-By
- [SDD § 12 SDK contracts](https://github.com/tatlacas-com/brevwick-ops/blob/main/docs/brevwick-sdd.md#12-sdk-contracts) — public API contract every adapter must satisfy
- Driving brevwick-web PR: [tatlacas-com/brevwick-web#192](https://github.com/tatlacas-com/brevwick-web/pull/192) — the landing-revamp PR whose claims this initiative makes true
- Issues: [#74](https://github.com/tatlacas-com/brevwick-sdk-js/issues/74) React staged-status UX, [#75](https://github.com/tatlacas-com/brevwick-sdk-js/issues/75) Console breadcrumbs (all levels), [#76](https://github.com/tatlacas-com/brevwick-sdk-js/issues/76) Network ring all-fetches, [#77](https://github.com/tatlacas-com/brevwick-sdk-js/issues/77) Redact expansion + custom hook
- Companion brevwick-api work: [tatlacas-com/brevwick-api#196](https://github.com/tatlacas-com/brevwick-api/issues/196) — vision-model image content blocks (separate initiative scope, same landing-parity tag); the wire rename `network_errors → network_calls` from #76 also has a small companion mirror in brevwick-api's sanitiser + shape-lock tests
- Replaces (mis-filed): [tatlacas-com/brevwick-web#143](https://github.com/tatlacas-com/brevwick-web/issues/143) — the input-clear-on-send bug, redirected here as #74
- Existing reference files to mirror: `packages/sdk/src/rings/{console,network}.ts`, `packages/sdk/src/core/internal/redact.ts`, `packages/sdk/src/__tests__/integration/{golden-payload,redaction-matrix}.test.ts`, `packages/react/src/feedback-button.tsx`, `packages/react/src/use-feedback.ts`

**Conventions (apply to every worktree):**

- pnpm workspace; tsup builds; vitest tests; size-limit enforces bundle budget
- Bundle budget DO NOT EXCEED — every change runs `__tests__/chunk-split.test.ts` + size-limit
- `sideEffects: false` in all packages
- Hand-written mocks (function-field style); no mocking frameworks
- Redaction mandatory — every payload through `redact()` before leaving device; new context fields ship with redaction tests
- Conventional commits, subject ≤ 72 chars; `feat:` prefix for these issues
- **No Co-Authored-By headers** anywhere
- CI gauntlet green locally before push: `pnpm install --frozen-lockfile && pnpm lint && pnpm type-check && pnpm test && pnpm build && pnpm size-limit`
- Squash-merge into `main` only
- **Do not remove worktrees** — the user cleans them up

---

## Grouping rationale (why 2 worktrees, not 4)

**Bundle the 3 SDK-payload issues into 1 worktree (WT-rings-redact)** because:

- All three live in `packages/sdk/src/` and edit the same neighbourhood:
  - #75 changes `rings/console.ts` + `BrevwickRingsConfig` in `types.ts` + `config.ts` validation.
  - #76 changes `rings/network.ts` + the same `BrevwickRingsConfig` union + `config.ts` validation + the wire field rename in `submit.ts`.
  - #77 changes `core/internal/redact.ts` + `BrevwickConfig` in `types.ts` + `config.ts` validation.
- All three touch `BrevwickRingsConfig` / `BrevwickConfig` and `config.ts` — concurrent PRs would conflict on every commit.
- All three update `__tests__/integration/golden-payload.test.ts` + `__tests__/integration/redaction-matrix.test.ts` — same fixtures.
- Bundle-budget accounting happens once: console (+200 B), network (+50 B), redact (+400 B) ≈ +650 B gzip on `core`. Splitting per-issue would force three separate size-limit baseline regenerations.
- A single PR delivers the message coherently: "the SDK matches every payload claim the landing makes." Splitting it would have three reviewers each saying "looks fine in isolation, but does the FAQ actually claim _this_ set?" — bundling is the cure.

**Split the React widget UX into its own worktree (WT-react-staged-status)** because:

- It lives entirely in `packages/react/src/` (`feedback-button.tsx` + `use-feedback.ts` + tests + README).
- The only cross-package coupling is a small phase-event hook published from `packages/sdk/src/submit.ts` — small and append-only, no structural conflict with WT-rings-redact's rename of `network_errors → network_calls` in the same file.
- Reviewers for the widget UX (animation timing, reduced-motion, retry CTA) are different from reviewers for the rings + redact (capture surface, regex correctness, privacy budget); per-PR review surface is cleaner.
- The bundle budget that matters is `@tatlacas/brevwick-react` ≤ 25 kB gzip — orthogonal to the core budget that WT-rings-redact moves.

**Shared-file conflict surface across both worktrees** (`packages/sdk/src/submit.ts`, `packages/sdk/README.md`, root `README.md` if updated): WT-rings-redact's edits are the wire field rename + the `composePayload` boundary that already exists; WT-react-staged-status's edits are three new phase-event emissions at `composePayload` complete / `redact()` complete / ingest 2xx. Both rebase cleanly onto each other with manual conflict resolution at the import-list level only. Whichever PR lands first sets the precedent; the second rebases.

---

## Dependency map

```
TIER 0 — Parallel from T+0 (2 parallel)
  WT-rings-redact:           #75 + #76 + #77 bundled (single PR)
                              - shared-file edit surface: packages/sdk/src/types.ts,
                                packages/sdk/src/config.ts, packages/sdk/src/submit.ts,
                                packages/sdk/README.md
                              - companion brevwick-api PR for the network_errors →
                                network_calls rename (sanitiser field + shape-lock
                                fixtures); tracked under landing-parity in brevwick-api
                                but small enough to ship in any in-flight API PR
  WT-react-staged-status:    #74  staged-status UX in @tatlacas/brevwick-react
                              - depends on a phase-event hook published from
                                packages/sdk/src/submit.ts; this worktree adds the
                                hook itself if WT-rings-redact has not yet landed it
```

Worktrees live alongside the main repo at `/Users/tatlacas/repos/brevwick/brevwick-sdk-js-wt-landing-parity-{rings,react}`.

---

## TIER 0

---

### Worktree rings-redact: console breadcrumbs + network ring all-fetches + redact expansion (#75 + #76 + #77)

Lands the three SDK-payload landing-parity issues as one bundle. Console ring captures every level (default 50, `BrevwickRingsConfig.console: { levels, max }`). Network ring captures every fetch (default 20, `BrevwickRingsConfig.network: { captureSuccess, max }`; payload field renamed `network_errors → network_calls`). Redactor expands to cover card / IP / SSN / phone / AWS / GitHub patterns plus a configurable `BrevwickConfig.redact: { disable, custom }` extension hook.

**Scope:**

- `packages/sdk/src/rings/console.ts` — patch all five console levels (`log`, `info`, `warn`, `error`, `debug`); route through existing buffer; default 50-entry FIFO; preserve dedupe-window behaviour
- `packages/sdk/src/rings/network.ts` — drop the failure-only filter; buffer every completed fetch + xhr; default 20-entry FIFO; relax `error?` on `NetworkEntry`
- `packages/sdk/src/core/internal/redact.ts` — add card / IP / SSN / phone / AWS / GitHub patterns with Luhn helper for cards; load custom extras from config
- `packages/sdk/src/types.ts` — extend `BrevwickRingsConfig` (console + network union shapes); extend `BrevwickConfig` with `redact?: { disable?, custom? }`; relax `NetworkEntry.error?`
- `packages/sdk/src/config.ts` — accept the new union shapes; back-compat with the boolean for both rings; wire `redact` config through to the redactor
- `packages/sdk/src/submit.ts` — rename payload key `network_errors → network_calls`
- `packages/sdk/src/__tests__/integration/golden-payload.test.ts` — extend to cover (a) all five console levels interleaved, (b) a 200 + 500 network interleave, (c) the wire rename
- `packages/sdk/src/__tests__/integration/redaction-matrix.test.ts` — extend to cover every new pattern + a Luhn-pass / Luhn-fail card pair
- `packages/sdk/src/rings/__tests__/{console,network}.test.ts` — level filtering, max cap, redaction parity, dedupe parity, allow-list parity
- `packages/sdk/README.md` — document new config shapes + the wire rename + the 50/20 defaults
- `.size-limit.js` — regenerate baseline if the +650 B accumulation nudges the gate; document the new size in PR body

**Depends on:** none.
**Blocks:** brevwick-web FAQ tightening (or claim-honesty restoration); brevwick-api shape-lock guard on the wire rename.
**Can run in parallel with:** WT-react-staged-status (sharing only `packages/sdk/src/submit.ts` — append-only phase events + the wire rename are non-conflicting).

```bash
cd /Users/tatlacas/repos/brevwick/brevwick-sdk-js
git fetch origin
git worktree add ../brevwick-sdk-js-wt-landing-parity-rings -b feat/landing-parity-rings origin/main
cd ../brevwick-sdk-js-wt-landing-parity-rings

claude --dangerously-skip-permissions "
You are landing the SDK-payload landing-parity bundle for brevwick-sdk-js. The bundle covers three shippable GitHub issues (#75, #76, #77) in one PR. Driving rationale: the brevwick-web landing FAQ promises capabilities the SDK does not currently match — this PR makes the marketing claims true.

THIS REPO: \$(pwd)

STEP 1 — Read project context:
- Read CLAUDE.md fully — bundle budget DO NOT EXCEED, redaction mandatory, lockstep versioning, no Co-Authored-By, branch-protected main.
- Run: gh api repos/tatlacas-com/brevwick-sdk-js/issues/75 --jq '.body' (console breadcrumbs)
- Run: gh api repos/tatlacas-com/brevwick-sdk-js/issues/76 --jq '.body' (network ring all-fetches + wire rename)
- Run: gh api repos/tatlacas-com/brevwick-sdk-js/issues/77 --jq '.body' (redact expansion + custom hook)
- Read driving PR for context: gh pr view 192 --repo tatlacas-com/brevwick-web --json body --jq '.body' | head -200
- Read existing implementations end-to-end:
  - packages/sdk/src/rings/console.ts (current error-only patch + dedupe-window 'count' field)
  - packages/sdk/src/rings/network.ts (current failure-only filter + 2 KiB / 4 KiB / allow-list caps)
  - packages/sdk/src/core/internal/redact.ts (current PATTERNS array — auth/cookie/bearer/jwt/email/base64)
  - packages/sdk/src/core/buffer.ts (FIFO buffer pattern — extend, do not re-invent)
  - packages/sdk/src/types.ts (current BrevwickRingsConfig + BrevwickConfig + NetworkEntry/ConsoleEntry)
  - packages/sdk/src/config.ts (current validation + back-compat)
  - packages/sdk/src/submit.ts (composePayload — locate the network_errors emission)
  - packages/sdk/src/__tests__/integration/golden-payload.test.ts (current fixture)
  - packages/sdk/src/__tests__/integration/redaction-matrix.test.ts (current matrix)
  - packages/sdk/src/__tests__/chunk-split.test.ts (bundle-budget gate)
  - .size-limit.js (current entries + budgets)

STEP 2 — Console ring (#75):
- packages/sdk/src/rings/console.ts:
  - Patch all five levels (log/info/warn/error/debug); each override calls the original via Function.prototype.call.
  - Route every entry through the existing buffer pattern in core/buffer.ts.
  - Default cap 50 entries (FIFO); hard ceiling 200 enforced at config validation.
  - Existing dedupe-window 'count' field applies uniformly to every level (no level-specific behaviour).
  - Existing error + unhandledrejection paths stay untouched.
- packages/sdk/src/types.ts:
  export interface BrevwickRingsConfig {
    console?:
      | boolean
      | {
          levels?: Array<'log' | 'info' | 'warn' | 'error' | 'debug'>;
          max?: number;
        };
    network?: ...; // see STEP 3
    route?: boolean;
  }
  - 'console: true' (or omitted) defaults to all five levels, max=50.
  - 'console: false' is full opt-out.
  - 'console: { levels: ['error'] }' reproduces today's behaviour for users who want it.
- packages/sdk/src/config.ts:
  - Accept the new union; back-compat with the boolean.
  - Validation: levels[] must be in the closed enum; max must be 1..200.
- packages/sdk/src/rings/__tests__/console.test.ts:
  - Default config captures all five levels.
  - 'levels' filter excludes other levels.
  - 'max' clips to FIFO cap.
  - Redaction applies uniformly.
  - Dedupe-window 'count' field still increments across levels.

STEP 3 — Network ring (#76):
- packages/sdk/src/rings/network.ts:
  - Drop the failure-only filter; buffer every completed fetch + xhr.
  - Default cap 20 entries; hard ceiling 100.
  - Same redact-on-write rules: requestBody/responseBody/headers capped per existing NetworkEntry contract; success responses are no exception.
- packages/sdk/src/types.ts:
  export interface BrevwickRingsConfig {
    console?: ...; // see STEP 2
    network?:
      | boolean
      | {
          captureSuccess?: boolean; // default true
          max?: number; // default 20
        };
    route?: boolean;
  }
  - Relax NetworkEntry.error to optional.
  - 'network: true' (default) captures success too — this is a behaviour change; document in CHANGESET / PR body.
  - 'network: { captureSuccess: false }' reproduces today's failures-only mode.
- packages/sdk/src/submit.ts:
  - Rename payload key 'network_errors' → 'network_calls' in composePayload's serialisation.
  - Note: this is a wire contract change; pair with the brevwick-api companion PR (sanitiser field + shape-lock fixtures + handler/issues consumer rename).
- packages/sdk/src/config.ts: validation parity with #75 (boolean back-compat; max bounds).
- packages/sdk/src/rings/__tests__/network.test.ts:
  - Default config captures success + failure.
  - 'captureSuccess: false' reproduces failures-only.
  - 'max' clips to FIFO cap.
  - Redaction + 2 KiB / 4 KiB / allow-list caps apply uniformly.

STEP 4 — Redact expansion (#77):
- packages/sdk/src/core/internal/redact.ts:
  - Append patterns to PATTERNS array (order matters — replacements run sequentially):
    - Card numbers — 13–19 digit runs with optional dash/space separators that pass the Luhn check; replace '[card]'. Add a tiny luhn(n: string): boolean helper.
    - IPv4 / IPv6 literals — replace '[ip]'.
    - US SSN / UK NI — '\d{3}-\d{2}-\d{4}' and the UK NI format; replace '[ssn]'.
    - Phone E.164 — '\+?\d[\d\s\-()]{7,}\d' with 8–15 digit length sanity check; replace '[phone]'. Gate behind config flag (default ON; flippable via 'disable: [\"phone\"]').
    - AWS access keys — 'AKIA[0-9A-Z]{16}'; replace '[aws-key]'.
    - GitHub tokens — 'ghp_[A-Za-z0-9]{36}' / 'gho_…' / 'ghs_…'; replace '[gh-token]'.
  - Load custom extras from config (RegExp or { pattern, replacement }) — append after built-ins so user patterns can override.
  - Honour 'disable' list: skip any built-in named in disable[].
- packages/sdk/src/types.ts:
  redact?: {
    disable?: Array<'auth' | 'cookie' | 'bearer' | 'jwt' | 'email' | 'card' | 'ip' | 'ssn' | 'phone' | 'aws' | 'github' | 'base64'>;
    custom?: Array<RegExp | { pattern: RegExp; replacement: string }>;
  };
- packages/sdk/src/config.ts: wire redact config through to the redactor.
- packages/sdk/src/__tests__/integration/redaction-matrix.test.ts:
  - Add a row per new pattern proving redaction.
  - Add Luhn-pass card (e.g. '4242 4242 4242 4242') vs Luhn-fail (e.g. '1234 5678 9012 3456') pair — the Luhn-fail must NOT be redacted (false-positive guard).
  - Add a 'disable: [\"phone\"]' test asserting raw phones survive.
  - Add a 'custom: [/secret-\\w+/]' test asserting custom redaction fires.

STEP 5 — Golden-payload integration test:
- packages/sdk/src/__tests__/integration/golden-payload.test.ts:
  - Extend fixture to drive console.log + console.info + console.warn + console.error + console.debug in order; assert the captured ring carries them in order with redaction applied.
  - Extend fixture to drive a 200 then a 500 fetch; assert both land in the network ring; assert the wire field is now 'network_calls' not 'network_errors'.
  - If a checked-in golden file exists, regenerate per the test's golden-write flag and verify the diff is exactly what's expected (no surprise field drift).

STEP 6 — Bundle budget:
- Run pnpm size-limit.
- Expected accumulation on @tatlacas/brevwick-sdk core: ≤ +650 B gzip (#75 ≤ +200 B, #76 ≤ +50 B, #77 ≤ +400 B).
- If the gate fails:
  - First, investigate whether dynamic-import boundaries are correct (e.g. Luhn helper + AWS/GitHub regexes in the eager core?). Move exotic patterns behind 'custom' if budget tightens.
  - Second, only if structurally unavoidable, bump the budget in .size-limit.js with the actual new value AND document in the PR body. Do not silently raise.
- packages/sdk/src/__tests__/chunk-split.test.ts: must stay green; modern-screenshot etc. still dynamic-imported.

STEP 7 — README:
- packages/sdk/README.md:
  - Document new BrevwickRingsConfig.console / network shapes; show the legacy boolean still works; show the 50 / 20 defaults.
  - Document the wire rename network_errors → network_calls under a 'Wire contract' or 'Changelog' section.
  - Document BrevwickConfig.redact: { disable, custom }; list the 12 built-in pattern names accepted by 'disable'.
  - Note the phone false-positive flag.

STEP 8 — Run the full CI gauntlet:
pnpm install --frozen-lockfile
pnpm lint
pnpm type-check
pnpm test
pnpm build
pnpm size-limit
- All green. If anything fails, fix root cause and re-run from clean. Do NOT --no-verify or otherwise bypass.

STEP 9 — Push + open PR:
git add -A
git commit -m 'feat(sdk): landing-parity — console all-levels + network all-fetches + redact expansion (#75 #76 #77)'
git push -u origin feat/landing-parity-rings
gh pr create --title 'feat(sdk): landing-parity — console + network rings + redact expansion' --body \"\$(cat <<'PREOF'
Closes #75
Closes #76
Closes #77

Bundles three landing-parity SDK-payload issues into one PR. All three edit BrevwickRingsConfig / BrevwickConfig + config.ts validation + the same golden-payload + redaction-matrix integration tests; splitting would force serialised PRs with conflicts on every commit.

Implements [SDD § 12 SDK contracts](https://github.com/tatlacas-com/brevwick-ops/blob/main/docs/brevwick-sdd.md#12-sdk-contracts). Drives parity with the brevwick-web landing FAQ claims (PR #192).

## Summary
- packages/sdk/src/rings/console.ts: all five levels patched (log/info/warn/error/debug); default 50-entry FIFO; new BrevwickRingsConfig.console union accepting boolean OR { levels, max }
- packages/sdk/src/rings/network.ts: every completed fetch + xhr buffered (not just failures); default 20-entry FIFO; new BrevwickRingsConfig.network union accepting boolean OR { captureSuccess, max }; NetworkEntry.error now optional
- packages/sdk/src/core/internal/redact.ts: new card (Luhn-gated) / IP / SSN / phone / AWS / GitHub patterns; new BrevwickConfig.redact: { disable, custom } hook
- packages/sdk/src/submit.ts: payload key renamed network_errors → network_calls
- Golden-payload + redaction-matrix integration tests extended; per-ring tests added/extended
- Bundle budget on @tatlacas/brevwick-sdk core: <delta> B gzip (within budget; size-limit gate green)

## Behaviour changes (call out in CHANGESET)
- Default network ring now captures success traffic. Users who want today's failures-only mode opt in with 'network: { captureSuccess: false }'.
- Wire field rename network_errors → network_calls is a contract change. Companion brevwick-api PR mirrors the sanitiser field + shape-lock fixtures + handler consumers; the schema-lock guard fails until both ship.

## Out of scope (intentional)
- React widget staged-status UX — tracked separately as #74; lands in WT-react-staged-status alongside the phase-event subscription on submit.ts (orthogonal to this PR's submit.ts edits).
- Server-side redaction parity — separate brevwick-api issue. SDK redacts first; API double-checks.
- Source-mapping log call sites; WebSocket / gRPC-Web ring capture; ML / NER redaction.

## Test plan
- [ ] CI gauntlet green: pnpm install --frozen-lockfile && pnpm lint && pnpm type-check && pnpm test && pnpm build && pnpm size-limit
- [ ] chunk-split.test.ts green (no eager-import regressions)
- [ ] Golden-payload integration test exercises all-five-levels console interleave + 200/500 network interleave + new wire field name
- [ ] Redaction-matrix integration test grows to cover every new pattern + Luhn-pass / Luhn-fail card pair
- [ ] Companion brevwick-api PR linked (network_errors → network_calls rename)
- [ ] No mention of Claude in commits, PR title, PR body, or code comments
PREOF
)\"
"
```

---

### Worktree react-staged-status: clear input on send + staged status UX (#74)

Lands the React widget UX that mirrors the brevwick-web AnimatedDemo. Pressing **Send** clears the input, moves the typed text into a user bubble, then ticks through three staged status rows (`Captured route, console, network, device` → `PII-sanitised, packaged` → `Formatting with AI…`). Reduced-motion users get all rows at once; submission failures collapse to a single retry CTA.

**Scope:**

- `packages/react/src/feedback-button.tsx` — replace the single `Sending…` bubble around line 961 with the staged sequence; pull state out of `useFeedback` so row visibility is bound to submit-pipeline phase, not a timer
- `packages/react/src/use-feedback.ts` — extend `FeedbackStatus` with phase enum (`'capturing' | 'sanitising' | 'formatting' | 'sent' | 'error'`) so the consumer drives the UI from pipeline state
- `packages/sdk/src/submit.ts` — emit phase events at three known boundaries: `composePayload` complete, `redact()` complete, ingest 2xx. Use a `RingBus`-style internal `phase` event the React adapter subscribes to; do **not** introduce a public observable on the SDK's exported surface
- `packages/react/src/__tests__/feedback-button.test.tsx` — three staged rows render in order; reduced-motion fallback renders all rows immediately; each `SubmitErrorCode` collapses to a red retry row with the message verbatim
- `packages/react/README.md` — document the new state machine + the reduced-motion contract + the AI-row suppression on non-AI projects
- AI-row gate: read `getConfig().ai_enabled` — when false, suppress the third row entirely (don't claim work the SDK isn't doing)
- Failure surface: `SubmitErrorCode === 'ATTACHMENT_UPLOAD_FAILED' | 'INGEST_REJECTED' | 'INGEST_RETRY_EXHAUSTED' | 'INGEST_TIMEOUT' | 'INGEST_INVALID_RESPONSE'` turns the in-progress row red with retry CTA
- Stagger: ~200 ms between rows; same fade-in we use for the user bubble

**Depends on:** none structurally — this worktree adds the phase-event hook on `submit.ts` itself if WT-rings-redact has not yet landed it. If WT-rings-redact lands first and adds the hook, rebase and drop the duplicate; if this lands first, WT-rings-redact rebases and re-applies its `network_errors → network_calls` rename around the new emit sites.
**Blocks:** brevwick-web AnimatedDemo continuing to ship the "live but aspirational" comment — once #74 lands the demo can drop the forward-looking caveat.
**Can run in parallel with:** WT-rings-redact (only shared file is `packages/sdk/src/submit.ts`; both edits are append-only at the import-list level).

```bash
cd /Users/tatlacas/repos/brevwick/brevwick-sdk-js
git fetch origin
git worktree add ../brevwick-sdk-js-wt-landing-parity-react -b feat/landing-parity-react origin/main
cd ../brevwick-sdk-js-wt-landing-parity-react

claude --dangerously-skip-permissions "
You are landing the React widget staged-status UX. Your task is GitHub issue #74 on tatlacas-com/brevwick-sdk-js. The bug was mis-filed at brevwick-web#143 — it lives in the @tatlacas/brevwick-react adapter, not in brevwick-web.

THIS REPO: \$(pwd)

STEP 1 — Read project context:
- Read CLAUDE.md fully — bundle budget DO NOT EXCEED, redaction mandatory, no Co-Authored-By, branch-protected main, auto-PR on push.
- Run: gh api repos/tatlacas-com/brevwick-sdk-js/issues/74 --jq '.body'
- Read driving PR for the target UX: gh pr view 192 --repo tatlacas-com/brevwick-web --json body --jq '.body' | head -200
- Read the brevwick-web AnimatedDemo source for the visual contract: gh api repos/tatlacas-com/brevwick-web/contents/src/app/(marketing)/_components/landing/animated-demo.tsx --jq '.content' | base64 -d | head -300
- Read existing implementations end-to-end:
  - packages/react/src/feedback-button.tsx (locate the 'Sending…' bubble around line 961; understand the current AssistantBubble + UserBubble component shape)
  - packages/react/src/use-feedback.ts (current FeedbackStatus enum + state machine)
  - packages/react/src/__tests__/feedback-button.test.tsx (test patterns + @testing-library/react conventions)
  - packages/sdk/src/submit.ts (locate composePayload around line 470 + the redact() call site + the ingest 2xx boundary; the three phase-emit boundaries map to these three points)
  - packages/sdk/src/core/ringbus.ts (or wherever the internal event bus lives — mirror its API for the new 'phase' event; do NOT export it from the SDK's index)
  - packages/sdk/src/index.ts (confirm what is and isn't part of the public API surface)

STEP 2 — Phase-event hook on @tatlacas/brevwick-sdk:
- packages/sdk/src/submit.ts:
  - At composePayload complete: emit phase 'capturing-done' (after the buffers snapshot lands in the payload).
  - After redact() runs over the payload and BEFORE the ingest POST: emit phase 'sanitising-done'.
  - After the ingest 2xx response: emit phase 'sent' (with a flag indicating whether AI formatting will run, derived from the resolved config's ai_enabled).
- The emit channel is the existing internal RingBus / event surface — NOT a new public observable on the index.ts surface.
- If WT-rings-redact (the network/console/redact bundle) has already landed the same boundaries, reuse them; if it has not, this worktree adds them and WT-rings-redact rebases on top.
- Test: packages/sdk/src/__tests__/integration/<existing-or-new>.test.ts asserts the three phase events fire in order on a happy-path submit.

STEP 3 — useFeedback state machine:
- packages/react/src/use-feedback.ts:
  - Extend FeedbackStatus with an explicit phase enum: 'idle' | 'capturing' | 'sanitising' | 'formatting' | 'sent' | 'error'.
  - Subscribe to the SDK's internal phase event; map each event to the next phase.
  - On error (any SubmitErrorCode), set phase: 'error' with the SubmitError attached so the consumer can render the retry CTA.
  - Expose a 'retry()' callback that re-runs submit() with the same payload (already in the existing surface? if so, reuse).
  - Public API discipline: only the phase enum is new; do not add new public hooks.

STEP 4 — feedback-button.tsx UI:
- packages/react/src/feedback-button.tsx:
  - On Send click: immediately move the typed value into a UserBubble and clear the input. Do NOT wait for submit() to resolve.
  - Render three AssistantBubble rows driven by the phase enum:
    1. 'Captured' — green checkmark + 'Captured route, console, network, device' (visible from phase >= 'sanitising').
    2. 'Sanitised' — green checkmark + 'PII-sanitised, packaged' (visible from phase >= 'formatting' OR 'sent').
    3. 'Formatting with AI' — spinner + 'Formatting with AI…' (visible only when phase === 'formatting' AND the resolved config's ai_enabled is true; suppress entirely when ai_enabled === false).
  - Stagger ~200 ms between rows on entry; same fade-in transition the existing UserBubble uses.
  - Reduced motion: read window.matchMedia('(prefers-reduced-motion: reduce)').matches at render time; when true, render all rows immediately on send (no stagger).
  - On phase: 'error' — collapse the in-progress row to a red retry row showing the SubmitError message verbatim + a 'Retry' CTA wired to useFeedback.retry().
  - SubmitErrorCode coverage: ATTACHMENT_UPLOAD_FAILED, INGEST_REJECTED, INGEST_RETRY_EXHAUSTED, INGEST_TIMEOUT, INGEST_INVALID_RESPONSE.

STEP 5 — Tests:
- packages/react/src/__tests__/feedback-button.test.tsx:
  - 'Pressing Send clears the input + renders user bubble immediately' — assert before any await.
  - 'Three rows render in order' — drive the SDK mock to emit phase events; assert each row appears in sequence.
  - 'AI row suppressed on non-AI project' — mock getConfig() with ai_enabled: false; assert the third row never renders.
  - 'Reduced motion renders all rows immediately' — mock matchMedia; assert no stagger delay.
  - 'Each SubmitErrorCode renders a red retry row' — table-driven across the five codes; assert message renders verbatim + retry CTA fires useFeedback.retry().

STEP 6 — README:
- packages/react/README.md: add a state-machine section documenting the phase enum, the three rows, the AI-row gate on getConfig().ai_enabled, the reduced-motion contract, and the failure → retry collapse.

STEP 7 — Bundle budget:
- pnpm size-limit.
- @tatlacas/brevwick-react bundle budget is ≤ 25 kB gzip. The new state machine + three-bubble render should stay well under (a couple hundred bytes of JSX + the phase subscription wiring).
- packages/react/src/__tests__/chunk-split.test.ts (if one exists) stays green.
- @tatlacas/brevwick-sdk core budget: must be unchanged or within +50 B for the phase emits. If the gate moves, document in PR body.

STEP 8 — Run the full CI gauntlet:
pnpm install --frozen-lockfile
pnpm lint
pnpm type-check
pnpm test
pnpm build
pnpm size-limit
- All green. If anything fails, fix root cause and re-run from clean.

STEP 9 — Push + open PR:
git add -A
git commit -m 'feat(react): clear input on send + staged status (Captured / Sanitised / Formatting) (#74)'
git push -u origin feat/landing-parity-react
gh pr create --title 'feat(react): staged-status feedback widget UX' --body \"\$(cat <<'PREOF'
Closes #74
Closes tatlacas-com/brevwick-web#143

Implements the React widget staged-status UX so the @tatlacas/brevwick-react widget visually matches the brevwick-web landing AnimatedDemo (PR #192). Pressing Send clears the input, moves the typed value into a user bubble immediately, then ticks through three staged AssistantBubble rows (Captured → Sanitised → Formatting with AI) driven by the SDK's submit-pipeline phase events. Honours prefers-reduced-motion; collapses to a red retry row on every SubmitErrorCode.

Implements [SDD § 12 SDK contracts](https://github.com/tatlacas-com/brevwick-ops/blob/main/docs/brevwick-sdd.md#12-sdk-contracts).

## Summary
- packages/sdk/src/submit.ts: emits internal RingBus phase events at composePayload-done / redact-done / ingest-2xx (not exposed on the public SDK surface)
- packages/react/src/use-feedback.ts: FeedbackStatus extended with phase enum 'idle' | 'capturing' | 'sanitising' | 'formatting' | 'sent' | 'error'
- packages/react/src/feedback-button.tsx: input clears on Send + three staged AssistantBubble rows + ~200 ms stagger + reduced-motion fallback + AI-row suppression on non-AI projects + red retry row on every SubmitErrorCode
- packages/react/__tests__/feedback-button.test.tsx: row ordering + reduced-motion + AI gate + table-driven failure paths
- packages/react/README.md: state-machine + reduced-motion + AI-gate documentation
- Bundle budget: react adapter <delta> B / SDK core <delta> B (size-limit gate green)

## Out of scope (intentional)
- Server-side AI status pushing (no SSE, no polling) — status rows are purely client-side animation against pipeline phase.
- Per-row failure retries — a single retry CTA on the failed row is the contract; the issue body is explicit.
- Replacing AssistantBubble for already-shipped surfaces — the new rows reuse the same component; only the content changes.

## Companion / cross-repo
- WT-rings-redact (#75 + #76 + #77) lives in this repo too; if it lands first, the phase-event hook may already be present on submit.ts — this PR rebases. If this PR lands first, WT-rings-redact rebases its 'network_errors' → 'network_calls' rename onto the new emit sites.
- brevwick-web follow-up: AnimatedDemo can drop the 'live but aspirational' comment once this ships.

## Test plan
- [ ] CI gauntlet green: pnpm install --frozen-lockfile && pnpm lint && pnpm type-check && pnpm test && pnpm build && pnpm size-limit
- [ ] Pressing Send clears the input + renders the user bubble before any network round-trip (asserted in test before any await)
- [ ] Three staged rows render in order; each green check fires at the documented submit-pipeline boundary
- [ ] AI row suppressed when getConfig().ai_enabled === false
- [ ] prefers-reduced-motion: reduce shows all rows immediately, no stagger
- [ ] Each of the five SubmitErrorCodes (ATTACHMENT_UPLOAD_FAILED, INGEST_REJECTED, INGEST_RETRY_EXHAUSTED, INGEST_TIMEOUT, INGEST_INVALID_RESPONSE) collapses to a red retry row with the message verbatim
- [ ] No mention of Claude in commits, PR title, PR body, or code comments
PREOF
)\"
"
```

---

## Parallel execution cheat sheet

- **At T+0 (2 parallel):** WT-rings-redact + WT-react-staged-status — independent at the source-code level except for `packages/sdk/src/submit.ts`, where edits are append-only and rebase cleanly.
- **Shared-file conflict** (`packages/sdk/src/submit.ts`): WT-rings-redact's edit is the wire field rename `network_errors → network_calls`. WT-react-staged-status's edits are three phase-event emissions at `composePayload` / `redact()` / ingest-2xx boundaries. Whichever PR lands first sets the precedent; the second rebases and re-applies — manual conflict resolution at the import-list level only, no structural conflicts.
- **Cross-repo:** brevwick-api needs a small companion PR mirroring the wire rename (`internal/llm/sanitize.go` `NetworkErrors` → `NetworkCalls`, plus shape-lock fixtures + any `internal/handler/issues/...` consumers). It's small enough to ride along in any in-flight brevwick-api PR rather than its own worktree, but the schema-lock guard will fail until both ship.
- **Lockstep versioning:** all packages move together (per CLAUDE.md). After landing-parity ships, run a single Version Packages PR bumping every package together. The wire rename in #76 is breaking enough to warrant a minor bump per the pre-1.0 cadence (anything non-bugfix is minor in 0.x).
