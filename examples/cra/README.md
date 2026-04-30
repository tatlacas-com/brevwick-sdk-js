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
`process.env`. The example points at the public Brevwick API by default.

| Variable                         | Required | Purpose                                         |
| -------------------------------- | -------- | ----------------------------------------------- |
| `REACT_APP_BREVWICK_PROJECT_KEY` | yes      | Public ingest key (`pk_test_…` or `pk_live_…`). |
