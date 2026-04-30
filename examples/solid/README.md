# brevwick-example-solid

[SolidStart](https://start.solidjs.com) example wired up with
[`@tatlacas/brevwick-solid`](../../packages/solid)'s `<BrevwickProvider>` and
`<FeedbackButton>`.

## Works locally

1. Bring up the local API stack:
   ```bash
   docker compose -f ../../../brevwick-api/docker-compose.dev.yml up -d
   ```
   Then start `brevwick-api` on `http://localhost:8080`.
2. Seed a test project key and copy it into `.env.local`:
   ```bash
   cp .env.example .env.local
   # edit VITE_BREVWICK_PROJECT_KEY=pk_test_…
   ```
3. From the repo root, build the SDKs and run the example:
   ```bash
   pnpm install
   pnpm --filter @tatlacas/brevwick-sdk --filter @tatlacas/brevwick-solid build
   pnpm --filter brevwick-example-solid dev
   ```
4. Open http://localhost:3001 and click the floating **Feedback** button.

## Environment

Both variables are required — the example fails closed if either is missing
rather than fall through to the SDK's production endpoint default.

| Variable                    | Required | Purpose                                        |
| --------------------------- | -------- | ---------------------------------------------- |
| `VITE_BREVWICK_PROJECT_KEY` | yes      | Public ingest key (`pk_test_…`).               |
| `VITE_BREVWICK_ENDPOINT`    | yes      | Ingest endpoint, e.g. `http://localhost:8080`. |
