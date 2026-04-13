# PR #22 Review — feat(submit): submit() with auto-context + redaction + presign

**Issue**: #4 — feat(submit): submit() with auto-context + redaction + presign flow
**Branch**: feat/issue-4-submit
**Reviewed**: 2026-04-13
**Verdict**: CHANGES REQUIRED

Strong core. The pipeline is well-structured, the never-throws contract is honored at the top level, and the tests are non-trivial (fake timers against a never-resolving msw handler is the right idea). The blockers below are real and fixable: bundle budget is hard-violated, the SDD cross-repo update the PR itself flags is missing, attachment caps are advertised in the JSDoc but not enforced, `config.userContext()` can still crack the never-throws contract, and several payload fields are deviations from SDD § 7 that are not covered by the PR body disclosure.

---

## Completeness (NON-NEGOTIABLE)

- [x] **Bundle budget exceeded (hard blocker per `CLAUDE.md`).** Eager core chunk is 2110 B gzip; budget is `< 2 kB` (= 2048 B). The overage is 62 B. `CLAUDE.md` says "DO NOT EXCEED" in caps; the acceptance criterion in issue #4 says "Bundle budget unchanged after this PR". Status quo is 2043 B → 2110 B is a regression. Either (a) trim the wrapper in `packages/sdk/src/core/client.ts:158-173` (the inline `.catch` envelope is ~60 B — you can collapse to `import('../submit').then((m) => m.runSubmit(internal, input)).catch((e) => ({ ok: false, error: { code: 'INGEST_RETRY_EXHAUSTED', message: e?.message ?? String(e) } }))` with most of the literal strings pushed into `submit.ts`), or (b) export a shared fallback builder from `submit.ts` and re-import it only on error. Do not merge this PR above budget.
- [x] **SDD § 12 cross-repo update is missing.** PR body says "SDD § 12 needs a cross-repo update to match" but no ops PR exists. Open `brevwick-ops` PRs: "docs(sdd): align § 12 web SDK contract with JS SDK PR #16" (predates this), "docs(sdd): document captureScreenshot opts", "docs(sdd): pin NetworkEntry shape" — none covers the `SubmitResult` tagged-union change, nor the new `SubmitError`/`SubmitErrorCode` exports, nor the new `FeedbackAttachment` interface, nor the new `console_errors` / `network_errors` / `route_trail` field names. CLAUDE.md: "Public API changes require an SDD update in the same PR (cross-repo)." Open the ops PR before this merges.
- [x] **Attachment cap enforcement missing.** `packages/sdk/src/types.ts:35` advertises "≤10 MB each, ≤5 total per report" in the public `FeedbackAttachment` JSDoc. `runSubmit` never checks either bound — a caller passing 12 MB or 7 attachments discovers the limit after burning 7 presign requests server-side. Validate client-side in `runSubmit` before the upload loop: return `ATTACHMENT_UPLOAD_FAILED` with a specific message when violated. This is in the SDD § 7 presign contract (`size_bytes` ≤ 10 MB) and is trivially checkable locally. Also enforce MIME whitelist (`image/png`, `image/jpeg`, `image/webp`, `video/webm`) since that's a documented server-side constraint.
- [x] **`config.userContext()` can crack the never-throws contract.** `packages/sdk/src/submit.ts:278`: `const userCtxExtra = config.userContext ? config.userContext() : undefined;` — a throwing user callback escapes `runSubmit`'s try/finally on the happy (non-abort) path and rejects the returned promise with the user's thrown error. The never-throws contract is the entire point of the tagged-union result type. Wrap in try/catch, log a warn, treat as `undefined`, continue.
- [x] **Redaction acceptance criterion not satisfied as stated.** Issue #4 says the msw-received body must contain `«redacted:email»`. PR deliberately uses `[email]` / `[jwt]` / `[blob]` / `[redacted]` instead — this IS the correct call (per #3 in the PR deviation list: consistency with the rings). But the acceptance criterion literal strings differ, and the SDD says "Redact ... Bearer ... JWT-shaped strings replaced with `[jwt]`. Long base64 blobs (>200 chars) replaced with `[blob]`." The SDD already documents `[jwt]`/`[blob]` — the task-prompt `«redacted:…»` markers never landed there. Confirming the deviation is correct; the issue checkbox wording is stale and should be edited, not the code.
- [x] **No test asserts ring snapshots are NOT re-redacted.** `packages/sdk/src/submit.ts:317-322` documents this invariant in a comment ("do NOT re-run redact() here"). This is load-bearing — if a future refactor drops the comment and re-runs `redact()` on ring snapshots, `[email]` becomes `[email]` again (idempotent for most markers but not all — `Bearer [redacted]` stays stable, but re-running `redact()` on a string that contains literal `[jwt]` mid-paragraph could double-mask when regexes overlap). Add a test that pushes a `NetworkEntry` with `requestBody: 'Bearer [redacted]'` into the buffer, runs `submit()`, and asserts the received body contains exactly one `[redacted]` marker and no shape mutation.

