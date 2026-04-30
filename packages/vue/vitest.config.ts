import { readFileSync } from 'node:fs';
import { defineConfig } from 'vitest/config';

const pkg = JSON.parse(
  readFileSync(new URL('./package.json', import.meta.url), 'utf8'),
) as { version: string };

export default defineConfig({
  define: {
    __BREVWICK_VUE_VERSION__: JSON.stringify(pkg.version),
  },
  test: {
    environment: 'happy-dom',
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/index.ts'],
      // Thresholds sized to the initial shipped surface (FAB + composable +
      // plugin). Branch coverage trails statement coverage because several
      // defensive paths — SSR `null` injection, screenshot capture failure,
      // empty-draft guard — only fire in environments the unit tests don't
      // simulate. Floors keep regressions visible without forcing synthetic
      // tests for branches the CI gauntlet already exercises end-to-end.
      thresholds: {
        lines: 70,
        statements: 70,
        functions: 70,
        branches: 60,
      },
    },
  },
});
