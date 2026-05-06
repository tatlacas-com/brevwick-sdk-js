/**
 * size-limit configuration. Two flavours of measurement:
 *
 *  1. **File-mode** (`disablePlugins: ['@size-limit/esbuild']`) — gzips the raw
 *     tsup-built artefact byte-for-byte. Matches `chunk-split.test.ts`'s
 *     "raw artefact gzipped" semantic. Used for the per-chunk SDK / React
 *     bundle ceilings.
 *
 *  2. **Bundled-import mode** (`@size-limit/esbuild`, `import` field) — re-
 *     bundles the named export(s) plus their resolved peer deps with esbuild
 *     and measures gzipped output. Used for the **on-widget-open** budget
 *     because the SDK wrapper dynamic-imports `modern-screenshot` (a peer
 *     dep) — file-mode would only weigh the wrapper (~0.9 kB), missing the
 *     ~14 kB the consumer's bundler actually ships. The bundled-import entry
 *     mirrors what a consumer's webpack/rollup/Next builder produces for the
 *     async chunk that lands when the user clicks the FAB.
 *
 * CJS entries mirror the ESM ceilings so bundle-size regression in either
 * format is caught — `chunk-split.test.ts` already asserts both formats for
 * the chunk-split invariant.
 *
 * Budgets are mirrored in `CLAUDE.md` — keep the two in sync on any change.
 */

/** @type {import('size-limit').SizeLimitConfig} */
const FILE_MODE = {
  gzip: true,
  brotli: false,
  // File-mode: gzip the artefact as-built; do not let esbuild re-bundle.
  disablePlugins: ['@size-limit/esbuild'],
};

const fileEntry = (name, path, limit) => ({ name, path, limit, ...FILE_MODE });

