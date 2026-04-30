import { readFileSync } from 'node:fs';
import { defineConfig } from 'tsup';

const pkg = JSON.parse(
  readFileSync(new URL('./package.json', import.meta.url), 'utf8'),
) as { version: string };

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  clean: true,
  sourcemap: true,
  minify: true,
  // Match @tatlacas/brevwick-react: leaving treeshake/splitting off keeps the
  // single-file output that the size-limit + bundle-ceiling tests measure.
  treeshake: false,
  splitting: false,
  external: ['vue', '@tatlacas/brevwick-sdk', 'modern-screenshot'],
  target: 'es2020',
  define: {
    __BREVWICK_VUE_VERSION__: JSON.stringify(pkg.version),
  },
});
