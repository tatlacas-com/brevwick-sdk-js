export default function Home() {
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
          submit, and check <code>brevwick-web</code>'s inbox.
        </p>
        <p>
          Set <code>VITE_BREVWICK_PROJECT_KEY</code> and{' '}
          <code>VITE_BREVWICK_ENDPOINT</code> in <code>.env.local</code> to
          mount the widget.
        </p>
      </section>
    </main>
  );
}
