import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      // Route every `react-native` import that travels through Vite's
      // transformer to a local stub so import-time evaluation in feature
      // worktrees does not depend on a Metro bundler or a device. The stub
      // lives under `test/` (not `src/`) so it never ships in the published
      // npm tarball. Richer mocks land alongside the feature work that
      // needs them.
      //
      // The companion `test/setup.ts` patches Node's CJS loader for the
      // same specifier — necessary because `@testing-library/react-native`
      // ships a CJS bundle whose deep `require('react-native')` calls are
      // resolved by Node directly and bypass Vite's alias.
      'react-native': fileURLToPath(
        new URL('./test/__mocks__/react-native.cjs', import.meta.url),
      ),
    },
  },
  test: {
    // happy-dom (matching `packages/sdk` and `packages/react`) ships a
    // spec-correct `Blob.arrayBuffer()` and `Response`/`fetch` surface; the
    // scaffold's earlier `jsdom` choice was fine for an empty package but
    // its Blob lacks `arrayBuffer()`, which the screenshot path needs to
    // assert wire bytes against the placeholder.
    environment: 'happy-dom',
    include: ['src/**/*.test.{ts,tsx}'],
    setupFiles: ['./test/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'src/**/*.test.{ts,tsx}',
        'src/__tests__/**',
        // Pure re-export aggregator — every line is exercised transitively
        // by the feature tests, but coverage providers do not always credit
        // re-export-only files; excluding it stops a 0%-on-2-lines artefact
        // from dragging the package floor.
        'src/index.ts',
        // Build-time codegen — the literal version string changes on every
        // version bump and the file has no logic worth threshold-gating.
        'src/version.ts',
      ],
      // Floor mirroring `packages/react/vitest.config.ts` (75 / 75 / 75 / 70).
      // Branches sit a notch lower because the screenshot module has several
      // defensive `?? null` / `?? default` ternaries that resolve only on
      // the unhappy paths, and the no-bus / outside-provider paths in the
      // hook surface defensive branches a single test exercises statement-
      // wise but not every permutation.
      thresholds: {
        lines: 75,
        statements: 75,
        functions: 75,
        branches: 70,
      },
    },
  },
});
