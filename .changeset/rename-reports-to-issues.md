---
'@tatlacas/brevwick-sdk': major
'@tatlacas/brevwick-react': major
---

BREAKING: rename Report → Issue across the public API. The SDK now submits
"issues" and exposes `Issue*` types.

- `SubmitResult` success shape: `{ ok: true; report_id: string }` →
  `{ ok: true; issue_id: string }`.
- Ingest endpoint path: `POST /v1/ingest/reports` → `POST /v1/ingest/issues`
  (paired server-contract change tracked in brevwick-api + SDD § 12).
- JSDoc, wire field names, test fixtures, and example prose all follow
  the same rename.

Callers that destructure `report_id` from the `submit()` result must
update to `issue_id`; consumers of the ingest URL must point at
`/v1/ingest/issues`. No transitional alias is shipped — this is a major
version bump precisely because the shape is incompatible.
