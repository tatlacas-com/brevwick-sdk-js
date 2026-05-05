import { ErrorBoundary, Show, type Component } from 'solid-js';
import {
  BrevwickProvider,
  FeedbackButton,
  type BrevwickConfig,
} from '@tatlacas/brevwick-solid';

const PROJECT_KEY_PATTERN = /^pk_(live|test)_[A-Za-z0-9]{16,}$/;
const PLACEHOLDER_KEY = 'pk_test_replace_me';

type ConfigErrorKind = 'missing-key' | 'invalid-key' | 'missing-endpoint';

interface ResolvedConfig {
  readonly projectKey: string;
  readonly endpoint: string;
  readonly error?: ConfigErrorKind;
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

function bannerText(err: ConfigErrorKind): string {
  if (err === 'missing-key')
    return 'Missing VITE_BREVWICK_PROJECT_KEY. Copy .env.example to .env.local, seed a real test key, and reload.';
  if (err === 'invalid-key')
    return 'VITE_BREVWICK_PROJECT_KEY is malformed. Must match pk_(live|test)_[A-Za-z0-9]{16,}.';
  return 'Missing VITE_BREVWICK_ENDPOINT. Point it at your local brevwick-api (e.g. http://localhost:8080).';
}

const bannerStyle = {
  position: 'fixed' as const,
  bottom: '1rem',
  left: '50%',
  transform: 'translateX(-50%)',
  'max-width': '32rem',
  padding: '0.75rem 1rem',
  background: '#fef2f2',
  color: '#b42318',
  border: '1px solid #fecaca',
  'border-radius': '0.5rem',
  'font-size': '0.875rem',
};

export const ConfiguredWidget: Component = () => {
  const { projectKey, endpoint, error } = readConfig();
  const mountWidget = !error && projectKey.length > 0 && endpoint.length > 0;
  const config: BrevwickConfig = {
    projectKey,
    endpoint,
    environment: 'dev',
  };
  return (
    <>
      <Show when={error}>
        {(err) => (
          <div role="alert" style={bannerStyle}>
            {bannerText(err())}
          </div>
        )}
      </Show>
      <Show when={mountWidget}>
        <ErrorBoundary
          fallback={(err: unknown) => (
            <p role="alert" style={{ color: '#b42318', margin: '1rem' }}>
              Brevwick config error:{' '}
              {err instanceof Error ? err.message : String(err)}
            </p>
          )}
        >
          <BrevwickProvider config={config}>
            <FeedbackButton position="bottom-right" />
          </BrevwickProvider>
        </ErrorBoundary>
      </Show>
    </>
  );
};
