import type { ReactElement } from 'react';
import { ConfiguredWidget } from './configured-widget';

// Mirrors `validateConfig` from `@tatlacas/brevwick-sdk` so we render a
// friendly banner instead of crashing the React tree when the env file still
// holds the seeded placeholder. `createBrevwick(...)` would throw
// synchronously inside the provider's `useMemo` otherwise.
const PROJECT_KEY_PATTERN = /^pk_(live|test)_[A-Za-z0-9]{16,}$/;
const PLACEHOLDER_KEY = 'pk_test_replace_me';
const projectKey = process.env.REACT_APP_BREVWICK_PROJECT_KEY ?? '';
const keyIsReady =
  projectKey.length > 0 &&
  projectKey !== PLACEHOLDER_KEY &&
  PROJECT_KEY_PATTERN.test(projectKey);

export function App(): ReactElement {
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
          textAlign: 'center',
        }}
      >
        <h1 style={{ marginTop: 0 }}>Brevwick — Create React App example</h1>
        <p>
          The floating <strong>Feedback</strong> button is rendered by{' '}
          <code>&lt;FeedbackButton /&gt;</code> from{' '}
          <code>@tatlacas/brevwick-react</code>.
        </p>
        {!keyIsReady && (
          <p style={{ color: '#b42318' }}>
            Set <code>REACT_APP_BREVWICK_PROJECT_KEY</code> to a real{' '}
            <code>pk_test_…</code> key. Copy <code>.env.example</code> to{' '}
            <code>.env.local</code>, replace <code>pk_test_replace_me</code>,
            and reload.
          </p>
        )}
      </section>
      {keyIsReady ? <ConfiguredWidget projectKey={projectKey} /> : null}
    </main>
  );
}
