<script lang="ts">
  import { getFeedback } from '@tatlacas/brevwick-svelte';

  const { submit, status } = getFeedback();

  async function reportSomething() {
    const result = await submit({
      description: 'Imperative submit demo from +page.svelte',
    });
    if (!result.ok) {
      console.error('submit failed', result.error);
    }
  }
</script>

<svelte:head>
  <title>Brevwick — SvelteKit example</title>
</svelte:head>

<main>
  <h1>Brevwick + SvelteKit</h1>
  <p>
    Click the floating <strong>Feedback</strong> button in the bottom-right to
    open the chat-style composer. The component is wired up via
    <code>setBrevwickContext()</code> in
    <code>+layout.svelte</code>.
  </p>
  <p>
    Or fire an imperative submit through <code>getFeedback()</code>:
  </p>
  <button type="button" on:click={reportSomething} disabled={$status === 'submitting'}>
    {$status === 'submitting' ? 'Sending…' : 'Send a programmatic report'}
  </button>
  <p>Status: <code>{$status}</code></p>
</main>

<style>
  main {
    font-family: system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
    max-width: 640px;
    margin: 4rem auto;
    padding: 0 1rem;
    line-height: 1.6;
  }
  button {
    padding: 0.5rem 1rem;
    border-radius: 8px;
    border: 1px solid #d1d5db;
    background: #4f46e5;
    color: #fff;
    cursor: pointer;
    font: inherit;
  }
  button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
</style>
