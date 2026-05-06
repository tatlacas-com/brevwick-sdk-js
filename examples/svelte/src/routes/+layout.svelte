<script lang="ts">
  import { setBrevwickContext, FeedbackButton } from '@tatlacas/brevwick-svelte';
  import { readConfig } from '$lib/configured-widget';

  const { config } = readConfig();
  if (config) {
    setBrevwickContext(config);
  }
</script>

<slot />

{#if config}
  <FeedbackButton />
{/if}
