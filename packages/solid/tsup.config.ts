import { readFileSync } from 'node:fs';
import { defineConfig } from 'tsup';
import { solidPlugin } from 'esbuild-plugin-solid';

const pkg = JSON.parse(
  readFileSync(new URL('./package.json', import.meta.url), 'utf8'),
) as { version: string };

// Solid JSX is compiled at build time via `esbuild-plugin-solid` (which wraps
// `babel-preset-solid`) so the `import` / `require` outputs ship runnable
// JS — but consumers using a Solid-aware bundler (Vite + vite-plugin-solid)
// resolve via the `"solid"` export condition in package.json and pick up the
// untransformed `.tsx` source for fine-grained reactivity tracking.
export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  clean: true,
  sourcemap: true,
  minify: true,
  treeshake: false,
  splitting: false,
  external: ['solid-js', 'solid-js/web', '@tatlacas/brevwick-sdk'],
  target: 'es2020',
  esbuildPlugins: [solidPlugin()],
  define: {
    __BREVWICK_SOLID_VERSION__: JSON.stringify(pkg.version),
  },
});
