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
  // Mirror `packages/react/tsup.config.ts` — minified output keeps the
  // first feature-worktree bundle under the size budget that #91 will
  // wire into `.size-limit.js`. RN ships product `src/` to satisfy
  // Metro's source-preference field, but the `dist/` artefact still
  // matters for non-Metro consumers (web fallbacks, bundler analysis).
  minify: true,
  splitting: false,
  external: [
    'react',
    'react-native',
    'react-native-view-shot',
    '@tatlacas/brevwick-sdk',
  ],
  target: 'es2020',
  define: {
    __BREVWICK_REACT_NATIVE_VERSION__: JSON.stringify(pkg.version),
  },
});
