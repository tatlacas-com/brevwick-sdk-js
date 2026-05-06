import { Show } from 'solid-js';
import { readConfig } from '../configured-widget';

export default function Home() {
  const { error } = readConfig();

  return (
    <main
      style={{
        display: 'grid',
        'place-items': 'center',
        'min-height': '100vh',
        padding: '2rem',
        'font-family':
          'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
      }}
    >
      <section
        style={{
          'max-width': '32rem',
          padding: '2rem',
          border: '1px solid rgba(0,0,0,0.1)',
          'border-radius': '0.75rem',
          'box-shadow': '0 1px 3px rgba(0,0,0,0.05)',
          'text-align': 'center',
        }}
      >
        <h1 style={{ 'margin-top': 0 }}>Brevwick — SolidStart example</h1>
        <p>
          The floating <strong>Feedback</strong> button is rendered by{' '}
          <code>&lt;FeedbackButton /&gt;</code> from{' '}
          <code>@tatlacas/brevwick-solid</code>. Click it, fill the dialog,
          submit, and check your project inbox at{' '}
          <a href="https://brevwick.dev">brevwick.dev</a>.
        </p>
        <Show when={error === 'missing-key'}>
          <p style={{ color: '#b42318' }}>
            Missing <code>VITE_BREVWICK_PROJECT_KEY</code>. Copy{' '}
            <code>.env.example</code> to <code>.env.local</code>, seed a real
            test key, and reload this page.
          </p>
        </Show>
        <Show when={error === 'invalid-key'}>
          <p style={{ color: '#b42318' }}>
            <code>VITE_BREVWICK_PROJECT_KEY</code> is malformed. It must match{' '}
            <code>pk_(live|test)_[A-Za-z0-9]{'{16,}'}</code>.
          </p>
        </Show>
        <Show when={error === 'missing-endpoint'}>
          <p style={{ color: '#b42318' }}>
            Missing <code>VITE_BREVWICK_ENDPOINT</code>. Point it at your local{' '}
            <code>brevwick-api</code> (e.g. <code>http://localhost:8080</code>)
            in <code>.env.local</code>.
          </p>
        </Show>
      </section>
    </main>
  );
}
