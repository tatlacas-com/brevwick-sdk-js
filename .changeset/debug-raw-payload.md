---
"@tatlacas/brevwick-sdk": minor
"@tatlacas/brevwick-react": minor
"@tatlacas/brevwick-solid": minor
"@tatlacas/brevwick-vue": minor
"@tatlacas/brevwick-svelte": minor
"@tatlacas/brevwick-angular": minor
---

feat: dev-only `debug` mode that exposes the raw payload sent to the API

Add a `debug?: boolean` config option (default `false`). When enabled, every `submit()` resolves with a `debug.payload` field carrying the exact, already-redacted body that was POSTed to `/v1/ingest/issues` — including everything the widget never renders (console ring, network ring, route trail, device + user context, attachment descriptors).

All five web widgets (React, Solid, Vue, Svelte, Angular) render a per-message **"Copy raw payload"** button on each sent bubble when the payload is present, copying the pretty-printed JSON to the clipboard. The button is absent unless `debug` is on.

Wire it to a host build flag so it never ships to real users, e.g. `debug: process.env.NEXT_PUBLIC_SEE_LOGS === 'true'`. `debug` never changes what is sent — the payload is identical to a normal submit and stays fully redacted; the only cost is retaining it in memory per submit.
