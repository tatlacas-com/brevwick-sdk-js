# brevwick-example-next

Next.js 16 (App Router) example wired up with
[`brevwick-react`](../../packages/react)&rsquo;s `<BrevwickProvider>` and
`<FeedbackButton>`.

## Works locally

1. Bring up the local API stack:
   ```bash
   docker compose -f ../../../brevwick-api/docker-compose.dev.yml up -d
   ```
   Then start `brevwick-api` on `http://localhost:8080` (see
   `brevwick-api/README.md`).
2. Seed a test project key with `bwctl` and copy it into `.env.local`:
   ```bash
   cp .env.example .env.local
   # edit NEXT_PUBLIC_BREVWICK_KEY=pk_test_…
   ```
3. From the repo root, build the SDKs and run the example:
   ```bash
   pnpm install
   pnpm --filter brevwick-sdk --filter brevwick-react build
   pnpm --filter brevwick-example-next dev
   ```
4. Open http://localhost:3000 and click the floating **Feedback** button.
5. Confirm the report appears in `brevwick-web` → `/app/inbox`.

## Environment

| Variable                   | Default                 | Purpose                   |
| -------------------------- | ----------------------- | ------------------------- |
| `NEXT_PUBLIC_BREVWICK_KEY` | —                       | Public ingest key         |
| `NEXT_PUBLIC_API_BASE`     | `http://localhost:8080` | Overrides ingest endpoint |