## Clean Architecture (NON-NEGOTIABLE)

- [x] **`packages/sdk/src/core/client.ts:163-172` duplicates error literals.** The `.catch` fallback hard-codes `'INGEST_RETRY_EXHAUSTED'` as a literal string. These should come from `submit.ts` (or a shared error helper) so there's a single source of truth for error-code strings. The literal also defeats tree-shaking of unused error-code variants. Extract an `EAGER_CHUNK_LOAD_ERROR` helper in the submit module exported only through `err()`; the wrapper here then only needs to import a single symbol, shrinking the eager surface.
- [x] **`packages/sdk/src/submit.ts:113-129` (`fetchJson`) is dead weight for `putAttachment` + `presignOne`.** They don't use it. The function is only called by `postReport`. Inline it or move it adjacent to `postReport`. Either way the module gains ~10 LOC worth of indirection for one call site.
- [x] **Wire-shape dispersion.** `composePayload` (submit.ts:300-324), `putAttachment` header merge (submit.ts:164-168), and presign result narrowing (submit.ts:28-33) all know about the wire shape independently. The presign response interface is defined inline in `submit.ts`; the report response interface is defined inline in `submit.ts`. If the SDD § 7 wire shape changes, three places in this file need updating. Not a blocker today, but one file per wire-shape boundary (e.g. `submit/wire.ts`) would make the cross-repo SDD update traceable.

## Clean Code (NON-NEGOTIABLE)

- [x] **`packages/sdk/src/submit.ts:234` — `attempt <= INGEST_BACKOFFS_MS.length` reads as off-by-one.** The loop runs 3 times (attempts 0, 1, 2), which IS "one attempt + two retries". But the guard condition `attempt <= length` is the kind of inversion that trips a reviewer — prefer `attempt < INGEST_BACKOFFS_MS.length + 1` or hoist a `MAX_ATTEMPTS = INGEST_BACKOFFS_MS.length + 1` constant. Worth fixing while touching the file.
- [x] **`packages/sdk/src/submit.ts:195-211` — `wait()` rolls its own `AbortSignal`-aware sleep.** A utility like this (and the `fetchJson`) has a home in `core/internal/`, alongside `redact.ts`. Submit isn't the only module that will eventually need a cancellable delay. Not required for this PR; flag for the first follow-up that needs it.
- [x] **`packages/sdk/src/submit.ts:46-48` — `err()` shadows a common variable name.** One-letter identifier referenced 6 times across the module. Rename to `submitError()` or similar; `catch (err)` later in the file would not conflict but future edits might. Small nit.
- [x] **`packages/sdk/src/submit.ts:75-91` — `redactUser` returns `Record<string, unknown> | undefined` but never returns `undefined`.** Signature lies. Tighten to `Record<string, unknown>` and let the caller check emptiness. (The `config.user` emptiness check is already at the call site — `if (config.user)`.)
- [x] **`packages/sdk/src/submit.ts:272-325` — `composePayload` mixes navigator/window probing with payload composition.** Extract `readDeviceContext()` (returns `{ ua, locale, viewport }`) so the SSR-safe probing lives in one place. Makes future mobile-only SSR-no-op test straightforward.

