# brevwick-example-astro

Minimal Astro example using a React island to mount
[`@tatlacas/brevwick-react`](../../packages/react)'s `<BrevwickProvider>` and
`<FeedbackButton>`.

## Run locally

1. From the repo root, install and build the SDKs:
   ```bash
   pnpm install
   pnpm --filter @tatlacas/brevwick-sdk --filter @tatlacas/brevwick-react build
   ```
2. Copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   # edit PUBLIC_BREVWICK_PROJECT_KEY=pk_test_…
   ```
3. Start the dev server:
   ```bash
   pnpm --filter brevwick-example-astro dev
   ```
4. Open http://localhost:4321 and click the floating **Feedback** button.

## How it works

Astro renders pages statically by default. Interactive UI is opted-in per
component via the `client:*` directives. The FAB is a React component, so we
wrap it in an island (`src/components/BrevwickIsland.tsx`) and mount it inside
the base layout with `client:load` so it hydrates on every page that uses the
layout.

The FAB only renders on routes that include the layout's island — pages built
without it (or fully static routes that strip client JS) won't show the
button.

## Environment

Astro exposes any env var prefixed with `PUBLIC_` to the client bundle. Read
the value via `import.meta.env.PUBLIC_*` from inside the React island.

| Variable                      | Required | Purpose                                         |
| ----------------------------- | -------- | ----------------------------------------------- |
| `PUBLIC_BREVWICK_PROJECT_KEY` | yes      | Public ingest key (`pk_test_…` or `pk_live_…`). |
