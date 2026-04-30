/**
 * Mirrors examples/next/src/app/page.tsx env-var plumbing. Shape-checks the
 * project key and endpoint at module load so `main.ts` only mounts the
 * BrevwickPlugin when the inputs validate — passing a malformed key would
 * trigger `createBrevwick`'s synchronous validation and crash the app.
 */
const PROJECT_KEY_PATTERN = /^pk_(live|test)_[A-Za-z0-9]{16,}$/;
const PLACEHOLDER_KEY = 'pk_test_replace_me';

export type ConfigError =
  | 'missing-key'
  | 'invalid-key'
  | 'missing-endpoint'
  | null;

export interface ConfigState {
  readonly projectKey: string;
  readonly endpoint: string;
  readonly error: ConfigError;
}

export function readConfig(): ConfigState {
  const rawKey = (import.meta.env.VITE_BREVWICK_PROJECT_KEY as string) ?? '';
  const rawEndpoint = (import.meta.env.VITE_BREVWICK_ENDPOINT as string) ?? '';

  if (!rawKey || rawKey === PLACEHOLDER_KEY) {
    return { projectKey: '', endpoint: rawEndpoint, error: 'missing-key' };
  }
  if (!PROJECT_KEY_PATTERN.test(rawKey)) {
    return { projectKey: '', endpoint: rawEndpoint, error: 'invalid-key' };
  }
  if (!rawEndpoint) {
    return { projectKey: rawKey, endpoint: '', error: 'missing-endpoint' };
  }
  return { projectKey: rawKey, endpoint: rawEndpoint, error: null };
}
