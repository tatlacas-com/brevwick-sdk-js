<script lang="ts">
  import type {
    BrevwickConfig,
    SubmitResult,
  } from '@tatlacas/brevwick-sdk';
  import { setBrevwickContext } from '../../lib/context';
  import FeedbackButton from '../../lib/components/FeedbackButton.svelte';

  export let config: BrevwickConfig;
  export let onSubmit: ((result: SubmitResult) => void) | undefined = undefined;
  export let position: 'bottom-right' | 'bottom-left' = 'bottom-right';
  export let disabled: boolean = false;
  export let hidden: boolean = false;
  export let label: string = 'Feedback';
  export let theme: 'light' | 'dark' | 'system' = 'system';

  setBrevwickContext(config);
</script>

<FeedbackButton
  {onSubmit}
  {position}
  {disabled}
  {hidden}
  {label}
  {theme}
/>
