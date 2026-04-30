import { env } from '$env/dynamic/public';
import type { BrevwickConfig } from '@tatlacas/brevwick-svelte';

/**
 * Single source of truth for the Brevwick config in this example. Reads the
 * `PUBLIC_BREVWICK_PROJECT_KEY` env var via `$env/dynamic/public` so the
 * build does not require the variable to be defined at compile time —
 * convenient for CI smoke builds and local-first iteration. Production
 * deploys should set the var; the placeholder fallback exists so the
 * example renders for first-time readers without a `.env`.
 */
export const brevwickConfig: BrevwickConfig = {
  projectKey: env.PUBLIC_BREVWICK_PROJECT_KEY || 'pk_test_replace_me',
  environment: 'dev',
};
