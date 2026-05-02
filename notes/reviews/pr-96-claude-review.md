# PR #96 Review — feat(react-native): device context collector

**Issue**: #85 — feat(react-native): device context — Platform/Dimensions/locale
**Branch**: feat/issue-85-rn-device
**Base**: main
**Reviewed**: 2026-05-02
**Verdict**: CHANGES REQUIRED

Single hard blocker (missing changeset → required `check` workflow is RED). Implementation, test surface, type design, and wire-shape interpretation are all sound; once the changeset is added the PR is mergeable. Two non-blocking improvements are listed at the end.

---

## Completeness (NON-NEGOTIABLE)

### Verdict on the wire-shape question (concern #1)

The PR's strict-Flutter-parity choice is **correct**. The issue body lists fields two ways and they contradict each other:

- The Scope checklist names `os_version: Platform.Version` and `viewport: { width, height, scale, fontScale }`.
- Acceptance criterion #1 says **"Wire format matches Flutter's `device_context` shape (snake_case)."**

Flutter (`~/repos/brevwick/brevwick-sdk-flutter/lib/src/device.dart` `DeviceContext.toJson()`) ships:

- `viewport: { w, h }` (rounded ints) — `lib/src/device.dart:38`
- NO `os_version` field (OS version is composed into `ua`, e.g. `'${model} / iOS ${systemVersion}'` — `lib/src/device.dart:283`)
- `{ ua?, locale?, viewport?, platform, sdk: { name, version, platform } }`

The JS web SDK in this repo (`packages/sdk/src/submit.ts:436-453, 515-521`) emits the **same shape** — `viewport: { w, h }`, no `os_version`. Issue #85's literal field list is the bug, not the implementation. Acceptance criterion #1 is the binding constraint, the PR body documents the choice, and `react-native-worktree.md:26` reinforces "platform … is the only deliberate divergence."

Switching to `os_version` + `{width,height,scale,fontScale}` would make RN the **only** SDK out of three (web, Flutter, RN) emitting that shape — backend triage would have to branch on `device_context.platform` to read viewport. Strict parity is right.

