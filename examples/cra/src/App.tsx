import type { ReactElement } from 'react';
import { ConfiguredWidget } from './configured-widget';

const projectKey = process.env.REACT_APP_BREVWICK_PROJECT_KEY ?? '';

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
        {!projectKey && (
          <p style={{ color: '#b42318' }}>
            Missing <code>REACT_APP_BREVWICK_PROJECT_KEY</code>. Copy{' '}
            <code>.env.example</code> to <code>.env.local</code>, set your{' '}
            <code>pk_test_…</code> key, and reload.
          </p>
        )}
      </section>
      {projectKey ? <ConfiguredWidget projectKey={projectKey} /> : null}
    </main>
  );
}
