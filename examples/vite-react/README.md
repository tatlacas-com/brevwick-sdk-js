# brevwick-example-vite-react

Plain Vite + React 19 example wired up with
[`@tatlacas/brevwick-react`](../../packages/react)'s `<BrevwickProvider>` and
`<FeedbackButton>`.

## Run locally

1. From the repo root, install and build the SDKs:
   ```bash
   pnpm install
   pnpm --filter @tatlacas/brevwick-sdk --filter @tatlacas/brevwick-react build
   ```
2. Copy `.env.example` to `.env.local` and set your project key:
   ```bash
   cp .env.example .env.local
   # edit VITE_BREVWICK_PROJECT_KEY=pk_test_…
   ```
3. Start the dev server:
   ```bash
   pnpm --filter brevwick-example-vite-react dev
   ```
4. Open http://localhost:5174 and click the floating **Feedback** button.

## Environment

Vite exposes any `VITE_*` env var to client code via `import.meta.env`. The
example points at the public Brevwick API by default (no `endpoint` override),
so a real `pk_test_…` key is enough to send issues to your project inbox.

| Variable                    | Required | Purpose                                         |
| --------------------------- | -------- | ----------------------------------------------- |
| `VITE_BREVWICK_PROJECT_KEY` | yes      | Public ingest key (`pk_test_…` or `pk_live_…`). |
