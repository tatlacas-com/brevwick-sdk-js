import { Show, type Component } from 'solid-js';
import {
  BrevwickProvider,
  FeedbackButton,
  type BrevwickConfig,
} from '@tatlacas/brevwick-solid';

const PROJECT_KEY_PATTERN = /^pk_(live|test)_[A-Za-z0-9]{16,}$/;
const PLACEHOLDER_KEY = 'pk_test_replace_me';

interface ResolvedConfig {
  readonly projectKey: string;
  readonly endpoint: string;
  readonly error?: 'missing-key' | 'invalid-key' | 'missing-endpoint';
}

/**
 * Pick the project key + endpoint out of Vite's `import.meta.env`. SolidStart
 * exposes the same `VITE_*` convention Vite uses everywhere — anything
 * prefixed `VITE_` is inlined into the client bundle. We fail closed when
 * either is missing so the example never falls through to the SDK's
 * production endpoint default.
 */
function readConfig(): ResolvedConfig {
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
  return { projectKey: rawKey, endpoint: rawEndpoint };
}

export const ConfiguredWidget: Component = () => {
  const { projectKey, endpoint, error } = readConfig();
  const mountWidget = !error && projectKey.length > 0 && endpoint.length > 0;
  const config: BrevwickConfig = {
    projectKey,
    endpoint,
    environment: 'dev',
  };
  return (
    <Show when={mountWidget}>
      <BrevwickProvider config={config}>
        <FeedbackButton position="bottom-right" />
      </BrevwickProvider>
    </Show>
  );
};
