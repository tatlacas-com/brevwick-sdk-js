# `@tatlacas/brevwick-solid`

[Solid](https://www.solidjs.com) bindings for [Brevwick](https://brevwick.dev) —
a `<BrevwickProvider>`, a floating `<FeedbackButton>`, and a `useFeedback()`
hook for the imperative path.

Works in any Solid app: SolidStart, Vite + Solid SPA, Astro + Solid islands.

## Install

```bash
pnpm add @tatlacas/brevwick-solid @tatlacas/brevwick-sdk solid-js
```

`@tatlacas/brevwick-sdk` and `solid-js` are peer dependencies — your bundler
deduplicates them with the rest of your app.

## Quick start

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

## Launcher presentation

`<FeedbackButton>` defaults to a vertical tab flush against the right
viewport edge, vertically centered (`variant="tab"`). The legacy floating
corner bubble is still available:

```tsx
// Right-edge tab (the default). `offset` nudges it from the vertical
// center in px (positive = down); `compact` renders an icon-only square
// tab and the string `label` becomes the aria-label.
<FeedbackButton compact offset={-120} label="Report a bug" />

// Legacy floating corner bubble.
<FeedbackButton variant="bubble" position="bottom-right" />
```

`position` accepts the edge sides `'right' | 'left'` (default `'right'`)
plus the legacy corners `'bottom-right' | 'bottom-left'`. When `variant`
and `position` disagree, `variant` wins and `position` contributes only
its horizontal side.

> **Migration:** the default presentation changed from the corner bubble
> to the right-edge tab. Pass `position="bottom-right"` (or your previous
> corner) to keep the old look — a legacy corner `position` without an
> explicit `variant` still renders the bubble, so existing call sites are
> unaffected.

## Imperative submit

```tsx
import { useFeedback } from '@tatlacas/brevwick-solid';

export default function ReportButton() {
  const { submit, status } = useFeedback();
  return (
    <button onClick={() => submit({ description: 'broken!' })}>
      {status() === 'submitting' ? 'Sending…' : 'Report'}
    </button>
  );
}
```

`status` is a Solid `Accessor` — call it inline in JSX for fine-grained
reactive updates.

## SSR / SolidStart

The provider mounts the SDK inside `onMount`, so server rendering emits no
Brevwick state and the SDK installs only after client hydration. The
`<FeedbackButton>` is gated on the same boundary, so the FAB never appears
in server-rendered markup. Drop both into your root layout — no wrapping
`<Show>` or `isServer` checks needed at the call site.

## Compile-time JSX (Solid `solid` export condition)

The package ships a `"solid"` export condition pointing at the unbuilt
`.tsx` source. Bundlers that resolve the `solid` condition (Vite +
`vite-plugin-solid`, SolidStart) pick up the source and run
`babel-preset-solid` themselves so the reactivity graph stays inline.
Bundlers that don't (plain Webpack, Rollup) fall through to the
pre-transformed `dist/index.js` and still get a working binding.

## Theming

The widget exposes the same `--brw-*` CSS custom properties as
`@tatlacas/brevwick-react`. Set them on `:root` (or any ancestor) to
re-theme the FAB and panel without rebuilding.

## License

MIT
