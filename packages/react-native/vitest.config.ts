import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const pkg = JSON.parse(
  readFileSync(new URL('./package.json', import.meta.url), 'utf8'),
) as { version: string };

export default defineConfig({
  define: {
    __BREVWICK_REACT_NATIVE_VERSION__: JSON.stringify(pkg.version),
  },
  resolve: {
    alias: {
      // Unit tests run under jsdom; route every `react-native` import to a
      // local stub so import-time evaluation in feature worktrees does not
      // depend on a Metro bundler or device. The stub lives under `test/`
      // (not `src/`) so it never ships in the published npm tarball.
      // Richer mocks land alongside the feature work that needs them.
      'react-native': fileURLToPath(
        new URL('./test/__mocks__/react-native.ts', import.meta.url),
      ),
    },
  },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'],
    // The scaffold ships zero tests by design (the issue calls for an
    // empty named-exports placeholder). Without `passWithNoTests`, vitest
    // would exit non-zero and turn CI red on a green diff. The first
    // feature worktree (#83 — provider + hook) MUST drop this flag and
    // add the corresponding `coverage.thresholds` block (mirroring
    // `packages/react/vitest.config.ts`) so a contributor who forgets to
    // write tests can no longer slip through. This flag is a transitional
    // escape hatch, not a permanent permission.
    passWithNoTests: true,
  },
});
