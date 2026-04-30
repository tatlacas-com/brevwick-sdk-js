import { readFileSync } from 'node:fs';
import { defineConfig } from 'vitest/config';
import { svelte } from '@sveltejs/vite-plugin-svelte';

const pkg = JSON.parse(
  readFileSync(new URL('./package.json', import.meta.url), 'utf8'),
) as { version: string };

export default defineConfig({
  plugins: [svelte()],
  define: {
    __BREVWICK_SVELTE_VERSION__: JSON.stringify(pkg.version),
  },
  resolve: {
    // @testing-library/svelte expects the browser-side Svelte client entry
    // when running under happy-dom — the default Node condition resolves to
    // the SSR build, which mounts components without DOM lifecycle.
    conditions: ['browser'],
  },
  test: {
    environment: 'happy-dom',
    include: ['src/**/*.test.ts'],
    setupFiles: ['./vitest.setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['src/lib/**/*.{ts,svelte}'],
      exclude: ['src/lib/index.ts', 'src/lib/internal/version.ts'],
      thresholds: {
        lines: 75,
        statements: 75,
        functions: 75,
        branches: 70,
      },
    },
  },
});
