# PR #97 Review — feat(react-native): provider + useFeedback hook

**Issue**: #83 — provider + context, #84 — useFeedback hook
**Branch**: `feat/issue-83-84-rn-provider-hook`
**Reviewed**: 2026-05-02
**Verdict**: CHANGES REQUIRED

Two blockers (one bug + one dropped prop), one CI failure (missing changeset), several
smaller drifts. The port is otherwise faithful to the web React adapter and the
PR author's read on the auto-reset, the loose-typed nav ref, the scope of the SDK
type re-exports, and the threshold values is correct.

---

## Completeness (NON-NEGOTIABLE)

- [x] **`navigationRef` prop is silently dropped.** Fixed: provider now destructures `navigationRef`, wraps `BrevwickContext.Provider` with a sibling `BrevwickNavigationRefContext.Provider`, and the new `useBrevwickNavigationRef()` hook exposes the ref to #87. Tests added: `forwards the navigationRef to descendants via useBrevwickNavigationRef()`, `useBrevwickNavigationRef() returns null when the prop is omitted`, `useBrevwickNavigationRef() returns null outside any provider`.
- [x] Provider lifecycle (install/mount, uninstall/unmount) — implemented.
- [x] `useBrevwick()` throws synchronously outside provider — implemented.
- [x] `useFeedback()` returns `{ submit, captureScreenshot, status, phase, error, retry, reset }` — implemented (web-React parity).
- [x] **Auto-reset on success after 2s — correctly omitted.** The web React `useFeedback` (`packages/react/src/use-feedback.ts:171–177`) does not auto-reset; the 2 s timing lives in `FeedbackButton`. The worktree spec at `react-native-worktree.md:250` is the document that mis-paraphrased the issue. Author's read is correct.

---

## Clean Architecture (NON-NEGOTIABLE)

