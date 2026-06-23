<script lang="ts">
  import type {
    BrevwickConfig,
    SubmitResult,
  } from '@tatlacas/brevwick-sdk';
  import { setBrevwickContext } from '../../lib/context';
  import FeedbackButton from '../../lib/components/FeedbackButton.svelte';
  import type {
    FeedbackButtonPosition,
    FeedbackButtonVariant,
  } from '../../lib/launcher';

  export let config: BrevwickConfig;
  export let onSubmit: ((result: SubmitResult) => void) | undefined = undefined;
  // No defaults for variant/position — `resolveLauncherPlacement` must see
  // "unset" so the corner-implies-bubble compat rule stays observable.
  export let variant: FeedbackButtonVariant | undefined = undefined;
  export let position: FeedbackButtonPosition | undefined = undefined;
  export let compact: boolean = false;
  export let offset: number = 0;
  export let disabled: boolean = false;
  export let hidden: boolean = false;
  export let label: string = 'Feedback';
  export let theme: 'light' | 'dark' | 'system' = 'system';

  setBrevwickContext(config);
</script>

<FeedbackButton
  {onSubmit}
  {variant}
  {position}
  {compact}
  {offset}
  {disabled}
  {hidden}
  {label}
  {theme}
/>
