<script lang="ts">
  import type { BrevwickConfig } from '@tatlacas/brevwick-sdk';
  import { setBrevwickContext, type FeedbackHandle } from '../../lib/context';
  import Consumer from './Consumer.svelte';

  export let config: BrevwickConfig;
  export let onHandle: ((handle: FeedbackHandle) => void) | undefined =
    undefined;

  setBrevwickContext(config);
</script>

<Consumer {onHandle} />
