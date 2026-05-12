# brevwick-example-vanilla (Vite)

Plain HTML + Vite + TypeScript example that imports
[`@tatlacas/brevwick-sdk`](../../../packages/sdk) directly and submits a
hard-coded issue when a button is clicked.

> Looking for a no-build-tool version that runs straight from `index.html`?
> See [`../static`](../static).

## Run it

1. Get a project key from your Brevwick dashboard and copy it into `.env`:
   ```bash
   cp .env.example .env
   # edit VITE_BREVWICK_KEY=pk_test_…
   # edit VITE_API_BASE    =https://api.your-brevwick-host.example  (or http://localhost:8080 against a local instance)
   ```
2. From the repo root, build the SDK and run the example:
   ```bash
   pnpm install
   pnpm --filter @tatlacas/brevwick-sdk build
   pnpm --filter brevwick-example-vanilla dev
   ```
3. Open http://localhost:5173 and click **Send feedback**.
4. Confirm the submission lands in your Brevwick dashboard inbox.

## Environment

Both variables are **required** for this example — it fails closed in-page if
either is missing. The SDK's own `endpoint` default (`https://api.brevwick.com`)
is the production SaaS; this example is explicitly scoped to whatever ingest
host you configure and refuses to silently fall through.

| Variable            | Required | Purpose                                                              |
| ------------------- | -------- | -------------------------------------------------------------------- |
| `VITE_BREVWICK_KEY` | yes      | Public ingest key (`pk_test_…`) — must match the SDK regex.          |
| `VITE_API_BASE`     | yes      | Ingest endpoint, e.g. `http://localhost:8080` for a local container. |
