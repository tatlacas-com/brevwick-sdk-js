import type { ReactElement } from 'react';
import { ConfiguredWidget } from './configured-widget';

const PLACEHOLDER_KEY = 'pk_test_replace_me';

export default function Home(): ReactElement {
  const rawKey = process.env.NEXT_PUBLIC_BREVWICK_KEY ?? '';
  // Treat the unedited placeholder as "missing" so integrators don't silently
  // hit the ingest endpoint with a sentinel key and see 401s.
  const projectKey = rawKey === PLACEHOLDER_KEY ? '' : rawKey;

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
        {!projectKey && (
          <p style={{ color: '#b42318' }}>
            Missing <code>NEXT_PUBLIC_BREVWICK_KEY</code>. Copy{' '}
            <code>.env.example</code> to <code>.env.local</code>, seed a real
            test key, and reload this page.
          </p>
        )}
      </section>
      {projectKey && (
        <ConfiguredWidget
          projectKey={projectKey}
          endpoint={process.env.NEXT_PUBLIC_API_BASE}
        />
      )}
    </main>
  );
}
