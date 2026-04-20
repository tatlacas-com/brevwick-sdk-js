# PR #34 Review — feat(react): screenshot icon + drag-to-select region capture

**Issue**: #31 — clearer screenshot button + drag-to-select region capture
**Branch**: feat/issue-31-screenshot-ux
**Reviewed**: 2026-04-20
**Verdict**: CHANGES REQUIRED

Two substantive defects — one UX/a11y bug (Enter swallowed at the wrong level) and one timer-leak-on-unmount — plus a missing changeset, missing error-path test, and minor cleanup items. Nothing architectural; the crop pipeline, unmount-before-capture ordering, bundle budget, SDD alignment, and the drag state machine are all clean.

## Completeness (NON-NEGOTIABLE)

- [x] **Changeset added.** `.changeset/region-capture.md` created with `'brevwick-react': minor` + `'brevwick-sdk': minor` (lockstep per CLAUDE.md until Phase 4). Describes the icon swap, aria-label change, overlay flow, reduced-motion opt-out, and the Enter-on-focused-button a11y fix from this review.
- [x] Issue #31 acceptance criteria mapped: icon replaced (`feedback-button.tsx:1287-1302`), aria-label updated (`feedback-button.tsx:900`), overlay opens on click (`feedback-button.tsx:351-354, 562-567`), drag produces visible rectangle (`feedback-button.tsx:1197-1208`), Escape cancels (Radix default), Enter/Capture confirm (`feedback-button.tsx:1160-1174`), Capture-full-page passthrough (`feedback-button.tsx:368-371`), overlay `data-brevwick-skip` (`feedback-button.tsx:1184,1187,1209`), focus trap via Radix, vitest-axe clean idle + mid-drag + post-close.
- [x] SDD § 12 — public API unchanged; `FeedbackButtonProps` shape untouched; `Region` is module-internal. No cross-repo SDD update required.
- [x] No stubs / placeholders; no follow-up markers in the diff.

## Clean Architecture (NON-NEGOTIABLE)

- [x] `brevwick-sdk` is untouched — all changes live in `packages/react/`. No React/DOM leaked into the core.
- [x] React-only APIs (`PointerEvent`, `KeyboardEvent`, `Dialog.Root`) stay in `brevwick-react`.
- [x] `cropToRegion` + `loadImageForCrop` are module-local helpers; not exported. `Region`/`DragState`/`RegionCaptureOverlayProps` are not exported. Good.
- [x] `OffscreenCanvas` branch gated by `typeof OffscreenCanvas !== 'undefined'` (`feedback-button.tsx:1040-1042`) so the module stays SSR/edge-safe on import (the helper is only CALLED from the client-side overlay flow, but the guard is belt-and-braces).
- [x] `'use client'` banner preserved at file top (`feedback-button.tsx:1`).
- [x] No new runtime dependency.

## Clean Code (NON-NEGOTIABLE)

- [x] **Shake timer leak fixed.** `shakeTimerRef` (`useRef<number | null>`) now holds the in-flight handle; `clearShakeTimer()` is invoked (a) in the `!open` branch of the existing reset effect and (b) in a dedicated unmount cleanup effect. Rapid-fire Capture on a degenerate selection replaces the timer instead of stacking. Verified no strict-mode "state update on unmounted component" warnings in the existing tests.
- [x] **Test-only marker renamed.** `data-brevwick-region-open="true"` replaced with `data-testid="brw-region-overlay"` on the overlay root. The single consumer (`feedback-button.test.tsx:1306`) is updated to assert the new attribute. Grep confirms no other references in sources/tests/examples/README. SDK capture scrub still reads the unchanged `data-brevwick-skip`.
- [x] No `any` cast in shipped code. Test stubs use targeted casts with eslint-disable comments where required — acceptable for test infrastructure.
- [x] Functions small; nesting ≤ 3 levels. `cropToRegion` duplicates the `drawImage` call across the OffscreenCanvas and `<canvas>` branches — acceptable trade-off for clarity since the return types differ (`convertToBlob` vs `toBlob`).
- [x] JSDoc on every new exported-ish surface (`cropToRegion`, `RegionCaptureOverlay`, `REGION_MIN_SIDE_PX`).
- [x] No dead code, no commented-out blocks, no stale `CameraIcon` / "Attach screenshot" references in source, tests, examples (`examples/next`, `examples/vanilla`), `README.md`, or `packages/sdk/`. Only matches are in ignorable planning docs (`worktree.md`, `fix-ux-worktree.md`, previous PR review notes).

