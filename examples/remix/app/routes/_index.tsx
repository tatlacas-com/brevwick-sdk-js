import type { MetaFunction } from '@remix-run/node';
import { readConfig } from '../configured-widget';

export const meta: MetaFunction = () => [{ title: 'Brevwick — Remix example' }];

export default function Index() {
  const { error } = readConfig();

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
        <h1 style={{ marginTop: 0 }}>Brevwick — Remix example</h1>
        <p>
          The floating <strong>Feedback</strong> button is rendered from{' '}
          <code>app/root.tsx</code> by <code>&lt;FeedbackButton /&gt;</code>{' '}
          from <code>@tatlacas/brevwick-react</code>. Click it, fill the dialog,
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
            <code>pk_(live|test)_[A-Za-z0-9]{'{16,}'}</code>.
          </p>
        )}
        {error === 'missing-endpoint' && (
          <p style={{ color: '#b42318' }}>
            Missing <code>VITE_BREVWICK_ENDPOINT</code>. Point it at your
            Brevwick ingest host (e.g. <code>http://localhost:8080</code> for a
            local instance) in <code>.env.local</code>.
          </p>
        )}
      </section>
    </main>
  );
}
