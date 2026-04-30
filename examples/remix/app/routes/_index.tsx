import type { MetaFunction } from '@remix-run/node';
import { useFeedback } from '@tatlacas/brevwick-react';

export const meta: MetaFunction = () => [{ title: 'Brevwick — Remix example' }];

export default function Index() {
  // `useFeedback` only works inside a `<BrevwickProvider>` (mounted in
  // `root.tsx` via `ConfiguredWidget`). It throws synchronously if the
  // provider is missing.
  const { submit, status } = useFeedback();

  async function handleManualSubmit() {
    const result = await submit({
      description: 'Manual submit from the Remix example index route.',
    });
    if (!result.ok) {
      console.error('[brevwick]', result.error.code, result.error.message);
    }
  }

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
          <code>app/root.tsx</code>. The button below demonstrates a manual
          submit via <code>useFeedback()</code>.
        </p>
        <button
          type="button"
          onClick={handleManualSubmit}
          disabled={status === 'submitting'}
          style={{
            padding: '0.75rem 1.25rem',
            fontSize: '1rem',
            borderRadius: '0.5rem',
            border: '1px solid currentColor',
            background: 'transparent',
            cursor: status === 'submitting' ? 'progress' : 'pointer',
          }}
        >
          {status === 'submitting' ? 'Sending…' : 'Submit manual feedback'}
        </button>
      </section>
    </main>
  );
}
