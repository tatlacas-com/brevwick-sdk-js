<script lang="ts">
  import { readConfig } from '$lib/configured-widget';

  const { error } = readConfig();
</script>

<svelte:head>
  <title>Brevwick — SvelteKit example</title>
</svelte:head>

<main>
  <section>
    <h1>Brevwick — SvelteKit example</h1>
    <p>
      The floating <strong>Feedback</strong> button is rendered by
      <code>&lt;FeedbackButton /&gt;</code> from
      <code>@tatlacas/brevwick-svelte</code>, mounted in
      <code>+layout.svelte</code>. Click it, fill the dialog, submit, and check
      your project inbox at <a href="https://brevwick.dev">brevwick.dev</a>.
    </p>
    {#if error === 'missing-key'}
      <p class="error">
        Missing <code>PUBLIC_BREVWICK_PROJECT_KEY</code>. Copy
        <code>.env.example</code> to <code>.env.local</code>, seed a real test
        key, and reload this page.
      </p>
    {:else if error === 'invalid-key'}
      <p class="error">
        <code>PUBLIC_BREVWICK_PROJECT_KEY</code> is malformed. It must match
        <code>pk_(live|test)_[A-Za-z0-9]{'{16,}'}</code>.
      </p>
    {:else if error === 'missing-endpoint'}
      <p class="error">
        Missing <code>PUBLIC_BREVWICK_ENDPOINT</code>. Point it at your local
        <code>brevwick-api</code> (e.g.
        <code>http://localhost:8080</code>) in <code>.env.local</code>.
      </p>
    {/if}
  </section>
</main>

<style>
  main {
    display: grid;
    place-items: center;
    min-height: 100vh;
    padding: 2rem;
    font-family: system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
  }
  section {
    max-width: 32rem;
    padding: 2rem;
    border: 1px solid rgba(0, 0, 0, 0.1);
    border-radius: 0.75rem;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
    text-align: center;
    line-height: 1.6;
  }
  h1 {
    margin-top: 0;
  }
  .error {
    color: #b42318;
  }
</style>