- [x] `device_context.platform = 'react-native-ios' | 'react-native-android'` — `packages/react-native/src/device.ts:83`
- [x] Static fields (`platform`, `sdk`, `ua`) cached at first call; locale + viewport re-read each call — `device.ts:76-97, 164-173` (matches Flutter `DeviceContextCollector.collect()` semantics — `lib/src/device.dart:219-244`)
- [x] Locale fallback chain: `SettingsManager.settings.AppleLocale` → `AppleLanguages[0]` → `NativeModules.I18nManager.localeIdentifier` → `'en-US'` constant — `device.ts:109-137`
- [x] Snapshot tests per platform — `device.test.ts:58-117`
- [x] `BREVWICK_REACT_NATIVE_VERSION` sourced via the Metro-safe codegen path (`scripts/generate-version.mjs`), not an ambient `__BREVWICK_REACT_NATIVE_VERSION__` token — `version.ts`, `device.ts:22, 92`
- [x] **Wiring into `composePayload()` is deferred to WT-rn-provider-hook (#83+#84).** Reviewer confirmed acceptable for this PR — `composePayload()` in `packages/sdk/src/submit.ts:515-521` hard-codes `device_context` with `platform: 'web'` and there is no `BrevwickConfig.deviceContext` slot or override hook yet, so the collector physically cannot be wired without core changes that are explicitly out of scope here. PR body discloses this. Acceptance criterion 2 of #85 ("Submitting from RN tags `device_context.platform = 'react-native-ios'`") will be exercised end-to-end in the example app (#89/#90) and verified on staging before WT-rn-release. **Inline forward-look note** is already present in `device.ts:37-41` JSDoc on `DeviceContext` ("Pass directly under `device_context` in the submit payload (or merge into a `BrevwickConfig.deviceContext` hook when one exists in the core)") so the WT-rn-provider-hook author has a clear pickup point.

## Clean Architecture (NON-NEGOTIABLE)

- [x] No core (`packages/sdk/`) edits — `git diff origin/main..HEAD --stat` confirms only `packages/react-native/**`
- [x] Adapter depends on RN primitives (`Platform`, `Dimensions`, `NativeModules`) only via the public `react-native` import; no DOM/Node globals in `device.ts`
- [x] `DeviceContext` type re-exported from `packages/react-native/src/index.ts:11` — surface is intentional, narrow, and tree-shakeable
- [x] `sideEffects: false` honoured (`packages/react-native/package.json:24`); `device.ts` is pure module — only `let cachedStatic` mutates, and only on first `collectDeviceContext()` call
- [x] `__resetDeviceContextCache` is exported but namespaced with `__` prefix — clearly test-only (JSDoc `device.ts:175-178` calls this out). Not exposed from `index.ts:11`, so it does not leak to consumers. Good
- [x] `react-native` is declared as a peer dep, not a runtime dep (`package.json:54-58`) — adapter does not bundle RN

## Clean Code (NON-NEGOTIABLE)

- [x] Single responsibility: `readStatic`, `readLocale`, `readViewport`, `collectDeviceContext` each do one thing
- [x] No `any`. Local cast helpers (`SettingsManagerLike`, `I18nManagerLike`) are narrowly scoped, documented, and replace what would otherwise be `any` indexing into untyped `NativeModules`
- [x] Functions all small (longest is `readLocale` at ~28 lines, three sequential fallback checks — appropriately flat)
- [x] No commented-out code, no TODOs, no dead exports
- [x] JSDoc on every public export (`DeviceContext`, `collectDeviceContext`, `__resetDeviceContextCache`)
- [x] **Fixed.** Replaced `appleLanguages[0]!` with the bind-then-narrow idiom (`const first = appleLanguages[0]; if (typeof first === 'string' && first.length > 0) return first;`) at `packages/react-native/src/device.ts:120-126`. Now consistent with the AppleLocale and androidLocale branches, also adds an empty-string guard so `AppleLanguages: ['']` falls through to the next link instead of returning `''`. New test pins this behaviour: `device.test.ts` "skips an empty-string AppleLanguages[0] and falls through to the next link".

## Public API & Types

- [x] `DeviceContext.platform: string` typed broadly enough to admit any future RN platform (`react-native-macos`, `react-native-windows`, `react-native-web`) — see Cross-Runtime note below
- [x] Optional fields modelled with `?` — JSON.stringify drops them (matches Flutter `if (ua != null)` semantics, called out in the file-header JSDoc `device.ts:16-18`)
- [x] `Viewport`, `SdkInfo` are non-exported helper types — appropriate; consumers see only `DeviceContext`
- [x] No throwing. `readViewport` swallows the `Dimensions.get` throw path; the rest is total functions

## Cross-Runtime Safety

- [x] Module imports only `react-native` and the local `version.ts`; no Node, no DOM
- [x] `String(Platform.Version)` defends against the iOS/Android type difference (iOS = string `'17.0'`, Android = number `34`) — `device.ts:81`
- [x] All `NativeModules.*` and `SettingsManager.*` accesses are optional-chained; tested against the "both unavailable" path (`device.test.ts:138-148`)
- [x] **Fixed (`Platform.OS = 'macos'` test row).** Added a test that flips `platform.OS = 'macos'` and asserts `device_context.platform === 'react-native-macos'`, `sdk.platform === 'macos'`, and `ua === 'react-native macos 14.0'` — pins the wider-platform contract and catches any future "throw on unknown OS" regression. See `device.test.ts` "produces a react-native-macos shape on RN-macOS without throwing".
- [x] **RN-Web triage-UI flag** is out of scope for this PR (the reviewer themselves marked it "Out of scope for this PR but worth flagging to the core / triage owner"). The intentional `react-native-*` prefix divergence is now documented inline in `device.ts:10-14` and pinned by both the iOS/Android snapshots and the new macOS test row, giving the triage owner a clear contract to act on.

## Bugs & Gaps

- [x] No async, no AbortSignal needs, no listener subscriptions — pure synchronous read
- [x] `try/catch` around `Dimensions.get('window')` (`device.ts:140-152`) — covers the rare native-bridge-unavailable case
- [x] Cache invalidation: `__resetDeviceContextCache` only — production callers can't break the cache; tests can. Correct
- [x] Empty-string locale guard (`length > 0` checks at `device.ts:116, 122-124, 133`) — falls through to next link in the chain, tested at `device.test.ts:144-148`
- [x] RTL locale identifiers (`ar_SA`, `he_IL`) — pass through unchanged. The collector's job is the BCP-47-ish tag, not direction. `I18nManager.isRTL` is intentionally not surfaced (not in Flutter's wire shape, not in the issue scope)

## Security

