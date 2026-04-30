# brevwick-example-remix

Minimal Remix (Vite) example wired up with
[`@tatlacas/brevwick-react`](../../packages/react). The provider mounts inside
`app/root.tsx` and is gated behind `useEffect` so the FAB renders only after
client hydration — Remix server-renders the document, but the SDK needs
`window`.

## Run locally

1. From the repo root, install and build the SDKs:
   ```bash
   pnpm install
   pnpm --filter @tatlacas/brevwick-sdk --filter @tatlacas/brevwick-react build
   ```
2. Copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   # edit REMIX_PUBLIC_BREVWICK_PROJECT_KEY=pk_test_…
   ```
3. Start the dev server:
   ```bash
   pnpm --filter brevwick-example-remix dev
   ```
4. Open http://localhost:5175 and click the floating **Feedback** button — or
   click **Submit manual feedback** to see `useFeedback()` in action.

## Environment

Remix reads env vars at build time via `process.env`. Any var prefixed with
`REMIX_PUBLIC_` is safe to surface to the client tree (the convention this
example uses). Server-only secrets stay unprefixed and never reach the bundle.

| Variable                            | Required | Purpose                                         |
| ----------------------------------- | -------- | ----------------------------------------------- |
| `REMIX_PUBLIC_BREVWICK_PROJECT_KEY` | yes      | Public ingest key (`pk_test_…` or `pk_live_…`). |
