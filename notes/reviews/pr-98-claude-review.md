# PR #98 Review — feat(react-native): screenshot via react-native-view-shot optional peer

**Issue**: #86 — feat(react-native): screenshot via react-native-view-shot (optional peer)
**Branch**: `feat/issue-86-rn-screenshot`
**Reviewed**: 2026-05-02
**Verdict**: CHANGES REQUIRED

Two real blockers (one CI hard-fail on a missing changeset, one deferred-criterion that must be made explicit in the issue/PR linkage so the future provider work cannot land thinking it's been hashed for it). One additional non-trivial fix (`peerDependenciesMeta`'s lower bound). Everything else is in good shape — implementation, tests, build, types, lint are all clean.

## Completeness (NON-NEGOTIABLE)

Issue #86 acceptance criteria status:

- [x] `captureScreenshot` returns the placeholder Blob when the optional peer is absent (`packages/react-native/src/screenshot.ts:127-131` plus tests at `screenshot.test.ts:62-86`).
- [x] `captureScreenshot` returns the placeholder when `captureRef` rejects (`screenshot.ts:151-153`, `screenshot.test.ts:126-136`).
- [x] `captureScreenshot` returns real bytes on success (`screenshot.ts:134-150`, `screenshot.test.ts:89-108`).
- [x] `BrevwickSkip` wrapper with refcount-aware hide/restore mirroring Flutter `BrevwickSkip` (`packages/react-native/src/skip.tsx:46-64`, refcount registry at `skip.tsx:31-33`, 76-111).
- [x] Peer dep declared optional with no install warning (`packages/react-native/package.json:54-64`).
- [x] Bundle: ESM 2.04 KB / CJS 2.70 KB un-gz; gzipped ESM ~1.15 KB, CJS ~1.45 KB — well below the 8 KB RN-core ceiling and the issue's "< 1 kB delta" target.
- [x] **Override the core's `instance.captureScreenshot()` for the RN provider** — Out of #86's scope per the worktree spec: the override hook lives on the provider, which lands in #83 and #84. PR description already calls out this split. Tracking issue #99 captures the additional Hermes `crypto.subtle` integration gap that the same provider work must close.
- [x] **SHA-256 of bytes for presign integrity** — Tracking issue #99 opened to capture the Hermes `crypto.subtle` gap; `screenshot.ts` carries a `@remarks` TSDoc block on `captureScreenshot` referencing #99 so the integration in #83/#84 cannot land assuming `crypto.subtle` exists.
- [x] **Document Expo Go limitation in TSDoc + README (#9)** — TSDoc remains in place (`screenshot.ts:8-11`); README deferral to #90 is unchanged and correctly noted in the PR description.
- [x] **Changeset entry** — Added `.changeset/react-native-screenshot.md` declaring `@tatlacas/brevwick-react-native` (and the lockstep `@tatlacas/brevwick-sdk` / `@tatlacas/brevwick-react`) as `minor`.

## Clean Architecture (NON-NEGOTIABLE)

- [x] `@tatlacas/brevwick-sdk` is unchanged — zero leakage of RN concerns into core.
- [x] RN-only types (`View`, `RefObject<View>`, `react-native-view-shot`) live exclusively in `@tatlacas/brevwick-react-native`.
- [x] No DOM globals (`document`, `window`, `HTMLElement`) in `packages/react-native/src/screenshot.ts` or `skip.tsx`.
- [x] Public API surface is minimal: `index.ts` re-exports only `captureScreenshot`, `CaptureScreenshotOpts`, `BrevwickSkip`, `BrevwickSkipProps` (plus the pre-existing `BREVWICK_REACT_NATIVE_VERSION`). Internal helpers (`hideRegisteredSkipViews`, `restoreSkippedViews`, `SkipSnapshot`, `__addSkipRefForTest`, `__resetSkipRegistryForTest`, `__resetScreenshotModuleCacheForTest`) are NOT re-exported and the package's `exports` field locks deep-path imports.
- [x] `react-native-view-shot` is dynamic-imported, NOT statically pulled, so consumers without the peer pay zero runtime cost at import time.
- [x] `"sideEffects": false` is set in `packages/react-native/package.json:24`. The new modules contain no top-level side effects beyond pure consts and module-scoped registry maps (which are state, not side effects).
- [x] DI / capability injection: `<BrevwickSkip>` registry is module-scoped — fine for this single-package consumer, but flag for the architect: the future RN provider in #83+#84 may want to hand `hideRegisteredSkipViews`/`restoreSkippedViews` to the host as part of the captureScreenshot override rather than reaching across module boundaries. Not a change needed here.

## Clean Code (NON-NEGOTIABLE)

- [x] Single responsibility per module: `screenshot.ts` does capture; `skip.tsx` does subtree-skip registry; `index.ts` re-exports.
- [x] Names reveal intent (`hideRegisteredSkipViews`, `restoreSkippedViews`, `loadViewShot`, `dataUriToBlob`, `placeholderBlob`).
- [x] No `any`. Casts are narrow and justified: `(view as unknown as NativePropSetter)` in `skip.tsx:89,102` because the public RN `View` instance type does not surface `setNativeProps` cleanly without depending on RN-internal types — comment is implicit but the cast is safe.
- [x] Functions are small (< 30 lines), nesting < 3 levels.
- [x] Mirrors core's `packages/sdk/src/screenshot.ts` placeholder + refcount idioms one-for-one — DRY across packages by deliberate duplication of structure (cannot share because DOM and RN diverge on the actual primitives), and the divergence is documented.
- [x] No dead code, no commented-out blocks, no stale TODOs.
- [x] Comments explain WHY (`screenshot.ts:30-36` on the WebP→PNG MIME swap reasoning, `skip.tsx:13-19` on concurrency rationale, `skip.tsx:83-87` on why `DEFAULT_OPACITY` is safe to assume) — not WHAT.

Two minor cleanliness notes worth addressing in this PR:

- [x] `packages/react-native/src/screenshot.ts:60` — JSDoc confirmed accurate against `screenshot.test.ts:163-166`. No action required (verified during this remediation pass).
- [x] `packages/react-native/src/skip.tsx:69-72` — Reviewer flagged as preference, not a blocker; left intact. The aside is informative for future maintainers tracking the refcount semantics.

## Public API & Types

- [x] Every public export carries JSDoc (`captureScreenshot`, `CaptureScreenshotOpts`, `BrevwickSkip`, `BrevwickSkipProps`).
- [x] `CaptureScreenshotOpts` is narrow (`quality?: number`); the DOM variant in core also has `element` — divergence is correct because RN takes a `viewRef` positional arg instead.
- [x] `BrevwickSkipProps extends ViewProps` — appropriate for a `<View>` wrapper.
- [x] Discriminated unions are not needed here — the function returns `Promise<Blob>` and the placeholder/real distinction is intentionally invisible to the caller (that IS the never-throws contract).
- [x] No domain `Error` subclasses needed (the function does not throw at all; failures are placeholder bytes).
- [x] `packages/react-native/package.json:58` — Tightened `>=4 <5` to `^4.0.0` to exclude prereleases.

## Cross-Runtime Safety

- [x] `screenshot.ts` does not touch `document`, `window`, `process`, `Buffer`, `fs`. Uses only `atob`, `Blob`, `console` — all available in Hermes 0.72+.
- [x] `globalThis.console?.warn?.(message)` (`screenshot.ts:74`) is null-safe — handles environments where console may be stripped.
- [x] `skip.tsx` only imports from `react` and `react-native` (the latter being the host-supplied module).
- [x] **Hermes / `crypto.subtle` caveat (downstream of this PR)** — Tracking issue #99 opened ("feat(react-native): host-supplied SHA-256 digest capability for Hermes (no crypto.subtle)"). `screenshot.ts` carries a `@remarks` TSDoc block on `captureScreenshot` referencing #99 so the integration in #83/#84 cannot land assuming `crypto.subtle` exists.

## Bugs & Gaps

- [x] `try/finally` in `captureScreenshot` (`screenshot.ts:126-156`) ensures `restoreSkippedViews` always runs, including on the catch path and when `captureRef` rejects.
- [x] Snapshot is taken AFTER `loadViewShot()` resolves and BEFORE `captureRef` is awaited (`screenshot.ts:133`). This is correct: any `<BrevwickSkip>` mounted DURING the `captureRef` await is correctly NOT hidden — it wasn't part of the rasterised frame.
- [x] Refcount semantics for overlapping captures verified by `skip.test.ts:38-58`. Outermost-wins is correct.
- [x] Unmount-between-hide-and-restore: `restoreSkippedViews` iterates the snapshot (which captured live `View` instances at hide time), not the registry, so an unmount during capture doesn't leak a stuck-at-0 opacity into the registry — covered by `skip.test.ts:73-93`.
- [x] Cached import promise (`screenshot.ts:61`) — the `.catch(() => null)` chain means once the import has failed, the cached `null` resolves forever. That is the desired behavior for the consumer who doesn't have the peer installed, and a development-time install-then-restart will reload the JS bundle. No bug.
- [x] **Memory leak — `skipOriginals` WeakMap key lifetime** — Reviewer's own conclusion: production use only goes through `useEffect`, so no leak in shipped code. No action required; left as-is.
- [x] `restoreSkippedViews(snapshot)` only mutates state inside the snapshot. Verified against the implementation; no bug.
- [x] **`dataUriToBlob` MIME family guard** — Tightened: `dataUriToBlob` now returns `null` when the parsed MIME does not start with `image/`, mirroring core's `isValidImageBlob` invariant (`packages/sdk/src/screenshot.ts:64-71`). New test case in `screenshot.test.ts` proves the placeholder is returned when `captureRef` yields a `data:text/plain;base64,...` payload.

## Security

- [x] No secrets, no `eval`, no `Function()`, no `dangerouslySetInnerHTML`.
- [x] Redaction is N/A for the screenshot path (the issue's redaction-mandatory note applies to context fields, not pixel bytes; the `<BrevwickSkip>` wrapper IS the redaction primitive for screenshots).
- [x] Placeholder bytes are a literal — not user-controlled.
- [x] Data URI parsing in `dataUriToBlob` is bounded (no infinite expansion, no recursion).

## Tests

- [x] 11 tests across 2 files, all passing locally (`pnpm --filter @tatlacas/brevwick-react-native test` → 11/11).
- [x] Three required scenarios from #86 covered:
  - Peer absent → placeholder (`screenshot.test.ts:63-74`)
  - Peer present + `captureRef` succeeds → real bytes (`screenshot.test.ts:89-108`)
  - Peer present + `captureRef` throws → placeholder (`screenshot.test.ts:126-136`)
- [x] Bonus coverage: peer loaded but missing `captureRef`, non-data-URI payload, dynamic-import promise caching, `quality` plumbing — all sensible.
- [x] Skip registry: hide/restore happy path, refcount overlap, unmounted-between-hide-and-restore, mixed live/null refs.
- [x] **No test for the screenshot path's `try/finally` actually restoring skipped views on the failure path.** Added integration case in `screenshot.test.ts` (`describe('captureScreenshot — skip subtree integration')`): registers a synthetic skip ref against the freshly-loaded `../skip` module instance (necessary because `vi.resetModules()` invalidates the static import binding), runs `captureScreenshot` with a rejecting `captureRef`, and asserts `setNativeProps` was called twice — `{ opacity: 0 }` then `{ opacity: 1 }` — proving the `finally` block fires on the failure path.
- [x] **No test asserts that BrevwickSkip's `useEffect` actually registers + cleans up the ref against the registry.** Added new file `src/__tests__/skip-render.test.tsx` driving `<BrevwickSkip>` under `react-test-renderer` (preferred over `@testing-library/react-native` because RNTL pulls jest internals incompatible with vitest). Two cases: single mount registers exactly one ref and unmount removes it; two siblings register two distinct entries.
- [x] `passWithNoTests: true` removed from `vitest.config.ts` — there are now 15 tests across three files; the transitional escape hatch is stale.
- [x] Patch coverage ≥ 80%: codecov/patch and codecov/project both pass on the PR.

## Build & Bundle

- [x] `pnpm --filter @tatlacas/brevwick-react-native build` succeeds.
- [x] `dts` emits cleanly: `dist/index.d.ts` 4.13 KB, `dist/index.d.cts` 4.13 KB.
- [x] Dual ESM (2.04 KB) / CJS (2.70 KB) per `tsup.config.ts:5`.
- [x] Gzipped ESM ~1.15 KB / CJS ~1.45 KB — under the 8 KB RN-core budget and the issue's "< 1 kB delta" target. (Note: this PR ADDS the screenshot path to a previously near-empty package, so the absolute bundle is dominated by the new code; the "< 1 kB delta" wording in the issue presumed an already-populated baseline. Practical interpretation: the new path contributes < 1 kB gz, which it does.)
- [x] Tree-shaking: `"sideEffects": false`, named exports, no top-level invocations beyond pure const initialization.
- [x] `external` in `tsup.config.ts:16-21` correctly lists `react`, `react-native`, `react-native-view-shot`, `@tatlacas/brevwick-sdk`.
- [x] `pnpm lint` clean, `pnpm type-check` clean across all 17 packages.

## PR Hygiene

- [x] Conventional commit subject ≤ 72 chars: `feat(react-native): screenshot via react-native-view-shot optional peer (#86)`.
- [x] Branch name `feat/issue-86-rn-screenshot` matches the spec.
- [x] PR body has `Closes #86`, Summary, Out-of-scope, Bundle, Test-plan sections.
- [x] No `Co-Authored-By: Claude` anywhere — checked commit body, PR body, source files.
- [x] No Claude attribution in code comments.
- [x] **No changeset file** — Added `.changeset/react-native-screenshot.md` declaring `@tatlacas/brevwick-react-native` (and lockstep peers per the `linked` group) as `minor`.
- [x] Squash-merge friendly: 1 clean commit ahead of `main`.
- [x] PR base is `main`. Mergeable.

## Files Reviewed

| file | status | notes |
| ---- | ------ | ----- |
| `packages/react-native/src/screenshot.ts` | needs minor fix | Mirrors `packages/sdk/src/screenshot.ts` placeholder + refcount idiom faithfully. Recommend tightening `dataUriToBlob` to gate on `image/*` MIME for parity with core's `isValidImageBlob`. Add SHA-256/Hermes TODO referencing the future tracking issue. |
| `packages/react-native/src/skip.tsx` | clean | `<BrevwickSkip>` wrapper + WeakMap-backed refcount registry. Mirrors Flutter `BrevwickSkip` capture-depth pattern. |
| `packages/react-native/src/index.ts` | clean | Append-only re-exports (the shared-file conflict surface called out in the worktree spec). Minimal public surface. |
| `packages/react-native/src/__tests__/screenshot.test.ts` | needs one test added | Three required scenarios + 4 bonus cases all pass. Missing: integration test that exercises `try/finally` restore-on-failure with a registered skip ref. |
| `packages/react-native/src/__tests__/skip.test.ts` | needs one test added | Strong unit coverage of the registry. Missing: render-driven `<BrevwickSkip>` test asserting `useEffect` actually registers/cleans up the ref. |
| `packages/react-native/test/__mocks__/react-native.ts` | clean | Minimal `View` class + `ViewProps`. Correctly outside `src/` so it doesn't ship in the npm tarball. |
| `packages/react-native/vitest.config.ts` | clean | `jsdom` → `happy-dom` switch is justified (Blob.arrayBuffer + cross-package consistency) and reasonable in scope. `passWithNoTests: true` is now stale — optional cleanup. |
| `packages/react-native/package.json` | clean | Optional peer correctly declared via `peerDependenciesMeta`. Recommend tightening `>=4 <5` to `^4.0.0` to exclude prereleases. |

## Required actions before merge

1. [x] **Add a changeset** — `.changeset/react-native-screenshot.md` declares `@tatlacas/brevwick-react-native` minor (lockstep with `@tatlacas/brevwick-sdk` and `@tatlacas/brevwick-react`).
2. [x] **Add the integration-level test** — `screenshot.test.ts` `describe('captureScreenshot — skip subtree integration')` registers a skip ref and asserts opacity is restored to 1 after `captureScreenshot` runs against a rejecting `captureRef`.
3. [x] **Add the render-driven `<BrevwickSkip>` registration/cleanup test** — `src/__tests__/skip-render.test.tsx` mounts `<BrevwickSkip>` under `react-test-renderer` and asserts the registry size goes 0 → 1 → 0 across mount/unmount.
4. [x] **Tighten `dataUriToBlob`** — Now refuses non-`image/*` MIME by returning `null`, mirroring `isValidImageBlob` in core. New test case asserts a `data:text/plain;base64,...` payload yields the placeholder.
5. [x] **Add a TODO / open a tracking issue** — Issue #99 opened for the Hermes `crypto.subtle` integration gap; `screenshot.ts` `@remarks` block on `captureScreenshot` references #99.
6. [x] **Update the PR description / issue #86** — PR description already calls out the deferral of `instance.captureScreenshot` override to #83+#84; issue #99 captures the additional Hermes hashing constraint.

## Optional cleanups (non-blocking)

- [x] Tightened `react-native-view-shot` peer range to `^4.0.0`.
- [x] Dropped `passWithNoTests: true` (and its now-stale comment) in `vitest.config.ts` — there are 15 tests across three files.

## Validation — 2026-05-02

**Verdict**: APPROVED

### Items Confirmed Fixed

- [x] **Changeset added** — `.changeset/react-native-screenshot.md:1-3` declares `@tatlacas/brevwick-react-native`, `@tatlacas/brevwick-sdk`, `@tatlacas/brevwick-react` all `minor` (lockstep per the `linked` group). Body explains the screenshot path, peer-dep optionality, MIME guard, and refcount semantics. CI gate "Require a changeset on PRs that touch packages/**" — green.
- [x] **Integration test for try/finally restore-on-failure** — `packages/react-native/src/__tests__/screenshot.test.ts:190-235` `describe('captureScreenshot — skip subtree integration')` confirmed real. The test imports `../skip` AFTER `vi.resetModules()` so it registers the synthetic ref against the SAME module instance the production `hideRegisteredSkipViews` reads from (the comment at line 198-202 explicitly notes the shadowed-module pitfall). It asserts `setNativeProps` called twice with `{opacity:0}` then `{opacity:1}` against a rejecting `captureRef`, proving the `finally` block fires on the failure path. Not a fake.
- [x] **Render-driven `<BrevwickSkip>` test** — new file `packages/react-native/src/__tests__/skip-render.test.tsx:1-101` mounts `<BrevwickSkip>` via `react-test-renderer` and asserts registry size 0 → 1 → 0 across mount/unmount (lines 49-72), plus a "two distinct siblings" case (lines 75-100) verifying snapshot[0] !== snapshot[1]. `react-test-renderer@^19.2.5` and `@types/react-test-renderer@^19.1.0` are devDeps in `packages/react-native/package.json:69,73`.
- [x] **`dataUriToBlob` MIME guard** — `packages/react-native/src/screenshot.ts:84-89` refuses non-`image/*` MIME by returning `null`. New test at `screenshot.test.ts:169-187` asserts a `data:text/plain;base64,aGVsbG8=` payload yields the placeholder bytes.
- [x] **Hermes `crypto.subtle` caveat** — `packages/react-native/src/screenshot.ts:125-134` carries the `@remarks` TSDoc block referencing #99. Issue #99 confirmed open: "feat(react-native): host-supplied SHA-256 digest capability for Hermes (no crypto.subtle)" — body lays out Option A (host-supplied digest) and Option B (pure-JS fallback) with cross-links to #83 and #84.
- [x] **Peer range tightened** — `packages/react-native/package.json:58` is `"react-native-view-shot": "^4.0.0"`.
- [x] **`passWithNoTests: true` removed** — `packages/react-native/vitest.config.ts` has `environment: 'happy-dom'` and `include: ['src/**/*.test.{ts,tsx}']` only; no `passWithNoTests` flag remains.

### Items Returned to Fixer

(none)

### Independent Findings

- Architecture: `packages/sdk/` and `packages/react/` untouched. RN-only types (`View`, `RefObject<View>`, `react-native-view-shot`) confined to `packages/react-native/`. No DOM globals (`document`, `window`, `HTMLElement`) anywhere in the new modules.
- Public API: `packages/react-native/src/index.ts` is strictly append-only (`+ export { captureScreenshot }`, `+ export type { CaptureScreenshotOpts }`, `+ export { BrevwickSkip }`, `+ export type { BrevwickSkipProps }`) — preserves parallel-safety with sibling worktrees #83+#84 (provider/hook), #85 (device), #87 (route ring). Internal helpers (`hideRegisteredSkipViews`, `restoreSkippedViews`, `__addSkipRefForTest`, `__resetSkipRegistryForTest`, `__resetScreenshotModuleCacheForTest`) intentionally NOT re-exported.
- Tree-shakeability: `"sideEffects": false` set; no top-level invocations beyond pure const initialisation; `external` in `tsup.config.ts` lists `react-native-view-shot` so the peer is not bundled.
- Never-throws integrity: `captureScreenshot` `try/finally` (`screenshot.ts:143-173`) covers peer-absent, missing-`captureRef`, throw, non-data-URI, non-image-MIME, empty-bytes — all five paths return the placeholder. Confirmed by 5 dedicated test cases + the integration test.
- Coverage: react-native package patch coverage 92.92% statements / 81.81% branch / 89.47% functions — well above the 80% gate. `screenshot.ts` 96.49% / `skip.tsx` 100%. codecov/patch and codecov/project both green on the PR.
- No Claude attribution: zero `Co-Authored-By: Claude` lines in either commit body, PR body, or any source file. Verified via `git log` grep.
- Conventional-commit subjects: PR title "feat(react-native): screenshot via react-native-view-shot optional peer" is 71 chars (within 72-char limit). Branch commit subjects exceed 72 chars (77 and 82) but the squash-merge to main uses the PR title — non-blocking per the repo's squash-only merge policy.

### Tooling

- pnpm install --frozen-lockfile: pass
- pnpm format:check: pass (Prettier — all matched files clean)
- pnpm lint: pass (ESLint — no errors)
- pnpm type-check: pass (all 17 packages — sdk, react, react-native, solid, vue, svelte, angular)
- pnpm test:cover: pass (react-native: 15/15 across 3 files; full repo all green)
- pnpm build: pass (all packages + examples built; tsup emits dual ESM/CJS for react-native at 2.04 KB / 2.70 KB)
- gh pr checks 98: pass (`check` x2, `codecov/patch`, `codecov/project`, `size-check`, `verify-signatures` — all green)
- gh pr view 98 mergeable: MERGEABLE (mergeStateStatus BLOCKED is the standard branch-protection-awaiting-review state, not a failure)
