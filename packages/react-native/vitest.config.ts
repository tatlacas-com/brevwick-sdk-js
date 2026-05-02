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
      // depend on a Metro bundler or device. Richer mocks land alongside the
      // feature work that needs them.
      'react-native': fileURLToPath(
        new URL('./src/__mocks__/react-native.ts', import.meta.url),
      ),
    },
  },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'],
    // Feature worktrees (#83 onwards) bring the first tests; until then the
    // suite must be a no-op rather than a hard failure.
    passWithNoTests: true,
  },
});
