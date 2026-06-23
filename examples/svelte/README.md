# Brevwick — SvelteKit example

Minimal SvelteKit app wired up with [`@tatlacas/brevwick-svelte`](../../packages/svelte). The root `+layout.svelte` calls `setBrevwickContext(...)` and mounts the floating `<FeedbackButton />`; `+page.svelte` shows an imperative submit through `getFeedback()`.

## Run it

```bash
pnpm install
pnpm --filter @tatlacas/brevwick-sdk --filter @tatlacas/brevwick-svelte build
cp examples/svelte/.env.example examples/svelte/.env
# edit .env to set PUBLIC_BREVWICK_PROJECT_KEY=pk_test_...

pnpm --filter brevwick-example-svelte dev
```

Open http://localhost:5173 — the vertical Feedback tab sits on the right edge (pass `position="bottom-right"` for the legacy corner bubble).

## Files

- `src/routes/+layout.svelte` — calls `setBrevwickContext` and mounts `<FeedbackButton />` once for the whole app.
- `src/routes/+page.svelte` — demonstrates the imperative `getFeedback()` API.
- `src/lib/configured-widget.ts` — env-var plumbing using SvelteKit's `$env/static/public`.

## Production deploy

The example uses `@sveltejs/adapter-auto`, which selects an adapter based on the deploy target. Swap to `@sveltejs/adapter-static` if you want a fully static build.
