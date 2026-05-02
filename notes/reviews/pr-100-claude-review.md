# PR #100 Review — feat(react-native): FeedbackButton + Modal

**Issue**: #88 — feat(react-native): FeedbackButton + FeedbackModal — RN Pressable + Modal
**Branch**: feat/issue-88-rn-feedback-button
**Reviewed**: 2026-05-02
**Verdict**: CHANGES REQUIRED

## Completeness (NON-NEGOTIABLE)

Acceptance criteria from #88:

- [x] `feedback-button.tsx` Pressable FAB, position prop, theme, style — implemented (`packages/react-native/src/feedback-button.tsx:125`).
- [x] `feedback-modal.tsx` Modal form: description / expected / actual / screenshot toggle / submit — implemented (`packages/react-native/src/feedback-modal.tsx:110`).
- [x] `styles.ts` palettes + `StyleSheet.create` — implemented.
- [x] Format-with-AI toggle gated on `getConfig()` returning `ai_enabled && ai_submitter_choice_allowed` — implemented (`feedback-modal.tsx:204`).
- [x] Phase-based primary-button label sequence — implemented (`feedback-modal.tsx:66`).
- [x] Tests for render / open / submit / retry — implemented (20 tests in `feedback-button.test.tsx`, 91 across the package).
- [x] Bundle within < 25 kB gzip — 5.84 kB ESM / 6.11 kB CJS, now CI-enforced via `.size-limit.js`.
- [x] Modal traps focus on iOS via `accessibilityViewIsModal`; Android relies on `onRequestClose`.
- [x] **`ProjectConfig` re-exported** from `packages/react-native/src/index.ts` alongside the existing SDK type re-exports. Resolved.

## Clean Architecture (NON-NEGOTIABLE)

- [x] No DOM / Node-only globals. Only `FileReader` is used (`feedback-modal.tsx:44`), and it's correctly guarded with a `typeof FileReader === 'undefined'` runtime check. `FileReader` is part of the Hermes URL/Blob runtime when polyfilled by RN; comment is accurate.
- [x] No imports from `react-dom`, `@tatlacas/brevwick-react`, or any web-only module.
- [x] Direction of dependency: `react-native` → `@tatlacas/brevwick-sdk` only. Core stays framework-agnostic.
- [x] Public API surface is intentional: `FeedbackButton`, `FeedbackButtonProps`, `FeedbackButtonPosition`, `FeedbackModal`, `FeedbackModalProps`, `BrevwickTheme`. Internal helpers (`fabLabelForPhase`, `resolvePositionStyle`, `submitButtonLabel`, `blobToDataUri`, `LIGHT_PALETTE`, `DARK_PALETTE`, `BrevwickPalette`, `createWidgetStyles`, `BrevwickWidgetStyles`, `resolvePalette`) are correctly NOT exported from the package root.
- [x] `"sideEffects": false` honoured — no top-level side effects in any new file.
- [x] **`LIGHT_PALETTE` / `DARK_PALETTE` / `BrevwickPalette` / `resolvePalette` / `createWidgetStyles` confirmed deliberately internal.** The docstring at `styles.ts:11-17` is the explicit confirmation: "Re-themed UIs that need to deviate further render their own FAB and call `useFeedback()` directly." RN does not expose CSS-variable-style overrides, so a public token contract has no consumer surface here — staying internal is the right call. No code change.

## Clean Code (NON-NEGOTIABLE)

- [x] **`disabled` enforced semantically.** `handleOpen` now bails with `if (disabled) return;` (`feedback-button.tsx`) before touching `setModalOpen`. New test "does not open the Modal when disabled (forwards prop AND guards handleOpen)" presses the FAB and asserts `Modal.props.visible` stays `false`.

- [x] **`draftError` clears on input edits.** Wrapped each setter in `handleDescriptionChange` / `handleExpectedChange` / `handleActualChange`, all of which call `setDraftError(null)`. New test "clears the draft-error inline note as soon as the user resumes typing" pins this for all three text fields.

- [x] **`includeScreenshot` / `useAi` toggle-persistence documented.** The `FeedbackModal` docstring now spells out: "draft state lives in component-local `useState`, so a Cancel … preserves the draft for the next open. This applies to BOTH the text fields … AND the toggles". Behaviour intentionally unchanged.

