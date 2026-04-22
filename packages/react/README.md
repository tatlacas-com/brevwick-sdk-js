# brevwick-react

[![npm](https://img.shields.io/npm/v/brevwick-react/beta?label=brevwick-react%40beta)](https://www.npmjs.com/package/brevwick-react)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](../../LICENSE)

React bindings for [Brevwick](https://brevwick.dev) — a provider, a drop-in floating feedback button, and a `useFeedback` hook for custom UIs.

Wraps [`brevwick-sdk`](https://www.npmjs.com/package/brevwick-sdk) — all configuration and submit semantics live there. This package adds the React ergonomics.

## Install

```bash
npm install brevwick-react@beta brevwick-sdk@beta
```

`brevwick-sdk` is a peer dependency. Installers that respect peer deps (npm 7+, pnpm, yarn 3+) will pull it in automatically.

**React:** 18.x and 19.x are supported.

## Quick start

### Drop-in floating button

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

### Next.js App Router

```tsx
// app/providers.tsx
'use client';

import { BrevwickProvider, FeedbackButton } from 'brevwick-react';

const config = { projectKey: 'pk_live_...' };

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <BrevwickProvider config={config}>
      {children}
      <FeedbackButton />
    </BrevwickProvider>
  );
}
```

```tsx
// app/layout.tsx
import { Providers } from './providers';

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
```

> **Hoist `config` to module scope or memoise with `useMemo`.** The provider keys the underlying SDK instance on config identity — passing a new literal each render would cycle `install`/`uninstall` on every render.

## `BrevwickProvider`

Top-level provider. Creates a single SDK instance, installs rings on mount, uninstalls on unmount.

```tsx
<BrevwickProvider config={brevwickConfig}>{children}</BrevwickProvider>
```

| Prop       | Type             | Description                                                                                                                                          |
| ---------- | ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `config`   | `BrevwickConfig` | SDK config — see the [core SDK config reference](https://www.npmjs.com/package/brevwick-sdk#brevwickconfig). **Reference-stable**: hoist or memoise. |
| `children` | `ReactNode`      | Your tree.                                                                                                                                           |

## `FeedbackButton`

A floating action button + chat-style feedback dialog. Opens to a composer with:

- **Textarea** with Enter-to-send (Shift+Enter for newline).
- **Screenshot** capture with region-select overlay (drag a rectangle, or "Capture full page").
- **File attachments** via paperclip icon.
- **Optional "Expected vs Actual"** disclosure.
- **Optional AI-format toggle** (only visible when the project allows per-submitter choice).
- **Success / error** inline states with "Send another" reset.

```tsx
<FeedbackButton position="bottom-right" label="Report a bug" />
```

### Props

| Prop        | Type                              | Default          | Description                                                                        |
| ----------- | --------------------------------- | ---------------- | ---------------------------------------------------------------------------------- |
| `position`  | `'bottom-right' \| 'bottom-left'` | `'bottom-right'` | Which corner the FAB pins to.                                                      |
| `disabled`  | `boolean`                         | `false`          | FAB renders as disabled and cannot open the dialog.                                |
| `hidden`    | `boolean`                         | `false`          | Component renders nothing — useful for feature flags.                              |
| `className` | `string`                          | —                | Appended to the FAB and dialog root for styling overrides.                         |
| `label`     | `ReactNode`                       | `'Feedback'`     | FAB label (can be a string or any React node).                                     |
| `theme`     | `'system' \| 'light' \| 'dark'`   | `'system'`       | Force a palette regardless of OS `prefers-color-scheme`.                           |
| `onSubmit`  | `(result: SubmitResult) => void`  | —                | Fired after every submit (success or failure). Use for analytics or custom toasts. |

### Theming via CSS custom properties

Override on any ancestor (`:root`, your app shell, etc.). Every widget rule reads tokens through `var(--brw-X, var(--brw-X-base))`, so public overrides always win — even under a forced `theme="light|dark"`.

**Surfaces**

- `--brw-panel-bg` — dialog panel background
- `--brw-bubble-assistant-bg` — assistant (greeting) bubble background
- `--brw-bubble-user-bg` — user bubble background
- `--brw-bubble-user-fg` — foreground on top of `--brw-bubble-user-bg` (pair with `--brw-bubble-user-bg` for WCAG contrast)
- `--brw-chip-bg` — attachment chip + inline panel background
- `--brw-composer-bg` — composer shell background

**Text**

- `--brw-fg` — primary foreground text
- `--brw-fg-muted` — muted / secondary text

**Border / focus**

- `--brw-border` — default border colour
- `--brw-border-focus` — applied on composer `:focus-within`
- `--brw-divider` — hairline between panel header / composer and thread

**Accent**

- `--brw-accent` — send button + active AI toggle colour
- `--brw-accent-fg` — foreground on top of accent (pair for contrast)

**Shadow**

- `--brw-shadow` — composite drop shadow for FAB + panel

Example:

```css
:root {
  --brw-accent: #7c3aed;
  --brw-accent-fg: #ffffff;
  --brw-panel-bg: #0b0b0c;
}
```

### Hiding sensitive content from screenshots

The widget captures the page via `brevwick-sdk`'s `captureScreenshot()`. Any element tagged `data-brevwick-skip` is hidden before capture and restored after:

```tsx
<input data-brevwick-skip type="password" />
<div data-brevwick-skip>{customerEmail}</div>
```

The FAB, dialog, and region overlay all carry `data-brevwick-skip` themselves, so they never appear in the screenshots they capture.

## `useFeedback`

Hook for building a custom feedback UI against the `BrevwickProvider` instance.

```tsx
import { useFeedback } from 'brevwick-react';

function MyCustomReporter() {
  const { submit, captureScreenshot, status, reset } = useFeedback();

  async function handleReport() {
    const shot = await captureScreenshot();
    const result = await submit({
      description: 'Dashboard crash after filter change',
      attachments: [shot],
    });
    if (!result.ok) alert(result.error.message);
  }

  return (
    <>
      <button onClick={handleReport} disabled={status === 'submitting'}>
        {status === 'submitting' ? 'Sending…' : 'Report bug'}
      </button>
      {status === 'success' && (
        <p>
          Thanks! <button onClick={reset}>Send another</button>
        </p>
      )}
    </>
  );
}
```

### Return value

| Field               | Type                                              | Description                                                                |
| ------------------- | ------------------------------------------------- | -------------------------------------------------------------------------- |
| `submit`            | `(input: FeedbackInput) => Promise<SubmitResult>` | Submit feedback. Returns the same tagged union `brevwick-sdk` returns.     |
| `captureScreenshot` | `() => Promise<Blob>`                             | Capture a DOM screenshot. Never throws — returns a placeholder on failure. |
| `status`            | `'idle' \| 'submitting' \| 'success' \| 'error'`  | Current submission lifecycle.                                              |
| `reset`             | `() => void`                                      | Reset `status` back to `'idle'`. Does not cancel an in-flight submit.      |

Throws synchronously on mount when rendered outside a `BrevwickProvider`.

## `BREVWICK_REACT_VERSION`

Exported semver string of the installed package — useful for including in error reports or diagnostics.

```ts
import { BREVWICK_REACT_VERSION } from 'brevwick-react';
console.log('brevwick-react', BREVWICK_REACT_VERSION);
```

## SSR

- The provider is `'use client'` in RSC terms — mount it inside a client boundary (e.g. a `providers.tsx` shell).
- Ring installation is gated on mount, so server rendering is a no-op.
- `FeedbackButton` is also `'use client'`. The `<style>` tag it injects is guarded against duplicates and survives Fast Refresh.

## TypeScript

Full types ship as `.d.ts` for both ESM and CJS. Re-exports:

```ts
import type {
  BrevwickProviderProps,
  FeedbackButtonProps,
  BrevwickTheme,
  FeedbackStatus,
  UseFeedbackResult,
  // from brevwick-sdk, re-exported for convenience:
  BrevwickConfig,
  FeedbackAttachment,
  FeedbackInput,
  SubmitResult,
} from 'brevwick-react';
```

## Bundle

- Zero initial cost on pages that don't mount `<FeedbackButton />`.
- The screenshot encoder (`modern-screenshot`) is dynamic-imported on first capture — not on button open and not on provider mount.
- `sideEffects: false` so bundlers tree-shake unused exports.

## Browser support

ES2020 evergreen (Chrome/Edge 90+, Firefox 90+, Safari 15+). Matches the core SDK.

## Links

- **Core SDK:** [`brevwick-sdk`](https://www.npmjs.com/package/brevwick-sdk)
- **Docs / dashboard:** [brevwick.dev](https://brevwick.dev)
- **Source:** [github.com/tatlacas-com/brevwick-sdk-js](https://github.com/tatlacas-com/brevwick-sdk-js)
- **Issues:** [github.com/tatlacas-com/brevwick-sdk-js/issues](https://github.com/tatlacas-com/brevwick-sdk-js/issues)

## License

[MIT](../../LICENSE)
