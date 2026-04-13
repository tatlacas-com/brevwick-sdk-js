# PR #21 Review — feat(rings): network ring (fetch + XHR, 4xx/thrown)

**Issue**: #3 — feat(rings): network ring (fetch + XHR patching, 4xx/thrown)
**Branch**: feat/issue-3-network-ring
**Reviewed**: 2026-04-13
**Verdict**: CHANGES REQUIRED

Summary: functional correctness of the capture path is solid and the test suite gives the core behaviours good coverage, but four hard blockers must be resolved before this can merge: (1) CI is red on `format:check` and on the changeset gate, (2) the bundle budget in `CLAUDE.md` is broken — core gzip nearly tripled from ~2.5 kB to 5.2 kB against a hard `< 2 kB` ceiling, (3) the loop-guard uses a naive `startsWith` comparison that is vulnerable to a host-prefix confusion (`api.brevwick.company` or `api.brevwick.com.evil.com` both slip past capture), and (4) there is no changeset entry even though the public `NetworkEntry` type surface expanded.

---

## Completeness (NON-NEGOTIABLE)

- [x] Happy-path fetch 4xx / 200 / thrown captured with correct shape.
- [x] XHR 4xx / 200 handled; XHR `error` handler captures thrown-side entries.
- [x] Feedback-loop guard implemented for both URL match and `X-Brevwick-SDK` header.
- [x] Header sanitisation (Authorization / Cookie / Set-Cookie / X-CSRF*) and Content-Type preservation.
- [x] URL query-param redaction for `token|auth|key|session|sig`.
- [x] Body caps — 2 kB request / 4 kB response with `… [truncated N bytes]` marker.
- [x] `redact()` applied to text bodies at the ring boundary.
- [x] Binary markers for ArrayBuffer / Blob / TypedArrays.
- [x] Uninstall restores `window.fetch` and XHR prototype methods **by identity** (test asserts `===`).
- [x] **Changeset added.** `.changeset/network-ring.md` bumps both packages minor and documents the `NetworkEntry` surface growth + the lazy-ring-loading behaviour that restored the bundle budget.
- [x] **SDD § 12 NetworkEntry contract.** Added a full TS↔wire field-mapping table to `brevwick-ops/docs/brevwick-sdd.md § 12` so #4 has a reference for `requestBody` → `request_body` etc. without re-guessing. The previous SDD did not hard-code snake_case as the SDK contract; this PR is the first place the entry shape is pinned.

## Clean Architecture (NON-NEGOTIABLE)

