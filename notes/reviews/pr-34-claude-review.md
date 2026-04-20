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
