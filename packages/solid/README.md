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
