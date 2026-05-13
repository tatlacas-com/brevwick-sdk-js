# brevwick-example-solid

[SolidStart](https://start.solidjs.com) example wired up with
[`@tatlacas/brevwick-solid`](../../packages/solid)'s `<BrevwickProvider>` and
`<FeedbackButton>`.

## Run it

1. Get a project key from your Brevwick dashboard and copy it into `.env.local`:
   ```bash
   cp .env.example .env.local
   # edit VITE_BREVWICK_PROJECT_KEY=pk_test_…
   # edit VITE_BREVWICK_ENDPOINT   =https://api.your-brevwick-host.example  (or http://localhost:8080 against a local instance)
   ```
2. From the repo root, build the SDKs and run the example:
   ```bash
   pnpm install
   pnpm --filter @tatlacas/brevwick-sdk --filter @tatlacas/brevwick-solid build
   pnpm --filter brevwick-example-solid dev
   ```
3. Open http://localhost:3001 and click the floating **Feedback** button.

## Environment

Both variables are required — the example fails closed if either is missing
rather than fall through to the SDK's production endpoint default.

| Variable                    | Required | Purpose                                        |
| --------------------------- | -------- | ---------------------------------------------- |
| `VITE_BREVWICK_PROJECT_KEY` | yes      | Public ingest key (`pk_test_…`).               |
| `VITE_BREVWICK_ENDPOINT`    | yes      | Ingest endpoint, e.g. `http://localhost:8080`. |
