import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

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
);