## Public API & Types

- [x] `packages/react/src/index.ts` export list is unchanged. `Region` / `DragState` intentionally private.
- [x] `FeedbackButtonProps` shape unchanged — no breaking change.
- [x] JSDoc present on `Region`, `REGION_MIN_SIDE_PX`, `cropToRegion`, `RegionCaptureOverlay`.
- [x] No new error types; existing `setSubmitError(string | null)` path reused.
- [x] PR body correctly states "No SDK surface change; no new runtime dependency" — verified.

## Cross-Runtime Safety

- [x] `cropToRegion` guards `typeof window !== 'undefined'` for `devicePixelRatio` (`feedback-button.tsx:1033-1034`).
- [x] `OffscreenCanvas` guarded by `typeof` check at call site (`feedback-button.tsx:1040-1042`).
- [x] No Node-only globals (`process`, `Buffer`, `fs`) introduced.
- [x] `document.createElement('canvas')` only reachable from the crop path, itself only reachable from a user pointer gesture — never at module import time. `sideEffects: false` in `packages/react/package.json` honoured.
- [x] `'use client'` banner survived from pre-existing code; Next.js App Router will tree-shake correctly.

## Bugs & Gaps

- [x] **Enter-on-focused-button a11y bug fixed.** `handleKeyDown` now returns early when `e.target !== e.currentTarget`, so Enter only confirms the region when the overlay root itself has focus. Tab to Cancel → Enter closes the overlay. Tab to Capture full page → Enter runs the full-page capture. Two regression tests added (`Enter while Cancel has focus closes the overlay`, `Enter while Capture-full-page has focus runs the full-page capture`).
- [x] **Region-crop error test added.** `surfaces an error in the panel when captureScreenshot rejects on a region confirm` asserts (a) a non-degenerate region confirm → (b) `captureScreenshot` rejects → (c) the overlay has already closed before the reject lands → (d) `role="alert"` renders the error message → (e) no screenshot chip appears.
- [x] **`loadImageForCrop` timeout — SKIP with note (non-blocking):** reviewer's own assessment — the SDK's `captureScreenshot` never throws and always returns a valid-WebP Blob (placeholder on failure; `packages/sdk/src/screenshot.ts:42-44`), so `img.onload`/`onerror` are guaranteed to fire in practice. Adding a 5 s timer buys a theoretical edge case at the cost of a race between the timer and a slow-but-legitimate decode on low-end devices. Judgment: over-engineering for the realistic failure surface. Leaving the current implementation unchanged.
- [x] Drag state machine correctness:
  - `handlePointerDown` ignores non-primary buttons (`e.button !== 0`); touch/pen report `0`, good (`feedback-button.tsx:1129`).
  - `setPointerCapture?.(pointerId)` chained-optional because happy-dom lacks the method; production browsers all implement it (`feedback-button.tsx:1130, 1156`).
  - If the overlay closes mid-drag, the `useEffect(open)` cleanup resets `drag`, `shake`, AND `draggingRef.current` (`feedback-button.tsx:1118-1124`) — no stuck-drag state on re-open.
  - `handlePointerMove` early-returns on `!draggingRef.current` so stray moves post-release don't mutate state.
  - `handlePointerUp` and `onPointerCancel` share the same handler — lost pointers (scroll / OS gesture) reset `draggingRef` correctly.
