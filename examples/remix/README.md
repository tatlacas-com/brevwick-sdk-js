# brevwick-example-remix

Minimal Remix (Vite) example wired up with
[`@tatlacas/brevwick-react`](../../packages/react). The provider mounts inside
`app/root.tsx`'s `<Layout>` so it wraps the `<Outlet />` — every route reached
through the outlet is inside the provider, and `useFeedback()` works in any of
them. The provider itself is SSR-safe (`createBrevwick` runs in `useMemo`,
rings install in `useEffect`), so no `.client.tsx` wrapper is required.

## Run locally

1. From the repo root, install and build the SDKs:
   ```bash
   pnpm install
   pnpm --filter @tatlacas/brevwick-sdk --filter @tatlacas/brevwick-react build
   ```
2. Copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   # edit VITE_BREVWICK_PROJECT_KEY=pk_test_…
   ```
3. Start the dev server:
   ```bash
   pnpm --filter brevwick-example-remix dev
   ```
4. Open http://localhost:5175 and click the floating **Feedback** button — or
   click **Submit manual feedback** to see `useFeedback()` in action.

## Environment

Remix uses Vite under the hood, so client-inlined env vars follow Vite's
`VITE_*` + `import.meta.env` convention. Vite only inlines variables whose
names match its `envPrefix` (default `VITE_`); anything else stays
server-only and never lands in the client bundle. There is **no**
`REMIX_PUBLIC_*` convention — that pattern is from a different framework.

| Variable                    | Required | Purpose                                         |
| --------------------------- | -------- | ----------------------------------------------- |
| `VITE_BREVWICK_PROJECT_KEY` | yes      | Public ingest key (`pk_test_…` or `pk_live_…`). |

## Endpoint

This example posts to the public Brevwick ingest at `https://api.brevwick.com`
by default — supplying a real `pk_test_…` key will deliver issues to your
project inbox. Override via the `endpoint` field on the `BrevwickConfig` in
`app/configured-widget.tsx` if you are running a local `brevwick-api`.
