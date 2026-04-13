# brevwick-example-vanilla

Plain HTML + Vite + TypeScript example that imports
[`brevwick-sdk`](../../packages/sdk) directly and submits a hard-coded
report when a button is clicked.

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
   pnpm --filter brevwick-sdk build
   pnpm --filter brevwick-example-vanilla dev
   ```
4. Open http://localhost:5173 and click **Send feedback**.
5. Confirm the report appears in `brevwick-web` → `/app/inbox`.

## Environment

| Variable            | Default                 | Purpose                   |
| ------------------- | ----------------------- | ------------------------- |
| `VITE_BREVWICK_KEY` | —                       | Public ingest key         |
| `VITE_API_BASE`     | `http://localhost:8080` | Overrides ingest endpoint |
