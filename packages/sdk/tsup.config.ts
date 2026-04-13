import { defineConfig } from 'tsup';

/**
 * Core SDK build. Code-splitting is enabled for both ESM and CJS so the
 * dynamic `import()`s of the network ring and the screenshot module land in
 * their own async chunks — keeping the eager base bundle under the 2 kB gzip
 * budget mandated by `CLAUDE.md`.
 */
export default defineConfig({
  entry: ['src/index.ts', 'src/testing.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  clean: true,
  sourcemap: true,
  treeshake: true,
  splitting: true,
  minify: true,
  target: 'es2020',
});
