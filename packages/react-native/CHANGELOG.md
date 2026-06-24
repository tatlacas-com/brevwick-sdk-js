# @tatlacas/brevwick-react-native

## 2.0.0

### Major Changes

- [#160](https://github.com/tatlacas-com/brevwick-sdk-js/pull/160) [`56b2d4e`](https://github.com/tatlacas-com/brevwick-sdk-js/commit/56b2d4eb307a1a76f3315356f3c084325ba9792c) Thanks [@tatlacas](https://github.com/tatlacas)! - BREAKING CHANGE: the launcher's default presentation changes from the corner
  bubble to the vertical edge tab.

  In 1.x, rendering `<FeedbackButton />` with no `position` (or `variant`) prop
  produced a floating corner pill pinned to `bottom-right`. As of 2.0 the default
  resolves to `variant: 'tab'` — a vertical button flush against the right
  viewport edge, vertically centered (`resolveLauncherPlacement`,
  `@tatlacas/brevwick-sdk/launcher`). Every adapter (React, Solid, Vue, Svelte,
  Angular, React Native) shares this default.

  Migration: call sites that want the legacy corner bubble must now opt in
  explicitly. Pass a legacy corner `position` without a `variant`
  (`<FeedbackButton position="bottom-right" />`) — which keeps the bubble
  byte-for-byte — or set `variant="bubble"` directly. Call sites that already
  pass a corner `position` are unaffected and render exactly as before; only the
  bare-default usage changes.

### Minor Changes

- [#157](https://github.com/tatlacas-com/brevwick-sdk-js/pull/157) [`db60dd6`](https://github.com/tatlacas-com/brevwick-sdk-js/commit/db60dd6c42a048d40a24e60232c885b835a9fe57) Thanks [@tatlacas](https://github.com/tatlacas)! - feat: launcher `variant` (vertical edge tab is the new default) + `compact` icon-only mode

  The FeedbackButton launcher now supports two presentations across every adapter (React, Solid, Vue, Svelte, Angular, React Native):
  - `variant="tab"` — **the new default**: a vertical tab flush against the right viewport edge (right edge of the host view on React Native), vertically centered. A new `offset` prop nudges the tab up/down from center in px.
  - `variant="bubble"` — the legacy floating corner pill.
  - `compact` — icon-only mode for either variant (circular bubble / square edge tab); the `label` is not rendered but becomes the launcher's `aria-label`.
  - `position` gains the edge sides `'right' | 'left'` alongside the legacy corners. Defaults: `'right'` for the tab, `'bottom-right'` for the bubble.

  Backwards compatibility: passing a legacy corner `position` (`'bottom-right'` / `'bottom-left'` — or the offset-object form on React Native) without an explicit `variant` keeps the corner bubble, so existing call sites render exactly as before. When both are set, `variant` wins and `position` contributes only its horizontal side.

  The framework-agnostic placement resolver is now exported from the core package at `@tatlacas/brevwick-sdk/launcher` (`resolveLauncherPlacement`, `FeedbackButtonVariant`, `FeedbackButtonPosition`). Every adapter consumes this single tree-shakeable copy instead of carrying its own (the React Native adapter composes it for its offset-object form).

  Fixes a bug where the left-edge tab (`position="left"`) rendered well below vertical center: the standalone CSS `rotate: 180deg` was applied after `transform` and inverted the centering `translateY(-50%)`. The 180° flip is now composed inside `transform`, so the left tab is correctly centered while keeping its mirrored radii, flat edge, and hover behavior. The Svelte compact bubble is also aligned to 48px to match the other adapters.

### Patch Changes

- [#152](https://github.com/tatlacas-com/brevwick-sdk-js/pull/152) [`ba4d53a`](https://github.com/tatlacas-com/brevwick-sdk-js/commit/ba4d53af10637d49c1047cbeb32d6af856a7824b) Thanks [@tatlacas](https://github.com/tatlacas)! - Re-align the seven linked packages onto a single version on the prerelease
  channel. The stable `1.0.2` release (PR [#150](https://github.com/tatlacas-com/brevwick-sdk-js/issues/150)) bumped only the five web
  adapters — `react`, `solid`, `vue`, `svelte`, `angular` — because the
  consumed changeset listed only those packages, and `.changeset/config.json`
  uses `linked` (which shares a version-floor across the group but does not
  auto-bump siblings) rather than `fixed`. As a result `@tatlacas/brevwick-sdk`
  and `@tatlacas/brevwick-react-native` were left at `1.0.1` on npm while the
  others moved to `1.0.2`. Listing all seven here brings every package to the
  next prerelease (`1.0.3-beta.0`) together, restoring parity across the
  linked group before further work continues on the dev channel.
- Updated dependencies [[`3327926`](https://github.com/tatlacas-com/brevwick-sdk-js/commit/332792687ef9bf85822a0446a3cca4ba604b506a), [`56b2d4e`](https://github.com/tatlacas-com/brevwick-sdk-js/commit/56b2d4eb307a1a76f3315356f3c084325ba9792c), [`db60dd6`](https://github.com/tatlacas-com/brevwick-sdk-js/commit/db60dd6c42a048d40a24e60232c885b835a9fe57), [`ba4d53a`](https://github.com/tatlacas-com/brevwick-sdk-js/commit/ba4d53af10637d49c1047cbeb32d6af856a7824b), [`ede8731`](https://github.com/tatlacas-com/brevwick-sdk-js/commit/ede8731518a22831711198ee40389b53044be221)]:
  - @tatlacas/brevwick-sdk@2.0.0

## 1.0.1

### Patch Changes

- [#139](https://github.com/tatlacas-com/brevwick-sdk-js/pull/139) [`a1196fa`](https://github.com/tatlacas-com/brevwick-sdk-js/commit/a1196fa2838ce1893a88915062c660f4727aabc9) Thanks [@tatlacas](https://github.com/tatlacas)! - Point each package's `homepage` field at the framework-specific docs page on
  `brevwick.dev` instead of the GitHub repo. npm renders `homepage` as a
  prominent link on the package page, and Google treats `npmjs.com/package/<x>`
  as a high-authority backlink source — pointing it at `brevwick.dev` gives
  the brand reciprocal-link credit alongside the JSON-LD `sameAs` graph the
  website ships in its marketing layout.
- Updated dependencies [[`a1196fa`](https://github.com/tatlacas-com/brevwick-sdk-js/commit/a1196fa2838ce1893a88915062c660f4727aabc9)]:
  - @tatlacas/brevwick-sdk@1.0.1

## 1.0.1-beta.0

### Patch Changes

- [#135](https://github.com/tatlacas-com/brevwick-sdk-js/pull/135) [`65d17bb`](https://github.com/tatlacas-com/brevwick-sdk-js/commit/65d17bb7f7206f60ddd4bf526a716b85f78c2b14) Thanks [@tatlacas](https://github.com/tatlacas)! - Point each package's `homepage` field at the framework-specific docs page on
  `brevwick.dev` instead of the GitHub repo. npm renders `homepage` as a
  prominent link on the package page, and Google treats `npmjs.com/package/<x>`
  as a high-authority backlink source — pointing it at `brevwick.dev` gives
  the brand reciprocal-link credit alongside the JSON-LD `sameAs` graph the
  website ships in its marketing layout.
- Updated dependencies [[`65d17bb`](https://github.com/tatlacas-com/brevwick-sdk-js/commit/65d17bb7f7206f60ddd4bf526a716b85f78c2b14)]:
  - @tatlacas/brevwick-sdk@1.0.1-beta.0

## 1.0.0

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

- [#102](https://github.com/tatlacas-com/brevwick-sdk-js/pull/102) [`6990577`](https://github.com/tatlacas-com/brevwick-sdk-js/commit/6990577b3e3c07c69354f5a829aacbc2aacbac95) Thanks [@tatlacas](https://github.com/tatlacas)! - chore(release): @tatlacas/brevwick-react-native first beta ([#91](https://github.com/tatlacas-com/brevwick-sdk-js/issues/91))

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

- [#118](https://github.com/tatlacas-com/brevwick-sdk-js/pull/118) [`b074130`](https://github.com/tatlacas-com/brevwick-sdk-js/commit/b07413098d669cb4f9fec29bbfe5277602e3de34) Thanks [@tatlacas](https://github.com/tatlacas)! - Bring `<FeedbackButton>` and `<FeedbackModal>` to behavior + payload parity with the React adapter ([#116](https://github.com/tatlacas-com/brevwick-sdk-js/issues/116)). Adds chat-thread bubbles, expected-vs-actual disclosure, phase-driven status rows, retry row, discard-confirm flow, AI toggle render-policy matrix, autogrow composer, and `Linking`-backed footer link. The hook surface (`useFeedback`) is unchanged; the modal now subscribes to the SDK's phase bus through the same internal-bridge pattern the React adapter uses. File-attach UI is deferred to a follow-up so v1 doesn't add a new native peer.

  Visual parity pass: composer is now a single rounded shell containing the textarea, an inline track-and-thumb AI toggle (replacing RN's native `<Switch>` row above), and an icon-only send button with a constant `accessibilityLabel="Send"` — the lifecycle copy (`Capturing…`/`Sending…`/`Sent ✓`/`Try again`) lives on the FAB itself, while the inline button stays a pure send affordance. Submit-failure retry is funnelled exclusively through the existing `RetryRow` to match the web adapter, removing the duplicate "Try again" Pressable that previously replaced the send button on error.

  Icon parity: every panel glyph (paperclip, send, minimize, close, status check) is now an SVG `<Path>` rendered via `react-native-svg`, using the exact same path data as the web adapter. The previous Unicode-glyph fallbacks (`✓`, `–`, `×`, `➤`) are removed because their rendering varied per font and looked off-brand at common pixel sizes. **`react-native-svg` is now a required peer dependency** — Expo ships it out of the box and bare RN apps overwhelmingly already depend on it transitively, but consumers upgrading from earlier `1.0.0-beta.x` may need to `npm install react-native-svg` if they had no transitive pull.

  File-attachment parity: the paperclip icon button on the left of the composer opens the platform document picker, picks turn into `<AttachmentChip>` rows above the composer, and selected URIs are converted to `Blob`s and ridesharred on the next submit through the existing `FeedbackInput.attachments` contract. Two new optional peers wire the picker:
  - `expo-document-picker` (≥12 <14) — preferred path for Expo apps.
  - `react-native-document-picker` (≥9 <11) — fallback for bare RN.

  Both are dynamically imported the first time the user taps the paperclip; if neither is installed the modal surfaces an inline note (`File attachments are unavailable. Install …`) so the missing-peer state is visible rather than silent. The cap matches the SDK's `MAX_ATTACHMENT_COUNT` (5 files); excess picks are clipped and the paperclip flips to its `Maximum 5 attachments reached` disabled label.

- [#111](https://github.com/tatlacas-com/brevwick-sdk-js/pull/111) [`a131a04`](https://github.com/tatlacas-com/brevwick-sdk-js/commit/a131a041d4a143684bd5fbd2add7c25f9509e860) Thanks [@tatlacas](https://github.com/tatlacas)! - chore: disable v1 screenshot button across every adapter widget

  Removes the screenshot button UI, region-overlay flow, and dead capture
  state/handlers from the React, Solid, Vue, Svelte, Angular, and React
  Native `FeedbackButton` components. The SDK-level `captureScreenshot()`
  export and the `useFeedback().captureScreenshot` hook surface are
  unchanged — only the in-widget UI affordance is gone, so consumers who
  trigger captures programmatically (or via the Playwright real-browser
  regression at `e2e/screenshot.spec.ts`) keep working.

  Re-enable by reverting the disable commits and flipping the `.skip`
  test blocks back; rationale and plan live in
  `~/.claude/plans/i-just-tested-examples-generic-honey.md`.

  Behavioural notes for adopters:
  - Users no longer see a "Take screenshot" / region-capture button on
    the panel. Submitting feedback no longer attaches a screenshot
    unless the host app calls `captureScreenshot()` itself.
  - Bundle budgets for every adapter shrink (e.g. React 22 kB → 9.97 kB
    gzip, Solid 5 kB → 3.26 kB, Vue 5 kB → 3.28 kB) — verified by
    `pnpm size`.
  - React Native adapter additionally normalizes its submit payload to
    match the web adapters; consumers reading the raw `meta` envelope
    may see field-shape parity changes.
  - Per the changesets `linked` config, this minor bump lockstep-bumps
    every package in the workspace, including `@tatlacas/brevwick-sdk`,
    even though the core package itself is not modified by this change.

### Patch Changes

- [#107](https://github.com/tatlacas-com/brevwick-sdk-js/pull/107) [`e9f24aa`](https://github.com/tatlacas-com/brevwick-sdk-js/commit/e9f24aaba3079d62488e190aadf5c2aca1f6504d) Thanks [@tatlacas](https://github.com/tatlacas)! - fix(sdk): compensate for inner overflow:auto scrollTop/scrollLeft so the
  capture matches what the user is looking at, not the top of the
  container's scroll extent.

  Apps whose visible viewport lives on an inner element rather than the
  window — Tailwind admin shells (`<main class="overflow-y-auto">`),
  dashboards with sticky headers and a scrolling content well, anything
  that pins `<html>`/`<body>` to viewport size and scrolls a child —
  were the original failure mode behind the PR [#103](https://github.com/tatlacas-com/brevwick-sdk-js/issues/103)
  "blank screenshot" reports. `modern-screenshot` clones the capture
  subtree into an SVG `<foreignObject>` and the clone resets `scrollTop`
  and `scrollLeft` on every overflow:auto/scroll descendant to (0, 0).
  Once the user had scrolled mid-way down, captures rasterized the _top_
  of the inner scrollable area rather than the visible content — partial
  or fully blank WebPs depending on what happened to live at the top of
  that scroll extent.

  PR [#103](https://github.com/tatlacas-com/brevwick-sdk-js/issues/103) flipped the default capture root from `documentElement` to
  `body`, which changed which slice of the page accidentally got
  captured but did not fix the underlying reset — the previous
  "foreignObject inside documentElement" hypothesis was wrong.

  What changed: `screenshot.ts` now walks overflow:auto/scroll
  descendants of the capture root with non-zero `scrollTop`/`scrollLeft`,
  leaves the container's `overflow` clip in place, and translates each
  direct element child by `(-scrollLeft, -scrollTop)` with
  `transform-origin: 0 0` for the duration of the capture. The
  container's box stays the same so clipping is preserved; the children
  render at the offset the user sees, exactly as in the live tree.
  Restored unconditionally in the same `try/finally` block as the
  `[data-brevwick-skip]` scrub, ref-counted via WeakMap so concurrent
  captures do not leak transforms.

  Sticky/fixed handling: `position: sticky` and `position: fixed` direct
  children are explicitly skipped by the compensation pass — translating
  them by `-scrollTop` would rasterize the pinned element off the top of
  the captured frame, re-introducing the partial-blank symptom this PR
  fixes for sticky-header dashboards. Skipped children render at their
  intrinsic flow position in the clone, which is roughly where the user
  sees a `top:0`-stuck header. Not pixel-perfect (faithful reconstruction
  needs per-child geometry), but strictly better than translating
  off-screen.

  Other limitations called out in JSDoc: inline `style.transform` on a
  direct child composes by _prepending_ the translate; RTL `scrollLeft`
  semantics are not normalised; window scroll continues to be handled by
  `modern-screenshot` itself. Real-browser pixel coverage of the
  rasterized output remains tracked separately via [#104](https://github.com/tatlacas-com/brevwick-sdk-js/issues/104).

  The non-SDK adapter packages get a no-op patch bump to stay in
  lockstep per the repo's pre-1.0 versioning policy.

- Updated dependencies [[`9955f24`](https://github.com/tatlacas-com/brevwick-sdk-js/commit/9955f24f281f7711163233bd9164c4f4e7e0353b), [`c2060af`](https://github.com/tatlacas-com/brevwick-sdk-js/commit/c2060af1c7d3cdbdd106f2cdfe350d48c16e5b6c), [`e88eabe`](https://github.com/tatlacas-com/brevwick-sdk-js/commit/e88eabefb03f4984fa5e48219e12c4f4d125092f), [`c4e0d51`](https://github.com/tatlacas-com/brevwick-sdk-js/commit/c4e0d51db6df24cd650dd81fd2a8b16ce79102de), [`8b9bdc5`](https://github.com/tatlacas-com/brevwick-sdk-js/commit/8b9bdc59aa55d1c4cb334866d0eef006ea3a4e5d), [`7a716bb`](https://github.com/tatlacas-com/brevwick-sdk-js/commit/7a716bbd342b18b89ac44085cdc8143655078eb2), [`46c2bc9`](https://github.com/tatlacas-com/brevwick-sdk-js/commit/46c2bc94d293987ff5c375835d30e53135d0fc2d), [`c3d5300`](https://github.com/tatlacas-com/brevwick-sdk-js/commit/c3d5300740bcb30c15a4b75eff484c81786b0b7c), [`103eb83`](https://github.com/tatlacas-com/brevwick-sdk-js/commit/103eb83887f4ef28f2e6e439f9505f381b6b700d), [`9a33e1d`](https://github.com/tatlacas-com/brevwick-sdk-js/commit/9a33e1d6b3b6a535e02087128ce2c262db31657d), [`e9f24aa`](https://github.com/tatlacas-com/brevwick-sdk-js/commit/e9f24aaba3079d62488e190aadf5c2aca1f6504d), [`a6246ab`](https://github.com/tatlacas-com/brevwick-sdk-js/commit/a6246ab3e9cf62fe64439e45cc5e04e8b61b5bca), [`84a6627`](https://github.com/tatlacas-com/brevwick-sdk-js/commit/84a662716df017884549de16463568d32954b881), [`15138b9`](https://github.com/tatlacas-com/brevwick-sdk-js/commit/15138b9c8882697599bd5056424390756830e53d), [`07a7ab2`](https://github.com/tatlacas-com/brevwick-sdk-js/commit/07a7ab21bd2c867a3285c0780140b1200d3425b0), [`91adb28`](https://github.com/tatlacas-com/brevwick-sdk-js/commit/91adb288ce52712c5e618e0b73d803650667a55a), [`788edc7`](https://github.com/tatlacas-com/brevwick-sdk-js/commit/788edc70a23713df78b4095e7c8f063b6e9345cf), [`d509f88`](https://github.com/tatlacas-com/brevwick-sdk-js/commit/d509f88743a38c96bff7446610ac98702dfcb00c), [`6807e6e`](https://github.com/tatlacas-com/brevwick-sdk-js/commit/6807e6e624497c116da36ae81f10f06faf350185), [`ccdc5b7`](https://github.com/tatlacas-com/brevwick-sdk-js/commit/ccdc5b77c2ba2f0b4abe1ba4f0fe51af842233be), [`e7cc9e4`](https://github.com/tatlacas-com/brevwick-sdk-js/commit/e7cc9e40a95d58a5c0a4ade77d802827c91eb3f9), [`ac2640c`](https://github.com/tatlacas-com/brevwick-sdk-js/commit/ac2640ce57882f25190323e9d2db3d9cf44e7b32), [`fea0f2d`](https://github.com/tatlacas-com/brevwick-sdk-js/commit/fea0f2d7167f82c3c6a9c07ae94e688ea73fab09), [`96d1a15`](https://github.com/tatlacas-com/brevwick-sdk-js/commit/96d1a151f8eca750a4168b6d7542faf87a53eac3), [`eee8b24`](https://github.com/tatlacas-com/brevwick-sdk-js/commit/eee8b24ab22f82533850a545bc5884d08a523055), [`1d2cb82`](https://github.com/tatlacas-com/brevwick-sdk-js/commit/1d2cb822e471bac4344c88703071f64815e05181), [`d0d30d0`](https://github.com/tatlacas-com/brevwick-sdk-js/commit/d0d30d0075cf1f523f65622e4935557e28cfee4f), [`f6446b5`](https://github.com/tatlacas-com/brevwick-sdk-js/commit/f6446b518d3c6350011b1a1472d3b2fae3a48706), [`5fcc5a7`](https://github.com/tatlacas-com/brevwick-sdk-js/commit/5fcc5a73053ddd3a5ab406f7ce2471d53ba159fa), [`d13c28e`](https://github.com/tatlacas-com/brevwick-sdk-js/commit/d13c28e1e14df0f314a4d53f170e41767269353c), [`f9fb472`](https://github.com/tatlacas-com/brevwick-sdk-js/commit/f9fb4729e5f9ba7adf714cb1aeb025f421a7377f), [`47e47b8`](https://github.com/tatlacas-com/brevwick-sdk-js/commit/47e47b8db9656272ce09d553aa267dd4b0daf972), [`d3f6577`](https://github.com/tatlacas-com/brevwick-sdk-js/commit/d3f65776f6b2ad8e17bfe22d08bb970dce576dcb), [`2337a8d`](https://github.com/tatlacas-com/brevwick-sdk-js/commit/2337a8d09f037f81e7d2ce77319e2f3987760de1), [`2ff114f`](https://github.com/tatlacas-com/brevwick-sdk-js/commit/2ff114f9f70057c2bb982fdf1a531603bf8fe65f), [`5a3c498`](https://github.com/tatlacas-com/brevwick-sdk-js/commit/5a3c498c28943cea1b0d4402ba50071f14461f62)]:
  - @tatlacas/brevwick-sdk@1.0.0

## 1.0.0-beta.13

### Minor Changes

- [#118](https://github.com/tatlacas-com/brevwick-sdk-js/pull/118) [`b074130`](https://github.com/tatlacas-com/brevwick-sdk-js/commit/b07413098d669cb4f9fec29bbfe5277602e3de34) Thanks [@tatlacas](https://github.com/tatlacas)! - Bring `<FeedbackButton>` and `<FeedbackModal>` to behavior + payload parity with the React adapter ([#116](https://github.com/tatlacas-com/brevwick-sdk-js/issues/116)). Adds chat-thread bubbles, expected-vs-actual disclosure, phase-driven status rows, retry row, discard-confirm flow, AI toggle render-policy matrix, autogrow composer, and `Linking`-backed footer link. The hook surface (`useFeedback`) is unchanged; the modal now subscribes to the SDK's phase bus through the same internal-bridge pattern the React adapter uses. File-attach UI is deferred to a follow-up so v1 doesn't add a new native peer.

  Visual parity pass: composer is now a single rounded shell containing the textarea, an inline track-and-thumb AI toggle (replacing RN's native `<Switch>` row above), and an icon-only send button with a constant `accessibilityLabel="Send"` — the lifecycle copy (`Capturing…`/`Sending…`/`Sent ✓`/`Try again`) lives on the FAB itself, while the inline button stays a pure send affordance. Submit-failure retry is funnelled exclusively through the existing `RetryRow` to match the web adapter, removing the duplicate "Try again" Pressable that previously replaced the send button on error.

  Icon parity: every panel glyph (paperclip, send, minimize, close, status check) is now an SVG `<Path>` rendered via `react-native-svg`, using the exact same path data as the web adapter. The previous Unicode-glyph fallbacks (`✓`, `–`, `×`, `➤`) are removed because their rendering varied per font and looked off-brand at common pixel sizes. **`react-native-svg` is now a required peer dependency** — Expo ships it out of the box and bare RN apps overwhelmingly already depend on it transitively, but consumers upgrading from earlier `1.0.0-beta.x` may need to `npm install react-native-svg` if they had no transitive pull.

  File-attachment parity: the paperclip icon button on the left of the composer opens the platform document picker, picks turn into `<AttachmentChip>` rows above the composer, and selected URIs are converted to `Blob`s and ridesharred on the next submit through the existing `FeedbackInput.attachments` contract. Two new optional peers wire the picker:
  - `expo-document-picker` (≥12 <14) — preferred path for Expo apps.
  - `react-native-document-picker` (≥9 <11) — fallback for bare RN.

  Both are dynamically imported the first time the user taps the paperclip; if neither is installed the modal surfaces an inline note (`File attachments are unavailable. Install …`) so the missing-peer state is visible rather than silent. The cap matches the SDK's `MAX_ATTACHMENT_COUNT` (5 files); excess picks are clipped and the paperclip flips to its `Maximum 5 attachments reached` disabled label.

## 1.0.0-beta.11

### Minor Changes

- [#111](https://github.com/tatlacas-com/brevwick-sdk-js/pull/111) [`a131a04`](https://github.com/tatlacas-com/brevwick-sdk-js/commit/a131a041d4a143684bd5fbd2add7c25f9509e860) Thanks [@tatlacas](https://github.com/tatlacas)! - chore: disable v1 screenshot button across every adapter widget

  Removes the screenshot button UI, region-overlay flow, and dead capture
  state/handlers from the React, Solid, Vue, Svelte, Angular, and React
  Native `FeedbackButton` components. The SDK-level `captureScreenshot()`
  export and the `useFeedback().captureScreenshot` hook surface are
  unchanged — only the in-widget UI affordance is gone, so consumers who
  trigger captures programmatically (or via the Playwright real-browser
  regression at `e2e/screenshot.spec.ts`) keep working.

  Re-enable by reverting the disable commits and flipping the `.skip`
  test blocks back; rationale and plan live in
  `~/.claude/plans/i-just-tested-examples-generic-honey.md`.

  Behavioural notes for adopters:
  - Users no longer see a "Take screenshot" / region-capture button on
    the panel. Submitting feedback no longer attaches a screenshot
    unless the host app calls `captureScreenshot()` itself.
  - Bundle budgets for every adapter shrink (e.g. React 22 kB → 9.97 kB
    gzip, Solid 5 kB → 3.26 kB, Vue 5 kB → 3.28 kB) — verified by
    `pnpm size`.
  - React Native adapter additionally normalizes its submit payload to
    match the web adapters; consumers reading the raw `meta` envelope
    may see field-shape parity changes.
  - Per the changesets `linked` config, this minor bump lockstep-bumps
    every package in the workspace, including `@tatlacas/brevwick-sdk`,
    even though the core package itself is not modified by this change.

### Patch Changes

- [#107](https://github.com/tatlacas-com/brevwick-sdk-js/pull/107) [`e9f24aa`](https://github.com/tatlacas-com/brevwick-sdk-js/commit/e9f24aaba3079d62488e190aadf5c2aca1f6504d) Thanks [@tatlacas](https://github.com/tatlacas)! - fix(sdk): compensate for inner overflow:auto scrollTop/scrollLeft so the
  capture matches what the user is looking at, not the top of the
  container's scroll extent.

  Apps whose visible viewport lives on an inner element rather than the
  window — Tailwind admin shells (`<main class="overflow-y-auto">`),
  dashboards with sticky headers and a scrolling content well, anything
  that pins `<html>`/`<body>` to viewport size and scrolls a child —
  were the original failure mode behind the PR [#103](https://github.com/tatlacas-com/brevwick-sdk-js/issues/103)
  "blank screenshot" reports. `modern-screenshot` clones the capture
  subtree into an SVG `<foreignObject>` and the clone resets `scrollTop`
  and `scrollLeft` on every overflow:auto/scroll descendant to (0, 0).
  Once the user had scrolled mid-way down, captures rasterized the _top_
  of the inner scrollable area rather than the visible content — partial
  or fully blank WebPs depending on what happened to live at the top of
  that scroll extent.

  PR [#103](https://github.com/tatlacas-com/brevwick-sdk-js/issues/103) flipped the default capture root from `documentElement` to
  `body`, which changed which slice of the page accidentally got
  captured but did not fix the underlying reset — the previous
  "foreignObject inside documentElement" hypothesis was wrong.

  What changed: `screenshot.ts` now walks overflow:auto/scroll
  descendants of the capture root with non-zero `scrollTop`/`scrollLeft`,
  leaves the container's `overflow` clip in place, and translates each
  direct element child by `(-scrollLeft, -scrollTop)` with
  `transform-origin: 0 0` for the duration of the capture. The
  container's box stays the same so clipping is preserved; the children
  render at the offset the user sees, exactly as in the live tree.
  Restored unconditionally in the same `try/finally` block as the
  `[data-brevwick-skip]` scrub, ref-counted via WeakMap so concurrent
  captures do not leak transforms.

  Sticky/fixed handling: `position: sticky` and `position: fixed` direct
  children are explicitly skipped by the compensation pass — translating
  them by `-scrollTop` would rasterize the pinned element off the top of
  the captured frame, re-introducing the partial-blank symptom this PR
  fixes for sticky-header dashboards. Skipped children render at their
  intrinsic flow position in the clone, which is roughly where the user
  sees a `top:0`-stuck header. Not pixel-perfect (faithful reconstruction
  needs per-child geometry), but strictly better than translating
  off-screen.

  Other limitations called out in JSDoc: inline `style.transform` on a
  direct child composes by _prepending_ the translate; RTL `scrollLeft`
  semantics are not normalised; window scroll continues to be handled by
  `modern-screenshot` itself. Real-browser pixel coverage of the
  rasterized output remains tracked separately via [#104](https://github.com/tatlacas-com/brevwick-sdk-js/issues/104).

  The non-SDK adapter packages get a no-op patch bump to stay in
  lockstep per the repo's pre-1.0 versioning policy.

- Updated dependencies [[`c3d5300`](https://github.com/tatlacas-com/brevwick-sdk-js/commit/c3d5300740bcb30c15a4b75eff484c81786b0b7c), [`e9f24aa`](https://github.com/tatlacas-com/brevwick-sdk-js/commit/e9f24aaba3079d62488e190aadf5c2aca1f6504d)]:
  - @tatlacas/brevwick-sdk@1.0.0-beta.11

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
