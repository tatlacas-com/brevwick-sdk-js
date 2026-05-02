import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

// Minimal Node globals for our build-time scripts. Avoids pulling in the
// full `globals` npm package as a top-level devDependency just for the few
// names we need.
const nodeGlobals = {
  console: 'readonly',
  process: 'readonly',
  Buffer: 'readonly',
  __dirname: 'readonly',
  __filename: 'readonly',
  global: 'readonly',
  module: 'readonly',
  require: 'readonly',
  exports: 'writable',
};

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  prettier,
  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      '**/coverage/**',
      '**/*.config.*',
      '**/.next/**',
      // SolidStart (vinxi) regenerates these on every dev/build; they are
      // already in .gitignore so they should not be linted either.
      '**/.vinxi/**',
      '**/.output/**',
      '**/.svelte-kit/**',
      '**/.astro/**',
      '**/build/**',
      // Svelte SFCs are not parsed by eslint here. `svelte-check` /
      // svelte2tsx via the per-package `type-check` script covers the
      // type-level issues plain eslint would flag. Wiring up
      // `svelte-eslint-parser` is intentionally deferred — type-check is
      // the load-bearing static-analysis gate for the .svelte surface.
      '**/*.svelte',
    ],
  },
  {
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
  // Build-time codegen scripts run under Node — no DOM globals, but they
  // need `process`, `console`, etc.
  {
    files: ['**/scripts/**/*.mjs', '**/scripts/**/*.js'],
    languageOptions: {
      globals: nodeGlobals,
    },
  },
  // CommonJS test fixtures (e.g. the React Native mock loaded by Node's
  // CJS loader from `test/setup.ts`) — they use `module.exports` and run
  // under Node, not the bundle.
  {
    files: ['**/*.cjs'],
    languageOptions: {
      globals: nodeGlobals,
      sourceType: 'commonjs',
    },
  },
);
