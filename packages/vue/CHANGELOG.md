# @tatlacas/brevwick-vue

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

- [#155](https://github.com/tatlacas-com/brevwick-sdk-js/pull/155) [`3327926`](https://github.com/tatlacas-com/brevwick-sdk-js/commit/332792687ef9bf85822a0446a3cca4ba604b506a) Thanks [@tatlacas](https://github.com/tatlacas)! - feat: dev-only `debug` mode that exposes the raw payload sent to the API

  Add a `debug?: boolean` config option (default `false`). When enabled, every `submit()` resolves with a `debug.payload` field carrying the exact, already-redacted body that was POSTed to `/v1/ingest/issues` — including everything the widget never renders (console ring, network ring, route trail, device + user context, attachment descriptors).

  All five web widgets (React, Solid, Vue, Svelte, Angular) render a per-message **"Copy raw payload"** button on each sent bubble when the payload is present, copying the pretty-printed JSON to the clipboard. The button is absent unless `debug` is on.

  Wire it to a host build flag so it never ships to real users, e.g. `debug: process.env.NEXT_PUBLIC_SEE_LOGS === 'true'`. `debug` never changes what is sent — the payload is identical to a normal submit and stays fully redacted; the only cost is retaining it in memory per submit.

- [#157](https://github.com/tatlacas-com/brevwick-sdk-js/pull/157) [`db60dd6`](https://github.com/tatlacas-com/brevwick-sdk-js/commit/db60dd6c42a048d40a24e60232c885b835a9fe57) Thanks [@tatlacas](https://github.com/tatlacas)! - feat: launcher `variant` (vertical edge tab is the new default) + `compact` icon-only mode

  The FeedbackButton launcher now supports two presentations across every adapter (React, Solid, Vue, Svelte, Angular, React Native):
  - `variant="tab"` — **the new default**: a vertical tab flush against the right viewport edge (right edge of the host view on React Native), vertically centered. A new `offset` prop nudges the tab up/down from center in px.
  - `variant="bubble"` — the legacy floating corner pill.
  - `compact` — icon-only mode for either variant (circular bubble / square edge tab); the `label` is not rendered but becomes the launcher's `aria-label`.
  - `position` gains the edge sides `'right' | 'left'` alongside the legacy corners. Defaults: `'right'` for the tab, `'bottom-right'` for the bubble.

  Backwards compatibility: passing a legacy corner `position` (`'bottom-right'` / `'bottom-left'` — or the offset-object form on React Native) without an explicit `variant` keeps the corner bubble, so existing call sites render exactly as before. When both are set, `variant` wins and `position` contributes only its horizontal side.

  The framework-agnostic placement resolver is now exported from the core package at `@tatlacas/brevwick-sdk/launcher` (`resolveLauncherPlacement`, `FeedbackButtonVariant`, `FeedbackButtonPosition`). Every adapter consumes this single tree-shakeable copy instead of carrying its own (the React Native adapter composes it for its offset-object form).

  Fixes a bug where the left-edge tab (`position="left"`) rendered well below vertical center: the standalone CSS `rotate: 180deg` was applied after `transform` and inverted the centering `translateY(-50%)`. The 180° flip is now composed inside `transform`, so the left tab is correctly centered while keeping its mirrored radii, flat edge, and hover behavior. The Svelte compact bubble is also aligned to 48px to match the other adapters.

- [#158](https://github.com/tatlacas-com/brevwick-sdk-js/pull/158) [`ede8731`](https://github.com/tatlacas-com/brevwick-sdk-js/commit/ede8731518a22831711198ee40389b53044be221) Thanks [@tatlacas](https://github.com/tatlacas)! - feat: restore the screenshot capture button in the widget composer

  The screenshot capture button — removed in v1 behind a future-flag (PR [#111](https://github.com/tatlacas-com/brevwick-sdk-js/issues/111)) — is back across all five web widgets (React, Solid, Vue, Svelte, Angular), backed by the core SDK's lazy `captureScreenshot()` wrapper. Clicking the camera button captures the page via the dynamically imported `modern-screenshot` peer dep and attaches the resulting image to the submitted issue. The React, Vue, Svelte, and Angular widgets add a region-select overlay (drag to crop a viewport rectangle) and a preview dialog to confirm the capture before sending; the Solid widget deliberately ships full-page capture only for V1 — no region overlay, no preview modal — keeping its adapter well under the bundle ceiling.

  `modern-screenshot` stays behind `await import('…')`, so the eager bundle cost is the UI surface only; bundle ceilings in `.size-limit.js` were raised accordingly (Vue 10 → 13 kB, Svelte SFC 14 → 22 kB, Angular 18 → 31 kB) and the on-widget-open budget remains under 25 kB gzip. React Native is unchanged — its widget intentionally ships no screenshot UI (issue [#116](https://github.com/tatlacas-com/brevwick-sdk-js/issues/116)).

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

## 1.0.2

### Patch Changes

- [#149](https://github.com/tatlacas-com/brevwick-sdk-js/pull/149) [`6623293`](https://github.com/tatlacas-com/brevwick-sdk-js/commit/66232935f708b77b8b14aaafb651d9ee64271849) Thanks [@tatlacas](https://github.com/tatlacas)! - Re-style the in-widget staged-status rows ("Captured route, console, network,
  device" / "PII-sanitised, packaged" / "Formatting with AI…") to match the
  marketing landing page's `AnimatedDemo` widget mock across every web-rendered
  adapter — React, Solid, Vue, Svelte, and Angular. Previously the rows rendered
  as assistant-coloured chat bubbles, which read as conversation messages rather
  than progress indicators and conflicted with the neutral-checklist treatment
  users saw on `brevwick.dev` before adopting the SDK. The rows now sit under a
  dashed top divider inside a `.brw-status-rows` (`brw-svelte-status-rows` on
  Svelte) wrapper, render as a compact stacked list with small emerald check
  icons, and live outside the `.brw-bubble` class family so screen readers and
  consumers that count conversation messages still see only the greeting + user
  message as bubbles. The per-row stagger now correctly targets
  `animation-delay` (the entrance is a CSS `@keyframes`, not a transition), so
  the cascade is no longer a no-op. The retry row keeps its standalone alert
  chrome — padding, radius, red border, transparent background — because it
  remains a separate failure CTA, not a checklist line. React Native is
  excluded — different rendering surface, native `StyleSheet` not CSS.

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

- [#68](https://github.com/tatlacas-com/brevwick-sdk-js/pull/68) [`e88eabe`](https://github.com/tatlacas-com/brevwick-sdk-js/commit/e88eabefb03f4984fa5e48219e12c4f4d125092f) Thanks [@tatlacas](https://github.com/tatlacas)! - Add `@tatlacas/brevwick-vue` adapter package: Vue 3 plugin (`app.use(BrevwickPlugin, config)`), `<FeedbackButton>` component, and `useFeedback()` composable. Mirrors the React adapter's mental model on Vue 3 composition API + provide/inject. SSR-safe (window-guarded plugin install + onMounted DOM access in the FAB). Eager bundle ≤ 5 kB gzip; the screenshot encoder stays dynamic-imported via the core SDK. Closes [#64](https://github.com/tatlacas-com/brevwick-sdk-js/issues/64).

- [#79](https://github.com/tatlacas-com/brevwick-sdk-js/pull/79) [`15138b9`](https://github.com/tatlacas-com/brevwick-sdk-js/commit/15138b9c8882697599bd5056424390756830e53d) Thanks [@tatlacas](https://github.com/tatlacas)! - Landing-parity bundle for the SDK payload — closes [#75](https://github.com/tatlacas-com/brevwick-sdk-js/issues/75), [#76](https://github.com/tatlacas-com/brevwick-sdk-js/issues/76), [#77](https://github.com/tatlacas-com/brevwick-sdk-js/issues/77).
  - **Console ring ([#75](https://github.com/tatlacas-com/brevwick-sdk-js/issues/75)):** patches all five console levels (`log` / `info` / `warn` / `error` / `debug`) by default into a 50-entry FIFO. New `BrevwickRingsConfig.console` accepts the legacy `boolean` shorthand or the object form `{ levels?, max? }` (hard ceiling 200) for finer-grained control. Existing `error` + unhandled-rejection paths stay regardless of the levels filter.
  - **Network ring ([#76](https://github.com/tatlacas-com/brevwick-sdk-js/issues/76)):** captures every completed fetch + XHR (success + failure) by default into a 20-entry FIFO. New `BrevwickRingsConfig.network` accepts `boolean` or `{ captureSuccess?, max? }` (hard ceiling 100). `NetworkEntry.error` is now optional. **Wire-contract change:** the ingest payload renames `network_errors` → `network_calls`; the server-side ingest mirrors the rename in lockstep.
  - **Redact expansion ([#77](https://github.com/tatlacas-com/brevwick-sdk-js/issues/77)):** the on-device redactor gains card numbers (Luhn-gated to skip false positives), IPv4 / IPv6 literals, US SSN + UK NI numbers, E.164 phone numbers (digit-count sanity check), AWS access keys, and GitHub tokens. New `BrevwickConfig.redact: { disable?, custom? }` lets projects turn off built-ins by name (`'auth' | 'cookie' | 'bearer' | 'jwt' | 'email' | 'card' | 'ip' | 'ssn' | 'phone' | 'aws' | 'github' | 'base64'`) or extend with project-specific patterns.

  **Bundle budget bump:** the eager `core` chunk's gzip ceiling moved from 2.2 kB → 2.85 kB to absorb the new ring-config + redact-config validators in `core/validate.ts`. The expanded redact patterns + Luhn helper themselves stay in the dynamic-imported ring + submit chunks. Mirrored in `CLAUDE.md`, `.size-limit.js`, and `chunk-split.test.ts`.

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

- [#119](https://github.com/tatlacas-com/brevwick-sdk-js/pull/119) [`721113f`](https://github.com/tatlacas-com/brevwick-sdk-js/commit/721113f4dcc011905110a5c2c21a30556297816b) Thanks [@tatlacas](https://github.com/tatlacas)! - Bring `<FeedbackButton>` to UX parity with the React adapter ([#112](https://github.com/tatlacas-com/brevwick-sdk-js/issues/112)). The widget now renders the chat-thread panel (assistant + user bubbles, receipt with relative-time), expected-vs-actual disclosure, phase-driven status rows, retry row, discard-confirm flow, AI toggle render-policy matrix, autogrow composer, and minimize button. The Vue `useFeedback()` composable is extended with `phase`, `error`, `retry` accessors and a new `internal-bridge.ts` subscribes to the SDK's phase bus. Bundle budget bumped 5 kB → 10 kB.

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

- [#119](https://github.com/tatlacas-com/brevwick-sdk-js/pull/119) [`721113f`](https://github.com/tatlacas-com/brevwick-sdk-js/commit/721113f4dcc011905110a5c2c21a30556297816b) Thanks [@tatlacas](https://github.com/tatlacas)! - Bring `<FeedbackButton>` to UX parity with the React adapter ([#112](https://github.com/tatlacas-com/brevwick-sdk-js/issues/112)). The widget now renders the chat-thread panel (assistant + user bubbles, receipt with relative-time), expected-vs-actual disclosure, phase-driven status rows, retry row, discard-confirm flow, AI toggle render-policy matrix, autogrow composer, and minimize button. The Vue `useFeedback()` composable is extended with `phase`, `error`, `retry` accessors and a new `internal-bridge.ts` subscribes to the SDK's phase bus. Bundle budget bumped 5 kB → 10 kB.

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

### Patch Changes

- Updated dependencies [[`d509f88`](https://github.com/tatlacas-com/brevwick-sdk-js/commit/d509f88743a38c96bff7446610ac98702dfcb00c), [`6807e6e`](https://github.com/tatlacas-com/brevwick-sdk-js/commit/6807e6e624497c116da36ae81f10f06faf350185), [`ccdc5b7`](https://github.com/tatlacas-com/brevwick-sdk-js/commit/ccdc5b77c2ba2f0b4abe1ba4f0fe51af842233be), [`96d1a15`](https://github.com/tatlacas-com/brevwick-sdk-js/commit/96d1a151f8eca750a4168b6d7542faf87a53eac3)]:
  - @tatlacas/brevwick-sdk@1.0.0-beta.9

## 1.0.0-beta.8

### Minor Changes

- [#68](https://github.com/tatlacas-com/brevwick-sdk-js/pull/68) [`e88eabe`](https://github.com/tatlacas-com/brevwick-sdk-js/commit/e88eabefb03f4984fa5e48219e12c4f4d125092f) Thanks [@tatlacas](https://github.com/tatlacas)! - Add `@tatlacas/brevwick-vue` adapter package: Vue 3 plugin (`app.use(BrevwickPlugin, config)`), `<FeedbackButton>` component, and `useFeedback()` composable. Mirrors the React adapter's mental model on Vue 3 composition API + provide/inject. SSR-safe (window-guarded plugin install + onMounted DOM access in the FAB). Eager bundle ≤ 5 kB gzip; the screenshot encoder stays dynamic-imported via the core SDK. Closes [#64](https://github.com/tatlacas-com/brevwick-sdk-js/issues/64).

- [#79](https://github.com/tatlacas-com/brevwick-sdk-js/pull/79) [`15138b9`](https://github.com/tatlacas-com/brevwick-sdk-js/commit/15138b9c8882697599bd5056424390756830e53d) Thanks [@tatlacas](https://github.com/tatlacas)! - Landing-parity bundle for the SDK payload — closes [#75](https://github.com/tatlacas-com/brevwick-sdk-js/issues/75), [#76](https://github.com/tatlacas-com/brevwick-sdk-js/issues/76), [#77](https://github.com/tatlacas-com/brevwick-sdk-js/issues/77).
  - **Console ring ([#75](https://github.com/tatlacas-com/brevwick-sdk-js/issues/75)):** patches all five console levels (`log` / `info` / `warn` / `error` / `debug`) by default into a 50-entry FIFO. New `BrevwickRingsConfig.console` accepts the legacy `boolean` shorthand or the object form `{ levels?, max? }` (hard ceiling 200) for finer-grained control. Existing `error` + unhandled-rejection paths stay regardless of the levels filter.
  - **Network ring ([#76](https://github.com/tatlacas-com/brevwick-sdk-js/issues/76)):** captures every completed fetch + XHR (success + failure) by default into a 20-entry FIFO. New `BrevwickRingsConfig.network` accepts `boolean` or `{ captureSuccess?, max? }` (hard ceiling 100). `NetworkEntry.error` is now optional. **Wire-contract change:** the ingest payload renames `network_errors` → `network_calls`; the server-side ingest mirrors the rename in lockstep.
  - **Redact expansion ([#77](https://github.com/tatlacas-com/brevwick-sdk-js/issues/77)):** the on-device redactor gains card numbers (Luhn-gated to skip false positives), IPv4 / IPv6 literals, US SSN + UK NI numbers, E.164 phone numbers (digit-count sanity check), AWS access keys, and GitHub tokens. New `BrevwickConfig.redact: { disable?, custom? }` lets projects turn off built-ins by name (`'auth' | 'cookie' | 'bearer' | 'jwt' | 'email' | 'card' | 'ip' | 'ssn' | 'phone' | 'aws' | 'github' | 'base64'`) or extend with project-specific patterns.

  **Bundle budget bump:** the eager `core` chunk's gzip ceiling moved from 2.2 kB → 2.85 kB to absorb the new ring-config + redact-config validators in `core/validate.ts`. The expanded redact patterns + Luhn helper themselves stay in the dynamic-imported ring + submit chunks. Mirrored in `CLAUDE.md`, `.size-limit.js`, and `chunk-split.test.ts`.

### Patch Changes

- Updated dependencies [[`c2060af`](https://github.com/tatlacas-com/brevwick-sdk-js/commit/c2060af1c7d3cdbdd106f2cdfe350d48c16e5b6c), [`e88eabe`](https://github.com/tatlacas-com/brevwick-sdk-js/commit/e88eabefb03f4984fa5e48219e12c4f4d125092f), [`15138b9`](https://github.com/tatlacas-com/brevwick-sdk-js/commit/15138b9c8882697599bd5056424390756830e53d), [`f9fb472`](https://github.com/tatlacas-com/brevwick-sdk-js/commit/f9fb4729e5f9ba7adf714cb1aeb025f421a7377f), [`47e47b8`](https://github.com/tatlacas-com/brevwick-sdk-js/commit/47e47b8db9656272ce09d553aa267dd4b0daf972), [`2337a8d`](https://github.com/tatlacas-com/brevwick-sdk-js/commit/2337a8d09f037f81e7d2ce77319e2f3987760de1)]:
  - @tatlacas/brevwick-sdk@1.0.0-beta.8
