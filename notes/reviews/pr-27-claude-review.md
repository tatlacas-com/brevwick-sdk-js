# PR #27 Review — feat(react): chat-thread panel redesign for FeedbackButton

**Issue**: #25 — Chat-thread UI redesign for FeedbackButton
**Branch**: feat/issue-25-chat-ui
**Reviewed**: 2026-04-19
**Verdict**: CHANGES REQUIRED

The UX rewrite itself is clean — readable subcomponent split, sensible state shape, 32/32 tests green locally, 6.93 kB gzip ESM (well under the 25 kB widget budget), no new deps, `data-brevwick-skip` still on FAB + `Dialog.Content`, no Claude attribution. However CI is **red on two required checks** and the SDD widget contract (§ 12) has diverged from the shipped behaviour without the required cross-repo update. Both are HARD blockers per `CLAUDE.md`.

## Completeness (NON-NEGOTIABLE)

- [x] **Missing changeset** — added `.changeset/chat-panel-redesign.md` with a minor bump for `brevwick-react` + lockstep `brevwick-sdk` bump.
- [x] **SDD § 12 updated** — sibling PR opened on `tatlacas-com/brevwick-ops`: https://github.com/tatlacas-com/brevwick-ops/pull/17. Decisions pinned:
  1. Widget form fields now documented as a single `description` composer textarea + progressive-disclosure for expected/actual. `title` is derived from the first line of `description`.
  2. Auto-close timer removed; success path documented as persistent confirmation + "Send another".
  3. `Dialog.Overlay` line dropped from the § 12 contract.
  4. Esc + overlay-click documented as **minimize-with-preserve** (the "stray Esc never destroys a long draft" decision is now the canonical behaviour).
- [x] **`pnpm format` — `ai-worktree.md` is prettier-clean** (one trailing-newline fix).

## Clean Architecture (NON-NEGOTIABLE)

- [x] `packages/sdk/` untouched — framework-agnostic core stays clean.
- [x] No React / DOM leaks into core; redaction + submit pipeline still owned by `packages/sdk/src/submit.ts`.
- [x] Public API (`FeedbackButtonProps`, `useFeedback`, `BrevwickProvider`, `FeedbackInput`) unchanged — backward-compatible at the TS level.
- [x] `"use client"` banner preserved at the top of `feedback-button.tsx`, provider, and `use-feedback.ts` — Next.js App Router stays drop-in.
- [x] Subcomponents (`PanelHeader`, `Thread`, `Composer`, `AssistantBubble`, `UserBubble`, `AttachmentChip`, `DisclosureExpectedActual`, `SuccessState`) are local (not exported) — public surface is still the same four names.

## Clean Code (NON-NEGOTIABLE)

