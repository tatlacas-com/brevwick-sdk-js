import { readFileSync } from 'node:fs';
import { defineConfig } from 'vitest/config';

const pkg = JSON.parse(
  readFileSync(new URL('./package.json', import.meta.url), 'utf8'),
) as { version: string };

export default defineConfig({
  define: {
    __BREVWICK_REACT_VERSION__: JSON.stringify(pkg.version),
  },
  test: {
    environment: 'happy-dom',
    include: ['src/**/*.test.{ts,tsx}'],
    setupFiles: ['./vitest.setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'src/**/*.test.{ts,tsx}',
        'src/index.ts',
        // Test-only scaffolding under __tests__ is not product code —
        // excluding it keeps the threshold measuring what ships.
        'src/__tests__/integration/setup.ts',
      ],
      // Floor, not target — issue #10 mandates ≥ 75% lines for
      // `packages/react`. Branches sit a bit below the lines figure
      // because `feedback-button.tsx` has several defensive no-op
      // branches; keeping branches at 70 avoids false failures on
      // tightly covered code with many ternaries.
      thresholds: {
        lines: 75,
        statements: 75,
        functions: 75,
        branches: 70,
      },
    },
  },
});