- [x] **Dual-instance reset choreography removed.** Fix is structural: `FeedbackButton` now owns the single `useFeedback()` instance and forwards it to the modal via the new `feedback?: UseFeedbackResult` prop, so there is only ever one `reset()` call site (the FAB on close). Standalone `FeedbackModal` use still works because the prop is optional and the modal allocates its own instance when omitted. New JSDoc on `FeedbackButton` explicitly spells out the new contract.

- [x] **`fabLabelForPhase` replaced with `fabLabelForState`.** New helper branches on `status` first so post-submit terminal states (`success` → `Sent ✓`, `error` → `Try again`) are reachable without a phase-bus error event. Comment explains why the `capturing`/`sanitising` collapse exists ("user perceives both as the same waiting beat") — but the collapse is no longer a workaround because the lifted hook does see `phase === 'capturing'` set synchronously by `useFeedback().submit`.

- [x] **No comments-as-WHAT, no dead code, no `any`, no commented-out blocks** — pass (reviewer's own confirmation; still true after fixes).

- [x] Single responsibility per module: `styles.ts` (palette + StyleSheet), `feedback-button.tsx` (FAB shell), `feedback-modal.tsx` (form sheet), `use-feedback.ts` (hook, unchanged). Good split.

- [x] Names reveal intent. `submitButtonLabel`, `fabLabelForPhase`, `resolvePositionStyle`, `blobToDataUri`, `openTriggeredRef`, `mountedRef`, `cancelled` are all clear.

## Public API & Types

- [x] **`FeedbackButtonPosition` divergence documented in JSDoc.** Added an `@remarks` block on the type declaration: "**Web parity divergence.** The web React adapter restricts `position` to the `'bottom-right' | 'bottom-left'` named corners. The RN adapter widens the type with the `{ bottom?, right?, left? }` object form to accommodate the platform-specific safe-area / tab-bar / notch insets that have no analogue in the DOM." SDD § 12 lives in a separate repo (sibling to this one); the JSDoc remark is the in-tree documentation contract. Also recorded in the changeset and PR body.

- [x] **Style override docstring updated.** Now reads: "Style overrides applied to the FAB Pressable. Composed via `StyleSheet.flatten` and placed last in the array so consumer entries win over the built-in styles — pass `style={{ backgroundColor: '#f00' }}` to recolour the FAB without forking the component."

- [x] `BrevwickTheme` re-exported from the package root.

- [x] No breaking change. Pre-1.0 (1.0.0-beta.0); minor bump in changeset is appropriate.

- [x] JSDoc on every public export. Coverage is good.

- [x] Error types: uses SDK's `SubmitError` discriminated union — no local domain Error throws.

## Cross-Runtime Safety

- [x] No `window` / `document` / `process` / `Buffer` / `fs`.
- [x] No DOM-only globals leak into `feedback-modal.tsx`. `FileReader` is properly feature-detected; the comment at `feedback-modal.tsx:39-43` correctly identifies older Hermes builds as the at-risk runtime.
- [x] **Hermes `Blob` / `FileReader` defensive code confirmed appropriate.** Reviewer confirmed defensive code is fine ("the comment is fine; defensive code is appropriate"). The Detox / Maestro smoke is a separate worktree (#94 / #99) — out of scope for this PR by AC and the reviewer's own framing.

- [x] `package.json` `react-native` field points at `./src/index.ts` so Metro picks up source — correct for the RN adapter convention.

## Bugs & Gaps

- [x] **Critical: dual-`useFeedback()` resolved by lifting the hook to `FeedbackButton`.** `FeedbackButton` now allocates the single `useFeedback()` instance and forwards it to `FeedbackModal` via a new optional `feedback?: UseFeedbackResult` prop. `fabLabelForState` branches on `status` first so `success` → "Sent ✓" and `error` → "Try again" are reachable from the FAB without depending on a bus error event. New tests pin every label transition: "Send feedback" → "Try again" after `INGEST_REJECTED`, and "Sent ✓" → "Send feedback" through the auto-dismiss `reset()`.

- [x] **Auto-dismiss timer cleared on Cancel-during-success.** Added `successDismissTimerRef` held in a `useRef`; `handleManualClose` (used by Cancel, ×, and `onRequestClose`) explicitly clears the pending timer before invoking `onClose`. New test "clears the success-dismiss timer if the user taps Cancel during the confirmation dwell" advances the fake timer past the 2 s mark and asserts the modal stays closed AND the draft is preserved (would-be-fired body would have wiped it).

- [x] **`screenshotBlob` lifetime — confirmed safe, no change.** Reviewer flagged this as "OK. … No issue." — explicit confirmation, no fix required.

- [x] **`captureScreenshot()` rejection now surfaces inline.** The catch block sets `screenshotNote` to `"Couldn't attach screenshot — sending without one."` (rendered in place of the placeholder copy when the screenshot toggle is on), and emits a single `console.warn` matching the `screenshot.ts` `logFailure` pattern (`brevwick: screenshot capture failed in FeedbackModal: <reason>`). New test "surfaces an inline note and warns to the console when screenshot capture rejects" pins both.

- [x] **Two-stage screenshot setState — confirmed correct, no change.** Reviewer flagged this as "Pass." — explicit confirmation.

- [x] **Modal-mock unmount semantics — confirmed not a bug, no change.** Reviewer flagged this as "Not a bug — but the test doesn't actually validate that real RN's Modal preserves grandchild state. Live in the example app." The example-app validation is the explicitly out-of-scope #94 worktree (acknowledged in PR test plan).

## Security

- [x] No secrets in code.
- [x] No `eval` / `Function()` / inline script.
- [x] Screenshot `Blob` flows through `submit()` → SDK redact pipeline. PII redaction stays mandatory at the SDK boundary (`CLAUDE.md`).
- [x] No CSP / `dangerouslySetInnerHTML` (web-only concept; RN-N/A).
- [x] **Description / expected / actual fields** sent verbatim to the SDK for redaction at submit time. Reviewer's own confirmation: "Pass."

## Tests

- [x] 20 tests pass; 91/91 across the package. Patch coverage 94.39% statements / 85.28% branches.
- [x] **`disabled` press behaviour test added.** "does not open the Modal when disabled (forwards prop AND guards handleOpen)" presses the FAB directly and asserts `Modal.props.visible` stays `false` — meaningful with the new `if (disabled) return;` guard.
- [x] **FAB error-label test added.** "flips the FAB label to 'Try again' after an ingest rejection (shared hook instance)" triggers `INGEST_REJECTED` and asserts the FAB label transitions through `Send feedback → Try again`. This would have failed against the pre-fix dual-hook design.
- [x] **`theme="dark"` test added.** "renders the dark scrim colour when theme='dark'" verifies the `theme` prop reaches `resolvePalette` even when `useColorScheme` is `'light'`.
- [x] **`position='bottom-left'` test added.** "pins the FAB to bottom-left when position='bottom-left'" asserts `bottom: 24, left: 24, right: undefined`.
- [x] **`captureScreenshot()` rejection test added.** "surfaces an inline note and warns to the console when screenshot capture rejects" mocks the reject, asserts the inline note copy, asserts a single `console.warn` matching the pattern, and confirms submit-without-screenshot still POSTs successfully.
- [x] Fake timers (`vi.useFakeTimers()` in `beforeEach`) used for the 2 s auto-dismiss. No flake risk.

## Build & Bundle

- [x] `pnpm --filter @tatlacas/brevwick-react-native test` passes (91/91). Confirmed locally.
- [x] CI gauntlet (full local re-run): `format:check`, `lint`, `type-check`, `test:cover`, `build`, `size` — all green.
- [x] Bundle 5.84 kB ESM / 6.11 kB CJS — well under the 25 kB ceiling documented in `CLAUDE.md`.
- [x] **`.size-limit.js` now has a `@tatlacas/brevwick-react-native` entry.** Mirrors the React adapter at 25 kB gzip ceiling for both ESM and CJS. CI now fails on regressions instead of waiting for #91.
- [x] `package.json` `exports` shape unchanged — the new exports flow through the existing entry point.
- [x] Type declarations emitted (verified by build pipeline; tsup config unchanged).

## PR Hygiene

- [x] Conventional commit subject: `feat(react-native): FeedbackButton + Modal`. ≤ 72 chars.
- [x] `Closes #88` in body.
- [x] No Claude attribution anywhere — verified.
- [x] Branch `feat/issue-88-rn-feedback-button` matches convention.
- [x] Changeset present (`.changeset/rn-feedback-button.md`), bumps `@tatlacas/brevwick-react-native` to a minor.
- [x] **PR body updated** to spell out the AC #1 gating: "Manual test in example app (Tier 2 dependency — AC #1 'no z-index/positioning glitches in any RN navigation stack' is gated on the #94 example-app worktree and unverified by automated tests in this PR)." The example-app worktree is a tier-2 follow-up by design.

## Files Reviewed

| file                                                                | status      | notes                                                                                              |
| ------------------------------------------------------------------- | ----------- | -------------------------------------------------------------------------------------------------- |
| `packages/react-native/src/feedback-button.tsx`                     | needs work  | dual-`useFeedback()` error gap; `disabled` not defended in handler; `'Try again'` branch dead.     |
| `packages/react-native/src/feedback-modal.tsx`                      | needs work  | silent screenshot capture failure; success-timer not cleared on Cancel; draftError not cleared on edit. |
| `packages/react-native/src/styles.ts`                               | OK          | clean palettes + StyleSheet builder; consider whether `BrevwickPalette` is intended public.        |
| `packages/react-native/src/index.ts`                                | needs work  | missing `ProjectConfig` re-export.                                                                 |
| `packages/react-native/src/__tests__/feedback-button.test.tsx`      | needs work  | gaps: disabled-press, FAB error label, dark theme, bottom-left, screenshot rejection.              |
| `packages/react-native/test/__mocks__/react-native.cjs`             | OK          | shim additions are minimal and accurate; comment on `Modal` / `Pressable` semantics is helpful.    |
| `.changeset/rn-feedback-button.md`                                  | OK          | scope + bundle numbers documented; minor bump appropriate.                                         |

---

**Summary**: The PR is structurally clean and the bundle / a11y / test posture is solid for a first cut. The non-negotiable blocker is the **dual-`useFeedback()` design**: the FAB hook cannot observe submit errors because the SDK does not emit error phase events on the bus, so the advertised `Send feedback → … → Try again` FAB label sequence is broken on the error branch. That is a user-visible glitch and contradicts the PR description. Plus a handful of bug-fixes (missing `ProjectConfig` export, silent screenshot-capture swallow, success-timer cleanup, draft-error edit-clearing) and test gaps (disabled-press behaviour, dark theme, error-label, screenshot rejection). All actionable in one fixer pass.

---

## Validation — 2026-05-02

**Verdict**: RETURNED TO FIXER

### Items Confirmed Fixed

- [x] FAB label lifecycle end-to-end (`Send feedback → Capturing… → Sending… → Sent ✓ / Try again`) — confirmed at `packages/react-native/src/feedback-button.tsx:87-104` (`fabLabelForState` branches on `status` first), and `feedback-button.tsx:163` (single shared `useFeedback()` instance forwarded to the modal at `:226`). The dual-hook bug is genuinely gone — `FeedbackModal` accepts `feedback?: UseFeedbackResult` (`feedback-modal.tsx:109`) and prefers it over its local instance (`feedback-modal.tsx:141`). Tests at `feedback-button.test.tsx:383` ("flips the FAB label to 'Try again' after an ingest rejection (shared hook instance)") and `:411` ("flips the FAB label to 'Sent ✓' after a successful submit, then back to default on dismiss") pin both terminal transitions.
- [x] `ProjectConfig` re-exported from `packages/react-native/src/index.ts:66` (inside the `@tatlacas/brevwick-sdk` re-export block, with a comment justifying inclusion).
- [x] `<FeedbackButton disabled>` blocks `handleOpen` semantically — `feedback-button.tsx:183` (`if (disabled) return;`). Test at `feedback-button.test.tsx:152` invokes `fab.props.onPress()` directly and asserts `Modal.props.visible === false`.
- [x] `captureScreenshot()` rejection surfaces inline note + `console.warn` — `feedback-modal.tsx:209-220` matches the `screenshot.ts` `logFailure` pattern (`brevwick: screenshot capture failed in FeedbackModal: <reason>`). Test at `feedback-button.test.tsx:580` asserts both the inline note AND a single warn match.
- [x] Success-dismiss `setTimeout` cleared on manual cancel — `successDismissTimerRef` declared at `feedback-modal.tsx:172`, set at `:251`, cleared in `handleManualClose` at `:264-267`. Test at `feedback-button.test.tsx:460` advances fake timers past 2 s after Cancel and asserts the modal stays closed AND the draft persists (would-be-fired body would have wiped `description`).
- [x] `draftError` clears on `onChangeText` of all three text fields — `handleDescriptionChange`/`handleExpectedChange`/`handleActualChange` at `feedback-modal.tsx:280-291` each call `setDraftError(null)`. Test at `feedback-button.test.tsx:282` covers all three fields.
- [x] Bundle still under 25 kB ceiling — local `pnpm size` reports 5.84 kB ESM / 6.11 kB CJS for RN.
- [x] `.size-limit.js` has the RN entry — `.size-limit.js:153-169`, mirrors React adapter at 25 kB.
- [x] No Claude attribution — `git log edec282..d1c799d` and source-tree grep both clean.
- [x] No `Co-Authored-By` headers in commits.
- [x] PR diff scope is correct — `gh pr diff 100 --name-only` lists only `.changeset/rn-feedback-button.md`, `.size-limit.js`, `packages/react-native/src/**`, `packages/react-native/test/__mocks__/react-native.cjs`. No `packages/angular/src/lib/internal/version.ts` codegen artefact in the PR (the working-tree drift on it is local-only, regenerated by `node scripts/generate-version.mjs` during type-check, idempotent against `package.json#version`).
- [x] JSDoc updates landed — `position` divergence remark at `feedback-button.tsx:28-36`, style override clarification at `:58-62`, toggle persistence at `feedback-modal.tsx:117-123`.
- [x] Local `pnpm format:check`, `pnpm lint`, `pnpm type-check`, `pnpm --filter @tatlacas/brevwick-react-native test:cover`, `pnpm build`, `pnpm size` — all pass. Coverage 94.39% statements / 85.28% branches across 91/91 RN tests.

### Items Returned to Fixer

- [x] **`size-check` job on GitHub CI fails** — Resolved by adding `packages/react-native/dist` to the `actions/upload-artifact` `path` list in the `check` job of `.github/workflows/ci.yml`, mirroring the Angular precedent (PR #71, commit `c2060af`). The `size-check` job downloads the `package-dists` artefact by name, so the new entry rides along automatically without any download-side change. Original failure logs (for record):
  ```
  @tatlacas/brevwick-react-native (ESM)
    Size Limit can't find files at packages/react-native/dist/index.js
  @tatlacas/brevwick-react-native (CJS)
    Size Limit can't find files at packages/react-native/dist/index.cjs
   ELIFECYCLE  Command failed with exit code 1.
  ```
  Root cause was that `.size-limit.js` entries at lines 160-169 reference `packages/react-native/dist/index.{js,cjs}`, but `.github/workflows/ci.yml` (`check` job) did not include `packages/react-native/dist` in the `actions/upload-artifact` list. The `size-check` job runs `actions/download-artifact` to restore the dist/ tree from the `check` job and then runs `pnpm size` WITHOUT a fresh build — so the RN dist artefacts never reached the size-check runner.

### Independent Findings

None beyond the size-check CI regression above. The architecture (core stays framework-agnostic; RN adapter depends only on `@tatlacas/brevwick-sdk`), public-API surface (intentional, JSDoc-covered, tree-shakeable via `"sideEffects": false`), cross-runtime safety (no `window`/`document`/`process`/`Buffer`; `FileReader` feature-detected at `feedback-modal.tsx:51`), and redaction-mandatory contract (description/expected/actual flow through `submit()` → SDK redact pipeline; no local domain Error surface) are all intact.

### Tooling

- `pnpm format:check`: pass
- `pnpm lint`: pass
- `pnpm type-check`: pass (all 17 workspace projects)
- `pnpm --filter @tatlacas/brevwick-react-native test:cover`: pass (91/91, 94.39% stmt / 85.28% branch)
- `pnpm build`: pass
- `pnpm size`: pass locally (RN: 5.84 kB ESM / 6.11 kB CJS)
- `gh pr checks 100`: **FAIL** — `size-check` is `fail`. Other checks (`check` x2, `verify-signatures`, `codecov/patch`, `codecov/project`) all pass.