## Public API & Types

- [x] **SDD § 12 says `submit(...) => Promise<{ reportId }>`.** PR ships `{ ok: true; report_id: string } | { ok: false; error: SubmitError }`. This is the right shape — the SDD is wrong — but the breaking-change posture needs to be explicit in the changelog. No changeset entry is in this PR (`.changeset/` is untouched). `packages/sdk/package.json` is at `0.1.0-beta.0`; per CLAUDE.md pre-1.0 "minor: anything else (no SemVer guarantee in 0.x)" — so a minor bump is fine, but a changeset entry recording the API shape is mandatory once changesets are wired (they are: see commit `ec946bc`). Add `.changeset/*.md`.
- [x] **`FeedbackInput.attachments` type widening.** SDD § 12 says `attachments?: Blob[]`. PR widens to `Array<Blob | FeedbackAttachment>`. The widening is backward-compatible at the call site (Blob is still accepted), and `FeedbackAttachment` adds a `filename`. But `filename` is never sent to the server — `uploadAttachments` reads `toAttachmentDescriptor(entry).blob` only; `.filename` is destructured but unused (submit.ts:93-99). Either drop the widening (YAGNI) or actually thread `filename` through the presign body (SDD § 7 presign does not accept filename — so drop it).
- [x] **`SubmitErrorCode` is a union of 5 literal strings.** That's fine. But `packages/sdk/src/index.ts:17-18` re-exports both `SubmitError` and `SubmitErrorCode`. The codes are undocumented on the type (no JSDoc on each variant explaining when it fires). Add JSDoc to each union member — triagers reading the type will not have the PR body to reference.
- [x] **`route_trail` wire field is invented by this PR.** SDD § 7 does not mention a route trail in `/v1/ingest/reports`. Three things to confirm in the ops PR: (a) is the server-side JSON schema OK with an unknown `route_trail` field, or will it 400? (b) Is `route_trail` or `routes` or `route_entries` the canonical name? (c) Should it ride on `device_context` alongside `route_path`, or at top level like console/network? The PR puts it at top level — that's the shape the triage dashboard will query, so it needs to land in SDD § 7 before ingest is written.

## Cross-Runtime Safety

- [x] **`packages/sdk/src/submit.ts:289, 292, 294, 297` — `window` / `navigator` / `location` probed via `typeof … !== 'undefined'`.** Good for SSR; but `composePayload` still emits `device_context` with the `ua`/`locale`/`viewport`/`routePath` set to `undefined`. In Node JSON, `undefined` fields are omitted, so wire is clean — but the `device_context.sdk` object is always emitted. If the SDK is ever used in an edge runtime, this means `device_context: { platform: 'web', sdk: {...} }` with everything else missing. Acceptable, but worth calling out in SDD § 12 that `device_context` shape is a lower bound.
- [x] **Origin header.** SDD § 7 documents `Origin` on both presign and reports endpoints. In a browser, `fetch` sets this automatically for cross-origin requests. In Node test runs with msw, the header is NOT set — `onUnhandledRequest: 'error'` passes because the URL matches, but if the server-side contract requires Origin, MSW tests would not catch a missing-Origin regression. Not a bug in this PR, but worth flagging for WT-10 integration tests.
- [x] **`DOMException` in `runSubmit` (submit.ts:335).** `DOMException` is not a Node global prior to Node 17. `packages/sdk/package.json` sets `"engines": {"node": ">=20.0.0"}` in the monorepo root, which covers the dev toolchain — but consumers importing `brevwick-sdk` from an older Node runtime (SSR on Node 16, e.g.) would crash on the `new DOMException(...)` call. Guard with `typeof DOMException !== 'undefined' ? new DOMException(...) : new Error(...)`, or use a plain `Error` with `.name = 'TimeoutError'`.

## Bugs & Gaps