export default [
  // ── Core eager total (≤ 8 kB gzip) ───────────────────────────────────────
  // File-mode glob: gzip `index.js` plus every shared chunk it pulls in
  // via static `import` / `export … from`. tsup hoists shared symbols
  // (the redact module, the console + network ring code) into
  // `chunk-*.js` files; those land on the same eager turn as `index.js`
  // and must be counted, while the *lazy* chunks live under explicit
  // prefixes (`submit-*`, `screenshot-*`, `config-*`) and stay outside
  // this glob.
  //
  // Bundled-import mode (`import: '{ createBrevwick }'`) was tried and
  // rejected: esbuild bundles dynamic `import()` graphs too, so it
  // measured the eager + lazy total (~19 kB) and conflated the two
  // budgets. The companion in-suite assertion in
  // `packages/sdk/src/__tests__/chunk-split.test.ts` walks the *static*
  // import graph to enforce the precise eager total; this entry is the
  // CI gate and uses the same 8 kB ceiling.
  //
  // Bumped from 2.85 kB → 8 kB when the console + network rings moved
  // out of dynamic-import thunks and into the eager registry. The
  // earlier shape opened a capture race (errors / fetches fired after
  // `install()` but before the ring chunks landed went unrecorded —
  // the headline "missing console + network info on submitted issues"
  // bug). Reliable capture is the SDK's product guarantee, so the
  // budget moved up rather than the rings moving back behind a network
  // round-trip.
  fileEntry(
    '@tatlacas/brevwick-sdk core eager (ESM)',
    'packages/sdk/dist/{index,chunk-*}.js',
    '8 kB',
  ),
  fileEntry(
    '@tatlacas/brevwick-sdk core eager (CJS)',
    'packages/sdk/dist/{index,chunk-*}.cjs',
    '8 kB',
  ),

  // ── Screenshot wrapper chunk (≤ 1.5 kB gzip) ─────────────────────────────
  // Tight ceiling on the SDK-side wrapper only. `modern-screenshot` is a peer
  // dep — its weight is captured by the "widget-open" entry below. Current
  // size ~896 B; 1.5 kB leaves room for small additions but flags any large
  // wrapper bloat.
  fileEntry(
    '@tatlacas/brevwick-sdk screenshot wrapper (ESM)',
    'packages/sdk/dist/screenshot-*.js',
    '1.5 kB',
  ),
  fileEntry(
    '@tatlacas/brevwick-sdk screenshot wrapper (CJS)',
    'packages/sdk/dist/screenshot-*.cjs',
    '1.5 kB',
  ),

  // ── React bundle (≤ 25 kB gzip) ──────────────────────────────────────────
  fileEntry(
    '@tatlacas/brevwick-react (ESM)',
    'packages/react/dist/index.js',
    '25 kB',
  ),
  fileEntry(
    '@tatlacas/brevwick-react (CJS)',
    'packages/react/dist/index.cjs',
    '25 kB',
  ),

  // ── Solid bundle (≤ 12 kB gzip) ──────────────────────────────────────────
  // Bumped from 5 kB → 12 kB when the Solid widget reached UX parity with
  // the React adapter (issue #113). The widget ships the chat-thread
  // panel: greeting + user/assistant bubbles, autogrow composer,
  // expected/actual disclosure, file attachment chips, AI toggle, staged-
  // status rows driven by the SDK's phase bus, retry CTA, and the panel
  // footer. Screenshot UI is intentionally absent in v1 (see PR #111);
  // callers that need a screenshot capture path invoke
  // `useFeedback().captureScreenshot()` directly. Current sizes ESM 8.79
  // / CJS 9.11 kB; 12 kB leaves headroom for incremental UX work without
  // dragging the package over the React adapter (25 kB) or unbalancing
  // the budget vs Vue (5 kB; Vue ships a thinner surface, no AI toggle /
  // disclosure / staged-status rows).
  fileEntry(
    '@tatlacas/brevwick-solid (ESM)',
    'packages/solid/dist/index.js',
    '12 kB',
  ),
  fileEntry(
    '@tatlacas/brevwick-solid (CJS)',
    'packages/solid/dist/index.cjs',
    '12 kB',
  ),

  // ── Vue bundle (≤ 10 kB gzip eager) ──────────────────────────────────────
  // Bumped from 5 kB → 10 kB when the Vue adapter's `<FeedbackButton>`
  // reached UX parity with the React adapter (issue #112). The widget now
  // ships the conversation thread, panel header / minimize / discard
  // confirm, autogrow composer with paperclip + AI toggle, staged-status
  // rows wired to the SDK's phase bus, retry row, lazy project-config
  // fetch, and the canonical `BREVWICK_CSS` byte-for-byte. Region capture
  // and the screenshot preview dialog stay out of v1 (no trigger button)
  // to keep the bundle below the React adapter's 25 kB ceiling — current
  // size sits ~8.4 kB gzip with headroom for incremental tuning before
  // the next bump is needed. Mirrors the React widget's "ship the surface,
  // measure the cost" approach in `CLAUDE.md`.
  fileEntry(
    '@tatlacas/brevwick-vue (ESM)',
    'packages/vue/dist/index.js',
    '10 kB',
  ),
  fileEntry(
    '@tatlacas/brevwick-vue (CJS)',
    'packages/vue/dist/index.cjs',
    '10 kB',
  ),

  // ── Svelte adapter eager entry (≤ 5 kB gzip) ─────────────────────────────
  // svelte-package does not bundle peers — `@tatlacas/brevwick-sdk` and
  // `svelte` resolve at consumer build time. The adapter itself is mostly
  // re-exports plus the FeedbackButton SFC, so the eager entry is small.
  // The on-widget-open weight is captured by the SDK's existing
  // "on widget open" entry above (modern-screenshot dynamic chunk shared
  // across every framework binding).
  fileEntry(
    '@tatlacas/brevwick-svelte eager',
    'packages/svelte/dist/index.js',
    '5 kB',
  ),

  // FeedbackButton SFC (compiled by `svelte-package`, but emitted as the
  // raw `.svelte` source — bundlers compile it at consumer build time).
  // Tracking the gzipped source caps the on-page weight if the SFC bloats.
  // Bumped from 8 kB → 14 kB at issue #114 when the SFC reached UI parity
  // with the React adapter (chat thread + assistant/user bubbles +
  // expected/actual disclosure + staged-status rows + retry row + AI
  // toggle render-policy + discard-confirm + minimize button + receipt
  // with relative time). The post-parity SFC weighs ~12.1 kB gzip; the
  // 14 kB ceiling leaves ~2 kB of headroom for incremental UX work.
  fileEntry(
    '@tatlacas/brevwick-svelte FeedbackButton SFC',
    'packages/svelte/dist/components/FeedbackButton.svelte',
    '14 kB',
  ),

  // ── Angular bundle (≤ 8 kB gzip) ─────────────────────────────────────────
  // Angular adapter ships only one artefact per Angular Package Format: the
  // FESM2022 flat-ESM bundle. ng-packagr does not emit a CJS counterpart for
  // libraries (CJS apps consume Angular via @angular/upgrade or stay on the
  // older legacy package format — neither is a target of this adapter).
  // 8 kB gzip envelope is intentionally roomier than React/Vue/Svelte/Solid
  // because Angular's @Injectable / standalone-component / Signals scaffolding
  // costs 4-5 kB of irreducible runtime overhead before our own code lands.
  fileEntry(
    '@tatlacas/brevwick-angular (FESM2022)',
    'packages/angular/dist/fesm2022/tatlacas-brevwick-angular.mjs',
    '8 kB',
  ),

  // ── React Native bundle (≤ 25 kB gzip) ───────────────────────────────────
  // The RN adapter mirrors the React adapter's 25 kB ceiling documented in
  // `CLAUDE.md`. Current eager weight of the FeedbackButton + Modal +
  // route ring + device + screenshot wrapper artefact is ~6 kB gzip, well
  // under the budget — this entry exists so any future bloat that crosses
  // the ceiling fails CI before it ships, the same defence-in-depth the
  // other adapters get.
  fileEntry(
    '@tatlacas/brevwick-react-native (ESM)',
    'packages/react-native/dist/index.js',
    '25 kB',
  ),
  fileEntry(
    '@tatlacas/brevwick-react-native (CJS)',
    'packages/react-native/dist/index.cjs',
    '25 kB',
  ),

  // ── On-widget-open total weight (≤ 25 kB gzip) ───────────────────────────
  // Bundled-import mode: esbuild re-bundles the screenshot module + its
  // resolved `modern-screenshot` peer the way a consumer's bundler would for
  // the async chunk that loads when the user clicks the FAB. This is what
  // CLAUDE.md and SDD § 11.8 actually mean by "on widget open < 25 kB gzip".
  {
    name: '@tatlacas/brevwick-sdk on widget open (screenshot + modern-screenshot)',
    path: 'packages/sdk/dist/index.js',
    import: '{ captureScreenshot }',
    limit: '25 kB',
    gzip: true,
    brotli: false,
    // No `disablePlugins` here: we intentionally let `@size-limit/esbuild`
    // do the bundling so the peer dep is resolved into the measurement.
    ignore: [],
  },
];
