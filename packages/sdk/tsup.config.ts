import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig } from 'tsup';

const pkg = JSON.parse(
  readFileSync(resolve(__dirname, 'package.json'), 'utf8'),
) as { version: string };

/**
 * Core SDK build. Code-splitting is enabled for both ESM and CJS so the
 * dynamic `import()`s of the screenshot, submit, and project-config
 * modules land in their own async chunks. The console + network rings are
 * eagerly imported by `core/registry.ts` on purpose — see CLAUDE.md
 * "Bundle Budget" + `core/registry.ts` for the install-time capture-race
 * reasoning. The eager total is enforced by `size-limit` and asserted in
 * `__tests__/chunk-split.test.ts`.
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
