<svelte:head>
  <title>Brevwick — SvelteKit example</title>
</svelte:head>

<main>
  <h1>Brevwick — SvelteKit example</h1>
  <p>
    The floating <strong>Feedback</strong> button is rendered by
    <code>&lt;FeedbackButton /&gt;</code> from
    <code>@tatlacas/brevwick-svelte</code>, mounted in
    <code>+layout.svelte</code>. Click it, fill the dialog, submit, and check
    your project inbox at <a href="https://brevwick.dev">brevwick.dev</a>.
  </p>
</main>

<style>
  main {
    font-family: system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
    max-width: 32rem;
    margin: 4rem auto;
    padding: 2rem;
    border: 1px solid rgba(0, 0, 0, 0.1);
    border-radius: 0.75rem;
    text-align: center;
    line-height: 1.6;
  }
</style>
