<script lang="ts">
  import { setBrevwickContext, FeedbackButton } from '@tatlacas/brevwick-svelte';
  import { brevwickConfig } from '$lib/configured-widget';

  setBrevwickContext(brevwickConfig);
</script>

<slot />

<FeedbackButton />
