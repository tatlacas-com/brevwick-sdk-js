import { defineConfig } from 'tsup';

/**
 * Core SDK build. Enables ESM code-splitting so the dynamic `import()` of the
 * network ring (and future rings) lands in its own async chunk — keeping the
 * eager core bundle under the 2 kB gzip budget mandated by `CLAUDE.md`.
 * CJS stays bundled because Node's `require()` cannot participate in the same
 * splitting graph; that tradeoff is fine because the consumer-relevant ceiling
 * applies to the browser ESM entry.
 */
export default defineConfig([
  {
    entry: { index: 'src/index.ts' },
    format: ['esm'],
    outDir: 'dist',
    dts: true,
    clean: true,
    sourcemap: true,
    treeshake: true,
    splitting: true,
    minify: true,
    target: 'es2020',
  },
  {
    entry: { index: 'src/index.ts' },
    format: ['cjs'],
    outDir: 'dist',
    dts: true,
    clean: false,
    sourcemap: true,
    treeshake: true,
    splitting: false,
    minify: true,
    target: 'es2020',
  },
]);
