# brevwick-example-cra

Create React App example wired up with
[`@tatlacas/brevwick-react`](../../packages/react).

> **CRA is in maintenance mode.** New projects should prefer
> [Vite](../vite-react) — this example is provided for compatibility with
> existing CRA codebases.

## Run locally

1. From the repo root, install and build the SDKs:
   ```bash
   pnpm install
   pnpm --filter @tatlacas/brevwick-sdk --filter @tatlacas/brevwick-react build
   ```
2. Copy `.env.example` to `.env.local`:
   ```bash
   cp .env.example .env.local
   # edit REACT_APP_BREVWICK_PROJECT_KEY=pk_test_…
   ```
3. Start the dev server:
   ```bash
   pnpm --filter brevwick-example-cra dev
   ```
4. Open http://localhost:3000 and click the floating **Feedback** button.

## Environment

CRA exposes any env var prefixed with `REACT_APP_` to the client bundle via
`process.env`.

| Variable                         | Required | Purpose                                         |
| -------------------------------- | -------- | ----------------------------------------------- |
| `REACT_APP_BREVWICK_PROJECT_KEY` | yes      | Public ingest key (`pk_test_…` or `pk_live_…`). |

## Endpoint

This example posts to the public Brevwick ingest at `https://api.brevwick.com`
by default — supplying a real `pk_test_…` key will deliver issues to your
project inbox. (`examples/next` and `examples/vanilla/vite` instead require
a `*_API_BASE` env and fail-closed against a local stack; this example
intentionally ships the simpler "drop in a key, press the button" path.)
