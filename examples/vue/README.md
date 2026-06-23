# Brevwick — Vue example

Minimal Vue 3 + Vite app wired up with [`@tatlacas/brevwick-vue`](../../packages/vue).

## Quick start

```bash
pnpm install
pnpm --filter @tatlacas/brevwick-sdk --filter @tatlacas/brevwick-vue build
cp .env.example .env.local        # then seed your real pk_test_* key
pnpm --filter brevwick-example-vue dev
```

Open http://localhost:3001 — the launcher renders as a vertical tab on the right edge (pass `position="bottom-right"` for the legacy corner bubble). Click it, type a description, optionally capture a screenshot, hit **Send**.

## Env vars

| Var                         | Required | Description                                                    |
| --------------------------- | -------- | -------------------------------------------------------------- |
| `VITE_BREVWICK_PROJECT_KEY` | Yes      | A `pk_test_*` or `pk_live_*` key from your Brevwick project.   |
| `VITE_BREVWICK_ENDPOINT`    | Yes      | Brevwick API base URL — `http://localhost:8080` for local dev. |

The example fails closed when either is missing — `App.vue` renders a banner explaining what's wrong.
