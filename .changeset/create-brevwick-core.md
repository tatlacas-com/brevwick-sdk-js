---
'brevwick-sdk': minor
'brevwick-react': minor
---

Add `createBrevwick(config)` factory with `install()` / `uninstall()` lifecycle and bounded FIFO ring buffers (console 50, network 50, routes 20). Canonicalises the `endpoint` so typo-equivalents (trailing slash, host casing) collapse to the same singleton key. `uninstall()` evicts the instance from the singleton registry so a subsequent `createBrevwick` call with the same key returns a fresh, installable instance. Ring modules land in follow-up PRs (#2 / #3) and are wired in by direct import, not module-side-effect registration, so the SDK's `"sideEffects": false` contract stays safe under tree-shaking. Freezes the public surface to exactly `createBrevwick`, `Brevwick`, `BrevwickConfig`, `FeedbackInput`, `SubmitResult`, `FeedbackAttachment`, `Environment`.
