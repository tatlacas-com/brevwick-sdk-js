<script lang="ts">
  import { setBrevwickContext, FeedbackButton } from '@tatlacas/brevwick-svelte';
  import { readConfig, type ConfigError } from '$lib/configured-widget';

  const { config, error } = readConfig();
  if (config) {
    setBrevwickContext(config);
  }

  const banner = (err: ConfigError): string | null => {
    if (err === 'missing-key')
      return 'Missing PUBLIC_BREVWICK_PROJECT_KEY. Copy .env.example to .env.local, seed a real test key, and reload.';
    if (err === 'invalid-key')
      return 'PUBLIC_BREVWICK_PROJECT_KEY is malformed. Must match pk_(live|test)_[A-Za-z0-9]{16,}.';
    if (err === 'missing-endpoint')
      return 'Missing PUBLIC_BREVWICK_ENDPOINT. Point it at your local brevwick-api (e.g. http://localhost:8080).';
    return null;
  };

  $: bannerText = banner(error);
</script>

<slot />

{#if bannerText}
  <div role="alert" class="brw-config-banner">{bannerText}</div>
{:else}
  <FeedbackButton />
{/if}

<style>
  .brw-config-banner {
    position: fixed;
    bottom: 1rem;
    left: 50%;
    transform: translateX(-50%);
    max-width: 32rem;
    padding: 0.75rem 1rem;
    background: #fef2f2;
    color: #b42318;
    border: 1px solid #fecaca;
    border-radius: 0.5rem;
    font-size: 0.875rem;
  }
</style>