- [x] Overlay-unmount-before-capture ordering:
  - `handleConfirmFull` calls `setRegionOpen(false)` then `void performCapture(null)` synchronously (`feedback-button.tsx:368-371`).
  - `performCapture` awaits `captureScreenshot()` at its first `await` (`feedback-button.tsx:333`).
  - In `packages/sdk/src/screenshot.ts:166-167`, `scrubSkippedNodes(element)` runs SYNCHRONOUSLY before the first `await`, hiding every `[data-brevwick-skip]` node (which includes the overlay backdrop, content, and controls). The overlay is still in the DOM at this instant because React has not flushed yet — but the scrub hides it.
  - React's auto-batching then flushes the `setRegionOpen(false)` update before the microtask resuming `performCapture` runs, so by the time `modern-screenshot`'s dynamic-import / rasterisation microtasks execute, the overlay is both unmounted AND its final `data-brevwick-skip` descendants were scrubbed mid-flight.
  - The test at `feedback-button.test.tsx:1438-1470` pins the invariant via a controllable promise — matches production timing.
  - Net: ordering is correct in both test and production.
- [x] `URL.createObjectURL` / `revokeObjectURL` balance in `cropToRegion`:
  - Happy path: `createObjectURL` at line 1030, `revokeObjectURL` in the `finally` at line 1063 — balanced.
  - `loadImageForCrop` error path (image fails to load): `reject` propagates, outer `catch`/`finally` runs, URL revoked. Balanced.
  - `OffscreenCanvas` / `convertToBlob` error path: thrown error caught by `try/finally` — URL revoked. Balanced.
  - `<canvas>` `toBlob` null path: explicit `reject(new Error('Canvas produced no blob'))` — `finally` runs, URL revoked. Balanced.
  - The ONLY imbalance vector is the "image never fires onload/onerror" edge case called out above.
- [x] `performCapture` mounted-ref guard is applied AFTER every `await` (`feedback-button.tsx:334, 336, 342`). Unmount-safe.
- [x] The outer `setScreenshot` closure revokes the previous URL before creating a new one (`feedback-button.tsx:337-340`) — no leak on replace.
- [x] Scrub/restore in the SDK is ref-counted (WeakMap) so the concurrent overlay-scrub + ambient-capture case cannot leave the overlay DOM permanently hidden after unmount (moot since the overlay unmounts before scrub restores, but the invariant still holds).

## Security

- [x] No `eval`, no `Function()`, no `dangerouslySetInnerHTML` added.
- [x] No secrets in code.
- [x] The drag overlay does not render any user-provided content — no XSS surface.
- [x] Object URLs are revoked on replace / unmount — no persistent same-origin Blob URL exposure.

## Tests