- [x] **`config.userContext()` throw escapes `runSubmit`.** Already listed under Completeness — repeated here because it's a bug, not a doc gap. `packages/sdk/src/submit.ts:278`.
- [x] **Abort race in `uploadAttachments`.** `packages/sdk/src/submit.ts:181-193` iterates attachments sequentially. If the 30 s budget fires mid-way, `presignOne` / `putAttachment` throw on `signal.aborted`, the catch in `runSubmit:348-357` checks `controller.signal.aborted` and returns `INGEST_TIMEOUT` — OK. But if a presign call succeeds and the PUT starts, then the signal aborts during the PUT, `fetch` throws `AbortError`, caller returns `INGEST_TIMEOUT`. The already-presigned object key is orphaned in R2. Acceptable for MVP (server-side GC sweeps orphans) but worth noting in a code comment.
- [x] **`putAttachment` header merge loses `Content-Type` if presign returns unrelated headers.** `packages/sdk/src/submit.ts:167` — `presign.headers ?? { 'Content-Type': blob.type }`. If presign ever returns `{ 'x-amz-checksum-sha256': '…' }` WITHOUT `Content-Type`, the PUT goes out with no `Content-Type`, and R2 rejects. SDD § 7 presign response example includes `Content-Type`, so this is stable today — but merge instead of replace would be safer: `headers: { 'Content-Type': blob.type, ...(presign.headers ?? {}) }`. Presign-provided Content-Type would still win (spread order).
- [x] **Presign response validation is one-sided.** `packages/sdk/src/submit.ts:153-155` checks `object_key` + `upload_url` exist, but does not validate shape (types, URL format). A presign that returns `{ object_key: 42, upload_url: 'not-a-url' }` passes the truthy check and then the PUT call explodes with an opaque URL error. At minimum, `typeof object_key === 'string' && typeof upload_url === 'string'`.
- [x] **Non-JSON 2xx handling.** `postReport` returns `INGEST_INVALID_RESPONSE` on non-JSON 200. Good. But `fetchJson` returns `body: undefined` on BOTH JSON parse failure AND empty body. An empty 202 (which is common for async ingest servers) would now be flagged invalid. Is empty-body + 202 allowed? Per SDD § 7, 202 response example has a body `{ report_id: ..., status: 'received' }` — so "empty 2xx" correctly fails validation. OK as-is; consider a comment.
- [x] **`postReport` `status === 0`.** Issue #4 says retry on "network error OR status === 0". PR retries on "thrown or 5xx", which is close but not identical — `fetch` does not surface `status === 0` (it throws on network failure; only XHR surfaces 0). This is fine in practice, but if the test suite ever injects a msw `passthrough` or similar, a 0 status would end up in the 4xx/5xx branches unhandled. Hoist a `isRetryable(status, error)` helper for clarity.
- [x] **Redaction skipped on `input.attachments[].filename`.** Free-form user-provided metadata. `filename` never reaches the wire so it's moot today, but if `filename` does eventually land in the report payload (it's on the public type), it needs `redact()`.
- [x] **No test covers `config.user` with `display_name: 'Bearer sk_live_...'`.** The current test `u_42 / alice@example.com / display_name: 'Alice'` only asserts `display_name` is a string. The "user metadata gets redacted via `redactValue`" branch (submit.ts:88) is covered by type check, but a positive assertion that a secret in `display_name` collapses to `[redacted]` would guard against a future change to `redactUser` that bypasses `redactValue`.
- [x] **No test covers a throwing `userContext`.** Once the catch is added (see bug above), add a test: `userContext: () => { throw new Error('boom') }` + submit → result is `ok: true` with `user_context` merely missing the extra keys.

## Security

