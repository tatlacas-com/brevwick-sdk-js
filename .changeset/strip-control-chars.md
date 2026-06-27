---
'@tatlacas/brevwick-sdk': patch
'@tatlacas/brevwick-react': patch
'@tatlacas/brevwick-solid': patch
'@tatlacas/brevwick-vue': patch
'@tatlacas/brevwick-svelte': patch
'@tatlacas/brevwick-angular': patch
'@tatlacas/brevwick-react-native': patch
---

fix: strip control chars from captured bodies and elide binary responses

The network ring read binary response bodies as text whenever the content-type slipped past the binary gate — most commonly a `font/woff2` download. A WOFF2 font read via `Response.text()` carries NUL (U+0000) bytes, which the ingest API cannot store in its `text`/`jsonb` columns: every such submission failed the server-side `INSERT` and came back **500** (and the oversized bodies also tripped occasional **413**s).

Two layers of fix:

- `redact()` — the mandatory pre-send chokepoint every ring and the submit pipeline pass through — now strips C0 control characters (NUL et al., keeping `\t` `\n` `\r`) and DEL as an unconditional final pass, so no captured string can carry a NUL regardless of which ring produced it.
- The network ring's binary content-type gate now also covers `font/*` and `application/wasm|pdf|zip|gzip|x-protobuf|font-*`, so those bodies are recorded as `[binary N bytes]` instead of being read as text — fixing the payload bloat behind the 413s.

The server adds the same NUL-stripping as defence-in-depth, but this stops the bad bytes at the source.
