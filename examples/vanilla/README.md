# brevwick-example-vanilla

Plain HTML + Vite + TypeScript example that imports
[`@tatlacas/brevwick-sdk`](../../packages/sdk) directly and submits a hard-coded
issue when a button is clicked.

## Works locally

1. Bring up the local API stack:
   ```bash
   docker compose -f ../../../brevwick-api/docker-compose.dev.yml up -d
   ```
   Then start `brevwick-api` itself on `http://localhost:8080` (see
   `brevwick-api/README.md`).
2. Seed a test project key with `bwctl` and copy it into `.env`:
   ```bash
   cp .env.example .env
   # edit VITE_BREVWICK_KEY=pk_test_…
   ```
3. From the repo root, build the SDK and run the example:
   ```bash
   pnpm install
   pnpm --filter @tatlacas/brevwick-sdk build
   pnpm --filter brevwick-example-vanilla dev
   ```
4. Open http://localhost:5173 and click **Send feedback**.
5. Confirm the issue appears in `brevwick-web` → `/app/inbox`.

## Environment

Both variables are **required** for this example — it fails closed in-page if
either is missing. The SDK's own `endpoint` default (`https://api.brevwick.com`)
is the production SaaS; this example is explicitly scoped to a local
`brevwick-api` and refuses to fall through to production.

| Variable            | Required | Purpose                                                              |
| ------------------- | -------- | -------------------------------------------------------------------- |
| `VITE_BREVWICK_KEY` | yes      | Public ingest key (`pk_test_…`) — must match the SDK regex.          |
| `VITE_API_BASE`     | yes      | Ingest endpoint, e.g. `http://localhost:8080` for a local container. |
