---
'@tatlacas/brevwick-sdk': minor
'@tatlacas/brevwick-react': minor
'@tatlacas/brevwick-solid': minor
'@tatlacas/brevwick-vue': minor
'@tatlacas/brevwick-svelte': minor
'@tatlacas/brevwick-angular': minor
---

Landing-parity bundle for the SDK payload — closes #75, #76, #77.

- **Console ring (#75):** patches all five console levels (`log` / `info` / `warn` / `error` / `debug`) by default into a 50-entry FIFO. New `BrevwickRingsConfig.console` accepts the legacy `boolean` shorthand or the object form `{ levels?, max? }` (hard ceiling 200) for finer-grained control. Existing `error` + unhandled-rejection paths stay regardless of the levels filter.
- **Network ring (#76):** captures every completed fetch + XHR (success + failure) by default into a 20-entry FIFO. New `BrevwickRingsConfig.network` accepts `boolean` or `{ captureSuccess?, max? }` (hard ceiling 100). `NetworkEntry.error` is now optional. **Wire-contract change:** the ingest payload renames `network_errors` → `network_calls`; the companion `brevwick-api` change ships in lockstep.
- **Redact expansion (#77):** the on-device redactor gains card numbers (Luhn-gated to skip false positives), IPv4 / IPv6 literals, US SSN + UK NI numbers, E.164 phone numbers (digit-count sanity check), AWS access keys, and GitHub tokens. New `BrevwickConfig.redact: { disable?, custom? }` lets projects turn off built-ins by name (`'auth' | 'cookie' | 'bearer' | 'jwt' | 'email' | 'card' | 'ip' | 'ssn' | 'phone' | 'aws' | 'github' | 'base64'`) or extend with project-specific patterns.

**Bundle budget bump:** the eager `core` chunk's gzip ceiling moved from 2.2 kB → 2.85 kB to absorb the new ring-config + redact-config validators in `core/validate.ts`. The expanded redact patterns + Luhn helper themselves stay in the dynamic-imported ring + submit chunks. Mirrored in `CLAUDE.md`, `.size-limit.js`, and `chunk-split.test.ts`.
