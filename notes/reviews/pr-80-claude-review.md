# PR #80 Review — feat(react): staged-status feedback widget UX

**Issue**: #74 — feat(react): clear input on send + staged status (Captured / Sanitised / Formatting)
**Branch**: feat/landing-parity-react
**Reviewed**: 2026-05-01
**Verdict**: CHANGES REQUIRED

A single dead-code defect (clean-code non-negotiable) blocks approval. Everything else is sound: architecture is clean, the public SDK surface is unchanged, the chunk split holds (`chunk-split.test.ts` already enforces no submit error literals leak into the eager chunk), tests cover the contract end-to-end, and CI is green. The defect is one line and trivial to fix.

## Completeness (NON-NEGOTIABLE)

- [x] Acceptance criteria from #74 — all six implemented (input clears on Send, three staged rows, AI-row gate, red retry row covering all five `SubmitErrorCode`s, `prefers-reduced-motion` collapse, bundle budgets respected).
- [x] SDD § 12 contract honoured — `phase` event lives on the internal `_internal.bus` and is not re-exported from `packages/sdk/src/index.ts:1-31`.
- [x] React README updated with a state-machine table, AI-row gate, reduced-motion contract, and retry contract (`packages/react/README.md:398-415`).
- [x] Changeset present with both packages bumped minor (`.changeset/staged-status-feedback-ux.md`).
- [x] No stubs / placeholders / "follow-up" markers in the diff.

## Clean Architecture (NON-NEGOTIABLE)

- [x] `@tatlacas/brevwick-sdk` stays React-free — `submit.ts` and `core/internal.ts` add only typed primitives and a bus emit; no React, DOM-specific, or Node-only imports leak in.
- [x] `phase` event is intentionally NOT re-exported from `packages/sdk/src/index.ts` — confirmed by inspection (lines 1-31 only export `createBrevwick` plus the public `*` types).
- [x] `PhaseEvent` is replicated in `packages/react/src/internal-bridge.ts:10-13` rather than imported from the SDK's deep path. This is the right call given the SDK does not expose internal types — and the lockstep monorepo means drift is caught by the React tests + the SDK integration test.
- [x] `internal-bridge.ts:36-45` performs strict structural guards (`typeof internal/bus === 'object'`, `typeof on/off === 'function'`) and returns `null` on misshapen mocks. Adapter does not crash on a non-stamped `Brevwick`-shaped object.
- [x] React bindings depend on the SDK, never the reverse. `packages/sdk/package.json` has no React dep.
- [x] `getConfig` cache refactor (`packages/sdk/src/core/client.ts:56-68, 93, 194`) — single `loadConfig` thunk shared by both `instance.getConfig()` and `internal.getConfig()`. Memoised via `configPromise`; concurrent callers collapse to one network round-trip; chunk-load failure is caught with `.catch(() => null)` so a transient failure doesn't poison the cache. Verified no double-fetch.

## Clean Code (NON-NEGOTIABLE)

- [x] **`packages/react/src/feedback-button.tsx:1090`** — replaced `delayMs={reducedMotion ? 0 : 0}` with `delayMs={0}` plus a one-line WHY comment ("Row 1 anchors the cascade at 0 ms; rows 2 and 3 stagger off it.").
- [x] All public exports carry JSDoc; comments throughout explain WHY (cache shape, race semantics, SSR fallbacks), not WHAT.
- [x] No `any`, no unsafe casts beyond the documented `_internal` backdoor cast in `internal-bridge.ts:37` (necessary; documented).
- [x] `PHASE_EVENT_TO_NEXT_PHASE` (`use-feedback.ts:78-82`) and `PHASE_RANK` (`feedback-button.tsx:966-973`) are declared once at module scope — no inline re-creation in render.
- [x] `void status;` at `feedback-button.tsx:1009` — fixed end-to-end: dropped `status: FeedbackStatus` from `ThreadProps`, removed it from the `Thread` destructure, removed `void status;`, removed `status={status}` from the `<Thread />` callsite, and dropped the now-unused `FeedbackStatus` type import. Parent component still consumes `useFeedback`'s `status` for composer/panel-header.
- [x] `RetryRow` and `StatusRow` are small, single-purpose, and parameterised cleanly.
- [x] `feedback-button.tsx:717` and `:763` use `void err;` to consume the caught error. Acceptable — the hook has already mapped the rejection into a tagged `SubmitError` and called `setPhase('error')`; the catch site only needs to pop the panel back open.
- [x] `doRetry` snapshots `lastSubmittedInputRef.current` (`feedback-button.tsx:740-766`) and re-runs the submit with the original `FeedbackInput`. Correct semantics — composer state was cleared synchronously on Send so resubmitting from current state would send empty.

