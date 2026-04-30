# @tatlacas/brevwick-react

[![npm](https://img.shields.io/npm/v/@tatlacas/brevwick-react/beta?label=@tatlacas/brevwick-react%40beta)](https://www.npmjs.com/package/@tatlacas/brevwick-react)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](../../LICENSE)

React bindings for [Brevwick](https://brevwick.dev) — a provider, a drop-in floating feedback button, and a `useFeedback` hook for custom UIs.

Wraps [`@tatlacas/brevwick-sdk`](https://www.npmjs.com/package/@tatlacas/brevwick-sdk) — all configuration and submit semantics live there. This package adds the React ergonomics.

## Install

```bash
npm install @tatlacas/brevwick-react@beta @tatlacas/brevwick-sdk@beta
```

`@tatlacas/brevwick-sdk` is a peer dependency. Installers that respect peer deps (npm 7+, pnpm, yarn 3+) will pull it in automatically.

**React:** 18.x and 19.x are supported.

## Quick start

### Drop-in floating button

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

### Next.js App Router

```tsx
// app/providers.tsx
'use client';

import { BrevwickProvider, FeedbackButton } from '@tatlacas/brevwick-react';

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

### Plain React (Vite + CRA)

Both Vite and Create React App are SPAs — no SSR, no client/server boundary. Wrap your tree in `<BrevwickProvider>` once at the app root and drop `<FeedbackButton />` next to it. The only thing that differs between the two is the env-var prefix.

```bash
pnpm add @tatlacas/brevwick-react @tatlacas/brevwick-sdk modern-screenshot
```

```tsx
// src/App.tsx — works in both Vite and CRA.
import { BrevwickProvider, FeedbackButton } from '@tatlacas/brevwick-react';

const config = {
  // Vite:
  projectKey: import.meta.env.VITE_BREVWICK_PROJECT_KEY,
  // CRA:
  // projectKey: process.env.REACT_APP_BREVWICK_PROJECT_KEY,
};

export function App() {
  return (
    <BrevwickProvider config={config}>
      <YourApp />
      <FeedbackButton />
    </BrevwickProvider>
  );
}
```

**Env-var convention:**

| Tool | Variable                         | Read in code                                 |
| ---- | -------------------------------- | -------------------------------------------- |
| Vite | `VITE_BREVWICK_PROJECT_KEY`      | `import.meta.env.VITE_BREVWICK_PROJECT_KEY`  |
| CRA  | `REACT_APP_BREVWICK_PROJECT_KEY` | `process.env.REACT_APP_BREVWICK_PROJECT_KEY` |

Both prefixes are required — Vite and CRA refuse to expose any env var that doesn't carry their prefix to the client bundle, by design.

> CRA is in maintenance mode. For new projects we recommend Vite; the wiring above works identically in both.

SSR-safety doesn't apply here — Vite and CRA always render on the client. The provider's `'use client'` boundary is a no-op in an SPA.

End-to-end runnable apps: [`examples/vite-react`](https://github.com/tatlacas-com/brevwick-sdk-js/tree/main/examples/vite-react), [`examples/cra`](https://github.com/tatlacas-com/brevwick-sdk-js/tree/main/examples/cra).

### Remix

Remix server-renders the document, but the provider is SSR-safe — `createBrevwick` runs in `useMemo` and the rings install in `useEffect`, so the SDK is a no-op on the server. Mount the provider inside `app/root.tsx`'s `<Layout>` so it wraps the `<Outlet />`: every route reached via the outlet is inside the provider, and `useFeedback()` works in any of them.

```bash
pnpm add @tatlacas/brevwick-react @tatlacas/brevwick-sdk modern-screenshot
```

```tsx
// app/configured-widget.tsx
import { BrevwickProvider, FeedbackButton } from '@tatlacas/brevwick-react';
import type { ReactNode } from 'react';

const projectKey = process.env.REMIX_PUBLIC_BREVWICK_PROJECT_KEY ?? '';
const config = { projectKey };

export function ConfiguredWidget({ children }: { children: ReactNode }) {
  if (!projectKey) return <>{children}</>;
  return (
    <BrevwickProvider config={config}>
      {children}
      <FeedbackButton />
    </BrevwickProvider>
  );
}
```

```tsx
// app/root.tsx
import {
  Outlet,
  Links,
  Meta,
  Scripts,
  ScrollRestoration,
} from '@remix-run/react';
import { ConfiguredWidget } from './configured-widget.client';

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <Meta />
        <Links />
      </head>
      <body>
        <ConfiguredWidget>{children}</ConfiguredWidget>
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export default function App() {
  return <Outlet />;
}
```

**Env-var convention:** Remix exposes anything you pass through `process.env` at build time. By convention, vars meant for the client tree carry a `REMIX_PUBLIC_` prefix; everything else stays server-only and never lands in the bundle.

End-to-end runnable app: [`examples/remix`](https://github.com/tatlacas-com/brevwick-sdk-js/tree/main/examples/remix).

## `BrevwickProvider`

Top-level provider. Creates a single SDK instance, installs rings on mount, uninstalls on unmount.

```tsx
<BrevwickProvider config={brevwickConfig}>{children}</BrevwickProvider>
```

| Prop       | Type             | Description                                                                                                                                                    |
| ---------- | ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `config`   | `BrevwickConfig` | SDK config — see the [core SDK config reference](https://www.npmjs.com/package/@tatlacas/brevwick-sdk#brevwickconfig). **Reference-stable**: hoist or memoise. |
| `children` | `ReactNode`      | Your tree.                                                                                                                                                     |

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

The widget captures the page via `@tatlacas/brevwick-sdk`'s `captureScreenshot()`. Any element tagged `data-brevwick-skip` is hidden before capture and restored after:

```tsx
<input data-brevwick-skip type="password" />
<div data-brevwick-skip>{customerEmail}</div>
```

The FAB, dialog, and region overlay all carry `data-brevwick-skip` themselves, so they never appear in the screenshots they capture.

## `useFeedback`

Hook for building a custom feedback UI against the `BrevwickProvider` instance.

```tsx
import { useFeedback } from '@tatlacas/brevwick-react';

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

| Field               | Type                                              | Description                                                                      |
| ------------------- | ------------------------------------------------- | -------------------------------------------------------------------------------- |
| `submit`            | `(input: FeedbackInput) => Promise<SubmitResult>` | Submit feedback. Returns the same tagged union `@tatlacas/brevwick-sdk` returns. |
| `captureScreenshot` | `() => Promise<Blob>`                             | Capture a DOM screenshot. Never throws — returns a placeholder on failure.       |
| `status`            | `'idle' \| 'submitting' \| 'success' \| 'error'`  | Current submission lifecycle.                                                    |
| `reset`             | `() => void`                                      | Reset `status` back to `'idle'`. Does not cancel an in-flight submit.            |

Throws synchronously on mount when rendered outside a `BrevwickProvider`.

## `BREVWICK_REACT_VERSION`

Exported semver string of the installed package — useful for including in error reports or diagnostics.

```ts
import { BREVWICK_REACT_VERSION } from '@tatlacas/brevwick-react';
console.log('@tatlacas/brevwick-react', BREVWICK_REACT_VERSION);
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
  // from @tatlacas/brevwick-sdk, re-exported for convenience:
  BrevwickConfig,
  FeedbackAttachment,
  FeedbackInput,
  SubmitResult,
} from '@tatlacas/brevwick-react';
```

## Bundle

- Zero initial cost on pages that don't mount `<FeedbackButton />`.
- The screenshot encoder (`modern-screenshot`) is dynamic-imported on first capture — not on button open and not on provider mount.
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
