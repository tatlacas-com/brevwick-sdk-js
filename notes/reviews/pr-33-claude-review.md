# PR #33 Review — feat(react): light/dark theming + composer shell polish

**Issue**: #30 — feat(react): light/dark theming + host-app awareness + composer polish
**Branch**: feat/issue-30-theming
**Base**: main
**Reviewed**: 2026-04-20
**Verdict**: **CHANGES REQUIRED** → all items resolved.

Locally `pnpm --filter brevwick-react test` is green (66/66, +1 for the new contrast guard), `pnpm --filter brevwick-react build` succeeds (8463 B gzip, under the 25 kB budget), `pnpm lint` clean, `pnpm --filter brevwick-react type-check` clean. Remote CI on the follow-up push: both `check` jobs green.

---

## Completeness (NON-NEGOTIABLE)

- [x] Every colour / background / shadow in `styles.ts` reads from a `--brw-*` custom property — the hex-literal audit test enforces this.
- [x] Light default + `@media (prefers-color-scheme: dark)` swap.
- [x] Host-override contract: `body { --brw-accent: hotpink }` swaps the send button — `packages/react/src/__tests__/feedback-button.test.tsx:1027` asserts this via `getComputedStyle` on the portaled send button.
- [x] Composer shell + `:focus-within` ring present at `packages/react/src/styles.ts:315-327`.
- [x] Textarea autogrow unchanged; `align-items: flex-end` on the shell keeps the send bottom-aligned.
- [x] Bundle ≤ 25 kB gzip: measured **8341 B** locally (PR body quotes 8347, within rounding).
- [x] **Public-API contract gap in JSDoc** — JSDoc on `FeedbackButton` now lists `--brw-bubble-user-fg` (paired with `--brw-bubble-user-bg`) and `--brw-divider`; accent pairing-rule documented too.
- [x] **SDD § 12 not updated.** brevwick-ops PR #21 adds a full "Theming contract" subsection to § 12 (public token table + widget-internal tokens + pairing rules + host-override example + reduced-motion). Cross-repo PR is linked from this PR's body.
- [x] `use_ai` / submitter-choice code paths untouched.

## Clean Architecture (NON-NEGOTIABLE)

- [x] Core SDK (`packages/sdk`) untouched. All changes scoped to `packages/react/src/**`.
- [x] No React / JSX / DOM leak into core.
- [x] No new public runtime export added to `packages/react/src/index.ts`; `BREVWICK_CSS` / `BREVWICK_STYLE_ID` / `COMPOSER_MAX_HEIGHT_PX` remain internal (tests import them by module path, not from the package entry). Good.
- [x] Tree-shakeable; `"sideEffects": false` preserved.
- [x] DI preserved — no outside-world calls introduced.

## Clean Code (NON-NEGOTIABLE)

- [x] **Dead token**: `--brw-success` removed from `styles.ts`. `--brw-error` remains (it has a consumer at `.brw-error`).
- [x] **Dark-mode status tokens missing**: after removing `--brw-success`, only `--brw-error` is declared as a status colour. Added a comment on the light declaration explaining the red reads adequately on the dark `--brw-panel-bg` so the token is intentionally carried through (no dark-block override).
- [x] **`expect.extend` interposed between imports** — moved to `packages/react/vitest.setup.ts`; feedback-button.test.tsx's imports are now contiguous again.
- [x] **Flat-out duplicated cast** — replaced by a single ambient `src/__tests__/vitest-axe.d.ts` that augments vitest 4's `Assertion` interface. Both axe specs now call `expect(results).toHaveNoViolations()` directly and type-check.
- [x] No `any` introduced; casts are narrow and commented.
- [x] Names reveal intent (`--brw-fg-muted` rename is clearer than the old `--brw-muted`).
- [x] No commented-out code, no TODOs, no stubs.

## Public API & Types

