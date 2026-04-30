<script lang="ts">
  import type {
    BrevwickConfig,
    SubmitResult,
  } from '@tatlacas/brevwick-sdk';
  import { setBrevwickContext } from '../../lib/context';
  import FeedbackButton from '../../lib/components/FeedbackButton.svelte';

  export let config: BrevwickConfig;
  export let onSubmit: ((result: SubmitResult) => void) | undefined = undefined;

  setBrevwickContext(config);
</script>

<FeedbackButton {onSubmit} />
