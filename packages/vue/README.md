# @tatlacas/brevwick-vue

[![npm](https://img.shields.io/npm/v/@tatlacas/brevwick-vue/beta?label=@tatlacas/brevwick-vue%40beta)](https://www.npmjs.com/package/@tatlacas/brevwick-vue)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](../../LICENSE)

Vue 3 bindings for [Brevwick](https://brevwick.dev) — a plugin, a drop-in floating feedback button, and a `useFeedback` composable for custom UIs.

Wraps [`@tatlacas/brevwick-sdk`](https://www.npmjs.com/package/@tatlacas/brevwick-sdk) — all configuration and submit semantics live there. This package adds the Vue ergonomics.

## Install

```bash
npm install @tatlacas/brevwick-vue@beta @tatlacas/brevwick-sdk@beta
```

`@tatlacas/brevwick-sdk` is a peer dependency. Installers that respect peer deps (npm 7+, pnpm, yarn 3+) will pull it in automatically.

**Vue:** 3.4+ is supported.

## Quick start

```ts
// main.ts
import { createApp } from 'vue';
import { BrevwickPlugin } from '@tatlacas/brevwick-vue';
import App from './App.vue';

const app = createApp(App);
app.use(BrevwickPlugin, { projectKey: 'pk_live_...' });
app.mount('#app');
```

```vue
<!-- App.vue -->
<script setup lang="ts">
import { FeedbackButton } from '@tatlacas/brevwick-vue';
</script>

<template>
  <YourApp />
  <FeedbackButton />
</template>
```

That's it. A vertical feedback tab appears on the right edge of the viewport (pass `position="bottom-right"` for the legacy corner bubble); clicking it opens a feedback dialog with screenshot capture and submit.

## `BrevwickPlugin`

Vue plugin that creates a single SDK instance and provides it to descendants via `provide`/`inject`. SSR-safe: no SDK is created when `window` is undefined; the plugin re-runs on client hydration.

```ts
app.use(BrevwickPlugin, {
  projectKey: 'pk_live_...',
  endpoint: 'https://api.brevwick.dev',
  environment: 'production',
});
```

The plugin calls `sdk.install()` after mount (attaches global ring listeners — network, console, visibility) and `sdk.uninstall()` on `app.unmount()`.

## `FeedbackButton`

A feedback launcher + dialog. The launcher renders as a vertical tab flush against the right viewport edge by default, or as the classic floating corner bubble via `variant="bubble"`. The dialog has a textarea, a screenshot capture button, and a send button.

```vue
<!-- Default: vertical tab on the right edge, vertically centered. -->
<FeedbackButton label="Report a bug" />

<!-- Legacy floating corner bubble. -->
<FeedbackButton variant="bubble" position="bottom-right" label="Report a bug" />

<!-- Icon-only tab, nudged 120px above the vertical center. The label
     becomes the launcher's aria-label. -->
<FeedbackButton compact :offset="-120" label="Report a bug" />
```

> **Migration:** the default presentation changed from the corner bubble to the right-edge tab. Pass `position="bottom-right"` (or your previous corner) to keep the old look — a legacy corner `position` without an explicit `variant` still renders the bubble, so existing call sites are unaffected.

### Props

| Prop        | Type                                                   | Default                                     | Description                                                                                                                                                                          |
| ----------- | ------------------------------------------------------ | ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `variant`   | `'tab' \| 'bubble'`                                    | `'tab'`                                     | Launcher presentation — vertical edge tab (the new default) or the legacy floating corner pill. A legacy corner `position` without an explicit `variant` implies `'bubble'`.         |
| `position`  | `'right' \| 'left' \| 'bottom-right' \| 'bottom-left'` | `'right'` (tab) / `'bottom-right'` (bubble) | Where the launcher sits. Edge sides are the tab's home, corners the bubble's. When `variant` and `position` disagree, `variant` wins and `position` contributes its horizontal side. |
| `compact`   | `boolean`                                              | `false`                                     | Icon-only launcher (circular bubble / square edge tab). The `label` is not rendered but becomes the launcher's `aria-label`.                                                         |
| `offset`    | `number`                                               | `0`                                         | Tab only: vertical offset in px from the viewport's vertical center. Positive moves the tab down, negative up. Ignored for the bubble.                                               |
| `disabled`  | `boolean`                                              | `false`                                     | Launcher renders as disabled and cannot open the dialog.                                                                                                                             |
| `hidden`    | `boolean`                                              | `false`                                     | Component renders nothing — useful for feature flags.                                                                                                                                |
| `className` | `string`                                               | —                                           | Appended to the launcher and dialog root for styling overrides.                                                                                                                      |
| `label`     | `string`                                               | `'Feedback'`                                | Launcher label text. Hidden visually when `compact`.                                                                                                                                 |
| `theme`     | `'system' \| 'light' \| 'dark'`                        | `'system'`                                  | Force a palette regardless of OS `prefers-color-scheme`.                                                                                                                             |
| `onSubmit`  | `(result: SubmitResult) => void`                       | —                                           | Fired after every submit (success or failure).                                                                                                                                       |

### Theming via CSS custom properties

Override on any ancestor (`:root`, your app shell, etc.). Every widget rule reads tokens through `var(--brw-X, var(--brw-X-base))`, so public overrides always win — even under a forced `theme="light|dark"`.

| Token                | Surface                               |
| -------------------- | ------------------------------------- |
| `--brw-panel-bg`     | Dialog panel background               |
| `--brw-fg`           | Primary foreground text               |
| `--brw-fg-muted`     | Muted / secondary text                |
| `--brw-border`       | Default border colour                 |
| `--brw-border-focus` | Applied on `:focus-visible`           |
| `--brw-divider`      | Hairline between header / actions     |
| `--brw-accent`       | Send button + FAB background          |
| `--brw-accent-fg`    | Foreground on top of accent           |
| `--brw-chip-bg`      | Screenshot chip background            |
| `--brw-shadow`       | Composite drop shadow for FAB + panel |

```css
:root {
  --brw-accent: #7c3aed;
  --brw-accent-fg: #ffffff;
  --brw-panel-bg: #0b0b0c;
}
```

### Hiding sensitive content from screenshots

The widget captures the page via `@tatlacas/brevwick-sdk`'s `captureScreenshot()`. Any element tagged `data-brevwick-skip` is hidden before capture and restored after:

```vue
<input data-brevwick-skip type="password" />
<div data-brevwick-skip>{{ customerEmail }}</div>
```

The FAB, panel, and backdrop all carry `data-brevwick-skip` themselves, so they never appear in the screenshots they capture.

## `useFeedback`

Composable for building a custom feedback UI against the plugin-provided SDK instance.

```vue
<script setup lang="ts">
import { useFeedback } from '@tatlacas/brevwick-vue';

const { submit, captureScreenshot, status, reset } = useFeedback();

async function handleReport() {
  const shot = await captureScreenshot();
  const result = await submit({
    description: 'Dashboard crash after filter change',
    attachments: [shot],
  });
  if (!result.ok) alert(result.error.message);
}
</script>

<template>
  <button :disabled="status === 'submitting'" @click="handleReport">
    {{ status === 'submitting' ? 'Sending…' : 'Report bug' }}
  </button>
  <p v-if="status === 'success'">
    Thanks! <button @click="reset">Send another</button>
  </p>
</template>
```

### Return value

| Field               | Type                                                  | Description                                                                                                                                                                                                                                                      |
| ------------------- | ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `submit`            | `(input: FeedbackInput) => Promise<SubmitResult>`     | Submit feedback. Returns the same tagged union the core SDK returns.                                                                                                                                                                                             |
| `captureScreenshot` | `() => Promise<Blob>`                                 | Capture a DOM screenshot via the core SDK (dynamic import). Rasterization errors are caught and a placeholder blob is returned, but the dynamic import itself can still reject if the chunk fails to load — wrap calls in `try/catch` if you render your own UI. |
| `status`            | `Ref<'idle' \| 'submitting' \| 'success' \| 'error'>` | Reactive submission lifecycle.                                                                                                                                                                                                                                   |
| `reset`             | `() => void`                                          | Reset `status` back to `'idle'`. Does not cancel an in-flight submit.                                                                                                                                                                                            |

Throws synchronously when called outside `BrevwickPlugin` — including during SSR before client hydration.

## SSR safety

- `BrevwickPlugin.install` is `window`-guarded. On the server, no SDK is created and `provide()` carries a sentinel `null`. Client hydration re-runs the plugin install in a browser context.
- `<FeedbackButton>` defers all DOM access to `onMounted`. The injected `<style>` tag is dedupe-guarded by id so multiple FABs in one tree still produce one stylesheet.

### Nuxt

Wrap the plugin install in a client-only Nuxt plugin:

```ts
// plugins/brevwick.client.ts
import { BrevwickPlugin } from '@tatlacas/brevwick-vue';

export default defineNuxtPlugin((nuxtApp) => {
  nuxtApp.vueApp.use(BrevwickPlugin, {
    projectKey: useRuntimeConfig().public.brevwickKey,
  });
});
```

The `.client.ts` suffix tells Nuxt to skip this on the server, sidestepping the SSR window guard entirely.

## `BREVWICK_VUE_VERSION`

Exported semver string of the installed package — useful for including in error reports or diagnostics.

```ts
import { BREVWICK_VUE_VERSION } from '@tatlacas/brevwick-vue';
console.log('@tatlacas/brevwick-vue', BREVWICK_VUE_VERSION);
```

## TypeScript

Full types ship as `.d.ts` for both ESM and CJS. Re-exports:

```ts
import type {
  BrevwickPluginOptions,
  BrevwickTheme,
  FeedbackStatus,
  UseFeedbackResult,
  // from @tatlacas/brevwick-sdk, re-exported for convenience:
  BrevwickConfig,
  FeedbackAttachment,
  FeedbackInput,
  SubmitResult,
} from '@tatlacas/brevwick-vue';
```

## Bundle

- Eager bundle ≤ 5 kB gzip (enforced via `.size-limit.js` and `chunk-split.test.ts`).
- The screenshot encoder (`modern-screenshot`) is dynamic-imported by the core SDK on first capture — not on plugin install and not on FAB mount.
- `sideEffects: false` so bundlers tree-shake unused exports.

## Browser support

ES2020 evergreen (Chrome/Edge 90+, Firefox 90+, Safari 15+). Matches the core SDK.

## Links

- **Core SDK:** [`@tatlacas/brevwick-sdk`](https://www.npmjs.com/package/@tatlacas/brevwick-sdk)
- **Docs / dashboard:** [brevwick.dev](https://brevwick.dev)
- **Source:** [github.com/tatlacas-com/brevwick-sdk-js](https://github.com/tatlacas-com/brevwick-sdk-js)
- **Issues:** [github.com/tatlacas-com/brevwick-sdk-js/issues](https://github.com/tatlacas-com/brevwick-sdk-js/issues)

## License

[MIT](../../LICENSE)
