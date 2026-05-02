# brevwick-sdk-js react-native Worktrees

10 issues across 8 worktrees in 4 tiers. New `@tatlacas/brevwick-react-native` adapter package mirroring `packages/react/` shape but built on RN primitives. The core (`@tatlacas/brevwick-sdk`) is reused unchanged — rings, redaction, submit pipeline, and types all run on Hermes/JSC. Only DOM-specific concerns (screenshot, route ring, device context, FAB UI) get RN replacements.

Tier 0 is gated: WT-rn-scaffold (#82) must land before any other worktree branches; once merged, four worktrees in Tier 1 run in parallel against independent files. Tier 2 bundles UI + example/docs; Tier 3 cuts the beta release.

**Key references:**

- `CLAUDE.md` (this repo) — pnpm workspace publishing multiple npm packages; bundle budget DO NOT EXCEED; redaction mandatory; lockstep versioning; squash-merge only; no Co-Authored-By
- [SDD § 12 SDK contracts](https://github.com/tatlacas-com/brevwick-ops/blob/main/docs/brevwick-sdd.md#12-sdk-contracts) — public API contract every adapter must satisfy
- Plan document: `/Users/tatlacas/.claude/plans/we-now-have-sdks-generic-dolphin.md`
- Issues: [#82](https://github.com/tatlacas-com/brevwick-sdk-js/issues/82) scaffold, [#83](https://github.com/tatlacas-com/brevwick-sdk-js/issues/83) provider, [#84](https://github.com/tatlacas-com/brevwick-sdk-js/issues/84) useFeedback, [#85](https://github.com/tatlacas-com/brevwick-sdk-js/issues/85) device, [#86](https://github.com/tatlacas-com/brevwick-sdk-js/issues/86) screenshot, [#87](https://github.com/tatlacas-com/brevwick-sdk-js/issues/87) route ring, [#88](https://github.com/tatlacas-com/brevwick-sdk-js/issues/88) FeedbackButton, [#89](https://github.com/tatlacas-com/brevwick-sdk-js/issues/89) Expo example, [#90](https://github.com/tatlacas-com/brevwick-sdk-js/issues/90) docs, [#91](https://github.com/tatlacas-com/brevwick-sdk-js/issues/91) release
- Companion repos:
  - `brevwick-ops/react-native-worktree.md` — SDD § 12.4 + ADR-0008 (1 worktree)
  - `brevwick-web/react-native-worktree.md` — registry + marketing + onboarding (3 worktrees)
- Existing packages to mirror: `packages/react/` (closest template — provider, hook, FAB, context), `packages/sdk/` (core, reused as-is via `workspace:*`)
- Flutter SDK precedent: `brevwick-sdk-flutter/lib/src/` for mobile patterns (route observer, screenshot scope, device context shape, never-throws semantics)

**Conventions (apply to every worktree):**

- pnpm workspace; tsup builds; vitest tests; size-limit enforces bundle budget
- Bundle budget DO NOT EXCEED — `@tatlacas/brevwick-react-native` core ≤ 8 kB gzip, on-FAB-open ≤ 25 kB gzip; `react-native-view-shot` is host-supplied and not counted
- `sideEffects: false` in the new package
- Hand-written mocks (function-field style); no mocking frameworks; mock `react-native` with a tiny stub for unit tests
- Redaction mandatory — every payload through `redact()` before leaving device; new context fields ship with redaction tests
- Wire format parity with `@tatlacas/brevwick-sdk` and `brevwick` (Flutter); `device_context.platform` is `react-native-ios` / `react-native-android` (the only deliberate divergence; documented in #52 SDD update)
- Never-throws contract: `submit()` and `captureScreenshot()` must resolve, never reject. Placeholder PNG (1×1 transparent) when capture fails or `react-native-view-shot` peer is absent.
- Conventional commits, subject ≤ 72 chars; no Co-Authored-By
- CI gauntlet green locally before push: `pnpm install --frozen-lockfile && pnpm lint && pnpm type-check && pnpm test && pnpm build`
- Squash-merge into `main` only
- **Do not remove worktrees** — the user cleans them up

---

## Grouping rationale (why 8 worktrees)

**Tier 0 — WT-rn-scaffold (#82) must land alone first.** Every other worktree needs `packages/react-native/` to exist and pnpm to resolve `@tatlacas/brevwick-react-native` from `workspace:*`. Splitting any feature work into the same PR as the scaffold makes the CI gauntlet murkier and forces reviewers to read structural choices (peer-dep matrix, tsup externals, Metro `react-native` field) inline with feature logic.

**Tier 1 — four parallel worktrees** built on independent source files:

- WT-rn-provider-hook (#83 + #84 bundled): provider and `useFeedback` share `context.ts` + `internal-bridge.ts`; bundling them avoids two PRs both editing the same context file. They are also the only Tier-1 worktree the FAB depends on, so bundling tightens the critical path.
- WT-rn-device (#85): only `device.ts` and a wire-shape test. No overlap with provider/hook.
- WT-rn-screenshot (#86): only `screenshot.ts` plus the optional-peer dynamic import. No overlap with anything else in Tier 1.
- WT-rn-route-ring (#87): only `rings/route.ts`. Touches provider's `navigationRef` prop interface, but the prop slot lands in WT-rn-provider-hook; this worktree wires the subscription. Coordinated by rebasing on whichever lands first.

**Tier 2 — two parallel worktrees** for UI and consumer-facing material:

- WT-rn-feedback-button (#88): the FAB + Modal. Depends on provider/hook (Tier 1) and screenshot (Tier 1).
- WT-rn-example-docs (#89 + #90 bundled): example Expo app and the canonical README share install snippets, env-var conventions, and verify steps. Two PRs editing both would conflict on copy and snippet alignment; bundling produces one coherent "here's how a user installs" diff.

**Tier 3 — WT-rn-release (#91)** alone. Changesets entry, version bump, npm provenance verification, optional size-limit budgets. Touches `.changeset/`, root `package.json`, and `packages/react-native/package.json`; landing in parallel with Tier 2 risks publishing a half-baked surface area.

**Shared-file conflict surface across Tier 1 worktrees:**

- `packages/react-native/src/index.ts` — append-only re-exports; rebase + concatenate.
- `packages/react-native/package.json` `dependencies` — peer-dep additions are append-only.
- `pnpm-lock.yaml` — regenerated on rebase.

No structural conflicts expected.

---

## Dependency map

```
TIER 0 — At T+0 (1 worktree, blocks everything)
  WT-rn-scaffold:           #82  packages/react-native skeleton + tsup + vitest

TIER 1 — After WT-rn-scaffold merges (4 parallel)
  WT-rn-provider-hook:      #83 + #84 bundled  provider + context + useFeedback
  WT-rn-device:             #85  device context (Platform/Dimensions/locale)
  WT-rn-screenshot:         #86  react-native-view-shot optional peer + placeholder
  WT-rn-route-ring:         #87  React Navigation onStateChange subscription

TIER 2 — After Tier 1 fully landed (2 parallel)
  WT-rn-feedback-button:    #88  FAB + Modal + theme
  WT-rn-example-docs:       #89 + #90 bundled  Expo example app + README

TIER 3 — After Tier 2 merges (1 worktree)
  WT-rn-release:            #91  changesets + 0.1.0-beta.0 publish
```

Worktrees live at `/Users/tatlacas/repos/brevwick/brevwick-sdk-js-wt-rn-<slug>`.

---

## TIER 0

---

### Worktree rn-scaffold: packages/react-native skeleton + tsup + vitest (#82)

Lands the empty workspace package: `package.json`, `tsup.config.ts`, `tsconfig.json`, `vitest.config.ts`, README stub, and a placeholder `src/index.ts`. After merge, `pnpm install` is green, `pnpm -r build/test/type-check` picks up the new package, and the public entry exports nothing yet. **Every other Tier-1 worktree branches from this commit.**

**Scope:** `packages/react-native/` (new) only. No edits to `packages/sdk/` or `packages/react/`. Touches root `pnpm-workspace.yaml` only if `packages/*` glob doesn't already match (verify; expected to already match).

**Depends on:** none.
**Blocks:** all other Tier 1+ worktrees.
**Can run in parallel with:** anything outside this initiative.

```bash
cd /Users/tatlacas/repos/brevwick/brevwick-sdk-js
git fetch origin
git worktree add ../brevwick-sdk-js-wt-rn-scaffold -b chore/issue-82-react-native-scaffold origin/main
cd ../brevwick-sdk-js-wt-rn-scaffold

claude --dangerously-skip-permissions "
You are scaffolding the React Native adapter package for brevwick-sdk-js. Issue #82 on tatlacas-com/brevwick-sdk-js.

THIS REPO: \$(pwd)

STEP 1 — Read project context:
- Read CLAUDE.md fully — bundle budget, redaction, lockstep versioning, no Co-Authored-By.
- Read packages/react/package.json, packages/react/tsup.config.ts, packages/react/tsconfig.json, packages/react/vitest.config.ts — they are the closest template.
- Read packages/sdk/package.json for the core's exports/types layout.
- Run: gh api repos/tatlacas-com/brevwick-sdk-js/issues/82 --jq '.body'
- Read the plan: /Users/tatlacas/.claude/plans/we-now-have-sdks-generic-dolphin.md (architecture + critical files sections).

STEP 2 — Create packages/react-native/package.json:
- name: '@tatlacas/brevwick-react-native'
- version: '1.0.0-beta.0' (lockstep with suite, will be bumped to next beta in #91)
- license: 'MIT'
- type: 'module'
- main / module / types / exports mirroring packages/react/package.json
- ADD a top-level 'react-native' field pointing to './src/index.ts' so Metro bundlers prefer source over dist (matches the RN library convention)
- peerDependencies: '@tatlacas/brevwick-sdk': 'workspace:*', 'react': '>=18 <20', 'react-native': '>=0.72 <0.78'
- peerDependenciesMeta: 'react-native-view-shot': { optional: true }
- devDependencies: react, react-native, @types/react, @testing-library/react-native (for future use), vitest, typescript, tsup
- publishConfig: { access: 'public', provenance: true }
- scripts: build (tsup), dev (tsup --watch), test (vitest run), test:cover, type-check (tsc --noEmit)

STEP 3 — Create packages/react-native/tsup.config.ts:
- entry: ['src/index.ts']
- format: ['cjs', 'esm']
- dts: true
- sourcemap: true
- clean: true
- external: ['react', 'react-native', 'react-native-view-shot', '@tatlacas/brevwick-sdk']

STEP 4 — Create packages/react-native/tsconfig.json:
- extends '../../tsconfig.base.json'
- compilerOptions.jsx: 'react-jsx'
- include: ['src/**/*']

STEP 5 — Create packages/react-native/vitest.config.ts:
- environment: 'jsdom' (until we add a proper RN test env)
- alias 'react-native' → './src/__mocks__/react-native.ts' for now (empty stub returning {})
- setupFiles: optional 'vitest.setup.ts' if needed

STEP 6 — Create packages/react-native/src/__mocks__/react-native.ts (vitest stub):
- export const Platform = { OS: 'ios', Version: '17.0', select: (m: any) => m.ios ?? m.default }
- export const Dimensions = { get: () => ({ width: 390, height: 844, scale: 3, fontScale: 1 }) }
- export const NativeModules = { SettingsManager: { settings: { AppleLocale: 'en_US' } } }
- export const I18nManager = { localeIdentifier: 'en_US' }
- enough to keep import-time evaluation safe in unit tests; richer mocks ride along with the feature worktrees

STEP 7 — Create packages/react-native/src/index.ts (placeholder):
- export {} for now; feature worktrees fill this in
- Top comment: 'Brevwick React Native adapter — public exports added by feature worktrees (#83 onwards).'

STEP 8 — Create packages/react-native/README.md (stub):
- One-liner: '@tatlacas/brevwick-react-native — drop-in QA feedback widget for React Native (Expo + bare). Coming soon. Tracking: tatlacas-com/brevwick-sdk-js#82'
- Link to canonical docs (filled in by #90).

STEP 9 — Verify:
- pnpm install (no peer warnings beyond optional react-native-view-shot)
- pnpm -r build (new package builds to dist/ with empty exports)
- pnpm -r type-check
- pnpm -r test (vitest passes with zero tests)
- pnpm lint (no new violations)

STEP 10 — Commit and PR:
git add packages/react-native pnpm-lock.yaml
git commit -m 'chore(react-native): scaffold packages/react-native (#82)'
git push -u origin chore/issue-82-react-native-scaffold
gh pr create --title 'chore(react-native): scaffold packages/react-native' --body \"\$(cat <<'PREOF'
Closes #82

Empty workspace package skeleton for the upcoming React Native adapter. Mirrors packages/react/ conventions (tsup CJS+ESM build, vitest, tsconfig). Adds the 'react-native' field for Metro source preference and declares 'react-native-view-shot' as an optional peer dep so the never-throws screenshot path can lazy-import without forcing every consumer to install it.

## Summary
- packages/react-native/ skeleton: package.json, tsup.config.ts, tsconfig.json, vitest.config.ts, README stub
- src/index.ts placeholder; feature work lands in #83 onwards
- vitest stub for 'react-native' so unit tests in feature worktrees work without an emulator
- No edits to packages/sdk or packages/react

## Out of scope (covered by follow-ups)
- Provider, hook, FAB, screenshot, route ring, device context — #83–#88
- Example app + README — #89, #90
- Beta release — #91

## Test plan
- [ ] CI green: lint, type-check, test, build
- [ ] pnpm install resolves with no peer-dep warnings beyond the optional react-native-view-shot
- [ ] No regression in existing packages (sdk, react, solid, vue, svelte, angular)
PREOF
)\"
"
```

---

## TIER 1

---

### Worktree rn-provider-hook: BrevwickProvider + context + useFeedback (#83 + #84)

Bundled because `useFeedback` depends on the context shape installed by `BrevwickProvider`; splitting them creates two PRs both editing `src/context.ts` and `src/internal-bridge.ts`. Mirrors `packages/react/src/{provider.tsx,context.ts,use-feedback.ts,internal-bridge.ts}` 1:1 except for any DOM-specific guards.

**Scope:** `packages/react-native/src/{context.ts,provider.tsx,use-feedback.ts,internal-bridge.ts,index.ts}`. Tests under `packages/react-native/src/__tests__/`. No edits to other packages.

**Depends on:** WT-rn-scaffold (#82) merged.
**Blocks:** WT-rn-feedback-button (#88), WT-rn-example-docs (#89 + #90).
**Can run in parallel with:** WT-rn-device, WT-rn-screenshot, WT-rn-route-ring.

```bash
cd /Users/tatlacas/repos/brevwick/brevwick-sdk-js
git fetch origin
git worktree add ../brevwick-sdk-js-wt-rn-provider-hook -b feat/issue-83-84-rn-provider-hook origin/main
cd ../brevwick-sdk-js-wt-rn-provider-hook

claude --dangerously-skip-permissions "
You are landing the Brevwick React Native provider + useFeedback bundle. Issues #83 and #84 on tatlacas-com/brevwick-sdk-js, single PR.

THIS REPO: \$(pwd)

STEP 1 — Read project context:
- Read CLAUDE.md fully.
- Read packages/react/src/{provider.tsx,context.ts,use-feedback.ts,internal-bridge.ts,index.ts} end-to-end. The RN port mirrors them exactly.
- Run: gh api repos/tatlacas-com/brevwick-sdk-js/issues/83 --jq '.body'
- Run: gh api repos/tatlacas-com/brevwick-sdk-js/issues/84 --jq '.body'
- Read the plan's Architecture and Public API sections.

STEP 2 — packages/react-native/src/context.ts:
- Mirror packages/react/src/context.ts: BrevwickContext = createContext<Brevwick | null>(null).
- Export useBrevwick() that throws synchronously if used outside provider — same error message contract as web React.

STEP 3 — packages/react-native/src/provider.tsx:
- Mirror packages/react/src/provider.tsx: memoise createBrevwick(config) on referential identity of config; install() in useEffect; uninstall() on cleanup; remount with same config no-ops.
- Add navigationRef prop typed loosely as { current: { addListener: (event: string, cb: any) => () => void; getCurrentRoute?: () => any } | null } to avoid hard dep on @react-navigation/native. The route-ring worktree (#87) reads this prop; provider only forwards.
- Server/test-env guard: if typeof globalThis.window === 'undefined' AND typeof globalThis.HermesInternal === 'undefined' (no RN runtime, no jsdom), no-op. RN dev-server scenarios never trip this.
- 'use client' directive NOT needed (RN has no SSR).

STEP 4 — packages/react-native/src/internal-bridge.ts:
- Mirror packages/react/src/internal-bridge.ts: the phase-bus subscription helper used by useFeedback.

STEP 5 — packages/react-native/src/use-feedback.ts:
- Mirror packages/react/src/use-feedback.ts return shape: { submit, captureScreenshot, status, phase, error, retry, reset }.
- Reset on success after 2s — match web React semantics.
- Throw if rendered outside provider.

STEP 6 — packages/react-native/src/index.ts:
- Append-only: export { BrevwickProvider, useBrevwick } from './provider'; export { useFeedback } from './use-feedback'; re-export types from '@tatlacas/brevwick-sdk' (BrevwickConfig, FeedbackInput, SubmitResult, etc.) so RN consumers don't need a second install.

STEP 7 — Tests under packages/react-native/src/__tests__/:
- provider.test.tsx: mounts provider → instance installed; remount with same config → no double install; unmount → uninstall called.
- use-feedback.test.tsx: phase transitions emit expected status; retry() re-runs last submit; reset() returns to idle; throws outside provider.
- Use the existing vitest stub for 'react-native' from #82.

STEP 8 — Verify:
- pnpm --filter @tatlacas/brevwick-react-native test
- pnpm --filter @tatlacas/brevwick-react-native build (verify dist contains the new exports)
- pnpm -r type-check

STEP 9 — Commit and PR:
git add packages/react-native
git commit -m 'feat(react-native): provider + useFeedback hook (#83, #84)'
git push -u origin feat/issue-83-84-rn-provider-hook
gh pr create --title 'feat(react-native): provider + useFeedback hook' --body \"\$(cat <<'PREOF'
Closes #83
Closes #84

BrevwickProvider + useFeedback hook for the React Native adapter, mirroring @tatlacas/brevwick-react 1:1 with RN-specific guards (no SSR, navigationRef prop forwarded for the route ring).

## Summary
- packages/react-native/src/{context.ts,provider.tsx,use-feedback.ts,internal-bridge.ts}
- navigationRef prop slot on the provider (consumed by #87)
- Tests cover lifecycle, phase transitions, retry/reset, outside-provider error

## Test plan
- [ ] vitest green
- [ ] No bundle-budget regressions (size-limit not yet wired; visual diff of dist/ size acceptable)
- [ ] pnpm -r type-check green
PREOF
)\"
"
```

---

### Worktree rn-device: device context — Platform/Dimensions/locale (#85)

Auto-collects RN device context for every submit. Wire-shape matches Flutter SDK's `device_context` (snake_case) per SDD § 12.

**Scope:** `packages/react-native/src/device.ts` and a snapshot test of the wire shape per platform.

**Depends on:** WT-rn-scaffold (#82) merged.
**Blocks:** nothing.
**Can run in parallel with:** WT-rn-provider-hook, WT-rn-screenshot, WT-rn-route-ring.

```bash
cd /Users/tatlacas/repos/brevwick/brevwick-sdk-js
git fetch origin
git worktree add ../brevwick-sdk-js-wt-rn-device -b feat/issue-85-rn-device origin/main
cd ../brevwick-sdk-js-wt-rn-device

claude --dangerously-skip-permissions "
You are landing the React Native device-context collector. Issue #85 on tatlacas-com/brevwick-sdk-js.

THIS REPO: \$(pwd)

STEP 1 — Read context:
- Read CLAUDE.md.
- Run: gh api repos/tatlacas-com/brevwick-sdk-js/issues/85 --jq '.body'
- Read the Flutter precedent: /Users/tatlacas/repos/brevwick/brevwick-sdk-flutter/lib/src/device.dart for wire-shape parity.
- Read the plan's 'What's RN-specific' table.

STEP 2 — packages/react-native/src/device.ts:
- collectDeviceContext(): DeviceContext returns:
  - platform: \`react-native-\${Platform.OS}\` (e.g., 'react-native-ios', 'react-native-android')
  - os_version: String(Platform.Version)
  - viewport: { width, height, scale, fontScale } from Dimensions.get('window')
  - locale: NativeModules.SettingsManager?.settings?.AppleLocale (iOS) || NativeModules.I18nManager?.localeIdentifier (Android) || 'en-US'
  - sdk: { name: 'brevwick-react-native', version: <package version, read at build time>, platform: Platform.OS }
- Cache the static fields at first call; re-read locale + viewport per submit (orientation changes; locale switching).
- All snake_case fields must match Flutter wire shape EXACTLY. Verify against /Users/tatlacas/repos/brevwick/brevwick-sdk-flutter/lib/src/device.dart.

STEP 3 — Wire into the provider:
- The provider's userContext callback path merges device context into the submit payload via a small helper (or pass collectDeviceContext as the userContext-extending function).
- Confirm the core's BrevwickConfig.userContext is callable; if not, add a deviceContext config slot to the RN-side provider that wraps it.

STEP 4 — Tests:
- Snapshot the device-context shape for ios + android (mock Platform.OS in vitest stub).
- Locale fallback: when SettingsManager.settings undefined → I18nManager.localeIdentifier; when both undefined → 'en-US'.

STEP 5 — Verify + commit + PR:
- pnpm --filter @tatlacas/brevwick-react-native test
git add packages/react-native
git commit -m 'feat(react-native): device context collector (#85)'
git push -u origin feat/issue-85-rn-device
gh pr create --title 'feat(react-native): device context collector' --body \"\$(cat <<'PREOF'
Closes #85

Auto-collects Platform.OS/Version, viewport from Dimensions.get('window'), and locale (iOS SettingsManager + Android I18nManager fallback). Wire-shape matches Flutter SDK device_context exactly so triage UI does not branch on platform.

## Summary
- packages/react-native/src/device.ts
- device_context.platform = 'react-native-ios' | 'react-native-android'
- Locale fallback chain documented inline
- Snapshot tests per platform

## Test plan
- [ ] vitest snapshots stable
- [ ] Diff against Flutter device_context: only platform string differs
PREOF
)\"
"
```

---

### Worktree rn-screenshot: react-native-view-shot optional peer + placeholder (#86)

Native widget capture via `react-native-view-shot`, lazy-imported as an optional peer dep. Returns a 1×1 transparent PNG when the peer is absent or capture fails — preserves the never-throws contract.

**Scope:** `packages/react-native/src/screenshot.ts`, `packages/react-native/src/skip.tsx` (BrevwickSkip wrapper), tests for absence + success + failure paths.

**Depends on:** WT-rn-scaffold (#82) merged.
**Blocks:** WT-rn-feedback-button (#88).
**Can run in parallel with:** WT-rn-provider-hook, WT-rn-device, WT-rn-route-ring.

```bash
cd /Users/tatlacas/repos/brevwick/brevwick-sdk-js
git fetch origin
git worktree add ../brevwick-sdk-js-wt-rn-screenshot -b feat/issue-86-rn-screenshot origin/main
cd ../brevwick-sdk-js-wt-rn-screenshot

claude --dangerously-skip-permissions "
You are landing the React Native screenshot path. Issue #86 on tatlacas-com/brevwick-sdk-js.

THIS REPO: \$(pwd)

STEP 1 — Read context:
- Read CLAUDE.md (never-throws contract section; redaction not relevant here but referenced).
- Read packages/sdk/src/screenshot.ts for the placeholder semantics — the RN path mirrors them.
- Run: gh api repos/tatlacas-com/brevwick-sdk-js/issues/86 --jq '.body'
- Read Flutter precedent: /Users/tatlacas/repos/brevwick/brevwick-sdk-flutter/lib/src/screenshot.dart (especially BrevwickSkip refcount).

STEP 2 — packages/react-native/src/screenshot.ts:
- captureScreenshot(viewRef: RefObject<View>): Promise<Blob>
- Lazy: const mod = await import('react-native-view-shot').catch(() => null)
- If mod === null OR mod.captureRef is missing → return placeholderPng() (1×1 transparent, content-type image/png).
- captureRef(viewRef, { format: 'png', quality: 0.9, result: 'data-uri' }): wrap in try/catch; failure → placeholder.
- SHA-256 of bytes for presign integrity (use the core's existing hash util if exposed; otherwise polyfill via expo-crypto OR rely on the core to hash post-attachment-creation).
- Cache the dynamic import promise to avoid re-importing on subsequent captures.

STEP 3 — packages/react-native/src/skip.tsx:
- <BrevwickSkip>{children}</BrevwickSkip> wraps a subtree; sets a marker on the underlying View ref so the screenshot path can hide-then-restore via setNativeProps({ opacity: 0 }) or a refcount-aware Visibility-equivalent.
- Refcount via WeakMap so concurrent captures don't double-restore.
- Mirror Flutter's BrevwickSkip pattern in /Users/tatlacas/repos/brevwick/brevwick-sdk-flutter/lib/src/screenshot.dart.

STEP 4 — Wire into the provider's instance.captureScreenshot:
- The core's createBrevwick().captureScreenshot is DOM-specific; RN provider overrides via the existing 'capture override' pattern in the core (verify: packages/sdk/src/screenshot.ts may expose a hook). If not exposed, add a thin override layer on the RN provider so useFeedback().captureScreenshot calls the RN path.

STEP 5 — Tests:
- Peer absent: captureScreenshot resolves to placeholder Blob; submit() resolves ok=true with placeholder attachment.
- Peer present, captureRef succeeds: real bytes returned; SHA-256 differs from placeholder.
- Peer present, captureRef throws: placeholder returned (no rejection bubbles up).

STEP 6 — Verify + commit + PR:
- pnpm --filter @tatlacas/brevwick-react-native test
git add packages/react-native
git commit -m 'feat(react-native): screenshot via react-native-view-shot optional peer (#86)'
git push -u origin feat/issue-86-rn-screenshot
gh pr create --title 'feat(react-native): screenshot via react-native-view-shot optional peer' --body \"\$(cat <<'PREOF'
Closes #86

Native widget-tree capture via react-native-view-shot, declared as an OPTIONAL peer dep. Returns a 1x1 transparent PNG placeholder when the peer is absent (Expo Go scenario) or capture fails — preserves never-throws contract from SDD § 12 line 1549.

## Summary
- packages/react-native/src/screenshot.ts (lazy import + placeholder)
- packages/react-native/src/skip.tsx (BrevwickSkip wrapper, refcount-aware)
- Bundle: screenshot path adds < 1 kB to our package; peer pulled from host

## Out of scope
- Custom native module (Swift/Kotlin) — explicitly deferred per plan
- Annotation / region-select on screenshot — Phase 5

## Test plan
- [ ] Peer absent → submit ok with placeholder
- [ ] Peer present + success → real bytes
- [ ] Peer present + throw → placeholder
PREOF
)\"
"
```

---

### Worktree rn-route-ring: React Navigation onStateChange subscription (#87)

20-entry FIFO route ring matching SDD § 12. Subscribes to React Navigation's `onStateChange` via the `navigationRef` prop on `BrevwickProvider`. Expo Router rides on React Navigation under the hood, so the same hook serves both.

**Scope:** `packages/react-native/src/rings/route.ts`. Wires into the provider's `navigationRef` prop slot landed by WT-rn-provider-hook.

**Depends on:** WT-rn-scaffold (#82) merged. Coordinates with WT-rn-provider-hook (#83+#84) on the navigationRef prop interface — rebase on whichever lands first.
**Blocks:** WT-rn-example-docs (#89 + #90) wants this for the route demo, but the example app can be wired without it and updated post-merge.
**Can run in parallel with:** WT-rn-provider-hook, WT-rn-device, WT-rn-screenshot.

```bash
cd /Users/tatlacas/repos/brevwick/brevwick-sdk-js
git fetch origin
git worktree add ../brevwick-sdk-js-wt-rn-route-ring -b feat/issue-87-rn-route-ring origin/main
cd ../brevwick-sdk-js-wt-rn-route-ring

claude --dangerously-skip-permissions "
You are landing the React Native route ring. Issue #87 on tatlacas-com/brevwick-sdk-js.

THIS REPO: \$(pwd)

STEP 1 — Read context:
- Read CLAUDE.md.
- Read packages/sdk/src/rings/ — the core's route ring buffer is reused; this worktree only changes the EVENT SOURCE.
- Read Flutter precedent: /Users/tatlacas/repos/brevwick/brevwick-sdk-flutter/lib/src/rings/route.dart (buffer + redaction semantics; 20-entry cap).
- Run: gh api repos/tatlacas-com/brevwick-sdk-js/issues/87 --jq '.body'
- IF WT-rn-provider-hook has merged: rebase onto origin/main and read packages/react-native/src/provider.tsx for the navigationRef prop shape.
- IF WT-rn-provider-hook has NOT merged: assume the prop interface { current: { addListener: ... } | null }; coordinate with that worktree on rebase.

STEP 2 — packages/react-native/src/rings/route.ts:
- attachRouteRing(navigationRef, push: (entry: { path: string; timestamp: number }) => void): () => void (returns unsubscribe)
- subscription = navigationRef.current?.addListener('state', () => {
    const route = navigationRef.current?.getCurrentRoute?.();
    if (!route) return;
    const path = redactPathParams(route.name);  // reuse core's redact() patterns
    push({ path, timestamp: Date.now() });
  })
- redactPathParams: redact tokens matching /(token|auth|key|session|sig)/i in route names + params.
- Cap at 20 (handled by core ring buffer; verify).
- Provider's useEffect calls attachRouteRing on mount + unsubscribes on unmount.

STEP 3 — Tests:
- Mock navigationRef with a tiny event-emitter stub.
- State change → entry pushed with redacted path.
- 21st state change → oldest entry dropped (verify ring cap).
- Unmount → unsubscribe called.
- Without navigationRef prop: no errors, ring stays empty.

STEP 4 — Verify + commit + PR:
- pnpm --filter @tatlacas/brevwick-react-native test
git add packages/react-native
git commit -m 'feat(react-native): route ring via React Navigation + Expo Router (#87)'
git push -u origin feat/issue-87-rn-route-ring
gh pr create --title 'feat(react-native): route ring via React Navigation + Expo Router' --body \"\$(cat <<'PREOF'
Closes #87

Subscribes to React Navigation's onStateChange via the provider's navigationRef prop. Same hook serves Expo Router (built on React Navigation). Reuses the core's existing 20-entry FIFO buffer; only the event source is RN-specific.

## Summary
- packages/react-native/src/rings/route.ts
- Path-param redaction: token/auth/key/session/sig
- 20-entry cap inherited from core
- Without navigationRef → ring stays empty (no errors)

## Out of scope
- react-native-navigation by Wix — open to follow-ups
- Deep-link parsing

## Test plan
- [ ] Navigation state change pushes entry
- [ ] Ring caps at 20
- [ ] Unmount unsubscribes
PREOF
)\"
"
```

---

## TIER 2

---

### Worktree rn-feedback-button: FAB + Modal + theme (#88)

Drop-in `<FeedbackButton />`: floating Pressable + RN `<Modal>` form. Matches `packages/react/src/feedback-button.tsx` UX. Honors project config (`ai_enabled`, `ai_submitter_choice_allowed`).

**Scope:** `packages/react-native/src/{feedback-button.tsx,feedback-modal.tsx,styles.ts}`. New `BrevwickTheme` type mirroring web React.

**Depends on:** Tier 1 fully landed — provider+hook (#83+#84), screenshot (#86). Device context (#85) and route ring (#87) optional but should be in.
**Blocks:** nothing (Tier 3 release waits, but only for completeness).
**Can run in parallel with:** WT-rn-example-docs.

```bash
cd /Users/tatlacas/repos/brevwick/brevwick-sdk-js
git fetch origin
git worktree add ../brevwick-sdk-js-wt-rn-feedback-button -b feat/issue-88-rn-feedback-button origin/main
cd ../brevwick-sdk-js-wt-rn-feedback-button

claude --dangerously-skip-permissions "
You are landing the React Native FeedbackButton + Modal. Issue #88 on tatlacas-com/brevwick-sdk-js.

THIS REPO: \$(pwd)

STEP 1 — Read context:
- Read CLAUDE.md (bundle budget — FAB + Modal < 25 kB gzip).
- Read packages/react/src/feedback-button.tsx end-to-end. The state machine is identical; only primitives change.
- Read packages/react/src/styles.ts for theme shape.
- Run: gh api repos/tatlacas-com/brevwick-sdk-js/issues/88 --jq '.body'

STEP 2 — packages/react-native/src/styles.ts:
- StyleSheet.create({...}) themes; export BrevwickTheme type identical to web React.

STEP 3 — packages/react-native/src/feedback-button.tsx:
- <Pressable> FAB with position: 'absolute', default bottom-right; props: style?, theme?, position? ('bottom-right' | 'bottom-left' | { bottom?: number; right?: number; left?: number }).
- accessibilityLabel: 'Send feedback'; accessibilityRole: 'button'.
- onPress opens FeedbackModal.
- Phase-based label: 'Send feedback' → 'Capturing…' → 'Sending…' → 'Sent ✓ / Try again' (matches web React copy).

STEP 4 — packages/react-native/src/feedback-modal.tsx:
- <Modal> with description (multiline TextInput), expected, actual, attachment preview (Image of screenshot; toggle to skip), submit button.
- Uses useFeedback() for state.
- 'Format with AI' toggle visible only if getConfig() returns ai_enabled && ai_submitter_choice_allowed.
- Modal traps focus on iOS via accessibilityViewIsModal.
- Cancel button + back-gesture closes modal without losing draft (state held in modal-local useState; reset on successful submit).

STEP 5 — index.ts exports:
- Append: export { FeedbackButton } from './feedback-button'; export type { BrevwickTheme } from './styles';

STEP 6 — Tests:
- Render <FeedbackButton />; press opens Modal; submit calls useFeedback().submit; error renders retry; success closes modal after 2s.
- Bundle: pnpm --filter @tatlacas/brevwick-react-native build, then check dist/index.js gzip size — record in PR body.

STEP 7 — Verify + commit + PR:
git add packages/react-native
git commit -m 'feat(react-native): FeedbackButton + Modal (#88)'
git push -u origin feat/issue-88-rn-feedback-button
gh pr create --title 'feat(react-native): FeedbackButton + Modal' --body \"\$(cat <<'PREOF'
Closes #88

Drop-in FAB + Modal feedback form for React Native. Mirrors @tatlacas/brevwick-react UX 1:1 with RN primitives (Pressable + Modal + StyleSheet). Honors project AI config flags.

## Summary
- <FeedbackButton /> floating Pressable, default bottom-right, themeable
- <FeedbackModal /> form: description / expected / actual / screenshot toggle
- Phase-based button label
- Accessible: accessibilityLabel + role + modal trap

## Bundle
- Recorded gzip size in this PR; budget is < 25 kB

## Out of scope
- Annotation / markup on screenshot — Phase 5
- Image picker for additional attachments — follow-up

## Test plan
- [ ] Render + interact tests pass
- [ ] Bundle within budget
- [ ] Manual test in example app (Tier 2 dependency)
PREOF
)\"
"
```

---

### Worktree rn-example-docs: Expo example app + canonical README (#89 + #90)

Bundled because both ship the same install snippet, env-var convention, and verify steps; splitting creates two PRs whose copy must be kept in sync. The example app under `examples/react-native/` doubles as the source of every snippet in the README.

**Scope:** `examples/react-native/` (new Expo SDK 51+ TypeScript app), `packages/react-native/README.md` (full canonical version). Possibly `pnpm-workspace.yaml` if `examples/*` glob doesn't already match (verify).

**Depends on:** Tier 1 fully landed (provider+hook, device, screenshot, route ring). FeedbackButton (#88) optional for the example but recommended; if not yet merged, example uses `useFeedback` + a manual `<Pressable>`.
**Blocks:** WT-rn-release (#91).
**Can run in parallel with:** WT-rn-feedback-button.

```bash
cd /Users/tatlacas/repos/brevwick/brevwick-sdk-js
git fetch origin
git worktree add ../brevwick-sdk-js-wt-rn-example-docs -b docs/issue-89-90-rn-example-docs origin/main
cd ../brevwick-sdk-js-wt-rn-example-docs

claude --dangerously-skip-permissions "
You are landing the React Native example Expo app + canonical README. Issues #89 and #90 on tatlacas-com/brevwick-sdk-js, single PR.

THIS REPO: \$(pwd)

STEP 1 — Read context:
- Read CLAUDE.md (ship criterion: a third-party dev installs and wires in < 10 min).
- Read existing examples/next/, examples/vanilla/, examples/vite-react/ for shape.
- Read packages/react/README.md as the documentation tone template.
- Run: gh api repos/tatlacas-com/brevwick-sdk-js/issues/89 --jq '.body'
- Run: gh api repos/tatlacas-com/brevwick-sdk-js/issues/90 --jq '.body'

STEP 2 — examples/react-native/ (Expo SDK 51+):
- package.json: expo, react, react-native, @tatlacas/brevwick-react-native (workspace:*), react-native-view-shot (peer of choice for the example), @react-navigation/native, @react-navigation/stack, react-native-screens, react-native-safe-area-context.
- app.json, babel.config.js, tsconfig.json, metro.config.js (with watchFolders pointing to repo root for workspace links — see existing examples/ patterns).
- src/App.tsx: NavigationContainer (with useNavigationContainerRef), Stack with Home + Details screens, BrevwickProvider wrapping NavigationContainer, FeedbackButton at root.
- src/screens/Home.tsx: buttons for 'Open feedback', 'Throw test error', 'Trigger failed fetch', 'Navigate to Details'.
- src/screens/Details.tsx: trivial second screen for route-ring demo.
- .env.example with EXPO_PUBLIC_BREVWICK_PROJECT_KEY=pk_test_demo and EXPO_PUBLIC_BREVWICK_ENDPOINT (staging).
- README.md: 'pnpm install && pnpm --filter examples/react-native start' instructions; Expo Go vs dev-client guidance for screenshot.

STEP 3 — packages/react-native/README.md (full canonical):
- Quick-start (Expo): npx expo install @tatlacas/brevwick-react-native @tatlacas/brevwick-sdk + optional react-native-view-shot for screenshots.
- Quick-start (bare RN): npm install + pod install instructions.
- Peer-dep matrix: react ≥18 <20, react-native ≥0.72 <0.78, react-native-view-shot (optional).
- Provider + FAB minimal snippet (copy verbatim from examples/react-native/src/App.tsx).
- Route ring snippet with useNavigationContainerRef().
- Expo Go limitation: react-native-view-shot needs a custom dev client; in Expo Go, screenshot returns a 1×1 placeholder. Link to https://docs.expo.dev/develop/development-builds/introduction/.
- Theming via theme prop.
- Troubleshooting:
  - Metro 'react-native' field issues — ensure metro.config.js has resolver.unstable_enablePackageExports OR include packages/react-native/dist in watchFolders.
  - Hermes vs JSC — both supported.
  - Workspace resolution in monorepos — point at examples/react-native/metro.config.js as the reference.
- Cross-link from packages/react/README.md ('for React Native, see packages/react-native/').

STEP 4 — Cross-link root README.md:
- Add @tatlacas/brevwick-react-native to the package table at the top of brevwick-sdk-js/README.md.

STEP 5 — Verify:
- pnpm install (workspace resolves examples/react-native).
- pnpm --filter examples/react-native typecheck (Expo's tsc).
- Manual: pnpm --filter examples/react-native start, scan with Expo Go (or dev client), submit a feedback issue against staging, verify on staging dashboard:
  * device_context.platform = 'react-native-ios' or '-android'
  * console / network / route rings populated
  * screenshot present (or placeholder if Expo Go)

STEP 6 — Commit + PR:
git add examples/react-native packages/react-native/README.md README.md packages/react/README.md
git commit -m 'docs(react-native): example Expo app + canonical README (#89, #90)'
git push -u origin docs/issue-89-90-rn-example-docs
gh pr create --title 'docs(react-native): example Expo app + canonical README' --body \"\$(cat <<'PREOF'
Closes #89
Closes #90

Minimal Expo example exercising provider, FAB, route ring, and four context streams; canonical README pulling its snippets from the example app so install instructions stay verifiable.

## Summary
- examples/react-native/ Expo app (Stack with Home + Details, four context-stream demo buttons)
- packages/react-native/README.md (Expo + bare RN quick-starts, peer-dep matrix, navigationRef wiring, Expo Go caveat, troubleshooting)
- Cross-links from root README.md and packages/react/README.md

## Test plan
- [ ] pnpm --filter examples/react-native typecheck
- [ ] Manual submit from example produces all four context streams on staging dashboard
- [ ] README quick-start works in a fresh Expo SDK 51 app in < 10 min (SDD ship criterion)
PREOF
)\"
"
```

---

## TIER 3

---

### Worktree rn-release: changesets + 0.1.0-beta.0 publish (#91)

Cuts the first npm beta of `@tatlacas/brevwick-react-native`. Lockstep with the suite (currently `1.0.0-beta.x`). Optional: add `size-limit` budget entries so future PRs are gated.

**Scope:** `.changeset/*.md`, optionally `.size-limit.js` or `packages/react-native/.size-limit.json`. Verify `package.json publishConfig` already has `provenance: true` (set by #82).

**Depends on:** Tier 2 fully merged.
**Blocks:** nothing.
**Can run in parallel with:** companion brevwick-web registry flip (`coming-soon` → `live`) — cross-repo follow-up, not a blocker for this PR.

```bash
cd /Users/tatlacas/repos/brevwick/brevwick-sdk-js
git fetch origin
git worktree add ../brevwick-sdk-js-wt-rn-release -b chore/issue-91-rn-release origin/main
cd ../brevwick-sdk-js-wt-rn-release

claude --dangerously-skip-permissions "
You are cutting the first beta release of @tatlacas/brevwick-react-native. Issue #91 on tatlacas-com/brevwick-sdk-js.

THIS REPO: \$(pwd)

STEP 1 — Read context:
- Read CLAUDE.md (versioning section — lockstep until Phase 4 ships).
- Read .github/workflows/release.yml — confirm changesets-driven flow.
- Read existing .changeset/*.md for the format.
- Run: gh api repos/tatlacas-com/brevwick-sdk-js/issues/91 --jq '.body'

STEP 2 — Confirm version policy:
- The suite is currently at 1.0.0-beta.8. Match it: bump @tatlacas/brevwick-react-native to whatever the next beta is post all merges in this initiative.
- Alternative independent versioning starting at 0.1.0-beta.0 — ONLY if maintainer decides, otherwise default to lockstep.

STEP 3 — Create changeset:
- pnpm changeset
  - select: @tatlacas/brevwick-react-native (and any others touched by Tier 1+2 merges)
  - bump: minor (or whatever matches lockstep)
  - summary: 'Initial React Native adapter package: BrevwickProvider, useFeedback hook, FeedbackButton + Modal, react-native-view-shot optional-peer screenshot, React Navigation route ring, device context, Expo example app, canonical README. Mirrors @tatlacas/brevwick-react with RN primitives. Wire format identical except device_context.platform = react-native-{ios,android}.'
- Commit the .changeset/*.md file.

STEP 4 — Optional: size-limit budgets:
- Add entries to .size-limit.js (or .size-limit.json):
  - { name: '@tatlacas/brevwick-react-native (core)', path: 'packages/react-native/dist/index.js', limit: '8 KB' }
  - { name: '@tatlacas/brevwick-react-native (with FAB)', path: 'packages/react-native/dist/index.js', limit: '25 KB' }  // adjust if entry-points differ
- Run: pnpm size — fix any overage before merge.

STEP 5 — Verify provenance:
- packages/react-native/package.json publishConfig: { access: 'public', provenance: true } — should already be set by #82. Confirm.

STEP 6 — Commit + PR:
git add .changeset packages/react-native/package.json .size-limit.js
git commit -m 'chore(release): @tatlacas/brevwick-react-native first beta (#91)'
git push -u origin chore/issue-91-rn-release
gh pr create --title 'chore(release): @tatlacas/brevwick-react-native first beta' --body \"\$(cat <<'PREOF'
Closes #91

Cuts the first npm beta of @tatlacas/brevwick-react-native via changesets. Lockstep with the rest of the SDK suite. Adds size-limit entries so future PRs are budget-gated.

## Summary
- .changeset/*.md entry for @tatlacas/brevwick-react-native
- size-limit budgets: core < 8 kB, with FAB < 25 kB
- npm provenance already configured in package.json

## Verify post-merge
- npm view @tatlacas/brevwick-react-native versions lists the new beta
- Provenance attestation visible on the npm page
- Fresh Expo app: npm i @tatlacas/brevwick-react-native@beta resolves with correct peer-dep matrix

## Out of scope
- Public announcement (separate launch-readiness effort)
- brevwick-web registry flip from coming-soon to live (companion follow-up commit; not gated here)
PREOF
)\"
"
```

---

## Parallel execution cheat sheet

**At T+0:**

- WT-rn-scaffold (#82) — runs alone. Every other worktree branches from this commit.

**After WT-rn-scaffold merges (4 parallel):**

- WT-rn-provider-hook (#83 + #84)
- WT-rn-device (#85)
- WT-rn-screenshot (#86)
- WT-rn-route-ring (#87) — coordinate navigationRef prop interface with WT-rn-provider-hook (rebase on whichever lands first)

Shared-file conflict surface in this tier is `packages/react-native/src/index.ts` (append-only re-exports) and `packages/react-native/package.json` `dependencies` (append-only). Resolve via rebase + concatenate.

**After Tier 1 fully landed (2 parallel):**

- WT-rn-feedback-button (#88)
- WT-rn-example-docs (#89 + #90)

**After Tier 2 merges:**

- WT-rn-release (#91) — cuts the npm beta.

**Companion cross-repo follow-ups (not in this file):**

- `brevwick-ops` SDD § 12.4 + ADR-0008 — file separately (`brevwick-ops/react-native-worktree.md`); parallel-safe with all of the above from T+0.
- `brevwick-web` registry entry, install snippet, FAQ, onboarding picker — three worktrees in `brevwick-web/react-native-worktree.md`; all parallel-safe with this initiative; the registry can flip from `coming-soon` to `live` only after WT-rn-release merges (small follow-up commit, not a separate worktree).
