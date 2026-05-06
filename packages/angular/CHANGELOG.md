# @tatlacas/brevwick-angular

## 1.0.0-beta.13

### Minor Changes

- [#120](https://github.com/tatlacas-com/brevwick-sdk-js/pull/120) [`f24a4d1`](https://github.com/tatlacas-com/brevwick-sdk-js/commit/f24a4d175af7131e14db7134fa5147222b195b0a) Thanks [@tatlacas](https://github.com/tatlacas)! - Bring `<bw-feedback-button>` to UX parity with the React adapter ([#115](https://github.com/tatlacas-com/brevwick-sdk-js/issues/115)). The standalone component now renders the chat-thread panel (assistant + user bubbles, receipt with relative-time), expected-vs-actual disclosure, phase-driven status rows, retry row, discard-confirm flow, AI toggle render-policy matrix, autogrow composer, and minimize button. `BrevwickService` is extended with `phase`, `error`, `retry`, `getConfig` Signals subscribed via a new `phase-bus.ts`. Component uses `ViewEncapsulation.None` so the canonical `BREVWICK_CSS` rules apply. Bundle budget bumped 8 kB → 18 kB.

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
  were the original failure mode behind the brevwick-web#254 / PR [#103](https://github.com/tatlacas-com/brevwick-sdk-js/issues/103)
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

- [#71](https://github.com/tatlacas-com/brevwick-sdk-js/pull/71) [`c2060af`](https://github.com/tatlacas-com/brevwick-sdk-js/commit/c2060af1c7d3cdbdd106f2cdfe350d48c16e5b6c) Thanks [@tatlacas](https://github.com/tatlacas)! - feat(angular): @tatlacas/brevwick-angular adapter package

  Ships the Angular 17+ standalone bindings:
  - `provideBrevwick(config)` — returns `EnvironmentProviders` for
    `bootstrapApplication`-style DI bootstrap.
  - `BrevwickService` (`providedIn: 'root'`) — Signals-first wrapper around
    `Brevwick`, SSR-safe via `PLATFORM_ID` + `isPlatformBrowser`. Exposes
    `submit()`, `captureScreenshot()`, `reset()`, and a `status` Signal that
    walks `'idle' | 'submitting' | 'success' | 'error'`.
  - `<bw-feedback-button>` (`BwFeedbackButtonComponent`) — drop-in standalone
    FAB with a minimal text-only panel. Wraps `BrevwickService`, emits the
    SDK's `SubmitResult`, and short-circuits on non-browser platforms.
  - `BREVWICK_ANGULAR_VERSION` — diagnostics literal, written into source by
    a `prebuild` codegen step (ng-packagr does not honour `define`).

  Build pipeline uses ng-packagr (Angular Package Format) — divergent from the
  rest of the monorepo's tsup adapters. Eager FESM2022 bundle measures 4.58 kB
  gzip vs the 8 kB envelope; `modern-screenshot` stays lazy via the SDK.

  The `@tatlacas/brevwick-sdk` and `@tatlacas/brevwick-react` bumps are the
  lockstep pre-1.0 version (no code change in either package for this PR).

- [#79](https://github.com/tatlacas-com/brevwick-sdk-js/pull/79) [`15138b9`](https://github.com/tatlacas-com/brevwick-sdk-js/commit/15138b9c8882697599bd5056424390756830e53d) Thanks [@tatlacas](https://github.com/tatlacas)! - Landing-parity bundle for the SDK payload — closes [#75](https://github.com/tatlacas-com/brevwick-sdk-js/issues/75), [#76](https://github.com/tatlacas-com/brevwick-sdk-js/issues/76), [#77](https://github.com/tatlacas-com/brevwick-sdk-js/issues/77).
  - **Console ring ([#75](https://github.com/tatlacas-com/brevwick-sdk-js/issues/75)):** patches all five console levels (`log` / `info` / `warn` / `error` / `debug`) by default into a 50-entry FIFO. New `BrevwickRingsConfig.console` accepts the legacy `boolean` shorthand or the object form `{ levels?, max? }` (hard ceiling 200) for finer-grained control. Existing `error` + unhandled-rejection paths stay regardless of the levels filter.
  - **Network ring ([#76](https://github.com/tatlacas-com/brevwick-sdk-js/issues/76)):** captures every completed fetch + XHR (success + failure) by default into a 20-entry FIFO. New `BrevwickRingsConfig.network` accepts `boolean` or `{ captureSuccess?, max? }` (hard ceiling 100). `NetworkEntry.error` is now optional. **Wire-contract change:** the ingest payload renames `network_errors` → `network_calls`; the companion `brevwick-api` change ships in lockstep.
  - **Redact expansion ([#77](https://github.com/tatlacas-com/brevwick-sdk-js/issues/77)):** the on-device redactor gains card numbers (Luhn-gated to skip false positives), IPv4 / IPv6 literals, US SSN + UK NI numbers, E.164 phone numbers (digit-count sanity check), AWS access keys, and GitHub tokens. New `BrevwickConfig.redact: { disable?, custom? }` lets projects turn off built-ins by name (`'auth' | 'cookie' | 'bearer' | 'jwt' | 'email' | 'card' | 'ip' | 'ssn' | 'phone' | 'aws' | 'github' | 'base64'`) or extend with project-specific patterns.

  **Bundle budget bump:** the eager `core` chunk's gzip ceiling moved from 2.2 kB → 2.85 kB to absorb the new ring-config + redact-config validators in `core/validate.ts`. The expanded redact patterns + Luhn helper themselves stay in the dynamic-imported ring + submit chunks. Mirrored in `CLAUDE.md`, `.size-limit.js`, and `chunk-split.test.ts`.

### Patch Changes

- Updated dependencies [[`c2060af`](https://github.com/tatlacas-com/brevwick-sdk-js/commit/c2060af1c7d3cdbdd106f2cdfe350d48c16e5b6c), [`e88eabe`](https://github.com/tatlacas-com/brevwick-sdk-js/commit/e88eabefb03f4984fa5e48219e12c4f4d125092f), [`15138b9`](https://github.com/tatlacas-com/brevwick-sdk-js/commit/15138b9c8882697599bd5056424390756830e53d), [`f9fb472`](https://github.com/tatlacas-com/brevwick-sdk-js/commit/f9fb4729e5f9ba7adf714cb1aeb025f421a7377f), [`47e47b8`](https://github.com/tatlacas-com/brevwick-sdk-js/commit/47e47b8db9656272ce09d553aa267dd4b0daf972), [`2337a8d`](https://github.com/tatlacas-com/brevwick-sdk-js/commit/2337a8d09f037f81e7d2ce77319e2f3987760de1)]:
  - @tatlacas/brevwick-sdk@1.0.0-beta.8