## Public API & Types

- [x] `FeedbackPhase`, `FeedbackStatus`, `UseFeedbackResult` exported from `packages/react/src/index.ts:18-21` — narrow, documented, discriminated.
- [x] `error: SubmitError | null` is a tagged union from the SDK; `retry()` returns `Promise<SubmitResult | undefined>` (undefined when no submit has been attempted). Discriminator is correct.
- [x] No breaking changes — `status` is preserved alongside `phase`; existing callers continue to work. Both packages bumped minor in the changeset (correct under pre-1.0 conventions in `CLAUDE.md`).
- [x] `BusEventMap` extension in `core/internal.ts:45-48` is internal-only — not in the public `exports` field of `packages/sdk/package.json`.
- [x] `PhaseEvent` is a discriminated union keyed on `phase` — `'sent'` carries `aiEnabled`, the other two carry no payload. Clean.

## Cross-Runtime Safety

- [x] `usePrefersReducedMotion()` (`feedback-button.tsx:147-154`) reads `window.matchMedia` only inside `useEffect`, returns `false` when `window === undefined` or `matchMedia` is missing. SSR-safe.
- [x] `submit.ts:581` calls `internal.getConfig()` which is the cached `loadConfig` thunk — works in browser + Node + edge. The `import('../config')` dynamic import is the existing path; no new runtime assumptions.
- [x] `phase` events are emitted on the in-process bus — no DOM/window dependency in the SDK.
- [x] `internal-bridge.ts` reads `_internal` via a typed cast on the `Brevwick` instance; no globals touched.

## Bugs & Gaps

- [x] **Phase-on-failure invariant** — `useFeedback` `runSubmit` at `use-feedback.ts:128-148` populates `error: SubmitError` on BOTH paths: `result.ok === false` (lines 130-133) and the `catch` clause for chunk-load failure (lines 141-148, synthesised as `INGEST_RETRY_EXHAUSTED`). The `RetryRow` guard (`feedback-button.tsx:1017`) reads `phase === 'error' && submitErrorTagged !== null`, so the row never renders without a non-null tagged error. Holds.
- [x] **Bus listener cleanup** — `use-feedback.ts:113-116` returns the cleanup that flips `aliveRef.current = false` AND calls `bus.off('phase', onPhase)`. Correct ordering. Strict-mode double-mount: the effect runs mount → unmount → remount; on each remount `aliveRef.current = true` is re-set on the next line (105). One subtle bug: if the bus listener fires AFTER unmount but BEFORE the next remount (impossible inside a synchronous strict-mode pair, but possible if the SDK ever calls back across an async boundary), it correctly short-circuits via `aliveRef.current === false`. Looks sound.
- [x] **Bus-null path** — `use-feedback.ts:106-107` early-returns when `getPhaseBus` resolves to `null` (e.g. test mock without `_internal`). The cleanup function isn't returned in this branch, so React simply has no teardown — no leak. Correct.
- [x] **Stale-closure in `onPhase`** — `setPhase(PHASE_EVENT_TO_NEXT_PHASE[event.phase])` uses the functional setter via the immediate next state value derived from the event. No closure over `phase` itself. Correct.
- [x] **`'sent'` phase race** — when `phase: 'sent'` arrives via the bus, the listener flips `phase` to `'sent'`, which makes `showFormatting` false in `Thread` (the AI spinner row hides the moment the pipeline lands). Captured + Sanitised stay visible (rank-based gate). Matches the spec.
- [x] **Submit-without-widget cost** — `submit.ts:581` triggers a config fetch when one hasn't been done. For non-widget consumers calling `instance.submit()` directly without ever calling `instance.getConfig()` first, this is one extra network round-trip per session. The cache then sticks for the lifetime of the instance. The contract is documented (`internal.ts:79-86`: "resolves to `null` on any failure"). Worth noting in the changeset / docs but not a blocker.
- [x] **`bus.clear()` on uninstall** — `core/client.ts:172` clears all listeners on uninstall. The React adapter's `useEffect` cleanup runs before the SDK uninstalls (provider unmount order), so the adapter unsubscribes itself. The `bus.clear()` is defence-in-depth.
- [x] **AbortSignal / timeouts** — submit pipeline retains its `TOTAL_BUDGET_MS = 30_000` controller and `clearTimeout` in `finally`. Phase emits do not introduce new long-running async paths.
- [x] No memory leaks: `screenshotUrlsRef` cleanup unchanged; `aliveRef` flip on unmount; bus listener removed via cleanup return.

