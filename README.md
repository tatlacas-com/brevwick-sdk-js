# Brevwick JS SDK

[![npm (sdk)](https://img.shields.io/npm/v/brevwick-sdk/beta?label=brevwick-sdk%40beta)](https://www.npmjs.com/package/brevwick-sdk)
[![npm (react)](https://img.shields.io/npm/v/brevwick-react/beta?label=brevwick-react%40beta)](https://www.npmjs.com/package/brevwick-react)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)

Ship feedback from any browser app straight into clean, AI-formatted GitHub issues. Drop in a floating button, collect a description + screenshot + the console/network rings that preceded the bug, and Brevwick turns it all into a triage-ready issue on your repo.

> **Status — public beta.** Versions are `1.x.x-beta.N` on the `beta` dist-tag. The API defined here is the frozen surface per the [SDK contract](https://github.com/tatlacas-com/brevwick-ops/blob/main/docs/brevwick-sdd.md#12-client-sdk-contracts) — breaking changes are possible before the `latest` cutover but will be called out in the changelog.

## Packages

| Package                              | Description                                                             | API reference                                          |
| ------------------------------------ | ----------------------------------------------------------------------- | ------------------------------------------------------ |
| [`brevwick-sdk`](./packages/sdk)     | Framework-agnostic core: submit, screenshot, rings.                     | [packages/sdk/README.md](./packages/sdk/README.md)     |
| [`brevwick-react`](./packages/react) | Provider, floating FAB widget, and `useFeedback` hook for React 18+/19. | [packages/react/README.md](./packages/react/README.md) |

## Install

Pick the one that matches your stack.

```bash
# Any browser app (framework-agnostic)
npm install brevwick-sdk@beta

# React / Next.js / Remix — pulls brevwick-sdk in as a peer dep
npm install brevwick-react@beta brevwick-sdk@beta
```

Works with `pnpm add`, `yarn add`, `bun add` — same package names.

## Quick start

### React

```tsx
import { BrevwickProvider, FeedbackButton } from 'brevwick-react';

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

### Vanilla / any framework

```ts
import { createBrevwick } from 'brevwick-sdk';

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

- **Zero-cost until engaged.** Core bundle is **< 2.2 kB gzip**. The screenshot encoder (`modern-screenshot`) is dynamic-imported and only loads when the user opens the widget — on-open budget is **< 25 kB gzip**.
- **Privacy-first.** Every payload is redacted client-side before it leaves the device — common secrets (Bearer tokens, cookies, email addresses, credit-card patterns) are stripped from console output, network bodies, and routes before anything is sent. Elements tagged with `data-brevwick-skip` are hidden in screenshots.
- **Typed end-to-end.** Full TypeScript types for config, submit input, results, and errors. `submit()` never throws — it resolves to a tagged `{ ok: true, issue_id }` / `{ ok: false, error }` so you handle failures explicitly.
- **SSR-safe.** All browser APIs are behind `typeof window` / `typeof document` guards; SSR renders cleanly and rings activate on first client mount.

## Browser support

ES2020 targets — modern evergreen browsers (Chrome/Edge 90+, Firefox 90+, Safari 15+). No IE, no transpile-down. Node is a build-time dependency only; the SDK runs in the browser.

## Links

- **Docs / dashboard:** [brevwick.dev](https://brevwick.dev)
- **API reference (core):** [packages/sdk/README.md](./packages/sdk/README.md)
- **API reference (React):** [packages/react/README.md](./packages/react/README.md)
- **Issues & feature requests:** [github.com/tatlacas-com/brevwick-sdk-js/issues](https://github.com/tatlacas-com/brevwick-sdk-js/issues)
- **Contributing:** [CONTRIBUTING.md](./CONTRIBUTING.md)
- **License:** [MIT](./LICENSE)
