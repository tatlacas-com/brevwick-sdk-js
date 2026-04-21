import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig } from 'tsup';

const pkg = JSON.parse(
  readFileSync(resolve(__dirname, 'package.json'), 'utf8'),
) as { version: string };

/**
 * Core SDK build. Code-splitting is enabled for both ESM and CJS so the
 * dynamic `import()`s of the network ring, screenshot, and submit modules
 * land in their own async chunks — keeping the eager base bundle under the
 * 2.2 kB gzip budget mandated by `CLAUDE.md` and enforced by `size-limit`.
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
  define: {
    __BREVWICK_VERSION__: JSON.stringify(pkg.version),
  },
});