- [x] **`projectKey` on the `Authorization: Bearer pk_*` header.** Correct per SDD. The key is pk_*, public by design. No concern.
- [x] **`endpoint` is validated to `https:` in `validateConfig` (already in core).** Good. `presignOne` uses `${endpoint}/v1/ingest/presign` without sanity-checking trailing slashes — validator canonicalises trailing slashes, so OK today; but a regression in the validator would let a double-slash land on the wire. Minor.
- [x] **Error message exposure.** `packages/sdk/src/submit.ts:251` — `INGEST_REJECTED` returns the raw response body as part of the message (first 256 chars). If a misbehaving server echoes back a Bearer token or PII in its 4xx body, that token lands in the caller's `result.error.message`. Consider running the `raw` slice through `redact()` before embedding.
- [x] **Loop-guard correctness under uppercase-host endpoint.** `packages/sdk/src/submit.ts:109` sends `X-Brevwick-SDK: brevwick-sdk/<version>`. Network ring checks `x-brevwick-sdk` (lower-case) — Headers API normalises, so correct. Confirmed.

## Tests

- [x] **Happy-path assertions are under-specified.** `submit.test.ts:83-123` — the happy path validates `report_id`, `attachments[0]`, `device_context.platform`, `device_context.sdk.name`. It does NOT assert: `environment`, `release`, `build_sha`, `route_path`, `user_context`, `console_errors`, `network_errors`, `route_trail`, `device_context.ua/locale/viewport`, the `title/description/expected/actual` fields round-trip. Every new wire field the PR adds should have a positive test asserting presence. Right now a future refactor that silently drops `environment` from the payload passes all tests.
- [x] **No test asserts the `Authorization` header on ingest requests.** Loop-guard header (`X-Brevwick-SDK`) is asserted; the actual auth header is not. Add to the headers test: `expect(request.headers.get('authorization')).toBe('Bearer pk_test_aaaaaaaaaaaaaaaa01')`.
- [x] **No test for retry-on-network-error (only retry-on-5xx).** `submit.test.ts:192-210` covers 503 → 200. The other retryable branch (`fetch` throws) is not covered. Add a handler that throws once via `HttpResponse.error()` then responds 200, assert exactly 2 hits.
- [x] **No test for INGEST_INVALID_RESPONSE.** The error code is exported on the public surface; no test exercises it. Add: 200 with body `{}` (no `report_id`) → `INGEST_INVALID_RESPONSE`.
- [x] **No test for INGEST_RETRY_EXHAUSTED.** Three 503s in a row → `INGEST_RETRY_EXHAUSTED`. Missing.
- [x] **No test asserts the non-retry of 4xx.** The 422 test asserts `hits === 1`, which IS the non-retry assertion — cover 400/401/403/429 with the same pattern to guarantee the inclusive bounds on the `status >= 400 && status < 500` branch.
- [x] **Fake-timer timeout test leaves the msw handler hanging.** `submit.test.ts:212-226` — `new Promise<Response>(() => undefined)` is never settled. `vi.useRealTimers()` in `afterEach` doesn't clean this up. Works because msw + the test runner tears the request down when `server.close()` in `afterAll` runs, but it's a pattern that can leak into later tests if the file gains more timeout cases. Prefer `http.post(REPORTS_URL, async () => { await new Promise(() => {}); })` so msw's internal teardown cancels it cleanly.
- [x] **No coverage of the `Blob`-vs-`FeedbackAttachment` widening.** Every test uses `makeBlob()` → passes `Blob` directly. The `FeedbackAttachment` branch in `toAttachmentDescriptor` (submit.ts:97-98) is dead from the test-coverage perspective.
- [x] **Coverage of `captureReportBody()` helper.** The helper uses `await request.text()` then returns JSON-unparsed. The redaction golden-fixture test calls `expect(body).toContain('[email]')` on the string — strong assertion. OK; worth a comment that the string form is intentional (substring search across keys + values).

## Build & Bundle

