import { defineConfig } from 'tsup';

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
  // Note: no `define` for the version literal — Metro resolves this package
  // via `package.json#react-native` → `./src/index.ts` and does not run
  // define-style substitution, so the literal is codegenned into
  // `src/version.ts` by `scripts/generate-version.mjs` (prebuild hook).
});
