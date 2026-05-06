import { env } from '$env/dynamic/public';
import type { BrevwickConfig } from '@tatlacas/brevwick-svelte';

const PROJECT_KEY_PATTERN = /^pk_(live|test)_[A-Za-z0-9]{16,}$/;
const PLACEHOLDER_KEY = 'pk_test_replace_me';

export type ConfigError =
  | 'missing-key'
  | 'invalid-key'
  | 'missing-endpoint'
  | null;

export interface ConfigState {
  readonly config: BrevwickConfig | null;
  readonly error: ConfigError;
}

/**
 * Mirrors examples/next/src/app/page.tsx env-var plumbing. Shape-checks the
 * project key and endpoint at module load so `+layout.svelte` only calls
 * `setBrevwickContext` when the inputs validate — passing a malformed key
 * would trigger `createBrevwick`'s synchronous validation and crash the
 * SvelteKit app on first render.
 */
export function readConfig(): ConfigState {
  const rawKey = env.PUBLIC_BREVWICK_PROJECT_KEY ?? '';
  const rawEndpoint = env.PUBLIC_BREVWICK_ENDPOINT ?? '';

  if (!rawKey || rawKey === PLACEHOLDER_KEY) {
    return { config: null, error: 'missing-key' };
  }
  if (!PROJECT_KEY_PATTERN.test(rawKey)) {
    return { config: null, error: 'invalid-key' };
  }
  if (!rawEndpoint) {
    return { config: null, error: 'missing-endpoint' };
  }
  return {
    config: {
      projectKey: rawKey,
      endpoint: rawEndpoint,
      environment: 'dev',
    },
    error: null,
  };
}
