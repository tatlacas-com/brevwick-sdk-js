# Brevwick JS SDK

[![npm (sdk)](https://img.shields.io/npm/v/@tatlacas/brevwick-sdk/beta?label=@tatlacas/brevwick-sdk%40beta)](https://www.npmjs.com/package/@tatlacas/brevwick-sdk)
[![npm (react)](https://img.shields.io/npm/v/@tatlacas/brevwick-react/beta?label=@tatlacas/brevwick-react%40beta)](https://www.npmjs.com/package/@tatlacas/brevwick-react)
[![npm (solid)](https://img.shields.io/npm/v/@tatlacas/brevwick-solid/beta?label=@tatlacas/brevwick-solid%40beta)](https://www.npmjs.com/package/@tatlacas/brevwick-solid)
[![npm (vue)](https://img.shields.io/npm/v/@tatlacas/brevwick-vue/beta?label=@tatlacas/brevwick-vue%40beta)](https://www.npmjs.com/package/@tatlacas/brevwick-vue)
[![npm (angular)](https://img.shields.io/npm/v/@tatlacas/brevwick-angular/beta?label=@tatlacas/brevwick-angular%40beta)](https://www.npmjs.com/package/@tatlacas/brevwick-angular)
[![npm (react-native)](https://img.shields.io/npm/v/@tatlacas/brevwick-react-native/beta?label=@tatlacas/brevwick-react-native%40beta)](https://www.npmjs.com/package/@tatlacas/brevwick-react-native)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)

Ship feedback from any browser app straight into clean, AI-formatted GitHub issues. Drop in a floating button, collect a description + screenshot + the console/network rings that preceded the bug, and Brevwick turns it all into a triage-ready issue on your repo.

> **Status — public beta.** Versions are `1.x.x-beta.N` on the `beta` dist-tag. The API defined here is the frozen public surface — breaking changes are possible before the `latest` cutover but will be called out in the changelog.

## Packages

| Package                                                      | Description                                                                                                   | API reference                                                        |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| [`@tatlacas/brevwick-sdk`](./packages/sdk)                   | Framework-agnostic core: submit, screenshot, rings.                                                           | [packages/sdk/README.md](./packages/sdk/README.md)                   |
| [`@tatlacas/brevwick-react`](./packages/react)               | Provider, floating FAB widget, and `useFeedback` hook for React 18+/19.                                       | [packages/react/README.md](./packages/react/README.md)               |
| [`@tatlacas/brevwick-solid`](./packages/solid)               | Provider, floating FAB widget, and `useFeedback` hook for Solid 1.8+.                                         | [packages/solid/README.md](./packages/solid/README.md)               |
| [`@tatlacas/brevwick-vue`](./packages/vue)                   | Plugin, floating FAB component, and `useFeedback` composable for Vue 3.4+.                                    | [packages/vue/README.md](./packages/vue/README.md)                   |
| [`@tatlacas/brevwick-svelte`](./packages/svelte)             | Context setter, FAB, and `getFeedback()` for Svelte 5 and SvelteKit.                                          | [packages/svelte/README.md](./packages/svelte/README.md)             |
| [`@tatlacas/brevwick-angular`](./packages/angular)           | `provideBrevwick`, `BrevwickService`, and `bw-feedback-button` standalone component for Angular 17+.          | [packages/angular/README.md](./packages/angular/README.md)           |
| [`@tatlacas/brevwick-react-native`](./packages/react-native) | Provider, `useFeedback` hook, route-ring helper, and native screenshot path for Expo SDK 51+ / bare RN 0.72+. | [packages/react-native/README.md](./packages/react-native/README.md) |

## Install

Pick the one that matches your stack.

```bash
# Any browser app (framework-agnostic)
npm install @tatlacas/brevwick-sdk@beta

# React / Next.js / Remix — pulls @tatlacas/brevwick-sdk in as a peer dep
npm install @tatlacas/brevwick-react@beta @tatlacas/brevwick-sdk@beta

# Solid / SolidStart
npm install @tatlacas/brevwick-solid@beta @tatlacas/brevwick-sdk@beta solid-js

# Vue 3 / Nuxt — pulls @tatlacas/brevwick-sdk in as a peer dep
npm install @tatlacas/brevwick-vue@beta @tatlacas/brevwick-sdk@beta

# Angular 17+ standalone — pulls @tatlacas/brevwick-sdk in as a peer dep
npm install @tatlacas/brevwick-angular@beta @tatlacas/brevwick-sdk@beta

# Expo / bare React Native — pulls @tatlacas/brevwick-sdk in as a peer dep
npx expo install @tatlacas/brevwick-react-native @tatlacas/brevwick-sdk
```

Works with `pnpm add`, `yarn add`, `bun add` — same package names.

## Quick start

### React

```tsx
import { BrevwickProvider, FeedbackButton } from '@tatlacas/brevwick-react';

export default function App() {
  return (
    <BrevwickProvider config={{ projectKey: 'pk_live_...' }}>
      <YourApp />
      <FeedbackButton />
    </BrevwickProvider>
  );
}
```

That's it. A floating action button appears in the bottom-right; clicking it opens a feedback dialog with screenshot capture, file attachments, and your project's AI formatting (if enabled).

Full API and theming → [packages/react/README.md](./packages/react/README.md).

### Solid / SolidStart

```tsx
import { BrevwickProvider, FeedbackButton } from '@tatlacas/brevwick-solid';

export default function App() {
  return (
    <BrevwickProvider config={{ projectKey: 'pk_live_...' }}>
      <YourApp />
      <FeedbackButton />
    </BrevwickProvider>
  );
}
```

Full API → [packages/solid/README.md](./packages/solid/README.md).

### Vue

```ts
// main.ts
import { createApp } from 'vue';
import { BrevwickPlugin } from '@tatlacas/brevwick-vue';
import App from './App.vue';

createApp(App).use(BrevwickPlugin, { projectKey: 'pk_live_...' }).mount('#app');
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

Nuxt users: register the plugin in a `~/plugins/brevwick.client.ts` file so it only runs in the browser.

Full API and theming → [packages/vue/README.md](./packages/vue/README.md).

### Angular

```ts
// main.ts
import { bootstrapApplication } from '@angular/platform-browser';
import { provideBrevwick } from '@tatlacas/brevwick-angular';
import { AppComponent } from './app/app.component';

bootstrapApplication(AppComponent, {
  providers: [provideBrevwick({ projectKey: 'pk_live_...' })],
});
```

```ts
// app.component.ts
import { Component } from '@angular/core';
import { BwFeedbackButtonComponent } from '@tatlacas/brevwick-angular';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [BwFeedbackButtonComponent],
  template: '<bw-feedback-button />',
})
export class AppComponent {}
```

Full API → [packages/angular/README.md](./packages/angular/README.md).

### React Native (Expo + bare)

```tsx
import { useMemo } from 'react';
import {
  NavigationContainer,
  useNavigationContainerRef,
} from '@react-navigation/native';
import { BrevwickProvider } from '@tatlacas/brevwick-react-native';

export default function App() {
  const navigationRef = useNavigationContainerRef();
  const config = useMemo(() => ({ projectKey: 'pk_live_...' }), []);

  return (
    <BrevwickProvider config={config} navigationRef={navigationRef}>
      <NavigationContainer ref={navigationRef}>
        <YourStack />
      </NavigationContainer>
    </BrevwickProvider>
  );
}
```

Build a custom feedback UI with `useFeedback()` (the drop-in `<FeedbackButton />` lands with #88), wire the React Navigation route ring by rendering `useRouteRing()` inside the provider, and capture screenshots via the optional `react-native-view-shot` peer.

Full API → [packages/react-native/README.md](./packages/react-native/README.md).

### Vanilla / any framework

```ts
import { createBrevwick } from '@tatlacas/brevwick-sdk';

const bw = createBrevwick({
  projectKey: 'pk_live_...',
  buildSha: process.env.BUILD_SHA,
});
bw.install(); // starts capturing console + network + route rings

document.querySelector('#report').addEventListener('click', async () => {
  const result = await bw.submit({
    description: 'Checkout hangs on second attempt',
    expected: 'Order completes',
    actual: 'Spinner forever',
    attachments: [await bw.captureScreenshot()],
  });

  if (result.ok) console.log('Filed', result.issue_id);
  else console.error(result.error.code, result.error.message);
});
```

Full API → [packages/sdk/README.md](./packages/sdk/README.md).

## Why Brevwick

- **Capture-first.** Core eager bundle is **< 8 kB gzip** and includes the console + network rings — they're live the instant `install()` returns so any error or failing fetch from app bootstrap onwards lands in the buffer, ready to ride along when the user files the issue. The screenshot encoder (`modern-screenshot`) and the submit pipeline are dynamic-imported on demand — on-widget-open budget is **< 25 kB gzip**.
- **Privacy-first.** Every payload is redacted client-side before it leaves the device — common secrets (Bearer tokens, cookies, email addresses, credit-card patterns) are stripped from console output, network bodies, and routes before anything is sent. Elements tagged with `data-brevwick-skip` are hidden in screenshots.
- **Typed end-to-end.** Full TypeScript types for config, submit input, results, and errors. `submit()` never throws — it resolves to a tagged `{ ok: true, issue_id }` / `{ ok: false, error }` so you handle failures explicitly.
- **SSR-safe.** All browser APIs are behind `typeof window` / `typeof document` guards; SSR renders cleanly and rings activate on first client mount.

## Browser support

ES2020 targets — modern evergreen browsers (Chrome/Edge 90+, Firefox 90+, Safari 15+). No IE, no transpile-down. Node is a build-time dependency only; the SDK runs in the browser.

## Links

- **Docs / dashboard:** [brevwick.dev](https://brevwick.dev)
- **API reference (core):** [packages/sdk/README.md](./packages/sdk/README.md)
- **API reference (React):** [packages/react/README.md](./packages/react/README.md)
- **API reference (Solid):** [packages/solid/README.md](./packages/solid/README.md)
- **API reference (Vue):** [packages/vue/README.md](./packages/vue/README.md)
- **API reference (Angular):** [packages/angular/README.md](./packages/angular/README.md)
- **API reference (React Native):** [packages/react-native/README.md](./packages/react-native/README.md)
- **Issues & feature requests:** [github.com/tatlacas-com/brevwick-sdk-js/issues](https://github.com/tatlacas-com/brevwick-sdk-js/issues)
- **Contributing:** [CONTRIBUTING.md](./CONTRIBUTING.md)
- **License:** [MIT](./LICENSE)