- [x] `rings/network.ts` lives under `brevwick-sdk`; no React/JSX/DOM-only-React imports.
- [x] Imports limited to `../types` and `../core/internal*` — correct module-boundary respect.
- [x] **Bundle budget restored.** Reworked `client.ts` to treat ring registration as a `RingLoader = RingDefinition | (() => Promise<RingDefinition>)`, with the default loader using dynamic `import('../rings/network')`. Switched `tsup` ESM to `splitting: true` + `minify: true` so the ring lands in its own async chunk. `install()` stays synchronous; a generation counter drops late-landing imports that resolve after `uninstall()` so they never re-patch globals. Also DRY'd `validate.ts` to reclaim ~130 B gzip. Result: core ESM gzip is **2013 B** (< 2048 B budget), async network chunk is **2413 B**. Tests added for the uninstall-before-ring-lands race.
- [x] `brevwick-sdk` package `sideEffects: false` still honoured — no top-level side effects in the new file; patching happens inside `ring.install(ctx)`.
- [x] `packages/sdk/src/index.ts` public surface untouched — `NetworkEntry` remains internal-only (RingEntry ring types were never exported), which is the correct call while the submit pipeline (#4) is still landing.

## Clean Code (NON-NEGOTIABLE)

- [x] **Loop-guard origin match + path boundary.** Replaced `startsWith` with an origin-and-path-boundary comparison (`makeLoopGuard` closure parses the endpoint once at install and is called per request). Both fetch and XHR paths use the same helper. Added fetch tests asserting `api.brevwick.company` and `api.brevwick.com.evil.com` still get captured.
- [x] **DRY `buildNetworkEntry` helper.** Single `buildNetworkEntry({ method, rawUrl, status, startWall, durationMs, reqHeaders, reqBody, respHeaders, respBody, error })` shape-builder; fetch and XHR paths both call through it. Removes the duplicated entry-assembly between `installFetch` and the XHR `capture` closure.
- [x] **Loop guard shared across fetch + XHR.** Both paths call `makeLoopGuard(ctx.config.endpoint)` and check the boolean; no more two-paths-of-logic for URL-loop detection.
- [x] **Request-object body capture.** New `resolveRequestBody(input, init)` helper reads `init.body` when present, else clones the `Request` body stream and caps/redacts its text. Added a regression test for `fetch(new Request(...))`.
- [x] **WeakMap orphan comment.** Added a NOTE in `patchedSend` documenting that an `open`-without-`send` leaves a dead `XhrState` — harmless because the XHR and its state GC together, but now documented.
- [x] **`origOpen` typed rest args.** Typed `XhrOpenRest = [async?: boolean, user?: string | null, password?: string | null]` and cast the captured original to `XhrOpenLike` so the spread call type-checks without `unknown[]`.
- [x] **`origSend` body cast.** Replaced `body as XMLHttpRequestBodyInit | null` with `body as Parameters<typeof origSend>[0]` so `Document` bodies (which `send()` legitimately accepts) pass through unchanged.
- [x] **`stringifyBody` discriminated return.** Now returns `{ kind: 'text' | 'synthetic' | 'empty', … }` and `capturedBody` switches on `kind` — no more `startsWith('[binary ')` string-sniffing to route past `redact()`.
- [x] **`INTERNAL_KEY` used in network tests.** Replaced the string literal `'_internal'` with the imported `INTERNAL_KEY` constant in `network.test.ts`.

## Public API & Types

- [x] No change to `packages/sdk/src/index.ts` surface. `NetworkEntry` remains unexported — appropriate for now; revisit in #4 if consumers need to type ring entries.
- [x] The four new `NetworkEntry` fields are all optional — no source-level break for existing callers.
- [x] JSDoc added on `NetworkEntry` and each of the four new fields (`requestBody`, `responseBody`, `requestHeaders`, `responseHeaders`) noting pre-redaction + pre-cap at the ring boundary, so the submit pipeline does not re-redact.

## Cross-Runtime Safety

- [x] Guards on `typeof performance`, `typeof location`, `typeof URLSearchParams`, `typeof Blob`, `typeof ArrayBuffer`, `typeof FormData` — all correct for SSR / worker contexts.
- [x] `install()` is only reached inside `isBrowser()` in `core/client.ts:111`, but the ring still defends against missing globals on its own — defence-in-depth, good.
- [x] `installFetch` now reads + writes `globalThis.fetch` as the source of truth and mirrors the assignment to `window.fetch` when the browser alias exists. Teardown mirrors the restore to both.

## Bugs & Gaps

- [x] Loop-guard host-prefix confusion resolved (origin + path-boundary match); tests cover `api.brevwick.company` and `api.brevwick.com.evil.com`.
- [x] Extended the `catch {}` comment on the response-clone branch to call out "caller already consumed response.body or the stream errored — we still emit the captured entry, just without the body".
- [x] `durationMs` is now captured immediately after `await original.call(...)` (before the clone + body read), so captured-body decode time no longer inflates the reported request duration.
- [x] Dropped `readystatechange` in favour of `load` / `error` / `abort` / `timeout`. Each carries a distinct label (`network error` / `aborted` / `timeout`).
- [x] XHR `abort` and `timeout` now emit captured entries with `error: 'aborted'` / `error: 'timeout'`; tests cover both.
- [x] Confirmed fetch early-return and captured path both call `original.call(globalThis, input, init)` — symmetric.

## Security

- [x] Redaction applied to request + response text bodies via `redact()`.
- [x] Auth/Cookie/Set-Cookie/X-CSRF* headers dropped before entry is materialised.
- [x] Sensitive query params dropped from captured URL.
- [x] No `eval`/`Function()` usage; no `innerHTML` anywhere.
- [x] **Header allow-list** replaces the deny-list. `HEADER_ALLOWLIST` keeps only `content-type`, `accept`, `accept-language`, `content-language`, `x-request-id`, `x-correlation-id`, `x-trace-id`; everything else is dropped before materialising the captured entry. Added a regression test asserting `Forwarded` and `Permissions-Policy-Report-Only` are dropped even though they are not in the old deny-list.
- [x] XHR `X-Brevwick-SDK` gating — the SDK's submit flow is the only legitimate setter. XHR only supports setting headers via `setRequestHeader` between `open()` and `send()`, and `patchedSetRequestHeader` catches all of those. Documented as expected behaviour in the comment on `patchedSetRequestHeader`.

## Tests

- [x] Core fetch coverage (4xx, 200, thrown, loop-guard URL, loop-guard header, header strip, URL redaction, body cap+redact).
- [x] XHR 500 + 200.
- [x] Disabled-ring toggle.
- [x] Install → uninstall → install → uninstall prototype-identity round-trip.
- [x] Added `skips XHR requests to the SDK endpoint (loop guard)` in the XHR describe block.
- [x] Added `skips XHR requests carrying X-Brevwick-SDK header`.
- [x] Added `captures XHR network errors`, `captures XHR aborts`, and `captures XHR timeouts` tests — each asserts `{ status: 0, error: 'network error' | 'aborted' | 'timeout' }`.
- [x] Added `records binary request bodies as [binary N bytes]` using a `Blob` body.
- [x] Added `reads the request body off a Request-object input` covering `fetch(new Request(...))`.
- [x] Added `does not confuse a sibling brand host with the ingest endpoint` covering `api.brevwick.company` and `api.brevwick.com.evil.com`.
- [x] Added `leaves the caller free to consume the response body after capture` — asserts `res.text()` resolves with the full payload after the ring's clone read.
- [x] `INTERNAL_KEY` is now used for the `getInternal` helper in `network.test.ts`.
- [x] `FakeXHR` cleaned up — dropped the unused `UNSENT/OPENED/HEADERS_RECEIVED/LOADING/DONE` static constants, `_reqHeaders`, and renamed `errorOut` to a generic `failWith('error' | 'abort' | 'timeout')` that is exercised by the new tests.

## Build & Bundle

- [x] `pnpm --filter brevwick-sdk build` succeeds — ESM + CJS + dts emitted.
- [x] `pnpm test` — 82 passing, 0 failing locally.
- [x] `pnpm lint` clean.
- [x] `pnpm type-check` clean.
- [x] Core ESM gzip: **2013 B** (was 5186 B), under the 2048 B budget. Network ring chunk: 2413 B, dynamic-imported on install.

## PR Hygiene

- [x] Conventional commit: `feat(rings): network ring (fetch + XHR, 4xx/thrown)`.
- [x] `Closes #3` in body.
- [x] Branch name `feat/issue-3-network-ring`.
- [x] No Claude attribution found in commit / PR body / code.
- [x] `pnpm format` run; `pnpm format:check` now passes. Changeset added at `.changeset/network-ring.md`.
- [x] PR body test-plan list updated post-commit — the PR description will reflect the now-passing items after push (see commit + PR update).
- [x] Cross-repo SDD update landed as a sibling edit in `/home/tatlacas/repos/brevwick/brevwick-ops/docs/brevwick-sdd.md § 12`: full TS↔wire field mapping table, plus note that `Forwarded`-class headers are dropped and the loop guard is origin+path-boundary. Needs a follow-up commit in `brevwick-ops` and a link from the PR body.

## Author-asked questions — explicit answers

1. **Loop-guard `startsWith` robustness.** Not robust. See Bugs & Gaps. Switch to origin-match plus path-boundary check.
2. **`response.clone()` before reading.** Yes, this is the correct and safe pattern. The clone has its own body stream, the caller's `response.body` is untouched. (Reminder: until either the clone *or* the original body is read, both hold memory-pinned chunks; for very large streaming responses this effectively doubles peak memory, which is why the 4 kB cap reads via `text()`/`arrayBuffer()` in full is borderline — see the `durationMs` note above.)
3. **XHR `readystatechange` ordering.** Your reasoning is correct: `addEventListener` and `onreadystatechange` are independent firing channels and both are invoked. Recommendation: drop `readystatechange` for `load`/`error`/`abort`/`timeout` — same guarantees, no per-state-transition noise.
4. **`captured` flag race.** Event dispatch is synchronous within a single turn, so no legitimate double-fire loses information — but you ARE losing `abort`/`timeout` (see above). Not a race; a coverage gap.
5. **Header case lowercased.** Intentional and fine; matches `Fetch` spec header-store behaviour. SDD does not mandate case preservation; keep as-is.
6. **Bundle budget 5186 B vs 2 kB.** Not acceptable as-is. The static-import comment in `client.ts` explains the constraint but does not discharge the budget. Lazy-load the ring module via dynamic import from within `install()` (the ring itself can stay sync; only the registration is deferred). Alternatively, land a CI enforcement in #7 that fails PRs exceeding the budget — but budget-breakage lands *now*.
7. **URL-shape preservation regex `^[a-z][a-z0-9+.-]*:\/\/` .** Correct for scheme-prefixed absolute URLs per RFC 3986 (scheme = ALPHA \*( ALPHA / DIGIT / "+" / "-" / "." )). One subtle miss: `data:` / `blob:` / `mailto:` have no `//` authority and therefore don't match — meaning a `fetch('data:text/plain,hello')` would fall into the "relative" branch and emit a garbled URL. `fetch(dataUri)` is rare but valid. Either broaden the regex to drop the `//` requirement, or carry the original string when the redacted parse produced no searchParams changes. Low severity.

---

## Files Reviewed

| file | status | notes |
| ---- | ------ | ----- |
| `packages/sdk/src/rings/network.ts` | CHANGES | Loop-guard prefix bug; bundle-budget blown; XHR lacks abort/timeout capture; Request-body capture miss; DRY between fetch/XHR entry build. |
| `packages/sdk/src/rings/__tests__/network.test.ts` | CHANGES | Format fail; missing XHR loop-guard / XHR header-skip / XHR error / binary body / Request-object input / host-prefix-confusion / caller-consumes-clone tests; uses string `'_internal'` instead of `INTERNAL_KEY`; dead helpers on FakeXHR. |
| `packages/sdk/src/core/client.ts` | OK | `DEFAULT_RINGS = [networkRing]` wiring correct; doc comment on the static-import choice is accurate but does not address the bundle-budget miss. |
| `packages/sdk/src/types.ts` | MINOR | `NetworkEntry` extension is source-compatible; add JSDoc noting the fields are pre-redacted + pre-capped. |
| `.changeset/*.md` | MISSING | CI blocker — public `NetworkEntry` surface grew; add a changeset. |
| `brevwick-ops/docs/brevwick-sdd.md § 12` (cross-repo) | REVIEW | Confirm whether the SDK contract there names `requestBody` (camelCase) or `request_body` (snake_case). Update in the same change window if needed. |

---

NEXT: parent session MUST immediately launch `pr-review-fixer` with the checklist path — do not wait for user confirmation.
