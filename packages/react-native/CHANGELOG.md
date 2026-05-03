# @tatlacas/brevwick-react-native

## 1.0.0-beta.10

### Patch Changes

- Updated dependencies [[`1d2cb82`](https://github.com/tatlacas-com/brevwick-sdk-js/commit/1d2cb822e471bac4344c88703071f64815e05181)]:
  - @tatlacas/brevwick-sdk@1.0.0-beta.10

## 1.0.0-beta.9

### Minor Changes

- [#96](https://github.com/tatlacas-com/brevwick-sdk-js/pull/96) [`7f069dd`](https://github.com/tatlacas-com/brevwick-sdk-js/commit/7f069ddf8b2e28d4d751278777851c5e87a81533) Thanks [@tatlacas](https://github.com/tatlacas)! - feat(react-native): add `collectDeviceContext()` returning the wire-ready
  `device_context` payload (`{ ua, locale?, viewport?: {w,h}, platform:
'react-native-ios' | 'react-native-android', sdk }`). Optional fields are
  omitted when their source is unavailable — `JSON.stringify` drops the
  `undefined` keys, matching Flutter's `if (locale != null) 'locale': locale`
  JSON builder. Strict Flutter-parity shape — `device_context.platform` is
  the only deliberate divergence so triage can split RN traffic from web
  without branching on `sdk.name`. Static fields (`platform`, `sdk`, `ua`)
  cache on first call; `locale` and `viewport` re-read each call so runtime
  locale switches and orientation changes ride on the next captured issue.
  Collector is shipped unwired and integrated into `composePayload()` by
  [#83](https://github.com/tatlacas-com/brevwick-sdk-js/issues/83)+[#84](https://github.com/tatlacas-com/brevwick-sdk-js/issues/84) (WT-rn-provider-hook).

- [#102](https://github.com/tatlacas-com/brevwick-sdk-js/pull/102) [`6990577`](https://github.com/tatlacas-com/brevwick-sdk-js/commit/6990577b3e3c07c69354f5a829aacbc2aacbac95) Thanks [@tatlacas](https://github.com/tatlacas)! - chore(release): @tatlacas/brevwick-react-native first beta ([#91](https://github.com/tatlacas-com/brevwick-sdk-js/issues/91)).

  Initial React Native adapter package: BrevwickProvider, useFeedback hook,
  FeedbackButton + Modal, react-native-view-shot optional-peer screenshot,
  React Navigation route ring, device context, Expo example app, canonical
  README. Mirrors @tatlacas/brevwick-react with RN primitives. Wire format
  identical except `device_context.platform = react-native-{ios,android}`.

  Lockstep with the rest of the SDK suite via the `linked` group in
  `.changeset/config.json` — the package version syncs to the next
  `1.0.0-beta.x` when the Release PR runs. Ships with npm provenance
  (`publishConfig.provenance: true`) and the 25 kB gzip size-limit gate
  mirroring the React adapter.

- [#95](https://github.com/tatlacas-com/brevwick-sdk-js/pull/95) [`d509f88`](https://github.com/tatlacas-com/brevwick-sdk-js/commit/d509f88743a38c96bff7446610ac98702dfcb00c) Thanks [@tatlacas](https://github.com/tatlacas)! - feat(react-native): route ring via React Navigation + Expo Router ([#87](https://github.com/tatlacas-com/brevwick-sdk-js/issues/87))

  Ships the React Native route ring as the third capture surface for the
  adapter, alongside console + network. New public surface:
  - `attachRouteRing(navigationRef, push)` — subscribes to React
    Navigation's `state` event on the captured `navigationRef.current`,
    resolves `getCurrentRoute()` after each transition, runs every
    benign-keyed param value through `redact()` before
    `encodeURIComponent` (so the regex set still matches literals), and
    pushes a wire-ready `RouteEntry` (`{ kind: 'route', path, timestamp }`).
    Returns an idempotent unsubscribe function.
  - `NavigationContainerRefLike` / `NavigationRefLike` — minimal
    structural slices over React Navigation v6.x and v7.x so the
    attach helper compiles without a hard `@react-navigation/native`
    peer dependency.

  Core public surface widens narrowly to support adapter composition:
  - `redact` — the global redactor function, so adapters can apply the
    same pattern set used by every payload that leaves the device.
  - `SENSITIVE_PARAM_KEYS` — the shared regex
    `/^(token|auth|key|session|sig).*/i` covering query/path keys
    flagged by name (any key starting with `token`, `auth`, `key`,
    `session`, or `sig`, case-insensitive — e.g. `tokenId`,
    `authState`, `keyring`, `sessionId`, `signature`). Single source of
    truth — `packages/sdk/src/rings/network.ts` now consumes the same
    constant in place of its old inline literal so the network ring and
    the RN route ring cannot drift. Param values keyed by names that
    fall outside this set are still defended by the global `redact()`
    pass on each value (JWT, email, IP, bearer, etc.).
  - `RouteEntry` — re-exported from the core ring-entry union so
    adapter packages compose against the same name.

  The `@tatlacas/brevwick-sdk` bump is the lockstep pre-1.0 minor; the
  linked group in `.changeset/config.json` propagates the bump across
  the suite.

- [#93](https://github.com/tatlacas-com/brevwick-sdk-js/pull/93) [`6807e6e`](https://github.com/tatlacas-com/brevwick-sdk-js/commit/6807e6e624497c116da36ae81f10f06faf350185) Thanks [@tatlacas](https://github.com/tatlacas)! - chore(react-native): scaffold @tatlacas/brevwick-react-native ([#82](https://github.com/tatlacas-com/brevwick-sdk-js/issues/82))

  Empty workspace package skeleton for the upcoming React Native adapter.
  Mirrors `packages/react/` conventions (tsup CJS+ESM build, vitest,
  tsconfig). Adds the `react-native` field for Metro source preference
  and declares `react-native-view-shot` as an optional peer dep so the
  never-throws screenshot path can lazy-import without forcing every
  consumer to install it.

  Public surface this PR ships:
  - `BREVWICK_REACT_NATIVE_VERSION` — diagnostics literal injected by
    tsup `define`, mirroring the React/Solid/Vue/Svelte/Angular adapters.

  Feature work (provider, hook, FAB, screenshot, route ring, device
  context) lands in [#83](https://github.com/tatlacas-com/brevwick-sdk-js/issues/83)–[#88](https://github.com/tatlacas-com/brevwick-sdk-js/issues/88); example app + canonical README in [#89](https://github.com/tatlacas-com/brevwick-sdk-js/issues/89)/[#90](https://github.com/tatlacas-com/brevwick-sdk-js/issues/90);
  beta release flips in [#91](https://github.com/tatlacas-com/brevwick-sdk-js/issues/91).

  The `@tatlacas/brevwick-sdk` and `@tatlacas/brevwick-react` bumps are
  the lockstep pre-1.0 version — the `linked` group in
  `.changeset/config.json` keeps the suite moving together. No code
  change in either package for this PR.

- [#98](https://github.com/tatlacas-com/brevwick-sdk-js/pull/98) [`ccdc5b7`](https://github.com/tatlacas-com/brevwick-sdk-js/commit/ccdc5b77c2ba2f0b4abe1ba4f0fe51af842233be) Thanks [@tatlacas](https://github.com/tatlacas)! - feat(react-native): captureScreenshot via react-native-view-shot optional peer ([#86](https://github.com/tatlacas-com/brevwick-sdk-js/issues/86))

  Adds `captureScreenshot(viewRef, opts?)` and `<BrevwickSkip>` to
  `@tatlacas/brevwick-react-native`. `react-native-view-shot` is declared as an
  **optional** peer dep so Expo Go consumers (no custom dev client) and
  consumers who never capture a screenshot skip the install entirely. The peer
  is dynamic-imported on first call; if the module is missing or `captureRef`
  rejects, the capture resolves to a 1×1 transparent PNG placeholder rather
  than throwing — preserving the never-throws contract from SDD § 12.

  `<BrevwickSkip>` mirrors the JS SDK `[data-brevwick-skip]` selector and
  Flutter's `BrevwickSkip`: any subtree wrapped by it is hidden via
  `setNativeProps({ opacity: 0 })` for the rasterised frame and restored on the
  way out, including on the failure path. The hide/restore is refcount-aware so
  overlapping captures cannot strand the UI hidden — outermost capture wins.

  `dataUriToBlob` rejects non-`image/*` MIME payloads, mirroring the core's
  `isValidImageBlob` invariant.

  The `@tatlacas/brevwick-sdk` and `@tatlacas/brevwick-react` bumps are the
  lockstep pre-1.0 version per the `linked` group in `.changeset/config.json`.
  No code change in either package for this PR.

- [#100](https://github.com/tatlacas-com/brevwick-sdk-js/pull/100) [`08d265e`](https://github.com/tatlacas-com/brevwick-sdk-js/commit/08d265e0b1b8b82760c4607221635bb47aa89d20) Thanks [@tatlacas](https://github.com/tatlacas)! - feat(react-native): FeedbackButton + Modal ([#88](https://github.com/tatlacas-com/brevwick-sdk-js/issues/88))

  Drop-in FAB + Modal feedback form for React Native, mirroring the
  `@tatlacas/brevwick-react` widget UX 1:1 with RN primitives:
  - `<FeedbackButton />` — `Pressable` FAB with `position` (`'bottom-right' |
'bottom-left' | { bottom?, right?, left? }`), `theme`, `style`, `label`,
    `hidden`, `disabled` props. Default label tracks the full SDK submit
    lifecycle (`Send feedback` → `Capturing…` → `Sending…` → `Sent ✓` /
    `Try again`); the `Try again` and `Sent ✓` terminal states are reachable
    on the FAB because the FAB owns a single `useFeedback()` instance and
    forwards it to the modal — both render against the same status/phase
    tuple so the FAB observes terminal states the SDK's phase bus does not
    emit. Accessible: `accessibilityLabel='Send feedback'` +
    `accessibilityRole='button'`. The `disabled` prop is enforced both via
    `Pressable`'s native gating AND an explicit guard in `handleOpen`.
  - `<FeedbackModal />` — slide-up form: description / expected / actual
    fields, screenshot preview with a skip toggle, and a primary button
    that drives `useFeedback().submit`. Lazy-loads `getConfig()` on first
    open and renders the AI toggle only when the project enables
    `ai_enabled && ai_submitter_choice_allowed`. Auto-dismisses 2 s after
    a successful submit and preserves the draft (text fields AND toggles)
    across Cancel + reopen (modal-local `useState`). The success-dismiss
    timer is cleared explicitly when the user taps Cancel during the
    confirmation dwell so it cannot fire on a hidden modal. The inline
    draft-error note clears on the first keystroke in any of the three
    text fields, matching the web composer behaviour. Screenshot capture
    failures surface as an inline note ("Couldn't attach screenshot —
    sending without one.") and emit a single `console.warn` matching the
    `screenshot.ts` `logFailure` pattern. Accepts an optional `feedback?:
UseFeedbackResult` prop so a parent can lift the hook (the FAB does
    this); standalone consumers can omit it. iOS gets
    `accessibilityViewIsModal` so VoiceOver scopes focus to the sheet.
  - `BrevwickTheme` and `ProjectConfig` types re-exported from the package
    root for parity with the web React adapter — `ProjectConfig` is needed
    by any consumer composing their own modal alongside `useFeedback()`.

  Bundle: 5.84 kB gzip ESM / 6.11 kB gzip CJS — well under the 25 kB
  budget enforced by `.size-limit.js` and documented in `CLAUDE.md`.

- [#97](https://github.com/tatlacas-com/brevwick-sdk-js/pull/97) [`659417f`](https://github.com/tatlacas-com/brevwick-sdk-js/commit/659417fefa20b4d966a597e03c0f030ad06d59af) Thanks [@tatlacas](https://github.com/tatlacas)! - feat(react-native): provider + useFeedback hook ([#83](https://github.com/tatlacas-com/brevwick-sdk-js/issues/83), [#84](https://github.com/tatlacas-com/brevwick-sdk-js/issues/84))

  Initial public API for `@tatlacas/brevwick-react-native`, mirroring
  `@tatlacas/brevwick-react` 1:1 with React-Native-specific wiring:
  - `BrevwickProvider` — memoises `createBrevwick(config)` on config
    identity, installs on mount, uninstalls on unmount; forwards an optional
    `navigationRef` to descendants via `BrevwickNavigationRefContext` so the
    route-ring worktree ([#87](https://github.com/tatlacas-com/brevwick-sdk-js/issues/87)) can subscribe without the adapter taking a
    hard dep on `@react-navigation/native`.
  - `useBrevwick()` — reads the SDK instance from the provider; throws
    synchronously when used outside one.
  - `useBrevwickNavigationRef()` — opt-in hook returning the forwarded
    `navigationRef` (or `null` when omitted/outside any provider).
  - `useFeedback()` — `{ submit, captureScreenshot, status, phase, error,
retry, reset }`, structurally identical to web React's
    `UseFeedbackResult`.

  Lockstep policy keeps the rest of the suite at the same beta cycle (see
  `.changeset/config.json` `linked` group); only the React Native package
  version actually advances here.

- [#101](https://github.com/tatlacas-com/brevwick-sdk-js/pull/101) [`96d1a15`](https://github.com/tatlacas-com/brevwick-sdk-js/commit/96d1a151f8eca750a4168b6d7542faf87a53eac3) Thanks [@tatlacas](https://github.com/tatlacas)! - feat(react-native): public `useRouteRing` hook + RN-aware
  `useFeedback().captureScreenshot(viewRef)`; SDK exports
  `PROJECT_KEY_PATTERN` ([#89](https://github.com/tatlacas-com/brevwick-sdk-js/issues/89), [#90](https://github.com/tatlacas-com/brevwick-sdk-js/issues/90))

  Public surface added by this PR (PR [#101](https://github.com/tatlacas-com/brevwick-sdk-js/issues/101) review action items):
  - `useRouteRing(navigationRef?)` from `@tatlacas/brevwick-react-native` —
    owns the `_internal.push` reach-around the example previously copy/
    pasted into every consumer's `RouteRingBridge`. Resolves both the
    `Brevwick` instance and the `navigationRef` from context, attaches via
    `attachRouteRing`, and detaches on unmount. Pass an explicit
    `navigationRef` for layouts that mount the bridge outside the provider
    tree.
  - `useFeedback().captureScreenshot` now accepts an optional `viewRef`
    (and `CaptureScreenshotOpts`) and routes RN captures through the
    package's native `captureScreenshot` (`react-native-view-shot` when
    the peer is installed, placeholder PNG otherwise) instead of always
    falling through to the core SDK's DOM-based path. Calls without a
    `viewRef` keep the previous behaviour.
  - `BrevwickNavigationRef.current.addListener` now narrows the event
    parameter to the `'state'` literal (the only event the route ring
    subscribes to), so `useNavigationContainerRef<TParamList>()`'s
    strictly-typed ref is structurally assignable to
    `BrevwickProviderProps.navigationRef` without an
    `as unknown as BrevwickNavigationRef` cast at the consumer site.

  Core SDK surface widens narrowly to support adapter + example
  composition without duplication:
  - `PROJECT_KEY_PATTERN` — the validator's project-key regex, exported
    so adapters and example apps can gate UI on the same source of truth
    `validateConfig` enforces. Use as `PROJECT_KEY_PATTERN.test(value)`;
    no boolean-returning helper is shipped because the eager bundle is
    within ~30 B of its 2.85 kB ceiling and a one-line `.test(value)` is
    no friction for callers.

  Also fixes the `examples/react-native` peer-dep mismatch: the package
  now declares `react-native-view-shot: >=3.8.0 <5` so both Expo SDK 51
  (`~3.8.0`) and bare RN (`^4.0.0`) sit inside the supported range. CI
  gains a `pnpm --filter @tatlacas/brevwick-react-native build` step
  ahead of `pnpm type-check` so a clean checkout no longer fails on
  TS2307 from `examples/react-native/tsconfig.json` (`moduleResolution:
Bundler`) trying to resolve `dist/` before it has been built.

  The `@tatlacas/brevwick-sdk` bump is the lockstep pre-1.0 minor; the
  linked group in `.changeset/config.json` propagates the bump across
  the suite.

### Patch Changes

- Updated dependencies [[`d509f88`](https://github.com/tatlacas-com/brevwick-sdk-js/commit/d509f88743a38c96bff7446610ac98702dfcb00c), [`6807e6e`](https://github.com/tatlacas-com/brevwick-sdk-js/commit/6807e6e624497c116da36ae81f10f06faf350185), [`ccdc5b7`](https://github.com/tatlacas-com/brevwick-sdk-js/commit/ccdc5b77c2ba2f0b4abe1ba4f0fe51af842233be), [`96d1a15`](https://github.com/tatlacas-com/brevwick-sdk-js/commit/96d1a151f8eca750a4168b6d7542faf87a53eac3)]:
  - @tatlacas/brevwick-sdk@1.0.0-beta.9
