<script lang="ts">
  import type { BrevwickConfig } from '@tatlacas/brevwick-sdk';
  import { setBrevwickContext } from '../../lib/context';

  export let config: BrevwickConfig;
  export let onSdk: ((sdk: unknown) => void) | undefined = undefined;

  const sdk = setBrevwickContext(config);
  onSdk?.(sdk);
</script>

<slot />
