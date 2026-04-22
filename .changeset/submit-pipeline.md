---
'@tatlacas/brevwick-sdk': minor
'@tatlacas/brevwick-react': minor
---

Add `submit(input)` pipeline: presigns each attachment, PUTs to the returned URL, then POSTs `/v1/ingest/issues` under a 30 s `AbortController` budget with one initial attempt + two retries on 5xx / network errors. Public type `SubmitResult` becomes a tagged union — `{ ok: true; issue_id: string } | { ok: false; error: { code: SubmitErrorCode; message: string } }` — so callers discriminate on `ok` and the pipeline never throws (breaking change versus the prior `{ issueId }` shape). New exports: `SubmitError`, `SubmitErrorCode`, and `FeedbackAttachment` (which widens `FeedbackInput.attachments` to `Array<Blob | FeedbackAttachment>`). All free-form text and `user_context` extras run through `redact()` before the wire; `config.user.email` is masked as `a***@d***.tld`; ring snapshots flow through unchanged because they were redacted at capture. Attachments are validated client-side (≤5 count, ≤10 MB each, MIME ∈ {image/png, image/jpeg, image/webp, video/webm}) before any presign round-trip. The submit pipeline lives in its own dynamic-import chunk so the eager core stays under the 2 kB gzip budget.