- [x] **Core eager chunk is 2110 B gzip. Budget is 2048 B. Must come down before merge.** Already called out.
- [x] **`tsup.config.ts` define injection is correct.** `__BREVWICK_VERSION__` is stamped at build and test time via `define`. Confirmed in sdk-version.ts with `declare const`. Clean.
- [x] **Vitest define block reads `package.json` via `node:fs`.** Fine — `vitest.config.ts` runs in Node. No cross-runtime concern.
- [x] **No size-limit check in CI.** `CLAUDE.md` says "CI enforces once WT-07 lands"; WT-07 hasn't landed yet per `worktree.md:58`. So the 2110 B regression would not block CI today — which is exactly why the human reviewer needs to enforce it here. Do not rubber-stamp the "CI is green" signal on bundle size.
- [x] **`chunk-split.test.ts` covers only `modern-screenshot`.** Add a similar assertion for the new `submit-*.js` chunk: the eager `dist/index.js` (ESM) and `dist/index.cjs` must NOT reference any symbol the submit chunk defines (`runSubmit`, `INGEST_BACKOFFS_MS`, etc.). Without this, a future inline of `submit.ts` would silently re-land the budget regression.

## PR Hygiene

- [x] **Branch**: `feat/issue-4-submit` — correct.
- [x] **Commit title**: `feat(submit): submit() with auto-context + redaction + presign (#4)` — conventional, ≤ 72 chars.
- [x] **PR body** references `Closes #4` and links SDD § 7 + § 12. Good.
- [x] **No Claude attribution anywhere.** Checked — clean.
- [x] **Changeset missing.** See Public API & Types above. Add `.changeset/<slug>.md` with a minor-bump entry: breaking change to `SubmitResult`, new `SubmitError`/`SubmitErrorCode` exports, new `FeedbackAttachment.filename`.
- [x] **PR body is honest about the deviations** (SDD mismatch, bundle overage, redaction-marker mismatch). That candor is the right posture — but it means the reviewer has to actually block on the things the author flagged. The budget blocker is one of them.

## Files Reviewed

| file | status | notes |
| ---- | ------ | ----- |
| `packages/sdk/src/submit.ts` | needs changes | `userContext` throw escapes never-throws; header merge; cap enforcement; presign shape validation; `err` naming; `redactUser` signature |
| `packages/sdk/src/core/client.ts` | needs changes | hard-coded `INGEST_RETRY_EXHAUSTED` literal; contributes to eager-chunk overage |
| `packages/sdk/src/types.ts` | needs changes | `FeedbackAttachment.filename` typed but unused on the wire; `SubmitErrorCode` variants need JSDoc |
| `packages/sdk/src/core/internal/sdk-version.ts` | clean | `define` strategy is clean |
| `packages/sdk/src/__tests__/submit.test.ts` | needs changes | coverage gaps: context fields, retry-on-throw, INGEST_INVALID_RESPONSE, INGEST_RETRY_EXHAUSTED, auth header, `FeedbackAttachment` branch, throwing userContext, ring-re-redaction invariant |
| `packages/sdk/src/core/__tests__/client.test.ts` | clean | tagged-union stub test is a good contract check |
| `packages/sdk/src/index.ts` | clean | new `SubmitError` / `SubmitErrorCode` exports are narrow |
| `packages/sdk/tsup.config.ts` | clean | `define` wired correctly |
| `packages/sdk/vitest.config.ts` | clean | `define` wired correctly |
| `package.json` | clean | msw added as workspace devDep |
| `pnpm-lock.yaml` | clean (skimmed) | msw transitive deps |

---

**Summary for the parent session:**

Verdict: **CHANGES REQUIRED**. Blockers: bundle budget overage (2110 B vs 2048 B), missing cross-repo SDD § 12 update, missing attachment cap enforcement, `config.userContext()` can crack the never-throws contract, no client-side MIME/size validation, test coverage gaps on every auto-collected context field and on the retry-on-throw / RETRY_EXHAUSTED / INVALID_RESPONSE branches. Strong work on the pipeline shape, the retry ladder, and the redaction golden fixture — the bones are right.

## Validation — 2026-04-13

**Verdict**: RETURNED TO FIXER

### Items Confirmed Fixed

