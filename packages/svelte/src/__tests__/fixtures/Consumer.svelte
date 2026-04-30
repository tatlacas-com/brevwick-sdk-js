<script lang="ts">
  import { getFeedback, type FeedbackHandle } from '../../lib/context';
  import type { FeedbackInput, SubmitResult } from '@tatlacas/brevwick-sdk';

  export let onHandle: ((handle: FeedbackHandle) => void) | undefined =
    undefined;

  const handle = getFeedback();
  onHandle?.(handle);

  const status = handle.status;
  let lastResult: SubmitResult | null = null;
  let lastError: string | null = null;

  export async function callSubmit(input: FeedbackInput): Promise<void> {
    try {
      lastResult = await handle.submit(input);
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
    }
  }
</script>

<div data-testid="status">{$status}</div>
{#if lastResult}
  <div data-testid="result">{JSON.stringify(lastResult)}</div>
{/if}
{#if lastError}
  <div data-testid="error">{lastError}</div>
{/if}
