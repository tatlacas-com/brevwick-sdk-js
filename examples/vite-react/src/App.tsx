import type { ReactElement } from 'react';
import { ConfiguredWidget } from './configured-widget';

// Mirrors the shape enforced by `@tatlacas/brevwick-sdk`'s `validateConfig`.
// Shape-checking here so the Provider is never mounted with a key that
// would throw synchronously from `createBrevwick(...)` — that would
// surface as a blank React crash instead of the friendly banner below.
const PROJECT_KEY_PATTERN = /^pk_(live|test)_[A-Za-z0-9]{16,}$/;
const PLACEHOLDER_KEY = 'pk_test_replace_me';

interface ConfigState {
  readonly projectKey: string;
  readonly endpoint: string;
  readonly error?: 'missing-key' | 'invalid-key' | 'missing-endpoint';
}

function readConfig(): ConfigState {
  const rawKey = import.meta.env.VITE_BREVWICK_PROJECT_KEY ?? '';
  const rawEndpoint = import.meta.env.VITE_BREVWICK_ENDPOINT ?? '';

  if (!rawKey || rawKey === PLACEHOLDER_KEY) {
    return { projectKey: '', endpoint: rawEndpoint, error: 'missing-key' };
  }
  if (!PROJECT_KEY_PATTERN.test(rawKey)) {
    return { projectKey: '', endpoint: rawEndpoint, error: 'invalid-key' };
  }
  // Fail closed when the endpoint is unset — this example is local-stack
  // scoped and must refuse to fall through to the SDK's production default.
  if (!rawEndpoint) {
    return { projectKey: rawKey, endpoint: '', error: 'missing-endpoint' };
  }
  return { projectKey: rawKey, endpoint: rawEndpoint };
}

export function App(): ReactElement {
  const { projectKey, endpoint, error } = readConfig();
  const mountWidget = !error && projectKey.length > 0 && endpoint.length > 0;

  return (
    <main
      style={{
        display: 'grid',
        placeItems: 'center',
        minHeight: '100vh',
        padding: '2rem',
        fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
      }}
    >
      <section
        style={{
          maxWidth: '32rem',
          padding: '2rem',
          border: '1px solid rgba(0,0,0,0.1)',
          borderRadius: '0.75rem',
          boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
          textAlign: 'center',
        }}
      >
        <h1 style={{ marginTop: 0 }}>Brevwick — Vite + React example</h1>
        <p>
          The floating <strong>Feedback</strong> button is rendered by{' '}
          <code>&lt;FeedbackButton /&gt;</code> from{' '}
          <code>@tatlacas/brevwick-react</code>. Click it, fill the dialog,
          submit, and check your project inbox at{' '}
          <a href="https://brevwick.dev">brevwick.dev</a>.
        </p>
        {error === 'missing-key' && (
          <p style={{ color: '#b42318' }}>
            Missing <code>VITE_BREVWICK_PROJECT_KEY</code>. Copy{' '}
            <code>.env.example</code> to <code>.env.local</code>, seed a real
            test key, and reload this page.
          </p>
        )}
        {error === 'invalid-key' && (
          <p style={{ color: '#b42318' }}>
            <code>VITE_BREVWICK_PROJECT_KEY</code> is malformed. It must match{' '}
            <code>pk_(live|test)_[A-Za-z0-9]{'{16,}'}</code>. Re-run{' '}
            <code>bwctl</code> and update <code>.env.local</code>.
          </p>
        )}
        {error === 'missing-endpoint' && (
          <p style={{ color: '#b42318' }}>
            Missing <code>VITE_BREVWICK_ENDPOINT</code>. Point it at your local{' '}
            <code>brevwick-api</code> (e.g. <code>http://localhost:8080</code>)
            in <code>.env.local</code>.
          </p>
        )}
      </section>
      {mountWidget && (
        <ConfiguredWidget projectKey={projectKey} endpoint={endpoint} />
      )}
    </main>
  );
}
