# @tatlacas/brevwick-svelte

[![npm](https://img.shields.io/npm/v/@tatlacas/brevwick-svelte/beta?label=@tatlacas/brevwick-svelte%40beta)](https://www.npmjs.com/package/@tatlacas/brevwick-svelte)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](../../LICENSE)

Svelte bindings for [Brevwick](https://brevwick.dev) — a context setter, a drop-in floating feedback button, and a `getFeedback()` getter for custom UIs. Works in Svelte 5 and SvelteKit.

Wraps [`@tatlacas/brevwick-sdk`](https://www.npmjs.com/package/@tatlacas/brevwick-sdk) — all configuration and submit semantics live there. This package adds the Svelte ergonomics.

## Install

```bash
pnpm add @tatlacas/brevwick-svelte@beta @tatlacas/brevwick-sdk@beta
```

`@tatlacas/brevwick-sdk` and `svelte` are peer dependencies. Installers that respect peers (npm 7+, pnpm, yarn 3+) pull them in automatically.

**Svelte:** `^5.0.0`. The package compiles cleanly under both runes and the legacy reactivity model.

## Quick start

### SvelteKit

```svelte
<!-- src/routes/+layout.svelte -->
<script lang="ts">
  import { setBrevwickContext, FeedbackButton } from '@tatlacas/brevwick-svelte';

  setBrevwickContext({ projectKey: 'pk_live_...' });
</script>

<slot />
<FeedbackButton />
```

That's it. A floating action button appears in the bottom-right; clicking it opens a feedback dialog with screenshot capture and file attachments.

> **Place `setBrevwickContext` in `+layout.svelte`, NOT `+layout.server.ts`.** The SDK is browser-side; the context setter is a no-op during SSR and `<FeedbackButton>` mounts after hydration.

### Plain Svelte SPA

```svelte
<!-- App.svelte -->
<script lang="ts">
  import { setBrevwickContext, FeedbackButton } from '@tatlacas/brevwick-svelte';

  setBrevwickContext({ projectKey: 'pk_live_...' });
</script>

<YourApp />
<FeedbackButton />
```

## `setBrevwickContext`

Top-level setter. Call exactly once near the root of your tree.

```ts
import { setBrevwickContext } from '@tatlacas/brevwick-svelte';
import type { BrevwickConfig } from '@tatlacas/brevwick-svelte';

const sdk = setBrevwickContext({ projectKey: 'pk_live_...' });
// `sdk` is the underlying Brevwick instance (or `null` during SSR) — useful
// for wiring custom diagnostics. Most apps can ignore the return value.
```

Returns the underlying SDK instance for advanced use, or `null` during SSR. The SDK's `install()` is called eagerly in the browser so console / network / route rings begin capturing as soon as the layout mounts.

## `FeedbackButton`

A floating action button + chat-style feedback dialog. Opens to a composer with:

- **Textarea** with Enter-to-send (Shift+Enter for newline).
- **Screenshot** capture via the SDK's `captureScreenshot()`.
- **File attachments** via paperclip icon.
- **Inline error / success** states.

```svelte
<FeedbackButton position="bottom-left" label="Report a bug" />
```

### Props

| Prop       | Type                              | Default          | Description                                              |
| ---------- | --------------------------------- | ---------------- | -------------------------------------------------------- |
| `position` | `'bottom-right' \| 'bottom-left'` | `'bottom-right'` | Which corner the FAB pins to.                            |
| `disabled` | `boolean`                         | `false`          | FAB renders as disabled and cannot open the dialog.      |
| `hidden`   | `boolean`                         | `false`          | Component renders nothing — useful for feature flags.    |
| `label`    | `string`                          | `'Feedback'`     | FAB label.                                               |
| `theme`    | `'system' \| 'light' \| 'dark'`   | `'system'`       | Force a palette regardless of OS `prefers-color-scheme`. |
| `onSubmit` | `(result: SubmitResult) => void`  | —                | Fired after every submit (success or failure).           |

### Theming via CSS custom properties

The component scopes the standard `--brw-*` token set (`--brw-fg`, `--brw-panel-bg`, `--brw-accent`, `--brw-shadow`, …) to its root. Override on any ancestor to re-skin without a rebuild — the same tokens line up with the React adapter's so a single design-system rule covers both.

### Hiding sensitive content from screenshots

The widget captures the page via `@tatlacas/brevwick-sdk`'s `captureScreenshot()`. Any element tagged `data-brevwick-skip` is hidden before capture:

```svelte
<input data-brevwick-skip type="password" />
<div data-brevwick-skip>{customerEmail}</div>
```

The FAB and dialog itself carry `data-brevwick-skip`, so they never appear in the screenshots they capture.

## `getFeedback`

Getter for building a custom feedback UI against the `setBrevwickContext` instance.

```svelte
<script lang="ts">
  import { getFeedback } from '@tatlacas/brevwick-svelte';

  const { submit, captureScreenshot, status, reset } = getFeedback();

  async function reportBug() {
    const shot = await captureScreenshot();
    const result = await submit({
      description: 'Dashboard crash after filter change',
      attachments: [shot],
    });
    if (!result.ok) alert(result.error.message);
  }
</script>

<button on:click={reportBug} disabled={$status === 'submitting'}>
  {$status === 'submitting' ? 'Sending…' : 'Report bug'}
</button>
{#if $status === 'success'}
  <p>Thanks! <button on:click={reset}>Send another</button></p>
{/if}
```

### Return value

| Field               | Type                                                 | Description                                                                      |
| ------------------- | ---------------------------------------------------- | -------------------------------------------------------------------------------- |
| `submit`            | `(input: FeedbackInput) => Promise<SubmitResult>`    | Submit feedback. Returns the same tagged union `@tatlacas/brevwick-sdk` returns. |
| `captureScreenshot` | `() => Promise<Blob>`                                | Capture a DOM screenshot. Returns a placeholder on failure.                      |
| `status`            | `Readable<'idle'\|'submitting'\|'success'\|'error'>` | Current submission status as a Svelte readable store.                            |
| `reset`             | `() => void`                                         | Reset `status` back to `'idle'`. Does not cancel an in-flight submit.            |

Throws synchronously when called outside a `setBrevwickContext` ancestor.

> **Call during component init.** `getFeedback()` reads Svelte context, which is only available during a component's initialisation call stack — assign it to a `<script>`-scope variable, not from inside `onMount` or an event handler.

## `BREVWICK_SVELTE_VERSION`

Exported semver string of the installed package — useful for including in error reports or diagnostics.

```ts
import { BREVWICK_SVELTE_VERSION } from '@tatlacas/brevwick-svelte';
console.log('@tatlacas/brevwick-svelte', BREVWICK_SVELTE_VERSION);
```

## SSR

- `setBrevwickContext` is a no-op during SSR (returns `null`); the SDK installs only on the browser.
- `<FeedbackButton>` guards DOM access behind `onMount` so it renders nothing during SSR.
- All browser-only code paths are gated by `typeof window !== 'undefined'`.

## TypeScript

Full types ship as `.d.ts` next to the compiled `.svelte` / `.js` output. Re-exports:

```ts
import type {
  FeedbackHandle,
  FeedbackStatus,
  // from @tatlacas/brevwick-sdk, re-exported for convenience:
  BrevwickConfig,
  FeedbackAttachment,
  FeedbackInput,
  SubmitResult,
} from '@tatlacas/brevwick-svelte';
```

## Bundle

- Zero initial cost on pages that don't mount `<FeedbackButton />`.
- The screenshot encoder (`modern-screenshot`) is dynamic-imported by the core SDK on first capture.
- `sideEffects: false` so bundlers tree-shake unused exports.

## Browser support

ES2020 evergreen (Chrome/Edge 90+, Firefox 90+, Safari 15+). Matches the core SDK.

## Links

- **Core SDK:** [`@tatlacas/brevwick-sdk`](https://www.npmjs.com/package/@tatlacas/brevwick-sdk)
- **React adapter:** [`@tatlacas/brevwick-react`](../react/README.md)
- **Example app:** [examples/svelte](../../examples/svelte)
- **Docs / dashboard:** [brevwick.dev](https://brevwick.dev)
- **Source:** [github.com/tatlacas-com/brevwick-sdk-js](https://github.com/tatlacas-com/brevwick-sdk-js)

## License

[MIT](../../LICENSE)
