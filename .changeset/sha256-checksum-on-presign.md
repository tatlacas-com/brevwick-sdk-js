---
'brevwick-sdk': patch
'brevwick-react': patch
---

fix(submit): send sha256 on presign + report so R2 PUT carries checksum

Compute base64 SHA-256 client-side once per attachment blob (via
`crypto.subtle.digest`) and thread the same digest through the presign
request body, the PUT header echo, and the final report entry. Without
this the R2 bucket's required `x-amz-checksum-sha256` header is missing
and every screenshot submit 409s. Fixes #29. Paired server-contract
update: SDD § 7 (tatlacas-com/brevwick-ops#20).