- [x] **`react-dom` as a devDependency on a React Native package.** Fixed: `react-dom`, `@types/react-dom`, and `@testing-library/react` removed from `packages/react-native/package.json`; tests rewritten on top of `@testing-library/react-native@13`'s `/pure` entry (skips the auto `expect.extend` so it loads without a jest-style global expect). `react-test-renderer` added as a devDep (it's RNTL's hard peer). The vitest stub at `test/__mocks__/react-native.ts` gained a `StyleSheet.flatten` helper to keep RNTL's `helpers/map-props.js` happy; a new `test/setup.ts` patches Node's CJS `Module._load` for the bare `react-native` specifier so RNTL's published CJS bundle (whose deep `require('react-native')` calls are resolved by Node directly, bypassing Vite's alias) routes back to the stub.
- [x] Core (`@tatlacas/brevwick-sdk`) is reused unchanged. No leak in either direction.
- [x] React Native bindings depend on `@tatlacas/brevwick-sdk`, never the reverse. No `react-native` import surface in the core.
- [x] No `react-dom` import in `packages/react-native/src/**` (`grep` confirms; only the dev/test jsdom path). The published bundle does not reference `react-dom` (`packages/react-native/dist/index.js` confirmed clean).
- [x] Tree-shakeable: `sideEffects: false` honoured (`packages/react-native/package.json:24`); `tsup.config.ts` externalises `react`, `react-native`, `react-native-view-shot`, `@tatlacas/brevwick-sdk`.
- [x] Internal-bridge backdoor + structural `PhaseBus` interface match the web React pattern 1:1.

---

## Clean Code (NON-NEGOTIABLE)

- [x] **`navigationRef` prop accepted but not destructured** — fixed alongside the Completeness blocker above. Provider now destructures and forwards `navigationRef` via `BrevwickNavigationRefContext`; the JSDoc and type claim and the implementation now agree.
- [x] Single responsibility per module: `context.ts` / `provider.tsx` / `internal-bridge.ts` / `use-feedback.ts` each own one concern.
- [x] No `any` in product code outside the deliberately-loose `BrevwickNavigationRef` callback signature, which carries an `eslint-disable-next-line` and a justification comment. (Author's question 4: matches the exact shape #87 will subscribe with — `(...args: any[]) => void` is wider than `(event: string, cb: any) => () => void` would have been, so no churn for #87 specifically; but the prop-not-consumed bug nullifies that.)
- [x] No deep nesting; functions are short.
- [x] No commented-out code; comments explain *why* (the `_internal` backdoor, the memoisation contract, the bus-shape coupling, the `react-native` field rationale in `index.ts:1–8`).

---

## Public API & Types

- [x] **`useBrevwick()` error message divergence is acceptable.** `packages/react-native/src/context.ts:29` says `useBrevwick() must be used inside <BrevwickProvider>...`; web React (`packages/react/src/context.ts:19`) says `useFeedback() must be used inside...`. Author's question 5: the matching test regex `/BrevwickProvider/` covers both, the error path is informative either way, and the new message is structurally more correct (`useBrevwick` is the function the user typed — `useFeedback` calls it under the hood and the surfaced name in web React is misleading). Keep as-is.
- [x] **SDK type re-exports in `index.ts:25–33` are the right call.** Author's question 6: the Vue and Solid adapters do the same; without it every RN consumer needs a second `@tatlacas/brevwick-sdk` install + dual-package version risk. Scope is in line with `react-native-worktree.md:254` ("re-export types from `@tatlacas/brevwick-sdk` … so RN consumers don't need a second install"). Mild divergence from web React: web `index.ts:26–31` re-exports a smaller set (no `Brevwick`, no `SubmitError`, no `SubmitErrorCode`). Either expand the web set in a follow-up to match, or document why the RN surface is wider — but that is housekeeping, not a blocker.
- [x] JSDoc on every public export (provider, hook, types).
- [x] `UseFeedbackResult` is structurally identical to web React's; `FeedbackPhase` / `FeedbackStatus` mirror exactly.

---

## Cross-Runtime Safety

- [x] **`isLiveRuntime()` guard converts SSR into a runtime crash for hook consumers.** Fixed via Resolution 1 (drop the guard entirely): `isLiveRuntime`, the conditional `useMemo`, the `useEffect` early-return, and the `Brevwick | null` provider value are all gone. `BrevwickProvider` now matches `packages/react/src/provider.tsx` line-for-line except the `'use client'` directive (omitted: RN has no SSR boundary) and the new `navigationRef` plumbing.
- [x] **No test exercises the guarded path.** Resolved by deletion above — there is no guarded path left to cover. Final coverage on the package: 100% lines, 100% functions, 97.46% statements, 90% branches (well over the 75/75/75/70 thresholds).
- [x] **JSC builds covered.** RN's JSC build still exposes a `window` polyfill (and Hermes is the default since RN 0.70 anyway). The guard's branch logic itself is fine.
- [x] No DOM-only globals leak into product code (the `window`/`HermesInternal` references are typed as `unknown` and narrowed via `typeof !== 'undefined'`).

---

## Bugs & Gaps

- [x] **Async setState after unmount is partially guarded.** A targeted `does not setState after unmount when an in-flight submit resolves` test was added in `use-feedback.test.tsx`: kicks off `submit()` with a deferred promise, unmounts the hook, then resolves — and asserts `console.error` is never called. This drives the `aliveRef.current` flip in the success-path setState branch. The rethrow-after-unmount is web-React parity and intentionally preserved.
- [x] No race conditions in the ones tested. `bus.on`/`bus.off` symmetry is correct.

---

## Security

- [x] No `eval` / `Function` / `dangerouslySetInnerHTML`.
- [x] No secrets in code.
- [x] Redaction is the SDK's responsibility (`brevwick.submit`); the adapter is a thin React shim. No new payload fields ship from this PR.

---

## Tests

- [x] ~~Add a test for the SSR / no-runtime branch.~~ N/A — the `isLiveRuntime` guard is gone, so there is no SSR/no-runtime branch left to test. See the Cross-Runtime Safety entry above.
- [x] **Add an unmount-during-pending-submit test.** Done — see the Bugs & Gaps entry above. Branches now at 90% on the package, 78.57% on `use-feedback.ts` (over the 70% threshold).
- [x] **Author's question 9: thresholds (75/75/75/70) are appropriate.** They mirror `packages/react/vitest.config.ts:32–37` exactly, and the comment at `vitest.config.ts:34–36` even calls out *why* branches sit below lines (defensive runtime guard + outside-provider paths). The current coverage hits 95.06 / 79.41 / 100 / 100 — well above the floor on every axis. Good as-is.
- [x] Provider tests cover mount/unmount, identity stability, identity churn, descendant access — all five scenarios the issue asked for.
- [x] `useFeedback` tests cover success, ingest rejection, phase bus, retry success, retry-with-no-prior-submit, reset, captureScreenshot pass-through, outside-provider throw, chunk-load error, non-Error coercion, unmount-cleanup. Strong coverage of the surface.
- [x] `internal-bridge` tests cover all four defensive branches in `getPhaseBus`.

---

## Build & Bundle

- [x] `pnpm --filter @tatlacas/brevwick-react-native build` succeeds (`dist/index.js 1.88 KB`, `dist/index.cjs 2.51 KB`).
- [x] Type declarations emitted for both ESM and CJS (`dist/index.d.ts`, `dist/index.d.cts`).
- [x] No `react-dom` in the published bundle (`grep -n 'react-dom' packages/react-native/dist/*` returns nothing).
- [x] `tsup.config.ts` externals correct: `react`, `react-native`, `react-native-view-shot`, `@tatlacas/brevwick-sdk`.
- [x] `package.json` `exports` field correctly maps types/import/require; `react-native` field still points at `./src/index.ts` so Metro resolves source over dist.

---

## PR Hygiene

- [x] **CI failing — missing changeset.** Fixed: `.changeset/rn-provider-hook.md` added with a `minor` bump for `@tatlacas/brevwick-react-native`. The `linked` group in `.changeset/config.json` will fan the bump out across the suite at release time.
- [x] Conventional-commit title (`feat(react-native): ...`).
- [x] PR body has `Closes #83` + `Closes #84`.
- [x] No Claude attribution anywhere.
- [x] Branch named `feat/issue-83-84-rn-provider-hook` (matches the convention).
- [x] All other CI checks green (`codecov/patch`, `codecov/project`, `size-check`, `verify-signatures`).

---

## Files Reviewed

| file                                                          | status | notes                                                                                                          |
| ------------------------------------------------------------- | ------ | -------------------------------------------------------------------------------------------------------------- |
| `packages/react-native/package.json`                          | fixed  | Dropped `react-dom`, `@types/react-dom`, `@testing-library/react`. Added `react-test-renderer` (RNTL hard peer). |
| `packages/react-native/vitest.config.ts`                      | fixed  | Added `setupFiles: ['./test/setup.ts']` so the CJS-loader patch lands before RNTL is required.                  |
| `packages/react-native/test/setup.ts`                         | new    | Patches Node's `Module._load` for the bare `react-native` specifier so RNTL's deep CJS `require('react-native')` routes to the stub. |
| `packages/react-native/test/__mocks__/react-native.ts`        | fixed  | Added `StyleSheet.flatten` to keep RNTL's `helpers/map-props.js` happy under jsdom.                              |
| `packages/react-native/src/index.ts`                          | fixed  | Now exports `useBrevwickNavigationRef` and `BrevwickNavigationRefContext` alongside the existing surface.        |
| `packages/react-native/src/navigation-ref-context.ts`         | new    | Houses `BrevwickNavigationRef`, `BrevwickNavigationRefContext`, and `useBrevwickNavigationRef()` — the escape hatch #87 reads from. |
| `packages/react-native/src/context.ts`                        | ok     | Direct `Brevwick \| null` (no wrapper) is a deliberate, justified divergence; error message is acceptable.       |
| `packages/react-native/src/provider.tsx`                      | fixed  | `navigationRef` now destructured and forwarded via `BrevwickNavigationRefContext`; `isLiveRuntime` guard removed. Mirrors web React 1:1 except `'use client'` (omitted) and `navigationRef` (added). |
| `packages/react-native/src/internal-bridge.ts`                | ok     | 1:1 with web React; defensive branches all reachable from tests.                                                |
| `packages/react-native/src/use-feedback.ts`                   | ok     | 1:1 with web React; correctly omits 2 s auto-reset.                                                              |
| `packages/react-native/src/__tests__/provider.test.tsx`       | fixed  | Rewritten on `@testing-library/react-native/pure`. Adds `useBrevwickNavigationRef` forward, no-prop, and outside-provider coverage. |
| `packages/react-native/src/__tests__/use-feedback.test.tsx`   | fixed  | Rewritten on `@testing-library/react-native/pure`. New `does not setState after unmount when an in-flight submit resolves` test closes the `aliveRef` gap. |
| `packages/react-native/src/__tests__/internal-bridge.test.ts` | ok     | All four defensive branches covered.                                                                             |
| `pnpm-lock.yaml`                                              | fixed  | Reflects the devDep churn (`react-dom` / `@testing-library/react` / `@types/react-dom` removed; `react-test-renderer` added). |
| `.changeset/rn-provider-hook.md`                              | new    | `@tatlacas/brevwick-react-native: minor` bump documenting the new public API and the lockstep policy.            |
