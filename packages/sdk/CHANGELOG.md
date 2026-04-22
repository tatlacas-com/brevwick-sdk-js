# brevwick-sdk

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

## 1.0.0-beta.2

### Major Changes

- [#37](https://github.com/tatlacas-com/brevwick-sdk-js/pull/37) [`fea0f2d`](https://github.com/tatlacas-com/brevwick-sdk-js/commit/fea0f2d7167f82c3c6a9c07ae94e688ea73fab09) Thanks [@tatlacas](https://github.com/tatlacas)! - BREAKING: rename Report → Issue across the public API. The SDK now submits
  "issues" and exposes `Issue*` types.
  - `SubmitResult` success shape: `{ ok: true; report_id: string }` →
    `{ ok: true; issue_id: string }`.
  - Ingest endpoint path: `POST /v1/ingest/reports` → `POST /v1/ingest/issues`
    (paired server-contract change tracked in brevwick-api + SDD § 12).
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

- [#24](https://github.com/tatlacas-com/brevwick-sdk-js/pull/24) [`07a7ab2`](https://github.com/tatlacas-com/brevwick-sdk-js/commit/07a7ab21bd2c867a3285c0780140b1200d3425b0) Thanks [@tatlacas](https://github.com/tatlacas)! - Allow `http://` endpoints on loopback hostnames (`localhost`, `127.0.0.1`, `[::1]`) so integrators can point `createBrevwick` at a local `brevwick-api` without standing up TLS. Non-loopback hosts still require `https:`. The eager-bundle gzip budget is bumped from < 2 kB to < 2.2 kB to accommodate the three extra hostname checks (SDD § 12 + `CLAUDE.md` updated in lockstep). `.localhost` subdomain aliases are NOT accepted; use `127.0.0.1` instead.

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
