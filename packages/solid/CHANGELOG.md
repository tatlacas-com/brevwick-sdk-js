# @tatlacas/brevwick-solid

## 1.0.0

### Minor Changes

- [#79](https://github.com/tatlacas-com/brevwick-sdk-js/pull/79) [`15138b9`](https://github.com/tatlacas-com/brevwick-sdk-js/commit/15138b9c8882697599bd5056424390756830e53d) Thanks [@tatlacas](https://github.com/tatlacas)! - Landing-parity bundle for the SDK payload — closes [#75](https://github.com/tatlacas-com/brevwick-sdk-js/issues/75), [#76](https://github.com/tatlacas-com/brevwick-sdk-js/issues/76), [#77](https://github.com/tatlacas-com/brevwick-sdk-js/issues/77).
  - **Console ring ([#75](https://github.com/tatlacas-com/brevwick-sdk-js/issues/75)):** patches all five console levels (`log` / `info` / `warn` / `error` / `debug`) by default into a 50-entry FIFO. New `BrevwickRingsConfig.console` accepts the legacy `boolean` shorthand or the object form `{ levels?, max? }` (hard ceiling 200) for finer-grained control. Existing `error` + unhandled-rejection paths stay regardless of the levels filter.
  - **Network ring ([#76](https://github.com/tatlacas-com/brevwick-sdk-js/issues/76)):** captures every completed fetch + XHR (success + failure) by default into a 20-entry FIFO. New `BrevwickRingsConfig.network` accepts `boolean` or `{ captureSuccess?, max? }` (hard ceiling 100). `NetworkEntry.error` is now optional. **Wire-contract change:** the ingest payload renames `network_errors` → `network_calls`; the server-side ingest mirrors the rename in lockstep.
  - **Redact expansion ([#77](https://github.com/tatlacas-com/brevwick-sdk-js/issues/77)):** the on-device redactor gains card numbers (Luhn-gated to skip false positives), IPv4 / IPv6 literals, US SSN + UK NI numbers, E.164 phone numbers (digit-count sanity check), AWS access keys, and GitHub tokens. New `BrevwickConfig.redact: { disable?, custom? }` lets projects turn off built-ins by name (`'auth' | 'cookie' | 'bearer' | 'jwt' | 'email' | 'card' | 'ip' | 'ssn' | 'phone' | 'aws' | 'github' | 'base64'`) or extend with project-specific patterns.

  **Bundle budget bump:** the eager `core` chunk's gzip ceiling moved from 2.2 kB → 2.85 kB to absorb the new ring-config + redact-config validators in `core/validate.ts`. The expanded redact patterns + Luhn helper themselves stay in the dynamic-imported ring + submit chunks. Mirrored in `CLAUDE.md`, `.size-limit.js`, and `chunk-split.test.ts`.

- [#70](https://github.com/tatlacas-com/brevwick-sdk-js/pull/70) [`f9fb472`](https://github.com/tatlacas-com/brevwick-sdk-js/commit/f9fb4729e5f9ba7adf714cb1aeb025f421a7377f) Thanks [@tatlacas](https://github.com/tatlacas)! - feat(solid): @tatlacas/brevwick-solid adapter — BrevwickProvider + useFeedback + FeedbackButton

  Ships the Solid bindings per the issue-66 SDD update:
  - `<BrevwickProvider config>` — creates the SDK inside `onMount` so SSR
    emits no Brevwick state and the install hook only fires after client
    hydration.
  - `useFeedback()` → `{ submit, captureScreenshot, status, reset }` where
    `status` is a Solid `Accessor<'idle' | 'submitting' | 'success' | 'error'>`.
    Throws synchronously when called outside the provider.
  - `<FeedbackButton>` — drop-in FAB + popover with textarea + screenshot
    capture + send. SSR-safe via the provider's hydration boundary; injects
    its stylesheet on first mount; reuses the React widget's `--brw-*`
    custom-property contract so cross-adapter theming stays consistent.
  - `"solid"` export condition pointing at the unbuilt `.tsx` source so
    Vite + `vite-plugin-solid` and SolidStart pick up the JSX-source for
    compile-time reactivity tracking. Pre-built `dist/index.js` /
    `dist/index.cjs` cover non-Solid-aware bundlers.
  - Bundle budget: < 5 kB gzip eager (enforced by `chunk-split.test.ts` +
    `.size-limit.js`).

  The `@tatlacas/brevwick-sdk` and `@tatlacas/brevwick-react` bumps are the
  lockstep pre-1.0 versions (no code change in either for this PR).

- [#121](https://github.com/tatlacas-com/brevwick-sdk-js/pull/121) [`2344715`](https://github.com/tatlacas-com/brevwick-sdk-js/commit/2344715598f1e317f88eb8507f1d720b68f77bc4) Thanks [@tatlacas](https://github.com/tatlacas)! - feat(solid): widget UX parity with React adapter

  The `<FeedbackButton>` Solid widget previously shipped a deliberately-
  small textarea-only subset (panel header + composer + screenshot button +
  send). It now renders the full chat-thread panel the React adapter does:
  - Greeting + user/assistant bubbles with relative-time receipts on
    successful submits.
  - Lazy `getConfig()` fetch on first panel open driving the AI toggle's
    render-policy matrix (`ai_enabled` + `ai_submitter_choice_allowed`).
  - Composer with autogrow textarea, paperclip file-attach (multi-file),
    screenshot button, AI toggle (track-and-thumb switch with Space-to-
    toggle keyboard a11y), and send.
  - Expected vs actual disclosure that piggybacks the submit payload.
  - Staged-status rows (`Captured` → `Sanitised` → `Formatting with AI…`)
    driven by the SDK's internal phase bus through a new
    `packages/solid/src/internal-bridge.ts`.
  - Tagged retry row on `ok: false` / chunk-load failures with a single
    Retry CTA that re-runs the original `FeedbackInput`.
  - Discard-confirm modal on dirty close; Esc / minimize preserves draft.
  - Reduced-motion gate (`prefers-reduced-motion: reduce`) flattens the
    staged-row stagger to instant.
  - Forced-palette via `theme="light|dark|system"` data attribute on FAB
    - panel; CSS injection guarded by the `brevwick-solid-styles` id.
  - Brevwick credit footer link below the composer.

  `useFeedback()` grows three new accessors (`phase`, `error`, `retry`) so
  the widget can drive the staged-status rows + retry CTA. The existing
  `submit`, `captureScreenshot`, `status`, `reset` surface is unchanged.

  Bundle budget bumped from 5 kB → 12 kB gzip to fit the larger UI surface;
  still well under the React adapter's 25 kB ceiling because the Radix-
  backed region-capture overlay + screenshot preview Dialog are out of
  scope for the Solid V1.

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

- [#121](https://github.com/tatlacas-com/brevwick-sdk-js/pull/121) [`2344715`](https://github.com/tatlacas-com/brevwick-sdk-js/commit/2344715598f1e317f88eb8507f1d720b68f77bc4) Thanks [@tatlacas](https://github.com/tatlacas)! - feat(solid): widget UX parity with React adapter

  The `<FeedbackButton>` Solid widget previously shipped a deliberately-
  small textarea-only subset (panel header + composer + screenshot button +
  send). It now renders the full chat-thread panel the React adapter does:
  - Greeting + user/assistant bubbles with relative-time receipts on
    successful submits.
  - Lazy `getConfig()` fetch on first panel open driving the AI toggle's
    render-policy matrix (`ai_enabled` + `ai_submitter_choice_allowed`).
  - Composer with autogrow textarea, paperclip file-attach (multi-file),
    screenshot button, AI toggle (track-and-thumb switch with Space-to-
    toggle keyboard a11y), and send.
  - Expected vs actual disclosure that piggybacks the submit payload.
  - Staged-status rows (`Captured` → `Sanitised` → `Formatting with AI…`)
    driven by the SDK's internal phase bus through a new
    `packages/solid/src/internal-bridge.ts`.
  - Tagged retry row on `ok: false` / chunk-load failures with a single
    Retry CTA that re-runs the original `FeedbackInput`.
  - Discard-confirm modal on dirty close; Esc / minimize preserves draft.
  - Reduced-motion gate (`prefers-reduced-motion: reduce`) flattens the
    staged-row stagger to instant.
  - Forced-palette via `theme="light|dark|system"` data attribute on FAB
    - panel; CSS injection guarded by the `brevwick-solid-styles` id.
  - Brevwick credit footer link below the composer.

  `useFeedback()` grows three new accessors (`phase`, `error`, `retry`) so
  the widget can drive the staged-status rows + retry CTA. The existing
  `submit`, `captureScreenshot`, `status`, `reset` surface is unchanged.

  Bundle budget bumped from 5 kB → 12 kB gzip to fit the larger UI surface;
  still well under the React adapter's 25 kB ceiling because the Radix-
  backed region-capture overlay + screenshot preview Dialog are out of
  scope for the Solid V1.

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

- [#79](https://github.com/tatlacas-com/brevwick-sdk-js/pull/79) [`15138b9`](https://github.com/tatlacas-com/brevwick-sdk-js/commit/15138b9c8882697599bd5056424390756830e53d) Thanks [@tatlacas](https://github.com/tatlacas)! - Landing-parity bundle for the SDK payload — closes [#75](https://github.com/tatlacas-com/brevwick-sdk-js/issues/75), [#76](https://github.com/tatlacas-com/brevwick-sdk-js/issues/76), [#77](https://github.com/tatlacas-com/brevwick-sdk-js/issues/77).
  - **Console ring ([#75](https://github.com/tatlacas-com/brevwick-sdk-js/issues/75)):** patches all five console levels (`log` / `info` / `warn` / `error` / `debug`) by default into a 50-entry FIFO. New `BrevwickRingsConfig.console` accepts the legacy `boolean` shorthand or the object form `{ levels?, max? }` (hard ceiling 200) for finer-grained control. Existing `error` + unhandled-rejection paths stay regardless of the levels filter.
  - **Network ring ([#76](https://github.com/tatlacas-com/brevwick-sdk-js/issues/76)):** captures every completed fetch + XHR (success + failure) by default into a 20-entry FIFO. New `BrevwickRingsConfig.network` accepts `boolean` or `{ captureSuccess?, max? }` (hard ceiling 100). `NetworkEntry.error` is now optional. **Wire-contract change:** the ingest payload renames `network_errors` → `network_calls`; the server-side ingest mirrors the rename in lockstep.
  - **Redact expansion ([#77](https://github.com/tatlacas-com/brevwick-sdk-js/issues/77)):** the on-device redactor gains card numbers (Luhn-gated to skip false positives), IPv4 / IPv6 literals, US SSN + UK NI numbers, E.164 phone numbers (digit-count sanity check), AWS access keys, and GitHub tokens. New `BrevwickConfig.redact: { disable?, custom? }` lets projects turn off built-ins by name (`'auth' | 'cookie' | 'bearer' | 'jwt' | 'email' | 'card' | 'ip' | 'ssn' | 'phone' | 'aws' | 'github' | 'base64'`) or extend with project-specific patterns.

  **Bundle budget bump:** the eager `core` chunk's gzip ceiling moved from 2.2 kB → 2.85 kB to absorb the new ring-config + redact-config validators in `core/validate.ts`. The expanded redact patterns + Luhn helper themselves stay in the dynamic-imported ring + submit chunks. Mirrored in `CLAUDE.md`, `.size-limit.js`, and `chunk-split.test.ts`.

- [#70](https://github.com/tatlacas-com/brevwick-sdk-js/pull/70) [`f9fb472`](https://github.com/tatlacas-com/brevwick-sdk-js/commit/f9fb4729e5f9ba7adf714cb1aeb025f421a7377f) Thanks [@tatlacas](https://github.com/tatlacas)! - feat(solid): @tatlacas/brevwick-solid adapter — BrevwickProvider + useFeedback + FeedbackButton

  Ships the Solid bindings per the issue-66 SDD update:
  - `<BrevwickProvider config>` — creates the SDK inside `onMount` so SSR
    emits no Brevwick state and the install hook only fires after client
    hydration.
  - `useFeedback()` → `{ submit, captureScreenshot, status, reset }` where
    `status` is a Solid `Accessor<'idle' | 'submitting' | 'success' | 'error'>`.
    Throws synchronously when called outside the provider.
  - `<FeedbackButton>` — drop-in FAB + popover with textarea + screenshot
    capture + send. SSR-safe via the provider's hydration boundary; injects
    its stylesheet on first mount; reuses the React widget's `--brw-*`
    custom-property contract so cross-adapter theming stays consistent.
  - `"solid"` export condition pointing at the unbuilt `.tsx` source so
    Vite + `vite-plugin-solid` and SolidStart pick up the JSX-source for
    compile-time reactivity tracking. Pre-built `dist/index.js` /
    `dist/index.cjs` cover non-Solid-aware bundlers.
  - Bundle budget: < 5 kB gzip eager (enforced by `chunk-split.test.ts` +
    `.size-limit.js`).

  The `@tatlacas/brevwick-sdk` and `@tatlacas/brevwick-react` bumps are the
  lockstep pre-1.0 versions (no code change in either for this PR).

### Patch Changes

- Updated dependencies [[`c2060af`](https://github.com/tatlacas-com/brevwick-sdk-js/commit/c2060af1c7d3cdbdd106f2cdfe350d48c16e5b6c), [`e88eabe`](https://github.com/tatlacas-com/brevwick-sdk-js/commit/e88eabefb03f4984fa5e48219e12c4f4d125092f), [`15138b9`](https://github.com/tatlacas-com/brevwick-sdk-js/commit/15138b9c8882697599bd5056424390756830e53d), [`f9fb472`](https://github.com/tatlacas-com/brevwick-sdk-js/commit/f9fb4729e5f9ba7adf714cb1aeb025f421a7377f), [`47e47b8`](https://github.com/tatlacas-com/brevwick-sdk-js/commit/47e47b8db9656272ce09d553aa267dd4b0daf972), [`2337a8d`](https://github.com/tatlacas-com/brevwick-sdk-js/commit/2337a8d09f037f81e7d2ce77319e2f3987760de1)]:
  - @tatlacas/brevwick-sdk@1.0.0-beta.8