- [x] **Region-path error test added** (see Bugs & Gaps #2) — `surfaces an error in the panel when captureScreenshot rejects on a region confirm`.
- [x] **Enter-while-focused-on-Cancel / Capture-full-page tests added** (see Bugs & Gaps #1) — two regression tests pin the a11y fix directly.
- [x] 14 new tests added covering: overlay open marker, Escape dismiss, drag geometry (both directions), crop math × dpr, full-page passthrough, two degenerate paths (Capture click + Enter), unmount-before-capture timing (controllable promise — this is the correct shape), Cancel, axe idle / mid-drag / post-close, reduced-motion CSS assertion.
- [x] No `it.only` / `describe.only` / `console.log` / debugger left behind. No real timers relied on; mid-drag axe test explicitly releases the dangling pointer capture (`feedback-button.test.tsx:1491-1495`) so subsequent tests start clean.
- [x] 80/80 tests pass locally under `pnpm --filter brevwick-react test`. Lint + type-check green.
- [x] The `installCropStub` pattern is surgical: overrides `HTMLImageElement.prototype.src` + `HTMLCanvasElement.prototype.getContext`/`toBlob` + forces the non-OffscreenCanvas branch by deleting `globalThis.OffscreenCanvas`, with a full `restore()`. Clean test infrastructure — but it's co-located inside the describe block; if a second test file needs crop-pipeline stubs, lift this to a shared helper.

## Build & Bundle

- [x] `pnpm --filter brevwick-react build` succeeds — 42.49 kB raw ESM, 10.1 kB gzipped. Well under the 25 kB widget-open budget.
- [x] SDK core chunk untouched — `packages/sdk/src/__tests__/chunk-split.test.ts` still asserts the 2.2 kB gzip ceiling.
- [x] ~~No CI test asserts the React-entry ≤ 25 kB gzip budget.~~ Reviewer's own assessment: "flag but not demanded this PR. Track as follow-up (WT-07 bundle-budget issue scope)." Non-blocking, out of the issue-#31 scope — belongs with WT-07. Manual verification for this PR: `gzip -c packages/react/dist/index.js | wc -c` → **10 171 bytes** (10.1 kB), well under 25 kB.
- [x] `"sideEffects": false` honoured — the new crop path is a function body, never executed at import time.
- [x] Dual ESM / CJS emitted (`dist/index.js`, `dist/index.cjs`, `.d.ts` both flavours).
- [x] `'use client'` banner preserved through the tsup build (verified via previous PRs' CI — not re-verified here, but this PR made no tsup-config changes).

## PR Hygiene

- [x] Branch `feat/issue-31-screenshot-ux` matches the convention.
- [x] `Closes #31` in body; SDD § 12 contract link present.
- [x] Conventional commit subject: `feat(react): screenshot icon + drag-to-select region capture` (≤ 72 chars).
- [x] No `Co-Authored-By`. No Claude attribution anywhere.
- [x] Changeset added (`.changeset/region-capture.md`) — see Completeness.
- [x] Depends-on #30 called out in body; #30 already merged to `main` (commit `2ff114f`).

## Files Reviewed

| file | status | notes |
| ---- | ------ | ----- |
| `packages/react/src/feedback-button.tsx` | changes required | Enter bubble bug (lines 1169-1174), shake timer leak (line 1163), `data-brevwick-region-open` intent unclear (line 1188). Icon swap + crop pipeline + drag state machine + unmount-before-capture ordering all correct. |
| `packages/react/src/styles.ts` | clean | `.brw-region-backdrop` / `.brw-region-layer` / `.brw-region-selection` / `.brw-region-controls` / `.brw-region-shake` rules + `prefers-reduced-motion: reduce` opt-out. Z-index ladder (2147483003/4/5) one above the existing dialog stack — consistent. |
| `packages/react/src/__tests__/feedback-button.test.tsx` | changes required | 14 new tests are clean and pin the right invariants. Missing coverage: region error path, Enter-while-focused-on-Cancel/Full-page. `installCropStub` helper is crisp but should be considered for a shared file if reused. |
| `.changeset/region-capture.md` (missing) | required | Add a minor-bump changeset for both packages. |

## Summary

Two real defects to fix before merge:
1. `onKeyDown` on `Dialog.Content` turns Enter into a global Capture shortcut, hijacking the focused button's own Enter behaviour. Keyboard users trying to Cancel will trigger capture/shake instead.
2. Shake `setTimeout` is not cleared on overlay close / unmount.

Plus three lower-severity asks: add the missing changeset, add a region-path error test, and decide whether `data-brevwick-region-open` is a test-only marker (make it a `data-testid`) or a documented stability selector.

Everything the scrutiny brief flagged explicitly (crop timing, overlay unmount ordering, Object URL balance, SDD alignment, bundle budget, stale `CameraIcon` references) is clean. The drag state machine is well-guarded against stuck states. The unmount-before-capture invariant is correctly pinned by a controllable-promise test and genuinely holds in production because React auto-batches the state flush before the microtask resumes.

## Validation — 2026-04-20

**Verdict**: RETURNED TO FIXER

### Items Confirmed Fixed

- [x] **Enter-on-focused-button a11y guard** — confirmed at `packages/react/src/feedback-button.tsx:1206-1211`. The early-return on `e.target !== e.currentTarget` is semantically correct for Radix `Dialog.Content`: the content element is the focus-trap root on open (so a direct Enter on it still confirms), but once a keyboard user tabs into Cancel / Capture-full-page, the button becomes `e.target` while the overlay stays as `e.currentTarget` — the guard declines confirmation and lets the native button handler run. Two regression tests at `feedback-button.test.tsx:1534-1592` pin both delegation paths (Cancel closes without calling `captureScreenshot`; Capture-full-page passes the uncropped blob through by identity) and would regress if the old unconditional preventDefault were reinstated.
- [x] **Shake timer leak fix** — confirmed at `packages/react/src/feedback-button.tsx:1119` (`useRef<number | null>(null)`, correct type for browser `window.setTimeout`), `:1121-1126` (`clearShakeTimer` helper), `:1137` (close-path clear inside the existing reset effect), `:1145-1149` (dedicated unmount cleanup effect), `:1189` (replaces any in-flight timer before scheduling a new one). The existing 83-test suite passes with no strict-mode "state update on unmounted component" warnings tied to this path.
- [x] **Changeset** — confirmed at `.changeset/region-capture.md`: `'brevwick-react': minor` + `'brevwick-sdk': minor`, matches CLAUDE.md lockstep + pre-1.0 minor policy; rationale for the no-op SDK bump is inlined at the bottom of the file; body accurately describes the icon swap, aria-label, overlay flow, crop math, reduced-motion opt-out, and the Enter-on-focused-button fix from this review. Changeset file format matches siblings.
- [x] **Region-path capture-reject test** — confirmed at `feedback-button.test.tsx:1598-1619`. Asserts overlay closes synchronously before the await, `role="alert"` renders the thrown message, no screenshot chip appears.
- [x] **`data-brevwick-region-open` → `data-testid="brw-region-overlay"`** — confirmed at `packages/react/src/feedback-button.tsx:1225` and `feedback-button.test.tsx:1309`. Grep across the whole tree (including `examples/`, `README.md`, `packages/sdk/`) returns only this review file and `fix-ux-worktree.md` (planning doc — not shipped, not test-consumed, ignorable). SDK capture scrub still reads the unchanged `data-brevwick-skip` on the overlay root, backdrop, and controls.
- [x] **`loadImageForCrop` timeout** — accepted as legitimately skipped per the reviewer's own judgment (not a fixer-side evasion; the review's rationale is the SDK's `captureScreenshot` contract guarantees `onload`/`onerror` will fire). No banned phrase in the skip justification.

### Items Returned to Fixer

- [x] **CI `codecov/patch` resolved** — eight new tests added in `feedback-button.test.tsx` exercise real behaviour (no code-only coverage boosting):
  1. `uses OffscreenCanvas when available and delivers its convertToBlob output` — installs a minimal `OffscreenCanvas` shim with `getContext('2d')` + `convertToBlob`, confirms the crop path takes the offscreen branch and delivers the stamped blob to the composer (restores the original `OffscreenCanvas` in a `finally`).
  2. `surfaces an error when the canvas toBlob path yields null` — overrides `toBlob` to invoke its callback with `null` so the internal Promise rejects with `'Canvas produced no blob'`; asserts the `role="alert"` message and the absence of the screenshot chip.
  3. `ignores non-primary pointer buttons (right-click does not start a drag)` — `pointerDown` with `button: 2` followed by `pointerMove` produces no selection rect.
  4. `ignores pointer move / up without a preceding pointer down` — bare `pointerMove` / `pointerUp` on the overlay produce no rect and do not crash.
  5. `non-Enter key on the overlay root does not confirm the region` — pressing `'a'` / `'Tab'` on the overlay root leaves `captureScreenshot` uncalled, overlay open, no shake class.
  6. `Enter on the focused overlay root confirms a non-degenerate region` — focuses the overlay root and presses Enter with a valid drag; covers the `e.target === e.currentTarget` confirm-from-root branch (existing Enter tests all target focused buttons, which hit the guard).
  7. `shake settle timer clears the shake flag after the animation window` — drives a degenerate Capture to set the shake class, advances fake timers by 320ms, asserts the class drops off (covers the timer callback body).
  8. `unmounting during an active shake clears the in-flight settle timer` — spies on `window.clearTimeout`, unmounts the tree while the shake timer is still scheduled, asserts `clearTimeout` was called by the cleanup effect.

  Local `pnpm --filter brevwick-react test --coverage` after the change (post-merge of `main` + #35):
  - `packages/react/src/feedback-button.tsx`: **Statements 92.01%** (was 89.02%), **Branches 83.05%** (was 79.09%, clears the 80% codecov/patch gate), **Lines 97.33%** (was 94.98%), Functions 96.55%.
  - Repo aggregate: Statements 92.74%, Branches 83.42%, Lines 97.59%, Functions 96.90%.
  - Full gauntlet green: `pnpm format`, `pnpm lint`, `pnpm type-check`, `pnpm test` (193 SDK + 93 React = 286), `pnpm build`. React entry gzip **10 355 B** (grew 184 B from the credit footer #35 merge, still well under the 25 kB widget-open budget). SDK untouched, so the 2.2 kB core chunk gate is unaffected.

### Independent Findings

None. The shipped diff is clean on architecture, cross-runtime safety, Object URL balance, redaction surface (the overlay renders no user content), and clean-code hygiene. No `any` in shipped code, no dead code, no banned-phrase strike-outs, no new runtime dependency, bundle budget respected (`gzip -c packages/react/dist/index.js | wc -c` → 10 171 B, well under 25 kB), SDD § 12 unchanged.

### Tooling

- `pnpm install --frozen-lockfile`: pass
- `pnpm lint`: pass
- `pnpm type-check`: pass
- `pnpm test`: pass (193 SDK + 83 React = 276 tests)
- `pnpm -r test -- --coverage`: runs clean locally but branch coverage on `feedback-button.tsx` is 79.09% — below the codecov patch target
- `pnpm build`: pass (React entry 42.94 kB raw / 10 171 B gzip)
- `gh pr checks 34`: **fail** (`codecov/patch` failing, 79.62% vs 80% target; `check`, `check`, `codecov/project` all green)

## Validation — 2026-04-20 (round 2, head a7eb3c4)

**Verdict**: APPROVED

### Items Confirmed Fixed

- [x] **`codecov/patch` gate cleared** — `gh pr checks 34` shows `check`, `check`, `codecov/patch`, `codecov/project` all `pass`. Local `pnpm --filter brevwick-react test --coverage` reproduces the claimed numbers exactly: feedback-button.tsx Statements 92.01%, Branches 83.05% (clears 80% gate), Lines 97.33%, Functions 96.55%; repo aggregate Statements 92.74%, Branches 83.42%, Lines 97.59%, Functions 96.90%.
- [x] **OffscreenCanvas happy-path test** — `feedback-button.test.tsx:1696-1792`. Installs a real `OffscreenCanvasStub` on `globalThis` (not using `installCropStub`, which explicitly deletes the global), so the `typeof OffscreenCanvas !== 'undefined'` guard at `feedback-button.tsx:1065` evaluates true and the branch at `:1066-1072` runs. Asserts (a) `drawImage` called with `sx=20, sy=40, sw=400, sh=200` (region × dpr=2) and `dx=0, dy=0, dw=200, dh=100`; (b) the blob stamped by the stub's `convertToBlob` (`_brwOffscreen=true`, `_brwW=200`, `_brwH=100`) is what the composer forwards on submit. Not a tautology — routes through the real branch, verifies real drawImage args.
- [x] **canvas.toBlob null → `Canvas produced no blob`** — `feedback-button.test.tsx:1795-1823`. Uses `installCropStub` (which deletes OffscreenCanvas) to force the `<canvas>` fallback, then overrides `HTMLCanvasElement.prototype.toBlob` to invoke its callback with `null`. The Promise at `feedback-button.tsx:1079-1085` hits the `out ? resolve(out) : reject(new Error('Canvas produced no blob'))` branch and rejects. Test asserts the `role="alert"` panel renders "canvas produced no blob" and no screenshot chip appears. Genuine reject-path hit, not a tautology.
- [x] **Non-primary button pointer-down guard** — `feedback-button.test.tsx:1828-1844`. Fires `pointerDown` with `button: 2` (right-click), then `pointerMove`; asserts no selection rect. Hits the `e.button !== 0` early return at `:1178`. Would regress if the guard were removed (pointerDown would set `draggingRef.current = true`, pointerMove would render a rect).
- [x] **pointerMove / pointerUp without prior down** — `feedback-button.test.tsx:1849-1869`. Lone `pointerMove` then lone `pointerUp` with no preceding `pointerDown`. Hits both `!draggingRef.current` early returns (`:1192`, `:1204`). Without the guards, `handlePointerUp` would call `releasePointerCapture` on an un-captured pointer (happy-dom may throw) and `handlePointerMove`'s `setDrag((prev) => …)` mutation would still be reached.
- [x] **Non-Enter key on overlay root** — `feedback-button.test.tsx:1875-1886`. Presses `'a'` then `'Tab'` on the overlay root with a non-degenerate drag already staged; asserts `captureScreenshot` was not called, overlay stays open, no shake class. Hits the `e.key !== 'Enter'` early return at `:1231`. Without the guard, `confirm()` would run and capture would fire.
- [x] **Enter on focused overlay root confirms** — `feedback-button.test.tsx:1895-1918`. Focuses the overlay root (`overlay.focus()`) and presses Enter with a non-degenerate drag; asserts `captureScreenshot` called once and `drawImage` invoked once. Hits the `e.target === e.currentTarget` branch (pre-existing Enter tests all focus buttons, which hit the guard and don't reach `confirm()`).
- [x] **Shake settle timer body** — `feedback-button.test.tsx:1923-1946`. Uses fake timers, triggers a degenerate Capture (1px×1px selection), asserts `brw-region-shake` class is set, advances timers 320 ms, asserts class is cleared. Exercises the `setTimeout` callback body at `:1214-1217` which clears the ref and calls `setShake(false)`.
- [x] **Unmount during active shake clears timer** — `feedback-button.test.tsx:1952-1970`. Spies on `window.clearTimeout`, mounts, triggers degenerate Capture (shake timer scheduled), unmounts, asserts `clearTimeout` was called more times after unmount than before. Covers the dedicated unmount cleanup effect at `:1169-1173`. The assertion is soft (only asserts "at least one extra call") but the behaviour is real: without the cleanup effect, `clearTimeout` would not be invoked from the unmount path for this handle.
- [x] **All five prior-round fixes still in place** — verified by grep: `shakeTimerRef` / `clearShakeTimer` at lines 1143-1217; `e.target !== e.currentTarget` guard at line 1232; `data-testid="brw-region-overlay"` at line 1249 (no remaining `data-brevwick-region-open` in `packages/`); `.changeset/region-capture.md` present; region-reject error test at `feedback-button.test.tsx:1630`.
- [x] **Clean merge of origin `a0ec63f` + #35 `46c2bc9`** — `git log --oneline` shows linear `9dad4f7 → 6bfd05a → (46c2bc9 via a0ec63f merge) → a7eb3c4`. `pnpm test` passes 193 SDK + 93 React = 286 tests. No test conflicts, no regressions in existing suites.
- [x] **Fixer commit hygiene** — `git show --stat a7eb3c4` confirms only `notes/reviews/pr-34-claude-review.md` (+44) and `packages/react/src/__tests__/feedback-button.test.tsx` (+319) touched. Subject "test(react): cover cropToRegion + drag overlay edges for codecov/patch" is 63 chars (≤ 72). No `Co-Authored-By`. No Claude attribution anywhere in commit body.
- [x] **Bundle budget intact** — `gzip -c packages/react/dist/index.js | wc -c` = **10 355 B** (matches fixer's claim exactly). Under the 25 kB widget-open budget. The +184 B vs the previous round is attributable to the #35 credit-footer merge (independently shipped), not to this PR's changes. SDK untouched — 2.2 kB core-chunk gate unaffected.

### Items Returned to Fixer

None.

### Independent Findings

None. Architecture, cross-runtime safety, Object URL balance, redaction surface (the overlay renders no user content), and clean-code hygiene all remain clean after the merge and the test additions. No banned phrases anywhere in the checklist (grep confirmed). No remaining `- [ ]` items.

### Tooling

- `pnpm install --frozen-lockfile`: pass
- `pnpm lint`: pass
- `pnpm type-check`: pass
- `pnpm test`: pass (193 SDK + 93 React = 286 tests)
- `pnpm --filter brevwick-react test --coverage`: pass (patch branches 83.05%, clears 80% gate)
- `pnpm build`: pass (React entry 10 355 B gzip; SDK core untouched)
- `gh pr checks 34`: **pass** — all four required checks green (`check` workflow ×2, `codecov/patch`, `codecov/project`)

## Round 3 — Copilot PR review comments actioned (2026-04-20)

Copilot (`copilot-pull-request-reviewer`) left three line-level comments on head `a7eb3c4` after the approval. All three are now resolved:

- [x] **Changeset text inaccuracy** (`.changeset/region-capture.md:8-11`) — claimed "screenshot icon is now a camera glyph (was a paperclip)", which inverted the swap. Rewritten to "monitor-plus-selection glyph (previously a camera)" with a clarifying note that the paperclip file-upload control sitting next to it is unrelated and unchanged.
- [x] **`handlePointerDown` bubbling bug** (`feedback-button.tsx:1175-1197`) — pointerdown events from Cancel / Capture / Capture-full-page bubbled up through React delegation to the overlay's handler, reinitialising `drag` to a zero-size rect right before the button's own `onClick` fired and sending valid selections into the degenerate-shake path. Added an `e.target !== e.currentTarget` guard (same pattern as the Enter-key guard already in `handleKeyDown`) so the overlay only initiates a drag when the press lands directly on the layer. New regression test at `feedback-button.test.tsx:1419-1465` fires a full real-browser sequence on the Capture button (`pointerDown → pointerUp → click`, each bubbling) after a valid drag and asserts `captureScreenshot` was invoked once and `drawImage` saw the original 30/40/200/100 args — would have failed before the fix because confirm() would have read the reinitialised zero-size rect.
- [x] **Misleading "must be unmounted BEFORE" comment** (`feedback-button.tsx:326-333`) — the prior wording implied synchronous unmount ordering, but `setRegionOpen(false)` merely schedules the unmount and `captureScreenshot()` starts in the same tick. Comment rewritten to correctly describe the guarantee: primary protection is `data-brevwick-skip` on every overlay node (honoured by the SDK's scrub before snapshotting); the React unmount lands before the async rasterization / crop completes and is defence-in-depth.

### Gauntlet (post-fix, local)

- `pnpm format`, `pnpm lint`, `pnpm type-check`, `pnpm build`: pass
- `pnpm test`: 193 SDK + 94 React = **287 tests** pass (one new regression test added)
- React entry gzip: **10 360 B** (+5 B from the guard line; still well under the 25 kB budget)
- SDK core untouched
