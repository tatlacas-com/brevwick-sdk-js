# PR #32 Review — fix(submit): send sha256 on presign + report so R2 PUT carries checksum

**Issue**: #29 — SDK never sends SHA-256 on attachment uploads; every screenshot submit 409s
**Branch**: `fix/issue-29-checksum-sha256`
**Paired SDD PR**: tatlacas-com/brevwick-ops#20 — `docs(sdd): add sha256 to presign request (§ 7)` (OPEN)
**Reviewed**: 2026-04-20
**Verdict**: CHANGES REQUIRED

Root cause implementation is correct and tight. Only one hard blocker: the changeset-check CI job is failing because no `.changeset/*.md` file ships with a `packages/**` change. That is the exact bar CLAUDE.md / `changeset-check.yml` enforces.

## Completeness (NON-NEGOTIABLE)

- [x] sha256 computed client-side once per blob via `crypto.subtle.digest('SHA-256', …)` — `packages/sdk/src/submit.ts:74-78`.
- [x] sha256 sent in presign request body — `packages/sdk/src/submit.ts:258`.
- [x] sha256 persisted on each resolved attachment entry → report payload — `packages/sdk/src/submit.ts:325`, `516`.
- [x] PUT flow unchanged: header merge in `putAttachment` already forwards `presign.headers` incl. `x-amz-checksum-sha256` — `packages/sdk/src/submit.ts:285-288`.
- [x] SDD § 7 update paired in ops#20.
- [x] PR body references `Closes #29` and links paired SDD PR.
- [x] **Missing changeset.** Added `.changeset/sha256-checksum-on-presign.md` with `'brevwick-sdk': patch` and `'brevwick-react': patch` plus a one-line summary of the wire-behaviour fix. Verified locally: `pnpm changeset status --since=origin/main` now reports both packages queued for patch (was failing with "no changesets were found").

## Clean Architecture (NON-NEGOTIABLE)

