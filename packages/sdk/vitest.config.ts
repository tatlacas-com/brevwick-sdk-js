import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

const pkg = JSON.parse(
  readFileSync(resolve(__dirname, 'package.json'), 'utf8'),
) as { version: string };

export default defineConfig({
  define: {
    __BREVWICK_VERSION__: JSON.stringify(pkg.version),
  },
  test: {
    environment: 'happy-dom',
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.test.ts',
        'src/index.ts',
        // Test-only scaffolding under __tests__ is not product code —
        // excluding it keeps the threshold measuring what ships.
        'src/__tests__/integration/setup.ts',
      ],
      // Floor, not target — issue #10 mandates ≥ 85% lines for
      // `packages/sdk`. Actual coverage sits around 97% today; the
      // threshold catches regressions without fighting the 85% figure
      // the SDD records. Statements / functions / branches tracked so a
      // whole-branch hole cannot slip in under the lines count.
      thresholds: {
        lines: 85,
        statements: 85,
        functions: 85,
        branches: 80,
      },
    },
  },
});