- [x] No secrets, no `eval`, no `Function()`, no DOM injection
- [x] Wire shape carries no PII beyond what Flutter / web already ship — `ua`, `locale`, `viewport`. No device IDs, no MAC, no advertising ID. `react-native-device-info` correctly stays out of scope (#85 acceptance criterion)
- [x] **Redaction** is run by `composePayload()` in the core after this collector returns — `submit.ts:497-521` redacts `userCtx` only, not `device_context` (which is constant + tag-shaped). When wiring lands in WT-rn-provider-hook, confirm the same: device_context is not run through `redact()` because it's not user-supplied free text. The current PR ships nothing on the wire, so this is a forward-look note for #83+#84

## Tests

- [x] All 14 tests pass locally: `pnpm --filter @tatlacas/brevwick-react-native test` → `Test Files 1 passed (1) / Tests 14 passed (14)`
- [x] Per-platform snapshot (`ios` + `android`) — `device.test.ts:58-93`
- [x] Strict key-shape ladder test (`device.test.ts:95-117`) — guards against an accidental future addition of `os_version` / `scale` / `fontScale` regressing parity. Excellent
- [x] Locale fallback chain — 5 cases covering all four links + empty-string flow (`device.test.ts:119-149`)
- [x] Static-field caching — both the cache-hit path and the `__resetDeviceContextCache` path (`device.test.ts:151-187`)
- [x] Viewport robustness — non-numeric, throw, fractional rounding (`device.test.ts:189-212`)
- [x] Sanity test on the baseline mock fixture (`device.test.ts:214-222`) — protects against the shared mock drifting under feature work
- [x] `beforeEach` / `afterEach` hygiene is thorough — every globally-mutable bit of the stub is reset, the cache is dropped, `Dimensions.get` is restored from a captured handle. No leakage between tests
- [x] **Fixed.** Added a `Platform.OS = 'macos'` test row pinning the wider-platform matrix (see Cross-Runtime Safety entry above). 16 tests total now pass.

## Build & Bundle

- [x] `pnpm --filter @tatlacas/brevwick-react-native build` succeeds: ESM 949 B, CJS 1.46 KB, DTS 1.43 KB. Tiny — well below any package budget
- [x] `pnpm format:check`, `pnpm lint`, `pnpm type-check` all green locally and in CI
- [x] No new runtime deps; no transitive bundle expansion
- [x] `dist/index.d.ts` exports `collectDeviceContext` and `DeviceContext` — confirmed by build output

## CI Status

- [x] `verify-signatures` (CI) — pass
- [x] `check` (CI) — pass
- [x] `size-check` (CI) — pass
- [x] `codecov/patch` — pass
- [x] `codecov/project` — pass
- [x] **Fixed.** Added `.changeset/react-native-device-context.md` as a single-package `'@tatlacas/brevwick-react-native': minor` entry (the `linked` group in `.changeset/config.json` propagates the bump across the lockstep suite). Body explains the wire shape, the strict-Flutter parity choice with the deliberate `device_context.platform` divergence, the cache semantics, and that the collector ships unwired and is integrated by #83+#84. Matches the populated-entry format the reviewer suggested and the `react-native-scaffold.md` precedent set by PR #93.

## PR Hygiene

- [x] Conventional commit subject (`feat(react-native): device context collector (#85)`), 51 chars — within ≤ 72
- [x] PR body has `Closes #85`
- [x] No Co-Authored-By, no Claude attribution anywhere (verified across PR title, body, commit message)
- [x] Branch name `feat/issue-85-rn-device` matches the convention
- [x] **Fixed.** `.changeset/react-native-device-context.md` added with a populated minor-bump entry for `@tatlacas/brevwick-react-native` (the `linked` group propagates the bump). Body documents the wire shape, the strict-Flutter parity choice, the deliberate `device_context.platform` divergence, the cache semantics, and the deferred wiring (#83+#84) — populated rather than empty per the reviewer's preference.

## Shared mock review (concern #4)

`test/__mocks__/react-native.ts` is the file every parallel Tier 1 worktree (#83+#84 provider-hook, #86 screenshot, #87 route-ring) imports through Vitest's alias. The change here:

1. Hoists `I18nManager` to a top-level `const` so the same object reference is mounted under `NativeModules.I18nManager` (`__mocks__/react-native.ts:62-88`).
2. Adds explicit type annotations on `NativeModules` and `I18nManager` so a worktree that mutates them (e.g. `i18n.localeIdentifier = 'de_DE'`) gets type-checked.
3. Pre-existing top-level `I18nManager` export is retained — backwards-compatible with any Tier 1 worktree that imports `I18nManager` directly.

This **mirrors real RN**: in production, `import { I18nManager } from 'react-native'` and `NativeModules.I18nManager` resolve to the same JSI table reference. A test that mutates one path now sees the change on the other — which is the right semantic for any future test that asserts cross-path consistency. **No collision** with the parallel Tier-1 worktrees. They append `Pressable`, `View`, `Modal`, etc. to this stub — orthogonal surface.

One subtle improvement worth noting in case any sibling worktree needs it: `NativeModules.SettingsManager.settings` is initialised as a value, but the device tests need it to be reassignable (`settingsManager.settings = undefined`). The current shape supports this (the type widens to `... | undefined` in the typed declaration). All good — but if a sibling worktree ever calls `Object.freeze(NativeModules)` for an isolation test, the device tests would break. Not a concern for any worktree currently planned.

## Files Reviewed

| file | status | notes |
| ---- | ------ | ----- |
| packages/react-native/src/device.ts | accepted | clean, single-purpose, well-documented; one cosmetic non-null assertion (`appleLanguages[0]!`) |
| packages/react-native/src/__tests__/device.test.ts | accepted | 14 tests, comprehensive fallbacks + cache + viewport + parity-ladder |
| packages/react-native/src/index.ts | accepted | append-only re-exports as the worktree.md prescribes |
| packages/react-native/test/__mocks__/react-native.ts | accepted | shared-reference `I18nManager` correctly mirrors real RN; no collision with parallel worktrees |
| **(missing) `.changeset/<slug>.md`** | **REQUIRED** | hard CI blocker — see PR Hygiene |

---

## Required actions before merge (in priority order)

1. ~~**HARD BLOCKER:** Add a changeset entry under `.changeset/` so the `check` workflow goes green. Suggested content above.~~ **Done** — `.changeset/react-native-device-context.md` added with populated minor-bump body.

## Recommended (non-blocking) follow-ups

2. ~~Replace `appleLanguages[0]!` non-null assertion with a bind-then-narrow pattern (`device.ts:120-125`) for stylistic consistency with the other two locale branches.~~ **Done** — bind-then-narrow + `length > 0` guard now applied; new test pins the empty-string fall-through.
3. ~~Add one `Platform.OS = 'macos'` test row to pin the broader-platform matrix and prove the implementation degrades gracefully on RN-macOS / Windows / Web.~~ **Done** — RN-macOS test row added; pins `device_context.platform === 'react-native-macos'`, `sdk.platform === 'macos'`, and the `ua` string.
4. **Carries forward to WT-rn-provider-hook PR (#83+#84) — out of scope for #85 by reviewer's own framing.** Wire `collectDeviceContext()` into the submit payload via a `BrevwickConfig.deviceContext` slot or an override hook on the core. Inline forward-look note already present in `device.ts:37-41` JSDoc on `DeviceContext`. The example app (#89/#90) must exercise this on staging before WT-rn-release.
5. **Carries forward to WT-rn-provider-hook PR (#83+#84) — design call for the wiring author and core owner.** `composePayload()` (`packages/sdk/src/submit.ts:481-530`) currently hard-codes `device_context`. The wiring PR will introduce either (a) `config.deviceContext?: () => DeviceContext` (flexible for future adapters) or (b) RN provider replaces the `submit()` path wholesale. Recorded here so the WT-rn-provider-hook author has a clear pickup point; not actionable inside this PR's scope (acceptance criterion of #85 explicitly only ships the collector).

---

## Validation — 2026-05-02

**Verdict**: APPROVED

### Items Confirmed Fixed

- [x] **HARD BLOCKER — changeset** — confirmed at `.changeset/react-native-device-context.md:1-13`. Frontmatter declares `'@tatlacas/brevwick-react-native': minor`, body documents the wire shape, the Flutter parity choice, the deliberate `device_context.platform` divergence, the cache semantics, and the deferred wiring. The `linked` group in `.changeset/config.json:9-19` includes `@tatlacas/brevwick-react-native`, so the lockstep bump propagates as claimed. `gh pr checks 96`: `check (Changeset check)` is GREEN.
- [x] **Locale fallback nit (`appleLanguages[0]!` non-null assertion)** — confirmed at `packages/react-native/src/device.ts:119-125`. Bind-then-narrow idiom (`const first = appleLanguages[0]; if (typeof first === 'string' && first.length > 0) return first;`) is now consistent with the AppleLocale branch (line 115-118) and the androidLocale branch (line 131-134). Empty-string `AppleLanguages[0]` falls through to I18nManager.localeIdentifier as designed. Pinned by `device.test.ts:169-176` ("skips an empty-string AppleLanguages[0] and falls through to the next link").
- [x] **Coverage gap nit (Platform.OS = 'macos' test row)** — confirmed at `packages/react-native/src/__tests__/device.test.ts:95-112`. Asserts `device_context.platform === 'react-native-macos'`, `sdk.platform === 'macos'`, `ua === 'react-native macos 14.0'`. Pins the wider-platform contract.

### Items Returned to Fixer

None.

### Independent Findings

- **Wire-shape parity vs Flutter** — confirmed byte-for-byte (`~/repos/brevwick/brevwick-sdk-flutter/lib/src/device.dart:138-147`): `{ if (ua != null) 'ua', if (locale != null) 'locale', if (viewport != null) 'viewport', 'platform', 'sdk: { name, version, platform } }`. RN `device.ts:163-172` returns the identical shape; optional fields drop via `JSON.stringify` when `undefined`. Only `device_context.platform` (`'react-native-ios' | 'react-native-android' | 'react-native-macos'` ...) deliberately differs from Flutter's `'ios' | 'android' | 'macos' | ...` — documented at `device.ts:10-14`, the worktree.md, and the changeset body.
- **Wire-shape parity vs core JS SDK** — confirmed at `packages/sdk/src/submit.ts:436-453, 515-521`: same `{ ua, locale, viewport: {w, h}, routePath }` + `device_context.{ ua, locale, viewport, platform, sdk }` shape. No `os_version`, no `scale`/`fontScale` — same triage contract.
- **Scope** — `git diff origin/main...HEAD --stat` confirms only the documented paths changed: `.changeset/react-native-device-context.md`, `notes/reviews/pr-96-claude-review.md`, `packages/react-native/src/{device.ts, __tests__/device.test.ts, index.ts}`, `packages/react-native/test/__mocks__/react-native.ts`. No core (`packages/sdk/`) edits, no scope creep into other adapters. (An unstaged `packages/angular/src/lib/internal/version.ts` bump exists in the worktree but is not part of any PR commit and is unrelated to #96.)
- **CLAUDE.md compliance** — no Co-Authored-By, no Claude attribution, no `🤖` glyph in any new file, in the fixer commit message, or in the PR title/body. Conventional-commit subjects on both PR commits (`feat(react-native): device context collector (#85)`, `fix(react-native): address PR #96 review (changeset + nits)`). Branch name matches `feat/issue-85-rn-device`. Squash-only base configured at `main`.
- **Banned-phrase audit** — none in strikethroughs. The strike-outs (lines 148, 152, 153) are: "changeset added", "bind-then-narrow + length>0 guard now applied", "RN-macOS test row added" — all real. Phrases such as "out of scope" / "deferred" / "follow-up" appear in earlier `[x]` items and the unstruck items 4-5, but they reflect the reviewer's original framing of the wiring carry-over to WT-rn-provider-hook (#83+#84) and the worktree.md scope split — not fixer scapegoating.

### Tooling

- `pnpm install --frozen-lockfile`: pass (lockfile up to date)
- `pnpm format:check`: pass (all matched files use Prettier code style)
- `pnpm lint`: pass (eslint clean across all packages)
- `pnpm type-check`: pass (all 7 packages clean)
- `pnpm test:cover`: pass (16/16 in `@tatlacas/brevwick-react-native`; `device.ts` 100%/100%/100%/100%; mock file's residual `Platform.select` branches account for the package-level dip to 90%/92%/85.71%/89.74% — not `device.ts` regressions)
- `pnpm build`: pass (RN ESM 969 B, CJS 1.47 KB, DTS 1.43 KB; `dist/index.d.ts` exports `BREVWICK_REACT_NATIVE_VERSION`, `type DeviceContext`, `collectDeviceContext`)
- `gh pr checks 96`: all 6 required checks GREEN — `check (Changeset)`, `check (CI)`, `verify-signatures`, `size-check`, `codecov/patch`, `codecov/project`.