- [x] Eager bundle ≤ 2048 B — `gzip -kc packages/sdk/dist/index.js | wc -c` → **2044 B**, confirmed under budget.
- [x] Dispatcher collapsed — `packages/sdk/src/core/client.ts:158-171` has `submit` and `captureScreenshot` as single-`.then` arrows; `dispatchSubmit` exported from `packages/sdk/src/submit.ts:103-108` owns both happy path and never-throws fallback (`chunkLoadFailure`). Eager chunk dump shows no `INGEST_*` / `ATTACHMENT_UPLOAD_FAILED` / `runSubmit` literals.
- [x] Attachment validation runs before any presign — `validateAttachments` in `packages/sdk/src/submit.ts:168-193` called at `runSubmit` line 493 before `uploadAttachments`. Count ≤ 5, size ≤ 10 MB, MIME whitelist (image/png, image/jpeg, image/webp, video/webm).
- [x] `userContext()` throw safety — `readUserContextExtra` at `packages/sdk/src/submit.ts:421-439` wraps in try/catch, pushes a `warn`-level console-ring entry on throw, returns `undefined`. Covered by `submit.test.ts:681-714`.
- [x] `makeTimeoutAbortReason` — `packages/sdk/src/submit.ts:76-83` falls back to `new Error` with `name = 'TimeoutError'` when `DOMException` is not a global.
- [x] `putAttachment` header merge — `packages/sdk/src/submit.ts:267-270` spreads `{ 'Content-Type': blob.type, ...(presign.headers ?? {}) }` so presign headers win but Content-Type always lands.
- [x] Presign response strict-shape check — `packages/sdk/src/submit.ts:249-252` uses `typeof json.object_key !== 'string' || typeof json.upload_url !== 'string'`.
- [x] 4xx body redacted — `packages/sdk/src/submit.ts:363` wraps `raw.slice(0, 256)` in `redact(...)`. Covered by `submit.test.ts:661-677`.
- [x] `redactUser` returns `Record<string, unknown>` (not optional) — `packages/sdk/src/submit.ts:139`.
- [x] `MAX_INGEST_ATTEMPTS` constant — `packages/sdk/src/submit.ts:32`, used at line 343 as `attempt < MAX_INGEST_ATTEMPTS`.
- [x] Test count grew to 26 cases in `submit.test.ts` covering all listed scenarios (context round-trip, count/size/MIME rejection with presign hit count = 0, retry-on-thrown-fetch, INGEST_RETRY_EXHAUSTED via fake timers, INGEST_INVALID_RESPONSE, 4xx matrix 400/401/403/409/413, 4xx body redaction, userContext throw safety, Authorization header on presign + reports, ring-re-redaction invariant, FeedbackAttachment branch, `display_name` secret redaction).
- [x] `chunk-split.test.ts` guards submit chunk — lines 50-80 assert base chunk imports submit lazily, has no `INGEST_*` / `runSubmit` / `INGEST_BACKOFFS_MS` literals; lines 88-93 assert gzipped size < 2048.
- [x] `.changeset/submit-pipeline.md` — minor bump for both `brevwick-sdk` and `brevwick-react`, documents breaking `SubmitResult` change, new `SubmitError`/`SubmitErrorCode`/`FeedbackAttachment` exports.
- [x] `SDD PR #7` exists and is open — `tatlacas-com/brevwick-ops#7` branch `docs/sdd-submit-result-tagged-union`, +42 -5 to `docs/brevwick-sdd.md`. Diff covers tagged `SubmitResult`, `SubmitError`/`SubmitErrorCode`, `FeedbackAttachment`, `FeedbackInput.attachments` widening, client-side attachment validation, `device_context.locale` / `.sdk`, `route_trail`, SSR lower-bound for `device_context`, `config.user.email` mask, INGEST_REJECTED body redaction.
- [x] `SubmitErrorCode` JSDoc — each variant documented in `packages/sdk/src/types.ts:49-67`.
- [x] No Claude attribution anywhere — commits, PR body, code comments all clean.

### Items Returned to Fixer