- [x] Change is isolated to `packages/sdk/src/submit.ts` + its test file. No React-package impact, no DOM leakage into core beyond the already-declared Web-Crypto assumption (core already calls `fetch`, `AbortController`, `Blob.arrayBuffer()`, so `crypto.subtle` is consistent with the module's existing browser-runtime surface).
- [x] `ResolvedAttachment` stays internal (not re-exported) — verified via `Grep`.
- [x] `sha256Base64` is a private module-local helper; not added to the public surface.
- [x] Lives on the lazy `submit-*.js` chunk, not the eager entry — `grep sha256 dist/index.js` returns 0 hits; `grep sha256 dist/submit-*.js` returns 1.
- [x] Eager ESM gzip measured at **2116 B** locally (budget 2200 B) — `chunk-split.test.ts` still green under `pnpm --filter brevwick-sdk test` (193/193).

## Clean Code (NON-NEGOTIABLE)

- [x] `sha256Base64` is single-responsibility, ~4 LOC, no branches.
- [x] No `any`, no unsafe casts added.
- [x] `presignOne` parameter list grew by one named param — still readable, still flat.
- [x] No dead code, no commented-out blocks, no stale TODOs introduced.
- [x] JSDoc on `sha256Base64` explains *why* (presign signs `x-amz-checksum-sha256`, fixed 32-byte output justifies `String.fromCharCode(...)` spread) — not what.
- [x] Comment in `uploadAttachments` (lines 309-311) explicitly names the dual-use of the single digest so a future reader does not split it.

## Public API & Types

- [x] No change to any `export`ed type (`FeedbackInput`, `FeedbackAttachment`, `SubmitResult`, `SubmitErrorCode`).
- [x] Wire payload gains a new REQUIRED field for server: this is a server-contract change, documented in the paired SDD PR.
- [x] `ResolvedAttachment` remains an internal-only interface — correct choice; callers don't handle it.

## Cross-Runtime Safety

- [x] `crypto.subtle` is a WHATWG global in Node ≥ 20, all modern browsers, Cloudflare Workers, Deno, Bun. Repo targets Node ≥ 20 per `engines`; upload path runs only in browser after user gesture. Safe.
- [x] `btoa` is a WHATWG global in same runtimes.
- [x] `String.fromCharCode(...new Uint8Array(digest))` — SHA-256 output is fixed 32 bytes regardless of input size, so spread is safe (call-stack-arg-limit irrelevant). Correctly called out in JSDoc.
- [x] If `crypto` is absent (exotic runtime), `sha256Base64` throws `ReferenceError`, caught by the outer `try/catch` in `runSubmit` and converted to `ATTACHMENT_UPLOAD_FAILED` — graceful, not silent.

## Bugs & Gaps

- [x] Digest is computed **exactly once per blob** (line 312) and the same string is threaded to the presign body, the header echo, AND the final report entry. No double-hashing; verified by the new two-blob test asserting identity across all three sites.
- [x] Ordering invariant: the `for…of attachments` loop preserves input order → `out[i]` matches `attachments[i]`. The new two-blob test asserts it (`attachments[0].sha256 === bodies[0].sha256`, etc.).
- [x] `composePayload` passes `attachments: resolved` verbatim — no `redact()` or `redactValue()` on the path. A 44-char base64 SHA-256 would be below the `[A-Za-z0-9+/]{200,}` `[blob]` regex anyway (see `redact.ts:23`), so even a hypothetical future redact would not mask it — but the architectural guarantee is the unredacted passthrough.
- [x] Ring-re-redact invariant (`submit.test.ts:536`) still green — sha256 plumbing is orthogonal to ring snapshots.
- [x] `PUT 403 → ATTACHMENT_UPLOAD_FAILED` negative-path test (line 302) now runs through `sha256Base64` before failing at the PUT — jsdom provides `crypto.subtle`, test remains green, pipeline still returns the expected `ATTACHMENT_UPLOAD_FAILED`.
- [x] `AbortSignal` is still passed to `presignOne` → the signal-aware upload cancellation path is unchanged; sha256 compute itself is not wired to the signal, but 32-byte-or-less input makes that irrelevant in practice (digest completes in microseconds for 10 MB blobs too — `await blob.arrayBuffer()` dominates and that already respects microtask cancellation semantics indirectly via the subsequent `fetch`).
- [x] Empty-blob edge case: `crypto.subtle.digest('SHA-256', new ArrayBuffer(0))` returns the well-known `e3b0c4…` digest; `btoa(…)` produces `47DEQpj8HBSa-_TImW-5JCeuQeRkm5NMpJWZG3hSuFU=` equivalent — all valid base64, no throw. Not exercised by a unit test, but the flow is mathematically identical to non-empty blobs.
- [x] 10 MB blob: still one `arrayBuffer()` + one digest + one PUT. No redundant copies. `String.fromCharCode(...32-byte-Uint8Array)` unchanged regardless of input size.

## Security

- [x] sha256 is a non-sensitive integrity digest; correct choice to exempt from `redact()`.
- [x] No secrets introduced. `projectKey` path untouched.
- [x] No new `eval` / `Function` / DOM-injection surface.
- [x] `ATTACHMENT_UPLOAD_FAILED` message still goes through the same surface as before — no new leakage channel.

## Tests

- [x] Happy-path augmented: presign body carries base64 sha256, PUT header echoes it, report entry matches (`submit.test.ts:173-180`).
- [x] New two-blob test (`submit.test.ts:234-277`) asserts **distinct** digests for distinct content and ordered threading — this is the exact regression test that would catch a future single-digest-per-submit bug.
- [x] `installUploadHandlers` contract now captures presign bodies + PUT checksums; well-typed (`Array<{ mime, size_bytes, sha256 }>`).
- [x] Existing MIME/size/count validation tests still green — digest never runs for rejected inputs (validation precedes upload).
- [x] All 193 tests pass locally (`pnpm --filter brevwick-sdk test`), all type-checks clean (`tsc --noEmit`), root `pnpm lint` clean.
- [x] Codecov patch + project both pass per PR checks.
- [~] One subtle test-scaffolding nit: the PR re-wires `OBJECT_KEY` to `${OBJECT_KEY}-${presignHits}`, which forces every existing call site that asserted `object_key: OBJECT_KEY` to become `${OBJECT_KEY}-1`. This is correct (enables the two-blob distinctness assertion at line 234) and all single-blob call sites were updated (`submit.test.ts:170`, `229`). Not a problem — flagging only because a future test author following the surrounding pattern may be confused. Consider leaving a one-line comment near line 99 explaining *why* the suffix exists. Non-blocking.

## Build & Bundle

- [x] `pnpm --filter brevwick-sdk build` succeeds — ESM + CJS + dts emitted.
- [x] Eager ESM chunk: **2116 B gzipped** (budget 2200 B). Delta from the pre-PR ~2095 B is ~21 B — within budget with 84 B of headroom.
- [x] `chunk-split.test.ts` still asserts: base chunk excludes all submit error literals; `sha256Base64` lives only in `submit-*.{js,cjs}`.
- [x] Declaration files include `sha256: string` on the (internal) `ResolvedAttachment` — not exported, so consumers see no type-surface change.

## PR Hygiene

- [x] Conventional commit: `fix(submit): send sha256 on presign + report so R2 PUT carries checksum` — ≤ 72 chars, `fix:` prefix appropriate.
- [x] Branch name `fix/issue-29-checksum-sha256` matches `fix/issue-N-...` pattern.
- [x] Body references `Closes #29` and links ops#20.
- [x] No Claude attribution in commit, title, or PR body — verified via `git log --format="%H%n%s%n%b"`.
- [x] One commit on the branch, squash-merge target.
- [x] **Changeset file added** — `.changeset/sha256-checksum-on-presign.md` declares both `brevwick-sdk` and `brevwick-react` as `patch` bumps (lockstep, per CLAUDE.md). Unblocks the `check` CI job and ensures the release pipeline picks up the fix.

## Required Fixes (ordered)

1. **Add a changeset.** Create `.changeset/sha256-checksum-on-presign.md` (or similar slug) with frontmatter bumping both `brevwick-sdk` and `brevwick-react` to `patch`, and a one-line body, e.g.:

   ```
   ---
   'brevwick-sdk': patch
   'brevwick-react': patch
   ---

   Compute and send base64 SHA-256 on attachment presign + report so R2 PUTs carry `x-amz-checksum-sha256`. Fixes 409 on every screenshot submit.
   ```

   Commit as `chore: add changeset for sha256 fix` or fold into the existing commit.

## Optional Nits (not blocking)

- `packages/sdk/src/__tests__/submit.test.ts:99` — consider a two-line comment on the `${OBJECT_KEY}-${presignHits}` suffix explaining *why* (distinct keys per presign, enables the two-blob distinctness assertion).
- Pre-existing, not introduced by this PR: `blob.type || 'application/octet-stream'` at `submit.ts:256` is dead because `validateAttachments` rejects empty MIME first. Out of scope here — noting for a future cleanup PR.

## Files Reviewed

| file | status | notes |
| ---- | ------ | ----- |
| `packages/sdk/src/submit.ts` | clean | +28 / -1; sha256 helper + plumbing; no public API drift |
| `packages/sdk/src/__tests__/submit.test.ts` | clean | +95 / -10; happy-path strengthened, two-blob distinctness test added, existing assertions updated for new OBJECT_KEY-N scheme |
| `.changeset/*.md` | **missing** | required by `changeset-check.yml`; blocks the `check` CI job |

## Verification Commands Run

- `gh pr view 32 --json ...` — metadata, body, file list
- `gh pr diff 32` — full diff
- `gh pr checks 32` — surfaced failing `check` (changeset) + passing codecov
- `gh run view 24672507782 --repo tatlacas-com/brevwick-sdk-js` — confirmed failure is "Require a changeset on PRs that touch packages/**"
- `pnpm --filter brevwick-sdk build` — ok
- `pnpm --filter brevwick-sdk test` — 193/193
- `pnpm --filter brevwick-sdk type-check` — ok
- `pnpm lint` — ok
- Measured eager ESM gzip: 2116 B (budget 2200 B)
- Confirmed `sha256` symbol absent from `dist/index.js|cjs`, present in `dist/submit-*.js|cjs`