## Security

- [x] `redact()` runs over `composePayload` body before `'sanitising-done'` fires — no PII leaks past the sanitise boundary in the emitted phase signal (the event itself carries no payload beyond `aiEnabled` for `'sent'`).
- [x] `RetryRow` renders `error.message` verbatim. Server-echoed bodies are run through `redact(raw.slice(0, 256))` in `submit.ts:392`, so a misbehaving server cannot reflect Bearer tokens or PII into the rendered alert.
- [x] No `eval`, `new Function()`, `dangerouslySetInnerHTML`, or inline script injection introduced.
- [x] No secrets in code. No new globals.
- [x] `data-brw-error-code` attribute exposes the `SubmitErrorCode` enum value to the DOM — fine; these are public enum members in the SDK's exported types.

## Tests

- [x] `packages/sdk/src/__tests__/integration/phase-events.test.ts` — three integration tests asserting (a) emit ordering on happy path, (b) `aiEnabled=false` on non-AI projects, (c) `'sent'` does NOT fire on 4xx. Drives through the real `createBrevwick` → install → submit pipeline with MSW handlers.
- [x] `packages/react/src/__tests__/feedback-button.test.tsx:2743-2907` — staged-status describe block:
  - Pressing Send clears input + renders user bubble synchronously (no `act` wrapper, asserted before any await).
  - Three rows render in sequence as phase events arrive (rank-based visibility verified).
  - AI row suppressed when `ai_enabled=false`; the test correctly waits for `getConfig()` to resolve before driving phases (avoids the false positive flagged in the PR description).
  - Reduced motion folds every row to `transitionDelay: 0ms` — verified via `vi.stubGlobal('matchMedia', ...)` + querying `[data-brw-row]`.
  - `it.each` over all five `SubmitErrorCode`s asserts the red retry row carries the verbatim message + `role="alert"` + `data-brw-error-code` AND the Retry CTA re-runs `submit()` with the original `FeedbackInput` (`(submit.mock.calls[1]![0] as { description }).description` matches the original `failure-${code}` typed string).
- [x] In-memory `phaseBus` mock (`feedback-button.test.tsx:36-54`) is structurally compatible with the React adapter's `getPhaseBus` guards. Stamped on the `Brevwick` mock at line 69 via `_internal: { bus: phaseBus }`.
- [x] Rewritten "submit rejects" test (line 803) replaces the legacy "draft preserved" assertion with the new contract: composer cleared, retry CTA appears, retry resubmits with the original input. Rewrite is sound — matches the issue spec verbatim.
- [x] Existing `role="alert"`-based failure tests at `:325` and `:360` continue to pass because `RetryRow` carries `role="alert"` and renders `error.message` verbatim. Backwards compat preserved at the assertion level.
- [x] Phase-event integration test at `phase-events.test.ts:118-156` explicitly asserts the failure path stops at `'sanitising-done'` — no `'sent'` on 4xx.
- [x] Coverage: codecov/patch and codecov/project both pass (`gh pr checks 80`).

## Build & Bundle