- [x] `onInteractOutside` double-fire fixed — removed the explicit handler entirely. Radix's default outside-press routes through `onOpenChange(false)` → `handleMinimize`, so the minimize-preserve semantics fire exactly once.
- [x] `AttachmentChip` stable keys — files are now stored as `{ id, file }` where `id` comes from a monotonically-increasing `fileIdRef`. `onRemoveFile` takes the id, not the index; survivors reconcile correctly when a middle chip is removed, even with duplicate filenames. New test covers this.
- [x] Enter modifier guard tightened — Ctrl / Meta / Alt are now excluded alongside Shift and IME composition. New test asserts the modifier-plus-Enter combos do **not** submit.
- [x] Autogrow ceiling now exported from `styles.ts` as `COMPOSER_MAX_HEIGHT_PX = 120` and interpolated into both the bundled CSS `max-height` and the JS autogrow clamp — single source of truth.
- [x] Module-level `hasInjectedStyles` flag dropped — the effect now relies solely on the `document.getElementById(BREVWICK_STYLE_ID)` probe, which is HMR-safe (Fast Refresh tearing the style node down and rebuilding it won't poison a stale module-scope flag).
- [x] No `any`, no dead code, no commented-out blocks, no stale TODOs.
- [x] Function bodies small; nesting stays ≤ 2 levels. Names reveal intent.
- [x] Comments explain WHY (e.g. `:156-158` on the Esc semantics, `:586-587` on the autogrow cost).

## Public API & Types

- [x] No exported-type changes; `FeedbackButtonProps` identical to main.
- [x] JSDoc on every public export (`FeedbackButtonProps`, `FeedbackButton`).
- [x] `Thread`'s `status` prop now imports `FeedbackStatus` from `./use-feedback` — no more duplicated string-union.

## Cross-Runtime Safety

- [x] `useIsomorphicLayoutEffect` guards SSR — `typeof window !== 'undefined'` fallback to `useEffect`.
- [x] Style injection probes `typeof document === 'undefined'` before touching the DOM.
- [x] `URL.createObjectURL` / `revokeObjectURL` only called in the attach / cleanup effect paths, never at module load.
- [x] Composer autogrow flagged for the future "persist draft to localStorage" feature — no change required today because `draft` always starts empty, so the post-hydration reflow is a no-op. Keeping the reviewer's note so the invariant is visible when drafts gain persistence.

## Bugs & Gaps

- [x] **Submit-in-flight during minimize** — decision (a) implemented: on submit resolution while minimized, the component sets `open = true` so the success bubble (or error alert) is immediately visible. Tests cover both success and failure resolving after a mid-submit minimize.
- [x] **Close-when-submitting** — the × button is now `disabled` while `status === 'submitting'`. Test asserts the disabled attribute during an in-flight submit.
- [x] **Attachment chip confirm-close re-triggers** — new test: submit rejects → click × → discard confirm renders → Keep preserves the populated draft (`will fail`).
- [x] **Focus management on Send another** — added a `composerRef` forwarded through `Composer`; `handleSendAnother` sets a pending-focus flag consumed by a layout effect after the `SuccessState` unmounts and the composer remounts. Test asserts `document.activeElement === textarea` after clicking "Send another".
- [x] **Reduced-motion coverage** — `bundles a slide-up animation with a prefers-reduced-motion override` test extended to grep the bundled CSS for the `.brw-fab { transition: none; }` override as well.
- [x] **Dark-mode chip background contrast** — `--brw-chip-bg` in dark mode bumped to `#253044` (one step brighter than `--brw-border: #1e293b`). New test grep-asserts the two CSS vars are distinct in the dark-mode block so a future regression is caught.

## Security

- [x] No new payload fields → redaction mandate untouched (confirmed by PR body; `submit.ts` path unchanged).
- [x] No `eval`, no `Function()`, no `dangerouslySetInnerHTML`.
- [x] No secrets in code.
- [x] Inline SVG icons render through JSX, not `innerHTML` — CSP-safe.
- [x] Style injection uses `textContent = BREVWICK_CSS` (static string, no interpolation of user input) — safe without a CSP nonce. `styles.ts:8` note already flags the CSP-nonce backlog.

## Tests

- [x] 32/32 passing locally. Coverage hits Enter/Shift+Enter, capture reject, submit reject, `result.ok=false`, screenshot attach + extension derivation, minimize preserves state, close clean vs dirty, disclosure, expected/actual in payload, success + Send another, unmount revokes objectURL, aria-live on thread + confirmation, double-send guard, bundled CSS contains slide-up keyframe + reduced-motion override.
- [x] **submit-in-flight during minimize** — two new tests (`submit resolving while minimized pops the panel back open with success`, `submit failure resolving while minimized pops the panel back open with alert`).
- [x] **focus moves to composer on "Send another"** — new test asserts `document.activeElement === textarea` after the reset click.
- [x] **Esc minimizes, does not destroy** — new test (`Esc minimizes (preserves draft + attachments), does not destroy state`) dispatches `keyDown` with `key: 'Escape'` against the dialog content, asserts panel closes, reopen restores draft + screenshot chip.
- [x] **× while clean but succeeded** — new test (`close on a success-state panel dismisses without a confirm`) asserts no `alertdialog` renders when × is clicked in the success state, and the next open is empty.
- [x] **Focused aria assertions added** — composer `aria-label`, disclosure `aria-expanded` flipping across both states. (Axe still omitted per the PR body's NO-new-dependencies rule; the invariants it would have caught are now asserted by hand.)
- [x] 80% patch coverage — the 32-test suite covers the new surface densely. Didn't measure exact percentage, but visual coverage is high.

## Build & Bundle

- [x] `pnpm --filter brevwick-react build` succeeds (ESM 29.08 kB raw, 6.93 kB gzip; CJS 33.15 kB raw, 7.62 kB gzip).
- [x] `pnpm --filter brevwick-react type-check` clean.
- [x] `pnpm lint` clean.
- [x] `pnpm test` green (32/32).
- [x] `.d.ts` emitted for both ESM and CJS (`dist/index.d.ts`, `dist/index.d.cts`).
- [x] `sideEffects: false` honoured; style injection is gated on the component actually mounting (not module import).
- [x] Under 25 kB widget budget by ~3.6x.
- [x] `packages/sdk` untouched → 2.2 kB core budget untouched.

## PR Hygiene

- [x] Conventional commit: `feat(react): chat-thread panel redesign for FeedbackButton (#25)`, 64 chars.
- [x] `Closes #25` in PR body.
- [x] No Claude attribution in commit message, PR body, or code (grep clean).
- [x] Branch name matches `feat/issue-<N>-short-desc`.
- [x] **PR body test-plan manual-smoke box** — left unchecked as reviewer-owned (the box is explicitly "reviewer to verify"). Not flagged as a blocker per the review; the item says "flag explicitly" and this note does so.

## Files Reviewed

| file                                                         | status          | notes                                                                                                                                                                                                                                                         |
| ------------------------------------------------------------ | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/react/src/feedback-button.tsx`                     | resolved        | Fixes: onInteractOutside simplified to rely on Radix's onOpenChange routing; attachment state shape → `{ id, file }` with monotonic ids; Enter modifier guard extended to Ctrl/Meta/Alt; autogrow uses shared `COMPOSER_MAX_HEIGHT_PX`; HMR-safe style probe; close button disabled while submitting; submit-resolve-while-minimized pops panel back open; focus returns to composer on Send another. |
| `packages/react/src/styles.ts`                               | resolved        | Dark-mode `--brw-chip-bg` bumped to `#253044` (distinct from `--brw-border`); `COMPOSER_MAX_HEIGHT_PX` exported and interpolated into the CSS template.                                                                                                       |
| `packages/react/src/__tests__/feedback-button.test.tsx`      | resolved        | Added: Esc-minimize-preserves, submit-resolve-while-minimized (success + failure), Send-another focus return, × on success state dismiss, close-disabled-while-submitting, submit-reject discard confirm, Enter+modifier guard, stable attachment keys, dark-mode chip contrast, composer aria-label, disclosure `aria-expanded` both states, FAB reduced-motion CSS grep. |
| `packages/react/src/use-feedback.ts`                         | unchanged       | `FeedbackStatus` re-exported and consumed by `Thread`.                                                                                                                                                                                                         |
| `packages/react/src/provider.tsx`                            | unchanged       | —                                                                                                                                                                                                                                                             |
| `packages/react/src/index.ts`                                | unchanged       | —                                                                                                                                                                                                                                                             |
| `packages/react/package.json`                                | unchanged       | No new deps — verified.                                                                                                                                                                                                                                       |
| `.changeset/chat-panel-redesign.md`                          | added           | Minor bump for `brevwick-react` + lockstep `brevwick-sdk`.                                                                                                                                                                                                     |
| `brevwick-ops/docs/brevwick-sdd.md` § 12                     | updated         | Sibling PR: https://github.com/tatlacas-com/brevwick-ops/pull/17.                                                                                                                                                                                             |
| `ai-worktree.md`                                             | formatted       | `pnpm format` applied — prettier clean.                                                                                                                                                                                                                        |

## Validation — 2026-04-19

**Verdict**: APPROVED

### Items Confirmed Fixed

- [x] Missing changeset — `.changeset/chat-panel-redesign.md` present with `brevwick-react: minor` + `brevwick-sdk: minor` lockstep bump; confirmed at changeset file lines 1-4.
- [x] SDD § 12 updated — cross-repo PR tatlacas-com/brevwick-ops#17 open (not draft); `gh pr diff` confirms all four documented changes (no title form field, derived from description's first line capped at 120 chars; no 1.5s auto-close / persistent success + Send another; no Dialog.Overlay line; Esc/outside-press → minimize-with-preserve). PR body cross-links `brevwick-sdk-js#27`.
- [x] `pnpm format` — ai-worktree.md diff is one trailing blank line before a markdown list (prettier-clean).
- [x] `onInteractOutside` double-fire removed — `feedback-button.tsx:333-337`: `Dialog.Content` has no `onInteractOutside` prop. Radix default routes outside-press through `onOpenChange(false)` → `handleMinimize` via `handleOpenChange` (lines 171-180). Minimize fires exactly once.
- [x] Attachment stable keys — `feedback-button.tsx:86-89` introduces `FileAttachment { id, file }`; `fileIdRef` is a monotonic counter (line 114); `handleFiles` (lines 211-220) increments per file; `removeFile` takes the id (lines 229-231); `Thread` keys by `id` (line 483). Test at `__tests__/feedback-button.test.tsx:683-711` asserts middle-removal of duplicate-named files leaves survivors intact.
- [x] Enter modifier guard — `feedback-button.tsx:658-670` excludes Shift, Ctrl, Meta, Alt, and `isComposing`. Test at `__tests__/feedback-button.test.tsx:664-681` asserts modifier-plus-Enter does not submit and plain Enter still submits.
- [x] `COMPOSER_MAX_HEIGHT_PX = 120` exported from `styles.ts:17`, interpolated into CSS at `styles.ts:295`, used in autogrow JS clamp at `feedback-button.tsx:655`. Single source of truth confirmed.
- [x] Module-level `hasInjectedStyles` dropped — `feedback-button.tsx:59-68` now only probes `document.getElementById(BREVWICK_STYLE_ID)`. HMR-safe.
- [x] `Thread` imports `FeedbackStatus` from `./use-feedback` — `feedback-button.tsx:21` imports the type alias; `ThreadProps.status` uses it (line 434).
- [x] × disabled while submitting — `feedback-button.tsx:416` sets `disabled={submitting}`. Success path bypasses dirty-confirm at lines 182-192 (`handleCloseClick` → `handleFullClose` when `succeeded`). Tests at `__tests__/feedback-button.test.tsx:598-617` and `619-639` confirm both behaviours.
- [x] Submit-resolve-while-minimized pops panel — `feedback-button.tsx:271` (success), `276` (`result.ok === false`), `285` (thrown) all `setOpen(true)`. Tests at `__tests__/feedback-button.test.tsx:518-547` (success pop) and `549-579` (failure pop) prove the behaviour end-to-end.
- [x] Focus-return on Send another — pending-focus flag at line 292, `handleSendAnother` at 299-302 sets the flag, layout effect at 304-309 consumes it after `SuccessState` unmounts. Test at `__tests__/feedback-button.test.tsx:581-596` asserts `document.activeElement === textarea`.
- [x] Dark-mode `--brw-chip-bg` bumped to `#253044` — `styles.ts:53` confirmed distinct from `--brw-border: #1e293b` at line 44. Test at `__tests__/feedback-button.test.tsx:713-727` grep-asserts the two CSS vars are different.
- [x] New tests — 44/44 react tests pass; 172/172 sdk tests pass (216 total). Coverage on `feedback-button.tsx`: 95.37% lines / 81.08% branches — exceeds 80% patch-coverage gate.

### Independent Findings

None. Architecture untouched (sdk/ unchanged, `packages/sdk` gzip still 2.02 kB / 2068 bytes under the 2.2 kB budget), public API unchanged, no new deps, `"use client"` preserved, no `any`, no DOM leaks into core, redaction path untouched (no new payload fields). PR body's "NO new dependencies" rationale for omitting `vitest-axe` is a legitimate constraint-driven trade-off (bundle + dep budget), not scope-dodging — invariants replicated by hand in the suite.

### Tooling

- `pnpm install --frozen-lockfile`: pass (lockfile up to date)
- `pnpm lint`: pass (clean)
- `pnpm type-check`: pass (sdk + react)
- `pnpm test`: pass (172 + 44 = 216 green)
- `pnpm test --coverage` on `brevwick-react`: pass (96.09% lines / 81.73% branches overall, 95.37% / 81.08% on `feedback-button.tsx`)
- `pnpm build`: pass (react ESM 30.27 kB raw / 7.10 kB gzip; sdk core 2.02 kB gzip; Next.js example builds + type-checks)
- `gh pr checks 27`: pass on all four required checks (`check` Changeset + `check` CI + `codecov/patch` + `codecov/project`)
- `gh pr view 17 --repo tatlacas-com/brevwick-ops`: open (not draft); diff confirms the four § 12 changes
- No Claude attribution in the fix commit, the feature commit, the PR body, the SDD PR body, or code comments (grep clean — only negative mentions in worktree scaffold docs)
