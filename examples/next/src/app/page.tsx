import type { ReactElement } from 'react';
import { ConfiguredWidget } from './configured-widget';

// Mirrors the shape enforced by `brevwick-sdk`'s `validateConfig`. Shape-check
// on the server so the Provider is never mounted with a key that would throw
// synchronously from `createBrevwick(...)` in the client bundle — that would
// surface as a blank React crash instead of the friendly banner below.
const PROJECT_KEY_PATTERN = /^pk_(live|test)_[A-Za-z0-9]{16,}$/;
const PLACEHOLDER_KEY = 'pk_test_replace_me';

interface ConfigState {
  readonly projectKey: string;
  readonly endpoint: string;
  readonly error?: string;
}

function readConfig(): ConfigState {
  const rawKey = process.env.NEXT_PUBLIC_BREVWICK_KEY ?? '';
  const rawEndpoint = process.env.NEXT_PUBLIC_API_BASE ?? '';

  if (!rawKey || rawKey === PLACEHOLDER_KEY) {
    return {
      projectKey: '',
      endpoint: rawEndpoint,
      error: 'missing-key',
    };
  }
  if (!PROJECT_KEY_PATTERN.test(rawKey)) {
    return {
      projectKey: '',
      endpoint: rawEndpoint,
      error: 'invalid-key',
    };
  }
  // Fail closed when the endpoint is unset — this example is local-stack
  // scoped and must refuse to fall through to the SDK's production default.
  if (!rawEndpoint) {
    return {
      projectKey: rawKey,
      endpoint: '',
      error: 'missing-endpoint',
    };
  }
  return { projectKey: rawKey, endpoint: rawEndpoint };
}

export default function Home(): ReactElement {
  const { projectKey, endpoint, error } = readConfig();
  const mountWidget = !error && projectKey.length > 0 && endpoint.length > 0;

  return (
    <main
      style={{
        display: 'grid',
        placeItems: 'center',
        minHeight: '100vh',
        padding: '2rem',
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
        <h1 style={{ marginTop: 0 }}>Brevwick — Next.js example</h1>
        <p>
          The floating <strong>Feedback</strong> button is rendered by{' '}
          <code>&lt;FeedbackButton /&gt;</code> from <code>brevwick-react</code>
          . Click it, fill the dialog, submit, and check{' '}
          <code>brevwick-web</code>&rsquo;s inbox.
        </p>
        {error === 'missing-key' && (
          <p style={{ color: '#b42318' }}>
            Missing <code>NEXT_PUBLIC_BREVWICK_KEY</code>. Copy{' '}
            <code>.env.example</code> to <code>.env.local</code>, seed a real
            test key, and reload this page.
          </p>
        )}
        {error === 'invalid-key' && (
          <p style={{ color: '#b42318' }}>
            <code>NEXT_PUBLIC_BREVWICK_KEY</code> is malformed. It must match{' '}
            <code>pk_(live|test)_[A-Za-z0-9]{'{16,}'}</code>. Re-run{' '}
            <code>bwctl</code> and update <code>.env.local</code>.
          </p>
        )}
        {error === 'missing-endpoint' && (
          <p style={{ color: '#b42318' }}>
            Missing <code>NEXT_PUBLIC_API_BASE</code>. Point it at your local{' '}
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
