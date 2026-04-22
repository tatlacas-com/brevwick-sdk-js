---
'brevwick-react': patch
'brevwick-sdk': patch
---

test(integration): MSW + live-API e2e coverage

Adds an end-to-end integration suite under
`packages/{sdk,react}/src/__tests__/integration/` that exercises real ring
installation, the redaction matrix per secret class, the runtime lazy-load
guard for `modern-screenshot`, golden payload pinning, and a React render
through the real `createBrevwick` pipeline. No shipped behaviour change —
test-only coverage hardening.

The package version bumps are no-op patches that keep the two packages in
lockstep per the repo's pre-1.0 versioning policy.