- [x] **PR #22 body updated.** Body rewritten via `gh api -X PATCH repos/tatlacas-com/brevwick-sdk-js/pulls/22` (the `gh pr edit` GraphQL path tripped on the projects-classic deprecation warning, so used the REST endpoint instead). Confirmed live via `gh pr view 22 --json body`: bundle line now reads "**2044 B gzipped — under the 2 kB (2048 B) budget**"; new "## SDD § 12 update (cross-repo)" section links `tatlacas-com/brevwick-ops#7` (branch `docs/sdd-submit-result-tagged-union`) as the paired contract update; the old "Contract diverges from the SDD" section is gone — SubmitResult tagged-union is now framed as the canonical shape that ops#7 codifies in § 12. The X-Brevwick-SDK loop-guard rationale, wire shape, error codes, and test plan checkboxes are all preserved. No Claude attribution in the body.

### Independent Findings

- None. Architecture is clean (core framework-agnostic, submit lives in its own dynamic-import chunk, no DOM/Node leaks into universal surface), no `any`, no magic numbers (all caps-hoisted), no deep nesting, no dead code, naming is clear, redaction runs on every free-form field before the wire, cross-runtime safety is correct, tests cover every documented failure branch.

### Tooling

- `pnpm install --frozen-lockfile`: pass
- `pnpm lint`: pass
- `pnpm type-check`: pass (both packages)
- `pnpm test`: pass (164/164 sdk, 1/1 react)
- `pnpm build`: pass (ESM + CJS + DTS for both packages)
- `gzip -kc packages/sdk/dist/index.js | wc -c`: **2044** (budget 2048)
- `gh pr checks 22`: pass (check ×2, codecov/patch, codecov/project)

## Validation — 2026-04-13 (re-validation after PR-body fix)

**Verdict**: APPROVED

### Items Confirmed Fixed

- [x] PR #22 body rewritten as claimed — confirmed via `gh pr view 22 --json body`:
  - Bundle line reads "Eager core chunk (`dist/index.js`): **2044 B gzipped — under the 2 kB (2048 B) budget.**" — no stale "2110" / "62 B over" remaining.
  - New `## SDD § 12 update (cross-repo)` section links `tatlacas-com/brevwick-ops#7` (`docs/sdd-submit-result-tagged-union`) as the companion SDD contract update.
  - Old "Contract diverges from the SDD" section is gone; task-prompt deviations preserved under renamed `## Deviations from the task prompt (intentional)` header.
  - Bullets for attachment validation (≤ 5, ≤ 10 MB, MIME whitelist), `userContext()` throw safety (logged to console ring, submit still succeeds), and 4xx body redaction all present under `## Summary`.
  - Test plan includes the claimed eight new boxes: happy-path + msw failure branches, attachment validation rejection, throwing `userContext`, redaction golden fixture, `display_name: 'Bearer sk_live_...'` redaction, ring-not-re-redacted invariant, 4xx body redaction, `Authorization: Bearer pk_*` on both presign and reports, `X-Brevwick-SDK` loop-guard assertion, bundle budget recorded.
  - `chunk-split.test.ts` enforcement of both the no-submit-symbols invariant and the 2048 B ceiling is called out under `## Bundle size`.
- [x] Checklist `Items Returned to Fixer` entry flipped to `- [x]` at `notes/reviews/pr-22-claude-review.md:143`.
- [x] Ops PR `tatlacas-com/brevwick-ops#7` — still OPEN, `docs/sdd-submit-result-tagged-union`, +42 -5 against `docs/brevwick-sdd.md`. § 12 diff intact.

### Items Returned to Fixer

- None.

### Independent Findings

- None. No code changes since the prior validation round; a spot-check of the diff (0 file mutations this round — body-only) confirms no drift. No banned scapegoating phrases anywhere in the checklist.

### Tooling (re-run)

- `pnpm install --frozen-lockfile`: pass
- `pnpm lint`: pass
- `pnpm type-check`: pass (sdk + react)
- `pnpm test`: pass (164/164 sdk, 1/1 react)
- `pnpm build`: pass (ESM + CJS + DTS, both packages)
- `gzip -kc packages/sdk/dist/index.js | wc -c`: **2044** (budget 2048)
- `gh pr checks 22`: pass (check ×2, codecov/patch, codecov/project)