- [x] CI checks all green: `check`, `check`, `codecov/patch`, `codecov/project`, `size-check`, `verify-signatures`.
- [x] Eager SDK chunk: 2.13 kB / 2.14 kB ESM/CJS (limit 2.2 kB) per the PR body — within margin.
- [x] React adapter: 11.92 kB / 12.3 kB (limit 25 kB) — well under.
- [x] `chunk-split.test.ts:60-67` already enforces that none of the five `SubmitErrorCode` literals leak into the eager chunk. Phase-emit code added to `submit.ts` rides the existing submit chunk; this test is the proper guard.
- [x] `package.json` `exports` field unchanged for both packages — no new public entry points.
- [x] Tree-shaking: the new exports (`FeedbackPhase`, `useFeedback` extensions) are pure type / hook additions, no top-level side effects introduced.

## PR Hygiene

- [x] Title is conventional: `feat(react): staged-status feedback widget UX`.
- [x] Body references `Closes #74` + the mis-filed `tatlacas-com/brevwick-web#143`.
- [x] No Claude attribution anywhere — verified across commits, PR title, body, code comments, changeset.
- [x] Branch name `feat/landing-parity-react` — matches the initiative documented in `landing-parity-worktree.md`.
- [x] Changeset entry present with appropriate minor bumps for both packages (lockstep, pre-1.0).

## Files Reviewed

| file                                                          | status      | notes                                                                                                  |
| ------------------------------------------------------------- | ----------- | ------------------------------------------------------------------------------------------------------ |
| `.changeset/staged-status-feedback-ux.md`                     | OK          | Minor bumps for both packages; release-note copy is accurate.                                          |
| `packages/react/README.md`                                    | OK          | New "Submit-pipeline state machine" section + AI-row + reduced-motion + retry contracts documented.    |
| `packages/react/src/__tests__/feedback-button.test.tsx`       | OK          | Five new staged-status tests; rewritten failure test matches the new contract; `it.each` covers all 5 codes. |
| `packages/react/src/feedback-button.tsx`                      | CHANGES REQ | Line 1090 `delayMs={reducedMotion ? 0 : 0}` is a dead-code ternary. `void status;` (line 1009) is a tidiness flag. Otherwise correct. |
| `packages/react/src/index.ts`                                 | OK          | New `FeedbackPhase` + `UseFeedbackResult` re-exports.                                                  |
| `packages/react/src/internal-bridge.ts`                       | OK          | Strict structural guards; null return path handled.                                                    |
| `packages/react/src/styles.ts`                                | OK          | `.brw-status-row` class family does not extend `.brw-bubble` (deliberate — keeps integration-test bubble counts stable). Reduced-motion override present. |
| `packages/react/src/use-feedback.ts`                          | OK          | Bus subscription correct; cleanup returns proper teardown; aliveRef + null-bus paths handled.          |
| `packages/sdk/src/__tests__/integration/phase-events.test.ts` | OK          | Three integration tests — ordering, aiEnabled flag, no-`sent`-on-4xx.                                  |
| `packages/sdk/src/core/client.ts`                             | OK          | Single `loadConfig` thunk shared by `instance.getConfig` + `internal.getConfig`; no double-fetch.      |
| `packages/sdk/src/core/internal.ts`                           | OK          | `phase` event added to `BusEventMap`; `getConfig()` added to `BrevwickInternal`. Internal-only — not re-exported. |
| `packages/sdk/src/submit.ts`                                  | OK          | Phase emits at the right boundaries; `'sent'` gated on `result.ok`; chunk-split test still enforces no error literal leak. |

## Required Fix Summary

One change required:

1. **`packages/react/src/feedback-button.tsx:1090`** — Replace `delayMs={reducedMotion ? 0 : 0}` with `delayMs={0}` (the first row has no stagger by design, regardless of reduced-motion). Optionally drop the now-unused `status` prop from `ThreadProps` and its callsite (line 818) instead of `void status;` at line 1009.

Bundle, tests, architecture, public surface, redaction, retry semantics, and AI-row gate all hold. The defect is mechanical and safe to fix in-place.