- [x] **`vitest-axe` type augmentation — cleaner path exists.** Implemented at `packages/react/src/__tests__/vitest-axe.d.ts` (placed under `__tests__` so tsup's dts bundler does not leak it into the published `dist/*` types). Both axe specs now type-check with a direct `expect(results).toHaveNoViolations()` call.

- [x] **JSDoc token list incomplete** — addressed under Completeness.

- [x] No new props added. `FeedbackButtonProps` interface unchanged.

## Cross-Runtime Safety

- [x] `useBrevwickStyles` still guards `typeof document === 'undefined'` (line 64 of `feedback-button.tsx`) — SSR-safe.
- [x] No new `window`/`document` access added to non-effect code paths.
- [x] No Node-only globals introduced.
- [x] `"use client"` banner preserved on `feedback-button.tsx`.

## Bugs & Gaps

- [x] **Hover box-shadow regression on FAB**. Pruned `box-shadow` from the `.brw-fab` transition list — only `transform` was animating anyway, so transitioning a static shadow was wasted paint budget. Design choice: hover lift is transform-only, rest shadow stays; inline comment records the intent.
- [x] **axe tests do not exercise contrast in either theme.** BOTH remediations applied: (a) added an inline comment in the describe block stating that the axe specs guard structural a11y (role / aria / accessible-name) only, since happy-dom can't evaluate `@media` against stubbed matchMedia and axe marks `color-contrast` inapplicable without a layout engine; (b) added a dedicated `dark-mode bubble-user / accent pairs meet WCAG AA contrast` test that pulls the dark palette straight out of `BREVWICK_CSS`, computes the WCAG 2.x contrast ratio, and asserts ≥ 4.5:1 for `--brw-bubble-user-bg / --brw-bubble-user-fg` and `--brw-accent / --brw-accent-fg`. Works without a layout engine.
- [x] **Accent/foreground pairing foot-gun**. JSDoc on `FeedbackButton` now explicitly calls out that `--brw-accent` + `--brw-accent-fg` MUST be set together, and `--brw-bubble-user-bg` + `--brw-bubble-user-fg` likewise. The SDD § 12 pairing-rules section mirrors this. Computed contrast-safe accent-fg is intentionally NOT implemented (more complex, review says "not required").
- [x] No race conditions introduced. The `useBrevwickStyles` effect and autogrow effect unchanged.

## Security

- [x] No `eval` / `Function()` / `dangerouslySetInnerHTML`.
- [x] Test-only stylesheet injection uses `textContent` (not `innerHTML`) at `feedback-button.test.tsx:1022-1024`. Good.
- [x] No secrets; no new network paths.
- [x] **CSP**: ~~acknowledged as "no new CSP risk; flagging for awareness"~~ — the existing SDD `<style>` + nonce-prop-backlog note on § 12 still stands; this PR does not widen the surface.

## Tests

- [x] 65 / 65 tests pass locally (`pnpm --filter brevwick-react test`).
- [x] New describe block covers the main new surface area: token consumption, shell wrapping, autogrow, hex-audit, and axe smoke.
- [x] **Brittle hex-audit regex** — replaced the `[\s\S]*?\n\s*}` regex with a `stripTokenBlocks` helper that walks balanced braces from each `:where(:root) {`. Whitespace / single-line / extra-nesting refactors can no longer silently mis-strip the token block and bleed hex defaults into the class-rules residue.
- [x] **Panel-bg test mixes unmount / remount between assertions.** Reviewer confirms "currently passes, low priority". `screen.getByRole('dialog')` throws on multiple matches under React Testing Library, so a stale portal would surface as a test failure rather than a silent pass — the risk the reviewer flagged cannot manifest silently. No code change needed beyond the acknowledgement.
- [x] **Autogrow test does NOT verify the autogrow value.** Now spies on `HTMLElement.prototype.scrollHeight` to return a value above `COMPOSER_MAX_HEIGHT_PX`, triggers the autogrow effect, and asserts `style.height === \`${COMPOSER_MAX_HEIGHT_PX}px\`` — catches both a regression that drops the effect (empty string) and one that silently removes the clamp.
- [x] Cleanup in the describe-local afterEach (lines 998-1018) is thorough.

## Build & Bundle

- [x] `pnpm --filter brevwick-react build` succeeds.
- [x] `.d.ts` emitted, dual ESM / CJS outputs intact.
- [x] Gzipped ESM entry: **8341 B** — well under the 25 kB budget.
- [x] `sideEffects: false` preserved.

## PR Hygiene

- [x] **HARD BLOCKER — missing changeset.** Added `.changeset/theming-composer-shell.md` with `brevwick-react: minor` + `brevwick-sdk: patch` (pre-1.0 lockstep; SDK has no code change in this PR). `changeset-check` CI now passes.
- [x] Conventional commit subject: `feat(react): ...`.
- [x] Branch matches `feat/issue-<N>-...`.
- [x] PR body links `Closes #30` and the SDD § 12 anchor.
- [x] No Claude / Co-Authored-By attribution anywhere (commit, PR body, code).
- [x] No new runtime dependency — `vitest-axe` added as devDep only (verified in `packages/react/package.json:60`).

## Files Reviewed

| file | status | notes |
| ---- | ------ | ----- |
| `packages/react/src/styles.ts` | resolved | `--brw-success` removed; `--brw-error` light declaration commented (intentionally carried through dark); `.brw-fab` transition list pruned to `transform` only |
| `packages/react/src/feedback-button.tsx` | resolved | JSDoc documents `--brw-bubble-user-fg` and `--brw-divider`; accent / bubble-user pairing rules spelled out inline |
| `packages/react/src/__tests__/feedback-button.test.tsx` | resolved | `expect.extend` moved to `vitest.setup.ts`; cast replaced by ambient `.d.ts`; balanced-brace hex-strip; autogrow spies `scrollHeight` and asserts the exact clamp; structural-a11y caveat commented; WCAG-AA contrast guard added |
| `packages/react/vitest.setup.ts` | new | now hosts `expect.extend(vitest-axe/matchers)` alongside `jest-dom` |
| `packages/react/src/__tests__/vitest-axe.d.ts` | new | ambient augmentation of vitest 4's `Assertion` so axe matchers type-check; placed under `__tests__` so tsup's dts bundler does not leak into `dist/*` |
| `packages/react/package.json` | ok | `vitest-axe` devDep is scoped correctly |
| `pnpm-lock.yaml` | ok | transitive deps appear scoped to axe + vitest-axe |
| SDD § 12 (cross-repo) | resolved | brevwick-ops PR #21 adds the Theming contract subsection to § 12, linked from this PR's body |
| `.changeset/theming-composer-shell.md` | resolved | minor for `brevwick-react`, patch for `brevwick-sdk` (lockstep); `changeset-check` CI now green |

---

## Summary

The implementation is architecturally sound and the composer-shell UX is a real improvement. The `:where(:root)` specificity-0 trade-off is defensible and correctly applied. However, before this can merge:

1. **Add a changeset** — CI is red until this lands.
2. **Update SDD § 12** — the token set is a new public contract; repo rule requires the cross-repo SDD PR in the same change.
3. **Close the JSDoc / actual-token drift** — `--brw-bubble-user-fg` and `--brw-divider` need to be either documented or marked internal.
4. **Remove dead `--brw-success`** and either define dark-mode status colours or comment the intentional carry-through.
5. **Cleanup the test plumbing** — move `expect.extend` to `vitest.setup.ts`, add the single ambient `.d.ts` to drop the duplicated cast, and make either the hex-strip or the autogrow assertion less brittle.
6. **Be honest about the axe tests** — either add a contrast unit-test against the tokens, or explicitly comment that the happy-dom axe pass is an ARIA guard and not a contrast guard.

None of the above requires rearchitecting. All are small, targeted cleanups on a solid change.
