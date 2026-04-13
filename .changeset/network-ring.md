---
'brevwick-sdk': minor
'brevwick-react': minor
---

Add the network ring: patches `globalThis.fetch` and `XMLHttpRequest.prototype.open/send/setRequestHeader` on install to capture any request with status ≥ 400 or that throws / aborts / times out. Captured entries include sanitised request + response headers (allow-list only — `content-type`, `accept`, `x-request-id`, etc.), a redacted + capped request body (2 kB) and response body (4 kB), and duration. Sensitive query parameters (`token|auth|key|session|sig`) are stripped from the captured URL. Binary and form-data bodies surface as `[binary N bytes]` / `[form-data]` markers. Requests to the configured ingest endpoint and requests carrying the `X-Brevwick-SDK` header are skipped to avoid submit-time feedback loops; the loop guard matches on origin + path boundary so sibling brand domains such as `api.brevwick.company` are not silently dropped. XHR `abort` and `timeout` are captured alongside `error` with distinct labels.

Grows the public `NetworkEntry` type (all optional fields): `requestBody`, `responseBody`, `requestHeaders`, `responseHeaders`. Existing consumers are source-compatible.

The ring module is dynamic-imported from `install()` and lands in its own async chunk — keeping the eager core bundle under the 2 kB gzip budget mandated by `CLAUDE.md`. Async ring loaders that resolve after `uninstall()` now short-circuit via a generation counter, so late-landing imports never re-patch globals against a terminal instance.

Test-only helpers (`__setRingsForTesting`, `__resetBrevwickRegistry`) moved from the package root to a new `brevwick-sdk/testing` entry point so they never ship in the eager production bundle. Not part of the public contract; consumer code must not import them.
