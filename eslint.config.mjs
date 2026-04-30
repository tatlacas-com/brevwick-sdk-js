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
      '**/.svelte-kit/**',
      '**/build/**',
      // Svelte SFCs are processed via svelte-eslint-parser; without it
      // wired up, plain `eslint .` would parse `.svelte` files as TS.
      // Keeping them out of the lint pass for now — type-check covers them
      // via svelte2tsx-emitted .d.ts files.
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
