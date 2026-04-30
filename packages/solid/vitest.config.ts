import { readFileSync } from 'node:fs';
import { defineConfig } from 'vitest/config';
import solid from 'vite-plugin-solid';

const pkg = JSON.parse(
  readFileSync(new URL('./package.json', import.meta.url), 'utf8'),
) as { version: string };

export default defineConfig({
  plugins: [solid()],
  // Resolve the `solid-js` peer to a single copy so the Provider, the hook,
  // and the test harness all share one reactivity graph. Without this, two
  // copies of `solid-js` end up in the worker (one from the package, one from
  // `@solidjs/testing-library`) and `useContext` returns `undefined` because
  // the Context.id mismatches.
  resolve: {
    conditions: ['development', 'browser'],
  },
  define: {
    __BREVWICK_SOLID_VERSION__: JSON.stringify(pkg.version),
  },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'],
    setupFiles: ['./vitest.setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/**/*.test.{ts,tsx}', 'src/index.ts'],
      thresholds: {
        lines: 75,
        statements: 75,
        functions: 75,
        branches: 70,
      },
    },
  },
});
