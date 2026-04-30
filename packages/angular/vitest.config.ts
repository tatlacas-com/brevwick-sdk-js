import { defineConfig } from 'vitest/config';

export default defineConfig({
  esbuild: {
    // ng-packagr / Angular emit decorator metadata via tsc + tsickle. For the
    // narrow set of vitest specs that exercise the service / provider /
    // component class APIs (no full Angular bootstrap), esbuild's standard
    // decorator transform is sufficient: we instantiate via TestBed and
    // Angular's own runtime then reads the static ɵfac/ɵprov fields the
    // Angular compiler would emit for production builds. The two surfaces are
    // built by separate toolchains — vitest tests the source TS as-typed,
    // size-limit asserts the ng-packagr artefact.
    target: 'es2022',
  },
  test: {
    environment: 'happy-dom',
    include: ['src/**/*.test.{ts,tsx}', 'src/**/*.spec.ts'],
    setupFiles: ['./vitest.setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['src/lib/**/*.ts'],
      exclude: [
        'src/**/*.test.ts',
        'src/**/*.spec.ts',
        'src/**/__tests__/**',
        'src/public-api.ts',
      ],
      thresholds: {
        lines: 70,
        statements: 70,
        functions: 70,
        branches: 60,
      },
    },
  },
});
