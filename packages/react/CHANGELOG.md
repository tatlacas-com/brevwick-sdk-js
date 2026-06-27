# brevwick-react

## 2.0.0-beta.2

### Patch Changes

- [#163](https://github.com/tatlacas-com/brevwick-sdk-js/pull/163) [`873a621`](https://github.com/tatlacas-com/brevwick-sdk-js/commit/873a621a568004b338d3a8f287a44fbcf55551e3) Thanks [@tatlacas](https://github.com/tatlacas)! - fix: strip control chars from captured bodies and elide binary responses

  The network ring read binary response bodies as text whenever the content-type slipped past the binary gate — most commonly a `font/woff2` download. A WOFF2 font read via `Response.text()` carries NUL (U+0000) bytes, which the ingest API cannot store in its `text`/`jsonb` columns: every such submission failed the server-side `INSERT` and came back **500** (and the oversized bodies also tripped occasional **413**s).

  Two layers of fix:
  - `redact()` — the mandatory pre-send chokepoint every ring and the submit pipeline pass through — now strips C0 control characters (NUL et al., keeping `\t` `\n` `\r`) and DEL as an unconditional final pass, so no captured string can carry a NUL regardless of which ring produced it.
  - The network ring's binary content-type gate now also covers `font/*` and `application/wasm|pdf|zip|gzip|x-protobuf|font-*`, so those bodies are recorded as `[binary N bytes]` instead of being read as text — fixing the payload bloat behind the 413s.

  The server adds the same NUL-stripping as defence-in-depth, but this stops the bad bytes at the source.

- Updated dependencies [[`873a621`](https://github.com/tatlacas-com/brevwick-sdk-js/commit/873a621a568004b338d3a8f287a44fbcf55551e3)]:
  - @tatlacas/brevwick-sdk@2.0.0-beta.2

## 2.0.0-beta.1

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

- [#158](https://github.com/tatlacas-com/brevwick-sdk-js/pull/158) [`ede8731`](https://github.com/tatlacas-com/brevwick-sdk-js/commit/ede8731518a22831711198ee40389b53044be221) Thanks [@tatlacas](https://github.com/tatlacas)! - feat: restore the screenshot capture button in the widget composer

  The screenshot capture button — removed in v1 behind a future-flag (PR [#111](https://github.com/tatlacas-com/brevwick-sdk-js/issues/111)) — is back across all five web widgets (React, Solid, Vue, Svelte, Angular), backed by the core SDK's lazy `captureScreenshot()` wrapper. Clicking the camera button captures the page via the dynamically imported `modern-screenshot` peer dep and attaches the resulting image to the submitted issue. The React, Vue, Svelte, and Angular widgets add a region-select overlay (drag to crop a viewport rectangle) and a preview dialog to confirm the capture before sending; the Solid widget deliberately ships full-page capture only for V1 — no region overlay, no preview modal — keeping its adapter well under the bundle ceiling.

  `modern-screenshot` stays behind `await import('…')`, so the eager bundle cost is the UI surface only; bundle ceilings in `.size-limit.js` were raised accordingly (Vue 10 → 13 kB, Svelte SFC 14 → 22 kB, Angular 18 → 31 kB) and the on-widget-open budget remains under 25 kB gzip. React Native is unchanged — its widget intentionally ships no screenshot UI (issue [#116](https://github.com/tatlacas-com/brevwick-sdk-js/issues/116)).

### Patch Changes

- Updated dependencies [[`db60dd6`](https://github.com/tatlacas-com/brevwick-sdk-js/commit/db60dd6c42a048d40a24e60232c885b835a9fe57), [`ede8731`](https://github.com/tatlacas-com/brevwick-sdk-js/commit/ede8731518a22831711198ee40389b53044be221)]:
  - @tatlacas/brevwick-sdk@2.0.0-beta.1

## 2.0.0-beta.0

### Minor Changes

- [#155](https://github.com/tatlacas-com/brevwick-sdk-js/pull/155) [`3327926`](https://github.com/tatlacas-com/brevwick-sdk-js/commit/332792687ef9bf85822a0446a3cca4ba604b506a) Thanks [@tatlacas](https://github.com/tatlacas)! - feat: dev-only `debug` mode that exposes the raw payload sent to the API

  Add a `debug?: boolean` config option (default `false`). When enabled, every `submit()` resolves with a `debug.payload` field carrying the exact, already-redacted body that was POSTed to `/v1/ingest/issues` — including everything the widget never renders (console ring, network ring, route trail, device + user context, attachment descriptors).

  All five web widgets (React, Solid, Vue, Svelte, Angular) render a per-message **"Copy raw payload"** button on each sent bubble when the payload is present, copying the pretty-printed JSON to the clipboard. The button is absent unless `debug` is on.

  Wire it to a host build flag so it never ships to real users, e.g. `debug: process.env.NEXT_PUBLIC_SEE_LOGS === 'true'`. `debug` never changes what is sent — the payload is identical to a normal submit and stays fully redacted; the only cost is retaining it in memory per submit.

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
- Updated dependencies [[`3327926`](https://github.com/tatlacas-com/brevwick-sdk-js/commit/332792687ef9bf85822a0446a3cca4ba604b506a), [`ba4d53a`](https://github.com/tatlacas-com/brevwick-sdk-js/commit/ba4d53af10637d49c1047cbeb32d6af856a7824b)]:
  - @tatlacas/brevwick-sdk@2.0.0-beta.0

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

### Major Changes

- [#37](https://github.com/tatlacas-com/brevwick-sdk-js/pull/37) [`fea0f2d`](https://github.com/tatlacas-com/brevwick-sdk-js/commit/fea0f2d7167f82c3c6a9c07ae94e688ea73fab09) Thanks [@tatlacas](https://github.com/tatlacas)! - BREAKING: rename Report → Issue across the public API. The SDK now submits
  "issues" and exposes `Issue*` types.
  - `SubmitResult` success shape: `{ ok: true; report_id: string }` →
    `{ ok: true; issue_id: string }`.
  - Ingest endpoint path: `POST /v1/ingest/reports` → `POST /v1/ingest/issues`
    (paired server-contract change).
  - JSDoc, wire field names, test fixtures, and example prose all follow
    the same rename.

  Callers that destructure `report_id` from the `submit()` result must
  update to `issue_id`; consumers of the ingest URL must point at
  `/v1/ingest/issues`. No transitional alias is shipped — this is a major
  version bump precisely because the shape is incompatible.

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

- [#68](https://github.com/tatlacas-com/brevwick-sdk-js/pull/68) [`e88eabe`](https://github.com/tatlacas-com/brevwick-sdk-js/commit/e88eabefb03f4984fa5e48219e12c4f4d125092f) Thanks [@tatlacas](https://github.com/tatlacas)! - Add `@tatlacas/brevwick-vue` adapter package: Vue 3 plugin (`app.use(BrevwickPlugin, config)`), `<FeedbackButton>` component, and `useFeedback()` composable. Mirrors the React adapter's mental model on Vue 3 composition API + provide/inject. SSR-safe (window-guarded plugin install + onMounted DOM access in the FAB). Eager bundle ≤ 5 kB gzip; the screenshot encoder stays dynamic-imported via the core SDK. Closes [#64](https://github.com/tatlacas-com/brevwick-sdk-js/issues/64).

- [#27](https://github.com/tatlacas-com/brevwick-sdk-js/pull/27) [`c4e0d51`](https://github.com/tatlacas-com/brevwick-sdk-js/commit/c4e0d51db6df24cd650dd81fd2a8b16ce79102de) Thanks [@tatlacas](https://github.com/tatlacas)! - feat(react): chat-thread panel redesign for FeedbackButton

  Reshapes the `<FeedbackButton>` widget from a centered modal into an
  anchored, chat-style panel that slides up next to the FAB (bottom-right /
  bottom-left).
  - Layout: header (title, minimize, close) → scrollable bubble thread →
    sticky composer (icons + autogrowing textarea + Send).
  - Composer: Enter sends; Shift/Ctrl/Meta/Alt + Enter inserts a newline;
    IME composition is respected. Autogrow ceiling is shared between CSS
    and JS via a single exported constant.
  - Attachments: screenshot chip + file chips with stable monotonic ids so
    removing a middle file never flashes surviving chips into the wrong
    slot.
  - Esc / overlay-click are mapped to "minimize with preserved state" (not
    destructive close); the × button explicitly runs the dirty-confirm
    flow, and is disabled while a submit is in-flight.
  - Progressive disclosure for expected / actual; hidden behind a single
    "Add expected vs actual" button by default.
  - Title field is derived from the first line of the description (max 120
    chars) — `FeedbackInput.title` wire shape is unchanged.
  - Success state replaces the thread with a persistent confirmation
    bubble + "Send another"; no auto-close timer. "Send another" returns
    focus to the composer textarea for keyboard users. If a submit
    resolves while the panel is minimized, the success state is still
    rendered on reopen so the user sees their issue was received.
  - Dark-mode chip background is one step brighter than the border so the
    chip outline stays visible.
  - `prefers-reduced-motion` disables both the panel slide animation and
    the FAB hover transition; softens the spinner.
  - `data-brevwick-skip=""` remains on the FAB and dialog content.
  - No new dependencies. Widget ESM bundle ≈ 6.9 kB gzip (well under the
    25 kB budget); core SDK untouched at 2.0 kB gzip.

  The `@tatlacas/brevwick-sdk` bump is the lockstep pre-1.0 version (no code
  changes in the SDK for this PR).

- [#19](https://github.com/tatlacas-com/brevwick-sdk-js/pull/19) [`8b9bdc5`](https://github.com/tatlacas-com/brevwick-sdk-js/commit/8b9bdc59aa55d1c4cb334866d0eef006ea3a4e5d) Thanks [@tatlacas](https://github.com/tatlacas)! - Add the console error ring: patches `console.error` / `console.warn` and listens for `window` `'error'` and `'unhandledrejection'` events, pushing redacted entries into a bounded FIFO buffer (cap 50). Messages and stacks run through `redact()` before storage, stacks are trimmed to the top 20 frames (leader preserved), and identical `message + first-frame` pairs within a 500 ms window dedupe in place via a new optional `count?: number` field on `ConsoleEntry`. The ring is wired into `DEFAULT_RINGS` by direct import so tree-shaking with `"sideEffects": false` stays safe; `uninstall()` restores originals, removes listeners, and clears internal dedupe state. Closes [#2](https://github.com/tatlacas-com/brevwick-sdk-js/issues/2).

- [#16](https://github.com/tatlacas-com/brevwick-sdk-js/pull/16) [`7a716bb`](https://github.com/tatlacas-com/brevwick-sdk-js/commit/7a716bbd342b18b89ac44085cdc8143655078eb2) Thanks [@tatlacas](https://github.com/tatlacas)! - Add `createBrevwick(config)` factory with `install()` / `uninstall()` lifecycle and bounded FIFO ring buffers (console 50, network 50, routes 20). Canonicalises the `endpoint` so typo-equivalents (trailing slash, host casing) collapse to the same singleton key. `uninstall()` evicts the instance from the singleton registry so a subsequent `createBrevwick` call with the same key returns a fresh, installable instance. Ring modules land in follow-up PRs ([#2](https://github.com/tatlacas-com/brevwick-sdk-js/issues/2) / [#3](https://github.com/tatlacas-com/brevwick-sdk-js/issues/3)) and are wired in by direct import, not module-side-effect registration, so the SDK's `"sideEffects": false` contract stays safe under tree-shaking. Freezes the public surface to exactly `createBrevwick`, `Brevwick`, `BrevwickConfig`, `FeedbackInput`, `SubmitResult`, `FeedbackAttachment`, `Environment`.

- [#58](https://github.com/tatlacas-com/brevwick-sdk-js/pull/58) [`103eb83`](https://github.com/tatlacas-com/brevwick-sdk-js/commit/103eb83887f4ef28f2e6e439f9505f381b6b700d) Thanks [@tatlacas](https://github.com/tatlacas)! - feat(react): multi-screenshot, in-flight capture indicator, tap-to-preview

  Three feedback-panel UX fixes that together make the screenshot flow
  legible end-to-end:
  - **In-flight capture indicator** ([#55](https://github.com/tatlacas-com/brevwick-sdk-js/issues/55)). The region-capture overlay closes
    the moment the user clicks Capture, but `captureScreenshot()` plus the
    optional crop step is async — previously the panel re-appeared with no
    thumbnail and no explanation for the gap. A new `capturing` state
    surfaces a "Capturing screenshot…" bubble in the thread and disables
    the screenshot + file-attach controls so a second click cannot stack
    on top of the first.
  - **Multiple screenshots per submission** ([#56](https://github.com/tatlacas-com/brevwick-sdk-js/issues/56)). The composer now keeps
    a bounded array of screenshots instead of a single field; each capture
    appends rather than replacing the previous one. The combined
    screenshot/file total caps at 5 (mirrors the SDK's
    `MAX_ATTACHMENT_COUNT`); the attach buttons disable with an explanatory
    `aria-label` once the cap is reached. Single-screenshot submissions
    keep the historical `screenshot.<ext>` wire filename; multi-screenshot
    submissions disambiguate as `screenshot-1.<ext>`, `screenshot-2.<ext>`,
    in capture order.
  - **Tap thumbnail to preview** ([#57](https://github.com/tatlacas-com/brevwick-sdk-js/issues/57)). The screenshot chip's image is now
    a button that opens a Radix `Dialog` preview at viewport-fit size. Esc,
    the close button, and the backdrop dismiss; focus restores to the chip
    on close. The chip's × remove stays a sibling so it never opens the
    preview, and removing a screenshot whose preview is open auto-closes
    the dialog.

  The `@tatlacas/brevwick-sdk` patch bump is a no-op to keep the two
  packages in lockstep per the repo's pre-1.0 versioning policy.

- [#53](https://github.com/tatlacas-com/brevwick-sdk-js/pull/53) [`9a33e1d`](https://github.com/tatlacas-com/brevwick-sdk-js/commit/9a33e1d6b3b6a535e02087128ce2c262db31657d) Thanks [@tatlacas](https://github.com/tatlacas)! - feat(react): redesign feedback panel as continuous chat thread

  Refactors `<FeedbackButton>` from a "thread + post-submit takeover" UI
  into a continuous chat thread, closing [#52](https://github.com/tatlacas-com/brevwick-sdk-js/issues/52).
  - Introduces a module-scope `Message` type and a `messages` state array;
    `Thread` renders from history (`messages.map(...)`) instead of a
    hardcoded layout.
  - Drops the live-mirror `<UserBubble>{draft}</UserBubble>` — typing into
    the composer no longer paints a bubble above it.
  - Removes `SuccessState`, `handleSendAnother`, the `succeeded` flag,
    and the `focusComposerPending` layout-effect dance. The composer is
    always mounted; submit success appends a user bubble + an assistant
    "Thanks — your issue is on its way." bubble, then clears the composer
    in place. Focus stays put.
  - The assistant receipt bubble carries an "Issue sent · timestamp"
    footer (`brw-bubble--receipt`) with an inline 16x16 SVG check icon. A
    tiny in-file `formatRelativeTime` helper avoids pulling in
    `Intl.RelativeTimeFormat` or `date-fns` so the bundle stays inside
    the §12 25 kB initial-gzip budget.
  - Closing the panel via `×` (or via "Discard" in the dirty-confirm)
    resets the thread to just the greeting on next open. Minimize
    semantics are unchanged — that path skips `resetAll()` so the
    existing "minimize preserves draft + attachments" contract still
    holds.
  - Removes the now-unused `.brw-bubble--success` and `.brw-success-wrap`
    CSS rules; adds `.brw-bubble--receipt` (small inline-flex footer
    reusing `--brw-fg-muted`, no new tokens).
  - Each new submission still fires its own POST and creates its own
    ticket; UI continuity ≠ thread continuity, and the receipt marker
    between bubbles makes that legible.

  The `@tatlacas/brevwick-sdk` bump is the lockstep pre-1.0 version (no
  code changes in the SDK for this PR).

- [#79](https://github.com/tatlacas-com/brevwick-sdk-js/pull/79) [`15138b9`](https://github.com/tatlacas-com/brevwick-sdk-js/commit/15138b9c8882697599bd5056424390756830e53d) Thanks [@tatlacas](https://github.com/tatlacas)! - Landing-parity bundle for the SDK payload — closes [#75](https://github.com/tatlacas-com/brevwick-sdk-js/issues/75), [#76](https://github.com/tatlacas-com/brevwick-sdk-js/issues/76), [#77](https://github.com/tatlacas-com/brevwick-sdk-js/issues/77).
  - **Console ring ([#75](https://github.com/tatlacas-com/brevwick-sdk-js/issues/75)):** patches all five console levels (`log` / `info` / `warn` / `error` / `debug`) by default into a 50-entry FIFO. New `BrevwickRingsConfig.console` accepts the legacy `boolean` shorthand or the object form `{ levels?, max? }` (hard ceiling 200) for finer-grained control. Existing `error` + unhandled-rejection paths stay regardless of the levels filter.
  - **Network ring ([#76](https://github.com/tatlacas-com/brevwick-sdk-js/issues/76)):** captures every completed fetch + XHR (success + failure) by default into a 20-entry FIFO. New `BrevwickRingsConfig.network` accepts `boolean` or `{ captureSuccess?, max? }` (hard ceiling 100). `NetworkEntry.error` is now optional. **Wire-contract change:** the ingest payload renames `network_errors` → `network_calls`; the server-side ingest mirrors the rename in lockstep.
  - **Redact expansion ([#77](https://github.com/tatlacas-com/brevwick-sdk-js/issues/77)):** the on-device redactor gains card numbers (Luhn-gated to skip false positives), IPv4 / IPv6 literals, US SSN + UK NI numbers, E.164 phone numbers (digit-count sanity check), AWS access keys, and GitHub tokens. New `BrevwickConfig.redact: { disable?, custom? }` lets projects turn off built-ins by name (`'auth' | 'cookie' | 'bearer' | 'jwt' | 'email' | 'card' | 'ip' | 'ssn' | 'phone' | 'aws' | 'github' | 'base64'`) or extend with project-specific patterns.

  **Bundle budget bump:** the eager `core` chunk's gzip ceiling moved from 2.2 kB → 2.85 kB to absorb the new ring-config + redact-config validators in `core/validate.ts`. The expanded redact patterns + Luhn helper themselves stay in the dynamic-imported ring + submit chunks. Mirrored in `CLAUDE.md`, `.size-limit.js`, and `chunk-split.test.ts`.

- [#24](https://github.com/tatlacas-com/brevwick-sdk-js/pull/24) [`07a7ab2`](https://github.com/tatlacas-com/brevwick-sdk-js/commit/07a7ab21bd2c867a3285c0780140b1200d3425b0) Thanks [@tatlacas](https://github.com/tatlacas)! - Allow `http://` endpoints on loopback hostnames (`localhost`, `127.0.0.1`, `[::1]`) so integrators can point `createBrevwick` at a local Brevwick API without standing up TLS. Non-loopback hosts still require `https:`. The eager-bundle gzip budget is bumped from < 2 kB to < 2.2 kB to accommodate the three extra hostname checks (SDD § 12 + `CLAUDE.md` updated in lockstep). `.localhost` subdomain aliases are NOT accepted; use `127.0.0.1` instead.

- [#21](https://github.com/tatlacas-com/brevwick-sdk-js/pull/21) [`91adb28`](https://github.com/tatlacas-com/brevwick-sdk-js/commit/91adb288ce52712c5e618e0b73d803650667a55a) Thanks [@tatlacas](https://github.com/tatlacas)! - Add the network ring: patches `globalThis.fetch` and `XMLHttpRequest.prototype.open/send/setRequestHeader` on install to capture any request with status ≥ 400 or that throws / aborts / times out. Captured entries include sanitised request + response headers (allow-list only — `content-type`, `accept`, `x-request-id`, etc.), a redacted + capped request body (2 kB) and response body (4 kB), and duration. Sensitive query parameters (`token|auth|key|session|sig`) are stripped from the captured URL. Binary and form-data bodies surface as `[binary N bytes]` / `[form-data]` markers. Requests to the configured ingest endpoint and requests carrying the `X-Brevwick-SDK` header are skipped to avoid submit-time feedback loops; the loop guard matches on origin + path boundary so sibling brand domains such as `api.brevwick.company` are not silently dropped. XHR `abort` and `timeout` are captured alongside `error` with distinct labels.

  Grows the public `NetworkEntry` type (all optional fields): `requestBody`, `responseBody`, `requestHeaders`, `responseHeaders`. Existing consumers are source-compatible.

  The ring module is dynamic-imported from `install()` and lands in its own async chunk — keeping the eager core bundle under the 2 kB gzip budget mandated by `CLAUDE.md`. Async ring loaders that resolve after `uninstall()` now short-circuit via a generation counter, so late-landing imports never re-patch globals against a terminal instance.

  Test-only helpers (`__setRingsForTesting`, `__resetBrevwickRegistry`) moved from the package root to a new `@tatlacas/brevwick-sdk/testing` entry point so they never ship in the eager production bundle. Not part of the public contract; consumer code must not import them.

- [#23](https://github.com/tatlacas-com/brevwick-sdk-js/pull/23) [`788edc7`](https://github.com/tatlacas-com/brevwick-sdk-js/commit/788edc70a23713df78b4095e7c8f063b6e9345cf) Thanks [@tatlacas](https://github.com/tatlacas)! - feat(react): BrevwickProvider + useFeedback + FeedbackButton

  Ships the React bindings per SDD § 12:
  - `<BrevwickProvider config>` — memoises `createBrevwick(config)` keyed on
    config identity, installs on mount, uninstalls on unmount.
  - `useFeedback()` → `{ submit, captureScreenshot, status, reset }` with a
    four-state machine `'idle' | 'submitting' | 'success' | 'error'`.
  - `<FeedbackButton>` — drop-in FAB + dialog with attachments, screenshot
    capture, double-submit guard, and unmount-safe async handlers. Props:
    `position`, `disabled`, `hidden`, `className`, `label`, `onSubmit`.
  - `"use client"` banner preserved in both ESM and CJS bundles for Next.js
    App Router.
  - `data-brevwick-skip` applied to FAB, overlay, and dialog so captured
    screenshots exclude Brevwick's own UI.

  The `@tatlacas/brevwick-sdk` bump is the lockstep pre-1.0 version (no code change in
  the SDK for this PR).

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

- [#41](https://github.com/tatlacas-com/brevwick-sdk-js/pull/41) [`e7cc9e4`](https://github.com/tatlacas-com/brevwick-sdk-js/commit/e7cc9e40a95d58a5c0a4ade77d802827c91eb3f9) Thanks [@tatlacas](https://github.com/tatlacas)! - feat(react): `theme` prop on `<FeedbackButton>` (light / dark / system)
  - New `theme?: 'light' | 'dark' | 'system'` prop lets consumers force a
    palette regardless of the OS `prefers-color-scheme` setting. Default
    `'system'` preserves the pre-existing OS-driven behaviour.
  - The prop stamps `data-brw-theme` on every `.brw-root` element (FAB,
    dialog panel, region-capture overlay). Two new CSS blocks —
    `.brw-root[data-brw-theme='light'|'dark']` — override the internal
    `--brw-*-base` defaults set on `:where(:root)` (and the
    `@media (prefers-color-scheme: dark)` swap).
  - Host-level `:root { --brw-*: ... }` overrides still win even under a
    forced theme: every widget rule consumes
    `var(--brw-X, var(--brw-X-base))`, and the forced-theme blocks only
    rewrite `--brw-X-base`, never the public `--brw-X`. So
    `theme="dark"` + a consumer `--brw-accent: hotpink` still paints the
    accent hotpink.
  - `BrevwickTheme` type exported from `@tatlacas/brevwick-react` for consumers that
    want to type their own theme-selecting state.

  The `@tatlacas/brevwick-sdk` patch bump is a no-op to keep the two packages in
  lockstep per the repo's pre-1.0 versioning policy.

- [#34](https://github.com/tatlacas-com/brevwick-sdk-js/pull/34) [`ac2640c`](https://github.com/tatlacas-com/brevwick-sdk-js/commit/ac2640ce57882f25190323e9d2db3d9cf44e7b32) Thanks [@tatlacas](https://github.com/tatlacas)! - feat(react): screenshot icon + drag-to-select region capture
  - The composer's screenshot icon is now a monitor-plus-selection glyph
    (previously a camera), with `aria-label="Capture screenshot of this
page"` so keyboard and screen-reader users discover the affordance
    without relying on the surrounding tooltip. The paperclip file-upload
    button next to it is unchanged.
  - Clicking the screenshot icon now opens a full-viewport region-capture
    overlay (Radix `Dialog.Root`, focus-trapped, Escape-to-dismiss). The
    submitter drags to mark a rectangle; "Capture" crops the full-page
    screenshot to that region, "Capture full page" preserves the pre-[#31](https://github.com/tatlacas-com/brevwick-sdk-js/issues/31)
    behaviour, and "Cancel" closes without a capture.
  - Crop runs through `OffscreenCanvas` when available and falls back to
    a detached `<canvas>` + `toBlob` — both branches multiply the source
    rectangle by `devicePixelRatio` so the crop is sharp on HiDPI displays.
  - Overlay nodes carry `data-brevwick-skip=""` so the SDK's capture scrub
    excludes them from the image (defence-in-depth — the overlay is
    unmounted before `captureScreenshot()` resolves).
  - `prefers-reduced-motion: reduce` opts out of the selection shake
    animation on a degenerate confirm.
  - Keyboard Enter confirms the drawn region only when the overlay root
    itself has focus; tabbing to Cancel / Capture full page and pressing
    Enter activates the focused button as expected.

  The `@tatlacas/brevwick-sdk` bump is a no-op minor to keep the two packages in
  lockstep per the repo's pre-1.0 versioning policy; the core SDK has no
  code changes in this release. `FeedbackButtonProps` is unchanged; no
  new runtime dependency; no SDD § 12 contract change.

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

- [#45](https://github.com/tatlacas-com/brevwick-sdk-js/pull/45) [`eee8b24`](https://github.com/tatlacas-com/brevwick-sdk-js/commit/eee8b24ab22f82533850a545bc5884d08a523055) Thanks [@tatlacas](https://github.com/tatlacas)! - Rename packages to the `@tatlacas` npm scope: `brevwick-sdk` → `@tatlacas/brevwick-sdk` and `brevwick-react` → `@tatlacas/brevwick-react`. The public API surface is unchanged — only the install name differs.

  **Consumers must update their `package.json` and imports:**

  ```diff
  - import { createBrevwick } from 'brevwick-sdk';
  + import { createBrevwick } from '@tatlacas/brevwick-sdk';
  ```

  ```diff
  - import { BrevwickProvider, FeedbackButton } from 'brevwick-react';
  + import { BrevwickProvider, FeedbackButton } from '@tatlacas/brevwick-react';
  ```

  Wire-level identifiers (the `sdk.name: 'brevwick-sdk'` field in ingest payloads and the `X-Brevwick-SDK` request header) are intentionally preserved, so server-side filters on the SDK identifier continue to match.

- [#20](https://github.com/tatlacas-com/brevwick-sdk-js/pull/20) [`f6446b5`](https://github.com/tatlacas-com/brevwick-sdk-js/commit/f6446b518d3c6350011b1a1472d3b2fae3a48706) Thanks [@tatlacas](https://github.com/tatlacas)! - feat(screenshot): captureScreenshot() via dynamic import

  Adds `captureScreenshot(opts?)` to `@tatlacas/brevwick-sdk`. The function dynamically
  imports `modern-screenshot` so the base bundle stays below the 2 kB gzip
  budget. `[data-brevwick-skip]` nodes are hidden during capture and restored
  afterwards — even on failure. Capture never throws: a failure resolves with a
  1×1 transparent WebP placeholder and logs a `warn` entry into the console
  ring. `modern-screenshot` is declared as an optional peer dependency so
  consumers that never call `captureScreenshot` skip the install.

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

- [#80](https://github.com/tatlacas-com/brevwick-sdk-js/pull/80) [`47e47b8`](https://github.com/tatlacas-com/brevwick-sdk-js/commit/47e47b8db9656272ce09d553aa267dd4b0daf972) Thanks [@tatlacas](https://github.com/tatlacas)! - feat(react): staged-status feedback widget UX ([#74](https://github.com/tatlacas-com/brevwick-sdk-js/issues/74))

  Pressing **Send** in the React feedback widget now clears the input and
  moves the typed value into the conversation thread synchronously, then
  animates a sequence of staged status rows through to the assistant
  receipt: **Captured route, console, network, device** → **PII-sanitised,
  packaged** → **Formatting with AI…**.

  The submit pipeline drives the rows via a new internal `phase` event on
  `@tatlacas/brevwick-sdk`'s ring bus (`'capturing-done' | 'sanitising-done'
| 'sent'`) — emitted at the `composePayload` / `redact()` / ingest-2xx
  boundaries. The event is **internal-only**: not exposed on the public
  SDK surface; framework adapters reach it through the existing
  `_internal` backdoor.

  `useFeedback()` gains:
  - `phase`: `'idle' | 'capturing' | 'sanitising' | 'formatting' | 'sent'
| 'error'` — backwards-compatible alongside the existing `status`.
  - `error`: tagged `SubmitError | null` from the most recent failed
    submit.
  - `retry()`: re-runs the most recent `submit()` with the same input.

  The "Formatting with AI…" row is gated on `getConfig().ai_enabled === true`
  so non-AI projects don't claim work the SDK isn't doing. Reduced motion
  (`prefers-reduced-motion: reduce`) collapses the cascade to a flat fade.
  On failure, the in-progress rows collapse to a red retry row carrying
  the `SubmitError.message` verbatim plus a one-click **Retry** CTA, for
  every `SubmitErrorCode` the submit pipeline can produce.

  Bundle: React adapter ESM 11.92 kB / CJS 12.3 kB (limit 25 kB). SDK core
  eager 2.13 kB / 2.14 kB (limit 2.2 kB).

- [#22](https://github.com/tatlacas-com/brevwick-sdk-js/pull/22) [`d3f6577`](https://github.com/tatlacas-com/brevwick-sdk-js/commit/d3f65776f6b2ad8e17bfe22d08bb970dce576dcb) Thanks [@tatlacas](https://github.com/tatlacas)! - Add `submit(input)` pipeline: presigns each attachment, PUTs to the returned URL, then POSTs `/v1/ingest/issues` under a 30 s `AbortController` budget with one initial attempt + two retries on 5xx / network errors. Public type `SubmitResult` becomes a tagged union — `{ ok: true; issue_id: string } | { ok: false; error: { code: SubmitErrorCode; message: string } }` — so callers discriminate on `ok` and the pipeline never throws (breaking change versus the prior `{ issueId }` shape). New exports: `SubmitError`, `SubmitErrorCode`, and `FeedbackAttachment` (which widens `FeedbackInput.attachments` to `Array<Blob | FeedbackAttachment>`). All free-form text and `user_context` extras run through `redact()` before the wire; `config.user.email` is masked as `a***@d***.tld`; ring snapshots flow through unchanged because they were redacted at capture. Attachments are validated client-side (≤5 count, ≤10 MB each, MIME ∈ {image/png, image/jpeg, image/webp, video/webm}) before any presign round-trip. The submit pipeline lives in its own dynamic-import chunk so the eager core stays under the 2 kB gzip budget.

- [#72](https://github.com/tatlacas-com/brevwick-sdk-js/pull/72) [`2337a8d`](https://github.com/tatlacas-com/brevwick-sdk-js/commit/2337a8d09f037f81e7d2ce77319e2f3987760de1) Thanks [@tatlacas](https://github.com/tatlacas)! - feat(svelte): @tatlacas/brevwick-svelte adapter — context + FeedbackButton + getFeedback

  Ships the Svelte bindings per SDD § 12:
  - `setBrevwickContext(config)` — root-layout setter that creates the SDK
    instance, calls `install()`, and stores it on Svelte's context.
  - `getFeedback()` — composable-style getter returning `{ submit,
captureScreenshot, status, reset }` with a Svelte `Readable` `status`
    store.
  - `<FeedbackButton>` — drop-in floating action button + chat-style
    composer with screenshot capture, file attachments, theming via
    `--brw-*` CSS custom properties, and SSR-safe `onMount` guard.

  Build pipeline: `svelte-package` (Svelte's official packager). Eager
  gzip < 1 kB; on-widget-open weight is shared with the core SDK's
  `modern-screenshot` dynamic chunk. Redaction tests cover the full
  submit pipeline; chunk-split test asserts `modern-screenshot` never
  leaks into emitted artefacts.

  Includes a SvelteKit example app at `examples/svelte/` and a complete
  README mirroring the React adapter's structure.

- [#33](https://github.com/tatlacas-com/brevwick-sdk-js/pull/33) [`2ff114f`](https://github.com/tatlacas-com/brevwick-sdk-js/commit/2ff114f9f70057c2bb982fdf1a531603bf8fe65f) Thanks [@tatlacas](https://github.com/tatlacas)! - feat(react): light/dark theming + composer shell polish
  - Introduce a `--brw-*` CSS custom-property token set on `:where(:root)`
    (specificity 0) so any host rule re-themes the widget without
    `!important`. Surface, text, border, accent, shadow, and divider
    tokens are covered; status colours (`--brw-error`) stay widget-internal.
  - Light defaults ship out of the box; a
    `@media (prefers-color-scheme: dark)` override swaps the palette when
    the host OS issues dark mode. Host overrides persist across modes.
  - Composer controls are wrapped in a rounded `.brw-composer-shell`
    with a `:focus-within` ring, so the textarea + icon buttons + send +
    AI toggle read as a single input affordance.
  - Multiline textarea retains the 1–5 row autogrow; `align-items:
flex-end` keeps the send button pinned to the bottom as the textarea
    grows.
  - JSDoc on `<FeedbackButton>` documents every public token, including
    `--brw-bubble-user-fg` and `--brw-divider`.
  - vitest-axe added as a devDep and runs clean on the rendered panel in
    both light and dark matchMedia stubs.
  - No public API change (props / hooks / payload unchanged); no new
    runtime dependency.

  The `@tatlacas/brevwick-sdk` bump is a no-op patch to keep the two packages in
  lockstep per the repo's pre-1.0 versioning policy; the core SDK has
  no code changes in this release.

- [#28](https://github.com/tatlacas-com/brevwick-sdk-js/pull/28) [`5a3c498`](https://github.com/tatlacas-com/brevwick-sdk-js/commit/5a3c498c28943cea1b0d4402ba50071f14461f62) Thanks [@tatlacas](https://github.com/tatlacas)! - feat(react): submitter Use-AI toggle + project config fetch

  Implements issue [#26](https://github.com/tatlacas-com/brevwick-sdk-js/issues/26) per SDD § 12.
  - `Brevwick.getConfig()` → `Promise<ProjectConfig | null>`. Dynamic-imported
    so the fetcher lives in a sibling chunk and never lands in the eager SDK
    bundle. Cached per session (the same stored promise collapses concurrent
    callers and retains a `null` result so failed or malformed responses are
    not retried).
  - New `ProjectConfig` type (`{ ai_enabled, ai_submitter_choice_allowed }`)
    exported from `@tatlacas/brevwick-sdk`; `fetchConfig` never throws — non-2xx,
    malformed shape, and thrown fetch all resolve to `null`.
  - `FeedbackInput` gains optional `use_ai: boolean`; `composePayload`
    threads it through to the ingest body when defined. Booleans skip
    `redact()` (non-string primitives are already passthrough).
  - `<FeedbackButton>` lazy-fetches project config on first panel open
    (never on mount, never before open) and renders a `role="switch"`
    "Format with AI" toggle when both `ai_enabled` and
    `ai_submitter_choice_allowed` are `true`. In every other state
    (config fetch pending, rejected, resolved to `null`, either flag
    `false`) the toggle is hidden and the submit payload omits `use_ai`.
  - Toggle defaults to on when visible; `resetAll()` ("Send another")
    returns it to the default. Space and click both flip the switch;
    `:focus-visible` ring and `prefers-reduced-motion` branch included.
  - Config request stamps `Authorization: Bearer <projectKey>` and the
    `X-Brevwick-SDK` loop-guard header so the network ring does not
    recursively capture it.
  - Eager SDK chunk stays under the 2.2 kB gzip budget (measured 2107 B).

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

- [#47](https://github.com/tatlacas-com/brevwick-sdk-js/pull/47) [`9955f24`](https://github.com/tatlacas-com/brevwick-sdk-js/commit/9955f24f281f7711163233bd9164c4f4e7e0353b) Thanks [@tatlacas](https://github.com/tatlacas)! - fix(react): AI toggle now reads as a switch, aligns with send button
  - The composer AI toggle used to be a pill that only changed background
    colour between on/off, so the off state looked _disabled_ rather than
    _unchecked_. Redesigned as a track-and-thumb switch: thumb slides
    left↔right, track fills with `--brw-accent` when on, reduced-motion
    skips the transition.
  - The "AI" label now sits **outside** the button so the track itself is
    the unambiguous toggle affordance. The label recolours from
    `--brw-fg-muted` to `--brw-fg` via `:has(.brw-aitoggle--on)` to
    reinforce the state.
  - New `.brw-aitoggle-wrap` is 34px tall to match `.brw-send-btn`, so the
    switch centre and the send-button centre share a baseline under the
    composer shell's `align-items: flex-end`.

  Semantic contract is unchanged — `role="switch"`, `aria-checked`,
  `aria-label="Format with AI"`, Space-to-toggle, and the
  `.brw-aitoggle--on` class all stay put.

  The `@tatlacas/brevwick-sdk` patch bump is a no-op to keep the two
  packages in lockstep per the repo's pre-1.0 versioning policy.

- [#35](https://github.com/tatlacas-com/brevwick-sdk-js/pull/35) [`46c2bc9`](https://github.com/tatlacas-com/brevwick-sdk-js/commit/46c2bc94d293987ff5c375835d30e53135d0fc2d) Thanks [@tatlacas](https://github.com/tatlacas)! - feat(react): credit footer with version + brevwick.dev link
  - Thin `Brevwick v<x.y.z>` credit anchored below the composer, rendered
    inside the existing `<FeedbackButton>` panel in both compose and
    success states.
  - Single link to https://brevwick.dev with `target="_blank"` and
    `rel="noopener noreferrer"`; label reads as one affordance rather
    than two competing elements.
  - Muted 10 px styling driven by `--brw-fg-muted` + `--brw-composer-bg`,
    so the footer sits quietly in both light and dark themes. Hover/focus
    lifts opacity and underlines, keeping it discoverable without
    intruding.
  - Version text comes from the existing `__BREVWICK_REACT_VERSION__`
    build-time constant that already powers `BREVWICK_REACT_VERSION` —
    no new source of truth.
  - No public API change; props, hooks, and payload are unchanged.

  The `@tatlacas/brevwick-sdk` bump is a no-op patch to keep both packages in
  lockstep per the repo's pre-1.0 versioning policy; the core SDK has
  no code changes in this release.

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

- [#50](https://github.com/tatlacas-com/brevwick-sdk-js/pull/50) [`a6246ab`](https://github.com/tatlacas-com/brevwick-sdk-js/commit/a6246ab3e9cf62fe64439e45cc5e04e8b61b5bca) Thanks [@tatlacas](https://github.com/tatlacas)! - fix(react): hide feedback panel while region-capture overlay is up

  Clicking the screenshot button opens a drag-to-select overlay over the
  page, but the feedback panel itself stayed painted at its anchor corner
  the whole time — covering page content the user was specifically trying
  to screenshot. Toggle a new `brw-panel-hidden` class
  (`visibility: hidden; pointer-events: none`) on the panel for the
  lifetime of the overlay so the page underneath is fully visible during
  selection. The panel stays mounted, so the composer draft, attachments,
  and Radix focus management survive an open / cancel round-trip; only
  painting and hit-testing are suppressed. The existing
  `data-brevwick-skip` on the panel is unchanged — it still scrubs the
  panel from the rasterised image during the actual capture pass; this
  fix is strictly about pre-capture occlusion.

  The `@tatlacas/brevwick-sdk` patch bump is a no-op to keep the two
  packages in lockstep per the repo's pre-1.0 versioning policy.

- [#39](https://github.com/tatlacas-com/brevwick-sdk-js/pull/39) [`84a6627`](https://github.com/tatlacas-com/brevwick-sdk-js/commit/84a662716df017884549de16463568d32954b881) Thanks [@tatlacas](https://github.com/tatlacas)! - test(integration): MSW + live-API e2e coverage

  Adds an end-to-end integration suite under
  `packages/{sdk,react}/src/__tests__/integration/` that exercises real ring
  installation, the redaction matrix per secret class, the runtime lazy-load
  guard for `modern-screenshot`, golden payload pinning, and a React render
  through the real `createBrevwick` pipeline. No shipped behaviour change —
  test-only coverage hardening.

  The package version bumps are no-op patches that keep the two packages in
  lockstep per the repo's pre-1.0 versioning policy.

- [#36](https://github.com/tatlacas-com/brevwick-sdk-js/pull/36) [`d0d30d0`](https://github.com/tatlacas-com/brevwick-sdk-js/commit/d0d30d0075cf1f523f65622e4935557e28cfee4f) Thanks [@tatlacas](https://github.com/tatlacas)! - fix(react): add hidden Dialog.Title to screenshot region overlay

  Radix `Dialog.Content` emits a `console.error` when no `Dialog.Title`
  descendant is present. The region-capture overlay previously labelled
  itself with `aria-label` only, so every screenshot button click logged
  the warning. Render a visually-hidden `Dialog.Title` (text: "Select
  screenshot region") to satisfy the primitive without affecting the
  announced name.

  The `@tatlacas/brevwick-sdk` bump is a no-op patch to keep the two packages in
  lockstep per the repo's pre-1.0 versioning policy.

- [#32](https://github.com/tatlacas-com/brevwick-sdk-js/pull/32) [`5fcc5a7`](https://github.com/tatlacas-com/brevwick-sdk-js/commit/5fcc5a73053ddd3a5ab406f7ce2471d53ba159fa) Thanks [@tatlacas](https://github.com/tatlacas)! - fix(submit): send sha256 on presign + issue so R2 PUT carries checksum

  Compute base64 SHA-256 client-side once per attachment blob (via
  `crypto.subtle.digest`) and thread the same digest through the presign
  request body, the PUT header echo, and the final issue entry. Without
  this the R2 bucket's required `x-amz-checksum-sha256` header is missing
  and every screenshot submit 409s. Fixes [#29](https://github.com/tatlacas-com/brevwick-sdk-js/issues/29).

- [#38](https://github.com/tatlacas-com/brevwick-sdk-js/pull/38) [`d13c28e`](https://github.com/tatlacas-com/brevwick-sdk-js/commit/d13c28e1e14df0f314a4d53f170e41767269353c) Thanks [@tatlacas](https://github.com/tatlacas)! - Internal: enable `minify: true` in the React package's tsup build (~2 kB
  gzip smaller delivered artefact for consumers; no API or runtime-behaviour
  change). Adds `size-limit` budgets enforced in CI: core eager chunk ≤ 2.2 kB
  gzip, screenshot wrapper ≤ 1.5 kB gzip, React bundle ≤ 25 kB gzip, and a
  re-bundled "on-widget-open" measurement (screenshot wrapper + resolved
  `modern-screenshot` peer) ≤ 25 kB gzip. SDK source unchanged; bumped in
  lockstep with `@tatlacas/brevwick-react` per the project's lockstep policy.
- Updated dependencies [[`9955f24`](https://github.com/tatlacas-com/brevwick-sdk-js/commit/9955f24f281f7711163233bd9164c4f4e7e0353b), [`c2060af`](https://github.com/tatlacas-com/brevwick-sdk-js/commit/c2060af1c7d3cdbdd106f2cdfe350d48c16e5b6c), [`e88eabe`](https://github.com/tatlacas-com/brevwick-sdk-js/commit/e88eabefb03f4984fa5e48219e12c4f4d125092f), [`c4e0d51`](https://github.com/tatlacas-com/brevwick-sdk-js/commit/c4e0d51db6df24cd650dd81fd2a8b16ce79102de), [`8b9bdc5`](https://github.com/tatlacas-com/brevwick-sdk-js/commit/8b9bdc59aa55d1c4cb334866d0eef006ea3a4e5d), [`7a716bb`](https://github.com/tatlacas-com/brevwick-sdk-js/commit/7a716bbd342b18b89ac44085cdc8143655078eb2), [`46c2bc9`](https://github.com/tatlacas-com/brevwick-sdk-js/commit/46c2bc94d293987ff5c375835d30e53135d0fc2d), [`c3d5300`](https://github.com/tatlacas-com/brevwick-sdk-js/commit/c3d5300740bcb30c15a4b75eff484c81786b0b7c), [`103eb83`](https://github.com/tatlacas-com/brevwick-sdk-js/commit/103eb83887f4ef28f2e6e439f9505f381b6b700d), [`9a33e1d`](https://github.com/tatlacas-com/brevwick-sdk-js/commit/9a33e1d6b3b6a535e02087128ce2c262db31657d), [`e9f24aa`](https://github.com/tatlacas-com/brevwick-sdk-js/commit/e9f24aaba3079d62488e190aadf5c2aca1f6504d), [`a6246ab`](https://github.com/tatlacas-com/brevwick-sdk-js/commit/a6246ab3e9cf62fe64439e45cc5e04e8b61b5bca), [`84a6627`](https://github.com/tatlacas-com/brevwick-sdk-js/commit/84a662716df017884549de16463568d32954b881), [`15138b9`](https://github.com/tatlacas-com/brevwick-sdk-js/commit/15138b9c8882697599bd5056424390756830e53d), [`07a7ab2`](https://github.com/tatlacas-com/brevwick-sdk-js/commit/07a7ab21bd2c867a3285c0780140b1200d3425b0), [`91adb28`](https://github.com/tatlacas-com/brevwick-sdk-js/commit/91adb288ce52712c5e618e0b73d803650667a55a), [`788edc7`](https://github.com/tatlacas-com/brevwick-sdk-js/commit/788edc70a23713df78b4095e7c8f063b6e9345cf), [`d509f88`](https://github.com/tatlacas-com/brevwick-sdk-js/commit/d509f88743a38c96bff7446610ac98702dfcb00c), [`6807e6e`](https://github.com/tatlacas-com/brevwick-sdk-js/commit/6807e6e624497c116da36ae81f10f06faf350185), [`ccdc5b7`](https://github.com/tatlacas-com/brevwick-sdk-js/commit/ccdc5b77c2ba2f0b4abe1ba4f0fe51af842233be), [`e7cc9e4`](https://github.com/tatlacas-com/brevwick-sdk-js/commit/e7cc9e40a95d58a5c0a4ade77d802827c91eb3f9), [`ac2640c`](https://github.com/tatlacas-com/brevwick-sdk-js/commit/ac2640ce57882f25190323e9d2db3d9cf44e7b32), [`fea0f2d`](https://github.com/tatlacas-com/brevwick-sdk-js/commit/fea0f2d7167f82c3c6a9c07ae94e688ea73fab09), [`96d1a15`](https://github.com/tatlacas-com/brevwick-sdk-js/commit/96d1a151f8eca750a4168b6d7542faf87a53eac3), [`eee8b24`](https://github.com/tatlacas-com/brevwick-sdk-js/commit/eee8b24ab22f82533850a545bc5884d08a523055), [`1d2cb82`](https://github.com/tatlacas-com/brevwick-sdk-js/commit/1d2cb822e471bac4344c88703071f64815e05181), [`d0d30d0`](https://github.com/tatlacas-com/brevwick-sdk-js/commit/d0d30d0075cf1f523f65622e4935557e28cfee4f), [`f6446b5`](https://github.com/tatlacas-com/brevwick-sdk-js/commit/f6446b518d3c6350011b1a1472d3b2fae3a48706), [`5fcc5a7`](https://github.com/tatlacas-com/brevwick-sdk-js/commit/5fcc5a73053ddd3a5ab406f7ce2471d53ba159fa), [`d13c28e`](https://github.com/tatlacas-com/brevwick-sdk-js/commit/d13c28e1e14df0f314a4d53f170e41767269353c), [`f9fb472`](https://github.com/tatlacas-com/brevwick-sdk-js/commit/f9fb4729e5f9ba7adf714cb1aeb025f421a7377f), [`47e47b8`](https://github.com/tatlacas-com/brevwick-sdk-js/commit/47e47b8db9656272ce09d553aa267dd4b0daf972), [`d3f6577`](https://github.com/tatlacas-com/brevwick-sdk-js/commit/d3f65776f6b2ad8e17bfe22d08bb970dce576dcb), [`2337a8d`](https://github.com/tatlacas-com/brevwick-sdk-js/commit/2337a8d09f037f81e7d2ce77319e2f3987760de1), [`2ff114f`](https://github.com/tatlacas-com/brevwick-sdk-js/commit/2ff114f9f70057c2bb982fdf1a531603bf8fe65f), [`5a3c498`](https://github.com/tatlacas-com/brevwick-sdk-js/commit/5a3c498c28943cea1b0d4402ba50071f14461f62)]:
  - @tatlacas/brevwick-sdk@1.0.0

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

- [#68](https://github.com/tatlacas-com/brevwick-sdk-js/pull/68) [`e88eabe`](https://github.com/tatlacas-com/brevwick-sdk-js/commit/e88eabefb03f4984fa5e48219e12c4f4d125092f) Thanks [@tatlacas](https://github.com/tatlacas)! - Add `@tatlacas/brevwick-vue` adapter package: Vue 3 plugin (`app.use(BrevwickPlugin, config)`), `<FeedbackButton>` component, and `useFeedback()` composable. Mirrors the React adapter's mental model on Vue 3 composition API + provide/inject. SSR-safe (window-guarded plugin install + onMounted DOM access in the FAB). Eager bundle ≤ 5 kB gzip; the screenshot encoder stays dynamic-imported via the core SDK. Closes [#64](https://github.com/tatlacas-com/brevwick-sdk-js/issues/64).

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

- [#80](https://github.com/tatlacas-com/brevwick-sdk-js/pull/80) [`47e47b8`](https://github.com/tatlacas-com/brevwick-sdk-js/commit/47e47b8db9656272ce09d553aa267dd4b0daf972) Thanks [@tatlacas](https://github.com/tatlacas)! - feat(react): staged-status feedback widget UX ([#74](https://github.com/tatlacas-com/brevwick-sdk-js/issues/74))

  Pressing **Send** in the React feedback widget now clears the input and
  moves the typed value into the conversation thread synchronously, then
  animates a sequence of staged status rows through to the assistant
  receipt: **Captured route, console, network, device** → **PII-sanitised,
  packaged** → **Formatting with AI…**.

  The submit pipeline drives the rows via a new internal `phase` event on
  `@tatlacas/brevwick-sdk`'s ring bus (`'capturing-done' | 'sanitising-done'
| 'sent'`) — emitted at the `composePayload` / `redact()` / ingest-2xx
  boundaries. The event is **internal-only**: not exposed on the public
  SDK surface; framework adapters reach it through the existing
  `_internal` backdoor.

  `useFeedback()` gains:
  - `phase`: `'idle' | 'capturing' | 'sanitising' | 'formatting' | 'sent'
| 'error'` — backwards-compatible alongside the existing `status`.
  - `error`: tagged `SubmitError | null` from the most recent failed
    submit.
  - `retry()`: re-runs the most recent `submit()` with the same input.

  The "Formatting with AI…" row is gated on `getConfig().ai_enabled === true`
  so non-AI projects don't claim work the SDK isn't doing. Reduced motion
  (`prefers-reduced-motion: reduce`) collapses the cascade to a flat fade.
  On failure, the in-progress rows collapse to a red retry row carrying
  the `SubmitError.message` verbatim plus a one-click **Retry** CTA, for
  every `SubmitErrorCode` the submit pipeline can produce.

  Bundle: React adapter ESM 11.92 kB / CJS 12.3 kB (limit 25 kB). SDK core
  eager 2.13 kB / 2.14 kB (limit 2.2 kB).

- [#72](https://github.com/tatlacas-com/brevwick-sdk-js/pull/72) [`2337a8d`](https://github.com/tatlacas-com/brevwick-sdk-js/commit/2337a8d09f037f81e7d2ce77319e2f3987760de1) Thanks [@tatlacas](https://github.com/tatlacas)! - feat(svelte): @tatlacas/brevwick-svelte adapter — context + FeedbackButton + getFeedback

  Ships the Svelte bindings per SDD § 12:
  - `setBrevwickContext(config)` — root-layout setter that creates the SDK
    instance, calls `install()`, and stores it on Svelte's context.
  - `getFeedback()` — composable-style getter returning `{ submit,
captureScreenshot, status, reset }` with a Svelte `Readable` `status`
    store.
  - `<FeedbackButton>` — drop-in floating action button + chat-style
    composer with screenshot capture, file attachments, theming via
    `--brw-*` CSS custom properties, and SSR-safe `onMount` guard.

  Build pipeline: `svelte-package` (Svelte's official packager). Eager
  gzip < 1 kB; on-widget-open weight is shared with the core SDK's
  `modern-screenshot` dynamic chunk. Redaction tests cover the full
  submit pipeline; chunk-split test asserts `modern-screenshot` never
  leaks into emitted artefacts.

  Includes a SvelteKit example app at `examples/svelte/` and a complete
  README mirroring the React adapter's structure.

### Patch Changes

- Updated dependencies [[`c2060af`](https://github.com/tatlacas-com/brevwick-sdk-js/commit/c2060af1c7d3cdbdd106f2cdfe350d48c16e5b6c), [`e88eabe`](https://github.com/tatlacas-com/brevwick-sdk-js/commit/e88eabefb03f4984fa5e48219e12c4f4d125092f), [`15138b9`](https://github.com/tatlacas-com/brevwick-sdk-js/commit/15138b9c8882697599bd5056424390756830e53d), [`f9fb472`](https://github.com/tatlacas-com/brevwick-sdk-js/commit/f9fb4729e5f9ba7adf714cb1aeb025f421a7377f), [`47e47b8`](https://github.com/tatlacas-com/brevwick-sdk-js/commit/47e47b8db9656272ce09d553aa267dd4b0daf972), [`2337a8d`](https://github.com/tatlacas-com/brevwick-sdk-js/commit/2337a8d09f037f81e7d2ce77319e2f3987760de1)]:
  - @tatlacas/brevwick-sdk@1.0.0-beta.8

## 1.0.0-beta.7

### Minor Changes

- [#58](https://github.com/tatlacas-com/brevwick-sdk-js/pull/58) [`103eb83`](https://github.com/tatlacas-com/brevwick-sdk-js/commit/103eb83887f4ef28f2e6e439f9505f381b6b700d) Thanks [@tatlacas](https://github.com/tatlacas)! - feat(react): multi-screenshot, in-flight capture indicator, tap-to-preview

  Three feedback-panel UX fixes that together make the screenshot flow
  legible end-to-end:
  - **In-flight capture indicator** ([#55](https://github.com/tatlacas-com/brevwick-sdk-js/issues/55)). The region-capture overlay closes
    the moment the user clicks Capture, but `captureScreenshot()` plus the
    optional crop step is async — previously the panel re-appeared with no
    thumbnail and no explanation for the gap. A new `capturing` state
    surfaces a "Capturing screenshot…" bubble in the thread and disables
    the screenshot + file-attach controls so a second click cannot stack
    on top of the first.
  - **Multiple screenshots per submission** ([#56](https://github.com/tatlacas-com/brevwick-sdk-js/issues/56)). The composer now keeps
    a bounded array of screenshots instead of a single field; each capture
    appends rather than replacing the previous one. The combined
    screenshot/file total caps at 5 (mirrors the SDK's
    `MAX_ATTACHMENT_COUNT`); the attach buttons disable with an explanatory
    `aria-label` once the cap is reached. Single-screenshot submissions
    keep the historical `screenshot.<ext>` wire filename; multi-screenshot
    submissions disambiguate as `screenshot-1.<ext>`, `screenshot-2.<ext>`,
    in capture order.
  - **Tap thumbnail to preview** ([#57](https://github.com/tatlacas-com/brevwick-sdk-js/issues/57)). The screenshot chip's image is now
    a button that opens a Radix `Dialog` preview at viewport-fit size. Esc,
    the close button, and the backdrop dismiss; focus restores to the chip
    on close. The chip's × remove stays a sibling so it never opens the
    preview, and removing a screenshot whose preview is open auto-closes
    the dialog.

  The `@tatlacas/brevwick-sdk` patch bump is a no-op to keep the two
  packages in lockstep per the repo's pre-1.0 versioning policy.

### Patch Changes

- Updated dependencies [[`103eb83`](https://github.com/tatlacas-com/brevwick-sdk-js/commit/103eb83887f4ef28f2e6e439f9505f381b6b700d)]:
  - @tatlacas/brevwick-sdk@1.0.0-beta.7

## 1.0.0-beta.6

### Minor Changes.

- [#53](https://github.com/tatlacas-com/brevwick-sdk-js/pull/53) [`9a33e1d`](https://github.com/tatlacas-com/brevwick-sdk-js/commit/9a33e1d6b3b6a535e02087128ce2c262db31657d) Thanks [@tatlacas](https://github.com/tatlacas)! - feat(react): redesign feedback panel as continuous chat thread

  Refactors `<FeedbackButton>` from a "thread + post-submit takeover" UI
  into a continuous chat thread, closing [#52](https://github.com/tatlacas-com/brevwick-sdk-js/issues/52).
  - Introduces a module-scope `Message` type and a `messages` state array;
    `Thread` renders from history (`messages.map(...)`) instead of a
    hardcoded layout.
  - Drops the live-mirror `<UserBubble>{draft}</UserBubble>` — typing into
    the composer no longer paints a bubble above it.
  - Removes `SuccessState`, `handleSendAnother`, the `succeeded` flag,
    and the `focusComposerPending` layout-effect dance. The composer is
    always mounted; submit success appends a user bubble + an assistant
    "Thanks — your issue is on its way." bubble, then clears the composer
    in place. Focus stays put.
  - The assistant receipt bubble carries an "Issue sent · timestamp"
    footer (`brw-bubble--receipt`) with an inline 16x16 SVG check icon. A
    tiny in-file `formatRelativeTime` helper avoids pulling in
    `Intl.RelativeTimeFormat` or `date-fns` so the bundle stays inside
    the §12 25 kB initial-gzip budget.
  - Closing the panel via `×` (or via "Discard" in the dirty-confirm)
    resets the thread to just the greeting on next open. Minimize
    semantics are unchanged — that path skips `resetAll()` so the
    existing "minimize preserves draft + attachments" contract still
    holds.
  - Removes the now-unused `.brw-bubble--success` and `.brw-success-wrap`
    CSS rules; adds `.brw-bubble--receipt` (small inline-flex footer
    reusing `--brw-fg-muted`, no new tokens).
  - Each new submission still fires its own POST and creates its own
    ticket; UI continuity ≠ thread continuity, and the receipt marker
    between bubbles makes that legible.

  The `@tatlacas/brevwick-sdk` bump is the lockstep pre-1.0 version (no
  code changes in the SDK for this PR).

### Patch Changes

- Updated dependencies [[`9a33e1d`](https://github.com/tatlacas-com/brevwick-sdk-js/commit/9a33e1d6b3b6a535e02087128ce2c262db31657d)]:
  - @tatlacas/brevwick-sdk@1.0.0-beta.6

## 1.0.0-beta.5

### Patch Changes

- [#50](https://github.com/tatlacas-com/brevwick-sdk-js/pull/50) [`a6246ab`](https://github.com/tatlacas-com/brevwick-sdk-js/commit/a6246ab3e9cf62fe64439e45cc5e04e8b61b5bca) Thanks [@tatlacas](https://github.com/tatlacas)! - fix(react): hide feedback panel while region-capture overlay is up

  Clicking the screenshot button opens a drag-to-select overlay over the
  page, but the feedback panel itself stayed painted at its anchor corner
  the whole time — covering page content the user was specifically trying
  to screenshot. Toggle a new `brw-panel-hidden` class
  (`visibility: hidden; pointer-events: none`) on the panel for the
  lifetime of the overlay so the page underneath is fully visible during
  selection. The panel stays mounted, so the composer draft, attachments,
  and Radix focus management survive an open / cancel round-trip; only
  painting and hit-testing are suppressed. The existing
  `data-brevwick-skip` on the panel is unchanged — it still scrubs the
  panel from the rasterised image during the actual capture pass; this
  fix is strictly about pre-capture occlusion.

  The `@tatlacas/brevwick-sdk` patch bump is a no-op to keep the two
  packages in lockstep per the repo's pre-1.0 versioning policy.

- Updated dependencies [[`a6246ab`](https://github.com/tatlacas-com/brevwick-sdk-js/commit/a6246ab3e9cf62fe64439e45cc5e04e8b61b5bca)]:
  - @tatlacas/brevwick-sdk@1.0.0-beta.5

## 1.0.0-beta.4

### Patch Changes

- [#47](https://github.com/tatlacas-com/brevwick-sdk-js/pull/47) [`9955f24`](https://github.com/tatlacas-com/brevwick-sdk-js/commit/9955f24f281f7711163233bd9164c4f4e7e0353b) Thanks [@tatlacas](https://github.com/tatlacas)! - fix(react): AI toggle now reads as a switch, aligns with send button
  - The composer AI toggle used to be a pill that only changed background
    colour between on/off, so the off state looked _disabled_ rather than
    _unchecked_. Redesigned as a track-and-thumb switch: thumb slides
    left↔right, track fills with `--brw-accent` when on, reduced-motion
    skips the transition.
  - The "AI" label now sits **outside** the button so the track itself is
    the unambiguous toggle affordance. The label recolours from
    `--brw-fg-muted` to `--brw-fg` via `:has(.brw-aitoggle--on)` to
    reinforce the state.
  - New `.brw-aitoggle-wrap` is 34px tall to match `.brw-send-btn`, so the
    switch centre and the send-button centre share a baseline under the
    composer shell's `align-items: flex-end`.

  Semantic contract is unchanged — `role="switch"`, `aria-checked`,
  `aria-label="Format with AI"`, Space-to-toggle, and the
  `.brw-aitoggle--on` class all stay put.

  The `@tatlacas/brevwick-sdk` patch bump is a no-op to keep the two
  packages in lockstep per the repo's pre-1.0 versioning policy.

- Updated dependencies [[`9955f24`](https://github.com/tatlacas-com/brevwick-sdk-js/commit/9955f24f281f7711163233bd9164c4f4e7e0353b)]:
  - @tatlacas/brevwick-sdk@1.0.0-beta.4

## 1.0.0-beta.3

### Minor Changes

- [#45](https://github.com/tatlacas-com/brevwick-sdk-js/pull/45) [`eee8b24`](https://github.com/tatlacas-com/brevwick-sdk-js/commit/eee8b24ab22f82533850a545bc5884d08a523055) Thanks [@tatlacas](https://github.com/tatlacas)! - Rename packages to the `@tatlacas` npm scope: `brevwick-sdk` → `@tatlacas/brevwick-sdk` and `brevwick-react` → `@tatlacas/brevwick-react`. The public API surface is unchanged — only the install name differs.

  **Consumers must update their `package.json` and imports:**

  ```diff
  - import { createBrevwick } from 'brevwick-sdk';
  + import { createBrevwick } from '@tatlacas/brevwick-sdk';
  ```

  ```diff
  - import { BrevwickProvider, FeedbackButton } from 'brevwick-react';
  + import { BrevwickProvider, FeedbackButton } from '@tatlacas/brevwick-react';
  ```

  Wire-level identifiers (the `sdk.name: 'brevwick-sdk'` field in ingest payloads and the `X-Brevwick-SDK` request header) are intentionally preserved, so server-side filters on the SDK identifier continue to match.

### Patch Changes

- Updated dependencies [[`eee8b24`](https://github.com/tatlacas-com/brevwick-sdk-js/commit/eee8b24ab22f82533850a545bc5884d08a523055)]:
  - @tatlacas/brevwick-sdk@1.0.0-beta.3

## 1.0.0-beta.2

### Major Changes

- [#37](https://github.com/tatlacas-com/brevwick-sdk-js/pull/37) [`fea0f2d`](https://github.com/tatlacas-com/brevwick-sdk-js/commit/fea0f2d7167f82c3c6a9c07ae94e688ea73fab09) Thanks [@tatlacas](https://github.com/tatlacas)! - BREAKING: rename Report → Issue across the public API. The SDK now submits
  "issues" and exposes `Issue*` types.
  - `SubmitResult` success shape: `{ ok: true; report_id: string }` →
    `{ ok: true; issue_id: string }`.
  - Ingest endpoint path: `POST /v1/ingest/reports` → `POST /v1/ingest/issues`
    (paired server-contract change).
  - JSDoc, wire field names, test fixtures, and example prose all follow
    the same rename.

  Callers that destructure `report_id` from the `submit()` result must
  update to `issue_id`; consumers of the ingest URL must point at
  `/v1/ingest/issues`. No transitional alias is shipped — this is a major
  version bump precisely because the shape is incompatible.

### Minor Changes

- [#27](https://github.com/tatlacas-com/brevwick-sdk-js/pull/27) [`c4e0d51`](https://github.com/tatlacas-com/brevwick-sdk-js/commit/c4e0d51db6df24cd650dd81fd2a8b16ce79102de) Thanks [@tatlacas](https://github.com/tatlacas)! - feat(react): chat-thread panel redesign for FeedbackButton

  Reshapes the `<FeedbackButton>` widget from a centered modal into an
  anchored, chat-style panel that slides up next to the FAB (bottom-right /
  bottom-left).
  - Layout: header (title, minimize, close) → scrollable bubble thread →
    sticky composer (icons + autogrowing textarea + Send).
  - Composer: Enter sends; Shift/Ctrl/Meta/Alt + Enter inserts a newline;
    IME composition is respected. Autogrow ceiling is shared between CSS
    and JS via a single exported constant.
  - Attachments: screenshot chip + file chips with stable monotonic ids so
    removing a middle file never flashes surviving chips into the wrong
    slot.
  - Esc / overlay-click are mapped to "minimize with preserved state" (not
    destructive close); the × button explicitly runs the dirty-confirm
    flow, and is disabled while a submit is in-flight.
  - Progressive disclosure for expected / actual; hidden behind a single
    "Add expected vs actual" button by default.
  - Title field is derived from the first line of the description (max 120
    chars) — `FeedbackInput.title` wire shape is unchanged.
  - Success state replaces the thread with a persistent confirmation
    bubble + "Send another"; no auto-close timer. "Send another" returns
    focus to the composer textarea for keyboard users. If a submit
    resolves while the panel is minimized, the success state is still
    rendered on reopen so the user sees their issue was received.
  - Dark-mode chip background is one step brighter than the border so the
    chip outline stays visible.
  - `prefers-reduced-motion` disables both the panel slide animation and
    the FAB hover transition; softens the spinner.
  - `data-brevwick-skip=""` remains on the FAB and dialog content.
  - No new dependencies. Widget ESM bundle ≈ 6.9 kB gzip (well under the
    25 kB budget); core SDK untouched at 2.0 kB gzip.

  The `brevwick-sdk` bump is the lockstep pre-1.0 version (no code
  changes in the SDK for this PR).

- [#19](https://github.com/tatlacas-com/brevwick-sdk-js/pull/19) [`8b9bdc5`](https://github.com/tatlacas-com/brevwick-sdk-js/commit/8b9bdc59aa55d1c4cb334866d0eef006ea3a4e5d) Thanks [@tatlacas](https://github.com/tatlacas)! - Add the console error ring: patches `console.error` / `console.warn` and listens for `window` `'error'` and `'unhandledrejection'` events, pushing redacted entries into a bounded FIFO buffer (cap 50). Messages and stacks run through `redact()` before storage, stacks are trimmed to the top 20 frames (leader preserved), and identical `message + first-frame` pairs within a 500 ms window dedupe in place via a new optional `count?: number` field on `ConsoleEntry`. The ring is wired into `DEFAULT_RINGS` by direct import so tree-shaking with `"sideEffects": false` stays safe; `uninstall()` restores originals, removes listeners, and clears internal dedupe state. Closes [#2](https://github.com/tatlacas-com/brevwick-sdk-js/issues/2).

- [#16](https://github.com/tatlacas-com/brevwick-sdk-js/pull/16) [`7a716bb`](https://github.com/tatlacas-com/brevwick-sdk-js/commit/7a716bbd342b18b89ac44085cdc8143655078eb2) Thanks [@tatlacas](https://github.com/tatlacas)! - Add `createBrevwick(config)` factory with `install()` / `uninstall()` lifecycle and bounded FIFO ring buffers (console 50, network 50, routes 20). Canonicalises the `endpoint` so typo-equivalents (trailing slash, host casing) collapse to the same singleton key. `uninstall()` evicts the instance from the singleton registry so a subsequent `createBrevwick` call with the same key returns a fresh, installable instance. Ring modules land in follow-up PRs ([#2](https://github.com/tatlacas-com/brevwick-sdk-js/issues/2) / [#3](https://github.com/tatlacas-com/brevwick-sdk-js/issues/3)) and are wired in by direct import, not module-side-effect registration, so the SDK's `"sideEffects": false` contract stays safe under tree-shaking. Freezes the public surface to exactly `createBrevwick`, `Brevwick`, `BrevwickConfig`, `FeedbackInput`, `SubmitResult`, `FeedbackAttachment`, `Environment`.

- [#24](https://github.com/tatlacas-com/brevwick-sdk-js/pull/24) [`07a7ab2`](https://github.com/tatlacas-com/brevwick-sdk-js/commit/07a7ab21bd2c867a3285c0780140b1200d3425b0) Thanks [@tatlacas](https://github.com/tatlacas)! - Allow `http://` endpoints on loopback hostnames (`localhost`, `127.0.0.1`, `[::1]`) so integrators can point `createBrevwick` at a local Brevwick API without standing up TLS. Non-loopback hosts still require `https:`. The eager-bundle gzip budget is bumped from < 2 kB to < 2.2 kB to accommodate the three extra hostname checks (SDD § 12 + `CLAUDE.md` updated in lockstep). `.localhost` subdomain aliases are NOT accepted; use `127.0.0.1` instead.

- [#21](https://github.com/tatlacas-com/brevwick-sdk-js/pull/21) [`91adb28`](https://github.com/tatlacas-com/brevwick-sdk-js/commit/91adb288ce52712c5e618e0b73d803650667a55a) Thanks [@tatlacas](https://github.com/tatlacas)! - Add the network ring: patches `globalThis.fetch` and `XMLHttpRequest.prototype.open/send/setRequestHeader` on install to capture any request with status ≥ 400 or that throws / aborts / times out. Captured entries include sanitised request + response headers (allow-list only — `content-type`, `accept`, `x-request-id`, etc.), a redacted + capped request body (2 kB) and response body (4 kB), and duration. Sensitive query parameters (`token|auth|key|session|sig`) are stripped from the captured URL. Binary and form-data bodies surface as `[binary N bytes]` / `[form-data]` markers. Requests to the configured ingest endpoint and requests carrying the `X-Brevwick-SDK` header are skipped to avoid submit-time feedback loops; the loop guard matches on origin + path boundary so sibling brand domains such as `api.brevwick.company` are not silently dropped. XHR `abort` and `timeout` are captured alongside `error` with distinct labels.

  Grows the public `NetworkEntry` type (all optional fields): `requestBody`, `responseBody`, `requestHeaders`, `responseHeaders`. Existing consumers are source-compatible.

  The ring module is dynamic-imported from `install()` and lands in its own async chunk — keeping the eager core bundle under the 2 kB gzip budget mandated by `CLAUDE.md`. Async ring loaders that resolve after `uninstall()` now short-circuit via a generation counter, so late-landing imports never re-patch globals against a terminal instance.

  Test-only helpers (`__setRingsForTesting`, `__resetBrevwickRegistry`) moved from the package root to a new `brevwick-sdk/testing` entry point so they never ship in the eager production bundle. Not part of the public contract; consumer code must not import them.

- [#23](https://github.com/tatlacas-com/brevwick-sdk-js/pull/23) [`788edc7`](https://github.com/tatlacas-com/brevwick-sdk-js/commit/788edc70a23713df78b4095e7c8f063b6e9345cf) Thanks [@tatlacas](https://github.com/tatlacas)! - feat(react): BrevwickProvider + useFeedback + FeedbackButton

  Ships the React bindings per SDD § 12:
  - `<BrevwickProvider config>` — memoises `createBrevwick(config)` keyed on
    config identity, installs on mount, uninstalls on unmount.
  - `useFeedback()` → `{ submit, captureScreenshot, status, reset }` with a
    four-state machine `'idle' | 'submitting' | 'success' | 'error'`.
  - `<FeedbackButton>` — drop-in FAB + dialog with attachments, screenshot
    capture, double-submit guard, and unmount-safe async handlers. Props:
    `position`, `disabled`, `hidden`, `className`, `label`, `onSubmit`.
  - `"use client"` banner preserved in both ESM and CJS bundles for Next.js
    App Router.
  - `data-brevwick-skip` applied to FAB, overlay, and dialog so captured
    screenshots exclude Brevwick's own UI.

  The `brevwick-sdk` bump is the lockstep pre-1.0 version (no code change in
  the SDK for this PR).

- [#41](https://github.com/tatlacas-com/brevwick-sdk-js/pull/41) [`e7cc9e4`](https://github.com/tatlacas-com/brevwick-sdk-js/commit/e7cc9e40a95d58a5c0a4ade77d802827c91eb3f9) Thanks [@tatlacas](https://github.com/tatlacas)! - feat(react): `theme` prop on `<FeedbackButton>` (light / dark / system)
  - New `theme?: 'light' | 'dark' | 'system'` prop lets consumers force a
    palette regardless of the OS `prefers-color-scheme` setting. Default
    `'system'` preserves the pre-existing OS-driven behaviour.
  - The prop stamps `data-brw-theme` on every `.brw-root` element (FAB,
    dialog panel, region-capture overlay). Two new CSS blocks —
    `.brw-root[data-brw-theme='light'|'dark']` — override the internal
    `--brw-*-base` defaults set on `:where(:root)` (and the
    `@media (prefers-color-scheme: dark)` swap).
  - Host-level `:root { --brw-*: ... }` overrides still win even under a
    forced theme: every widget rule consumes
    `var(--brw-X, var(--brw-X-base))`, and the forced-theme blocks only
    rewrite `--brw-X-base`, never the public `--brw-X`. So
    `theme="dark"` + a consumer `--brw-accent: hotpink` still paints the
    accent hotpink.
  - `BrevwickTheme` type exported from `brevwick-react` for consumers that
    want to type their own theme-selecting state.

  The `brevwick-sdk` patch bump is a no-op to keep the two packages in
  lockstep per the repo's pre-1.0 versioning policy.

- [#34](https://github.com/tatlacas-com/brevwick-sdk-js/pull/34) [`ac2640c`](https://github.com/tatlacas-com/brevwick-sdk-js/commit/ac2640ce57882f25190323e9d2db3d9cf44e7b32) Thanks [@tatlacas](https://github.com/tatlacas)! - feat(react): screenshot icon + drag-to-select region capture
  - The composer's screenshot icon is now a monitor-plus-selection glyph
    (previously a camera), with `aria-label="Capture screenshot of this
page"` so keyboard and screen-reader users discover the affordance
    without relying on the surrounding tooltip. The paperclip file-upload
    button next to it is unchanged.
  - Clicking the screenshot icon now opens a full-viewport region-capture
    overlay (Radix `Dialog.Root`, focus-trapped, Escape-to-dismiss). The
    submitter drags to mark a rectangle; "Capture" crops the full-page
    screenshot to that region, "Capture full page" preserves the pre-[#31](https://github.com/tatlacas-com/brevwick-sdk-js/issues/31)
    behaviour, and "Cancel" closes without a capture.
  - Crop runs through `OffscreenCanvas` when available and falls back to
    a detached `<canvas>` + `toBlob` — both branches multiply the source
    rectangle by `devicePixelRatio` so the crop is sharp on HiDPI displays.
  - Overlay nodes carry `data-brevwick-skip=""` so the SDK's capture scrub
    excludes them from the image (defence-in-depth — the overlay is
    unmounted before `captureScreenshot()` resolves).
  - `prefers-reduced-motion: reduce` opts out of the selection shake
    animation on a degenerate confirm.
  - Keyboard Enter confirms the drawn region only when the overlay root
    itself has focus; tabbing to Cancel / Capture full page and pressing
    Enter activates the focused button as expected.

  The `brevwick-sdk` bump is a no-op minor to keep the two packages in
  lockstep per the repo's pre-1.0 versioning policy; the core SDK has no
  code changes in this release. `FeedbackButtonProps` is unchanged; no
  new runtime dependency; no SDD § 12 contract change.

- [#20](https://github.com/tatlacas-com/brevwick-sdk-js/pull/20) [`f6446b5`](https://github.com/tatlacas-com/brevwick-sdk-js/commit/f6446b518d3c6350011b1a1472d3b2fae3a48706) Thanks [@tatlacas](https://github.com/tatlacas)! - feat(screenshot): captureScreenshot() via dynamic import

  Adds `captureScreenshot(opts?)` to `brevwick-sdk`. The function dynamically
  imports `modern-screenshot` so the base bundle stays below the 2 kB gzip
  budget. `[data-brevwick-skip]` nodes are hidden during capture and restored
  afterwards — even on failure. Capture never throws: a failure resolves with a
  1×1 transparent WebP placeholder and logs a `warn` entry into the console
  ring. `modern-screenshot` is declared as an optional peer dependency so
  consumers that never call `captureScreenshot` skip the install.

- [#22](https://github.com/tatlacas-com/brevwick-sdk-js/pull/22) [`d3f6577`](https://github.com/tatlacas-com/brevwick-sdk-js/commit/d3f65776f6b2ad8e17bfe22d08bb970dce576dcb) Thanks [@tatlacas](https://github.com/tatlacas)! - Add `submit(input)` pipeline: presigns each attachment, PUTs to the returned URL, then POSTs `/v1/ingest/issues` under a 30 s `AbortController` budget with one initial attempt + two retries on 5xx / network errors. Public type `SubmitResult` becomes a tagged union — `{ ok: true; issue_id: string } | { ok: false; error: { code: SubmitErrorCode; message: string } }` — so callers discriminate on `ok` and the pipeline never throws (breaking change versus the prior `{ issueId }` shape). New exports: `SubmitError`, `SubmitErrorCode`, and `FeedbackAttachment` (which widens `FeedbackInput.attachments` to `Array<Blob | FeedbackAttachment>`). All free-form text and `user_context` extras run through `redact()` before the wire; `config.user.email` is masked as `a***@d***.tld`; ring snapshots flow through unchanged because they were redacted at capture. Attachments are validated client-side (≤5 count, ≤10 MB each, MIME ∈ {image/png, image/jpeg, image/webp, video/webm}) before any presign round-trip. The submit pipeline lives in its own dynamic-import chunk so the eager core stays under the 2 kB gzip budget.

- [#33](https://github.com/tatlacas-com/brevwick-sdk-js/pull/33) [`2ff114f`](https://github.com/tatlacas-com/brevwick-sdk-js/commit/2ff114f9f70057c2bb982fdf1a531603bf8fe65f) Thanks [@tatlacas](https://github.com/tatlacas)! - feat(react): light/dark theming + composer shell polish
  - Introduce a `--brw-*` CSS custom-property token set on `:where(:root)`
    (specificity 0) so any host rule re-themes the widget without
    `!important`. Surface, text, border, accent, shadow, and divider
    tokens are covered; status colours (`--brw-error`) stay widget-internal.
  - Light defaults ship out of the box; a
    `@media (prefers-color-scheme: dark)` override swaps the palette when
    the host OS issues dark mode. Host overrides persist across modes.
  - Composer controls are wrapped in a rounded `.brw-composer-shell`
    with a `:focus-within` ring, so the textarea + icon buttons + send +
    AI toggle read as a single input affordance.
  - Multiline textarea retains the 1–5 row autogrow; `align-items:
flex-end` keeps the send button pinned to the bottom as the textarea
    grows.
  - JSDoc on `<FeedbackButton>` documents every public token, including
    `--brw-bubble-user-fg` and `--brw-divider`.
  - vitest-axe added as a devDep and runs clean on the rendered panel in
    both light and dark matchMedia stubs.
  - No public API change (props / hooks / payload unchanged); no new
    runtime dependency.

  The `brevwick-sdk` bump is a no-op patch to keep the two packages in
  lockstep per the repo's pre-1.0 versioning policy; the core SDK has
  no code changes in this release.

- [#28](https://github.com/tatlacas-com/brevwick-sdk-js/pull/28) [`5a3c498`](https://github.com/tatlacas-com/brevwick-sdk-js/commit/5a3c498c28943cea1b0d4402ba50071f14461f62) Thanks [@tatlacas](https://github.com/tatlacas)! - feat(react): submitter Use-AI toggle + project config fetch

  Implements issue [#26](https://github.com/tatlacas-com/brevwick-sdk-js/issues/26) per SDD § 12.
  - `Brevwick.getConfig()` → `Promise<ProjectConfig | null>`. Dynamic-imported
    so the fetcher lives in a sibling chunk and never lands in the eager SDK
    bundle. Cached per session (the same stored promise collapses concurrent
    callers and retains a `null` result so failed or malformed responses are
    not retried).
  - New `ProjectConfig` type (`{ ai_enabled, ai_submitter_choice_allowed }`)
    exported from `brevwick-sdk`; `fetchConfig` never throws — non-2xx,
    malformed shape, and thrown fetch all resolve to `null`.
  - `FeedbackInput` gains optional `use_ai: boolean`; `composePayload`
    threads it through to the ingest body when defined. Booleans skip
    `redact()` (non-string primitives are already passthrough).
  - `<FeedbackButton>` lazy-fetches project config on first panel open
    (never on mount, never before open) and renders a `role="switch"`
    "Format with AI" toggle when both `ai_enabled` and
    `ai_submitter_choice_allowed` are `true`. In every other state
    (config fetch pending, rejected, resolved to `null`, either flag
    `false`) the toggle is hidden and the submit payload omits `use_ai`.
  - Toggle defaults to on when visible; `resetAll()` ("Send another")
    returns it to the default. Space and click both flip the switch;
    `:focus-visible` ring and `prefers-reduced-motion` branch included.
  - Config request stamps `Authorization: Bearer <projectKey>` and the
    `X-Brevwick-SDK` loop-guard header so the network ring does not
    recursively capture it.
  - Eager SDK chunk stays under the 2.2 kB gzip budget (measured 2107 B).

### Patch Changes

- [#35](https://github.com/tatlacas-com/brevwick-sdk-js/pull/35) [`46c2bc9`](https://github.com/tatlacas-com/brevwick-sdk-js/commit/46c2bc94d293987ff5c375835d30e53135d0fc2d) Thanks [@tatlacas](https://github.com/tatlacas)! - feat(react): credit footer with version + brevwick.dev link
  - Thin `Brevwick v<x.y.z>` credit anchored below the composer, rendered
    inside the existing `<FeedbackButton>` panel in both compose and
    success states.
  - Single link to https://brevwick.dev with `target="_blank"` and
    `rel="noopener noreferrer"`; label reads as one affordance rather
    than two competing elements.
  - Muted 10 px styling driven by `--brw-fg-muted` + `--brw-composer-bg`,
    so the footer sits quietly in both light and dark themes. Hover/focus
    lifts opacity and underlines, keeping it discoverable without
    intruding.
  - Version text comes from the existing `__BREVWICK_REACT_VERSION__`
    build-time constant that already powers `BREVWICK_REACT_VERSION` —
    no new source of truth.
  - No public API change; props, hooks, and payload are unchanged.

  The `brevwick-sdk` bump is a no-op patch to keep both packages in
  lockstep per the repo's pre-1.0 versioning policy; the core SDK has
  no code changes in this release.

- [#39](https://github.com/tatlacas-com/brevwick-sdk-js/pull/39) [`84a6627`](https://github.com/tatlacas-com/brevwick-sdk-js/commit/84a662716df017884549de16463568d32954b881) Thanks [@tatlacas](https://github.com/tatlacas)! - test(integration): MSW + live-API e2e coverage

  Adds an end-to-end integration suite under
  `packages/{sdk,react}/src/__tests__/integration/` that exercises real ring
  installation, the redaction matrix per secret class, the runtime lazy-load
  guard for `modern-screenshot`, golden payload pinning, and a React render
  through the real `createBrevwick` pipeline. No shipped behaviour change —
  test-only coverage hardening.

  The package version bumps are no-op patches that keep the two packages in
  lockstep per the repo's pre-1.0 versioning policy.

- [#36](https://github.com/tatlacas-com/brevwick-sdk-js/pull/36) [`d0d30d0`](https://github.com/tatlacas-com/brevwick-sdk-js/commit/d0d30d0075cf1f523f65622e4935557e28cfee4f) Thanks [@tatlacas](https://github.com/tatlacas)! - fix(react): add hidden Dialog.Title to screenshot region overlay

  Radix `Dialog.Content` emits a `console.error` when no `Dialog.Title`
  descendant is present. The region-capture overlay previously labelled
  itself with `aria-label` only, so every screenshot button click logged
  the warning. Render a visually-hidden `Dialog.Title` (text: "Select
  screenshot region") to satisfy the primitive without affecting the
  announced name.

  The `brevwick-sdk` bump is a no-op patch to keep the two packages in
  lockstep per the repo's pre-1.0 versioning policy.

- [#32](https://github.com/tatlacas-com/brevwick-sdk-js/pull/32) [`5fcc5a7`](https://github.com/tatlacas-com/brevwick-sdk-js/commit/5fcc5a73053ddd3a5ab406f7ce2471d53ba159fa) Thanks [@tatlacas](https://github.com/tatlacas)! - fix(submit): send sha256 on presign + issue so R2 PUT carries checksum

  Compute base64 SHA-256 client-side once per attachment blob (via
  `crypto.subtle.digest`) and thread the same digest through the presign
  request body, the PUT header echo, and the final issue entry. Without
  this the R2 bucket's required `x-amz-checksum-sha256` header is missing
  and every screenshot submit 409s. Fixes [#29](https://github.com/tatlacas-com/brevwick-sdk-js/issues/29).

- [#38](https://github.com/tatlacas-com/brevwick-sdk-js/pull/38) [`d13c28e`](https://github.com/tatlacas-com/brevwick-sdk-js/commit/d13c28e1e14df0f314a4d53f170e41767269353c) Thanks [@tatlacas](https://github.com/tatlacas)! - Internal: enable `minify: true` in the React package's tsup build (~2 kB
  gzip smaller delivered artefact for consumers; no API or runtime-behaviour
  change). Adds `size-limit` budgets enforced in CI: core eager chunk ≤ 2.2 kB
  gzip, screenshot wrapper ≤ 1.5 kB gzip, React bundle ≤ 25 kB gzip, and a
  re-bundled "on-widget-open" measurement (screenshot wrapper + resolved
  `modern-screenshot` peer) ≤ 25 kB gzip. SDK source unchanged; bumped in
  lockstep with `brevwick-react` per the project's lockstep policy.
- Updated dependencies [[`c4e0d51`](https://github.com/tatlacas-com/brevwick-sdk-js/commit/c4e0d51db6df24cd650dd81fd2a8b16ce79102de), [`8b9bdc5`](https://github.com/tatlacas-com/brevwick-sdk-js/commit/8b9bdc59aa55d1c4cb334866d0eef006ea3a4e5d), [`7a716bb`](https://github.com/tatlacas-com/brevwick-sdk-js/commit/7a716bbd342b18b89ac44085cdc8143655078eb2), [`46c2bc9`](https://github.com/tatlacas-com/brevwick-sdk-js/commit/46c2bc94d293987ff5c375835d30e53135d0fc2d), [`84a6627`](https://github.com/tatlacas-com/brevwick-sdk-js/commit/84a662716df017884549de16463568d32954b881), [`07a7ab2`](https://github.com/tatlacas-com/brevwick-sdk-js/commit/07a7ab21bd2c867a3285c0780140b1200d3425b0), [`91adb28`](https://github.com/tatlacas-com/brevwick-sdk-js/commit/91adb288ce52712c5e618e0b73d803650667a55a), [`788edc7`](https://github.com/tatlacas-com/brevwick-sdk-js/commit/788edc70a23713df78b4095e7c8f063b6e9345cf), [`e7cc9e4`](https://github.com/tatlacas-com/brevwick-sdk-js/commit/e7cc9e40a95d58a5c0a4ade77d802827c91eb3f9), [`ac2640c`](https://github.com/tatlacas-com/brevwick-sdk-js/commit/ac2640ce57882f25190323e9d2db3d9cf44e7b32), [`fea0f2d`](https://github.com/tatlacas-com/brevwick-sdk-js/commit/fea0f2d7167f82c3c6a9c07ae94e688ea73fab09), [`d0d30d0`](https://github.com/tatlacas-com/brevwick-sdk-js/commit/d0d30d0075cf1f523f65622e4935557e28cfee4f), [`f6446b5`](https://github.com/tatlacas-com/brevwick-sdk-js/commit/f6446b518d3c6350011b1a1472d3b2fae3a48706), [`5fcc5a7`](https://github.com/tatlacas-com/brevwick-sdk-js/commit/5fcc5a73053ddd3a5ab406f7ce2471d53ba159fa), [`d13c28e`](https://github.com/tatlacas-com/brevwick-sdk-js/commit/d13c28e1e14df0f314a4d53f170e41767269353c), [`d3f6577`](https://github.com/tatlacas-com/brevwick-sdk-js/commit/d3f65776f6b2ad8e17bfe22d08bb970dce576dcb), [`2ff114f`](https://github.com/tatlacas-com/brevwick-sdk-js/commit/2ff114f9f70057c2bb982fdf1a531603bf8fe65f), [`5a3c498`](https://github.com/tatlacas-com/brevwick-sdk-js/commit/5a3c498c28943cea1b0d4402ba50071f14461f62)]:
  - brevwick-sdk@1.0.0-beta.2
