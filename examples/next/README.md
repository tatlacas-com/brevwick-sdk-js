# brevwick-example-next

Next.js 16 (App Router) example wired up with
[`@tatlacas/brevwick-react`](../../packages/react)&rsquo;s `<BrevwickProvider>` and
`<FeedbackButton>`.

## Run it

1. Get a project key from your Brevwick dashboard and copy it into `.env.local`:
   ```bash
   cp .env.example .env.local
   # edit NEXT_PUBLIC_BREVWICK_KEY=pk_test_…
   # edit NEXT_PUBLIC_API_BASE   =https://api.your-brevwick-host.example  (or http://localhost:8080 against a local instance)
   ```
2. From the repo root, build the SDKs and run the example:
   ```bash
   pnpm install
   pnpm --filter @tatlacas/brevwick-sdk --filter @tatlacas/brevwick-react build
   pnpm --filter brevwick-example-next dev
   ```
3. Open http://localhost:3000 and click the floating **Feedback** button.
4. Confirm the submission lands in your Brevwick dashboard inbox.

## Environment

Both variables are **required** for this example — it fails closed in-page if
either is missing. The SDK's own `endpoint` default (`https://api.brevwick.com`)
is the production SaaS; this example is explicitly scoped to whatever ingest
host you configure and refuses to silently fall through.

| Variable                   | Required | Purpose                                                              |
| -------------------------- | -------- | -------------------------------------------------------------------- |
| `NEXT_PUBLIC_BREVWICK_KEY` | yes      | Public ingest key (`pk_test_…`) — must match the SDK regex.          |
| `NEXT_PUBLIC_API_BASE`     | yes      | Ingest endpoint, e.g. `http://localhost:8080` for a local container. |
