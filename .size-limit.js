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
 * Budgets are mirrored in `CLAUDE.md` and `brevwick-ops/docs/brevwick-sdd.md`
 * § 11.8 / § 12 — keep the three in sync on any change.
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
  // ── Core eager chunk (≤ 2.2 kB gzip) ─────────────────────────────────────
  fileEntry(
    'brevwick-sdk core eager (ESM)',
    'packages/sdk/dist/index.js',
    '2.2 kB',
  ),
  fileEntry(
    'brevwick-sdk core eager (CJS)',
    'packages/sdk/dist/index.cjs',
    '2.2 kB',
  ),

  // ── Screenshot wrapper chunk (≤ 1.5 kB gzip) ─────────────────────────────
  // Tight ceiling on the SDK-side wrapper only. `modern-screenshot` is a peer
  // dep — its weight is captured by the "widget-open" entry below. Current
  // size ~896 B; 1.5 kB leaves room for small additions but flags any large
  // wrapper bloat.
  fileEntry(
    'brevwick-sdk screenshot wrapper (ESM)',
    'packages/sdk/dist/screenshot-*.js',
    '1.5 kB',
  ),
  fileEntry(
    'brevwick-sdk screenshot wrapper (CJS)',
    'packages/sdk/dist/screenshot-*.cjs',
    '1.5 kB',
  ),

  // ── React bundle (≤ 25 kB gzip) ──────────────────────────────────────────
  fileEntry('brevwick-react (ESM)', 'packages/react/dist/index.js', '25 kB'),
  fileEntry('brevwick-react (CJS)', 'packages/react/dist/index.cjs', '25 kB'),

  // ── On-widget-open total weight (≤ 25 kB gzip) ───────────────────────────
  // Bundled-import mode: esbuild re-bundles the screenshot module + its
  // resolved `modern-screenshot` peer the way a consumer's bundler would for
  // the async chunk that loads when the user clicks the FAB. This is what
  // CLAUDE.md and SDD § 11.8 actually mean by "on widget open < 25 kB gzip".
  {
    name: 'brevwick-sdk on widget open (screenshot + modern-screenshot)',
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
