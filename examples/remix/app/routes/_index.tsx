import type { MetaFunction } from '@remix-run/node';

export const meta: MetaFunction = () => [{ title: 'Brevwick — Remix example' }];

export default function Index() {
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
      </section>
    </main>
  );
}
