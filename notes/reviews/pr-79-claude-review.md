# PR #79 Review — feat(sdk): landing-parity — console + network rings + redact expansion

**Issues**: #75 (console all-levels), #76 (network all-fetches), #77 (redact expansion)
**Branch**: `feat/landing-parity-rings`
**Reviewed**: 2026-05-01
**Verdict**: CHANGES REQUIRED

A polished landing-parity bundle that genuinely closes #75 / #76 / #77 with good test coverage and a justified bundle-budget bump. CI is green, type-check + lint clean, 237/237 tests pass. The blocking issues are: (1) a broken TypeScript snippet in `packages/sdk/README.md` line 153 (semicolon-in-object-literal — does not compile, will mislead any user copy-pasting the legacy errors-only example); (2) missing redaction-matrix coverage for the **`phone`** built-in pattern (CLAUDE.md mandates: "Adding a new context field? Add a redaction test for it" — the pattern has unit-level coverage in `redact.test.ts` but is absent from the `CASES` table that the matrix iterates, and it is the single highest-false-positive pattern in the new set, so the integration matrix is exactly where it should be exercised); (3) misleading JSDoc on `BrevwickRedactConfig.custom` claiming customs can "unmask after a built-in" — once a built-in replaces text, the original token is gone and a custom RegExp can no longer recover it. Everything else is non-blocking nits.

## Completeness (NON-NEGOTIABLE)

- [x] Issue #75 — all five console levels patched with `{ levels?, max? }` config, 50-entry default, 200 hard ceiling.
- [x] Issue #76 — every completed fetch + XHR captured by default with `{ captureSuccess?, max? }`, 20-entry default, 100 hard ceiling, `error?` relaxed on `NetworkEntry`, wire field renamed `network_errors` → `network_calls`.
- [x] Issue #77 — six new built-in patterns (`card` Luhn-gated, `ip` v4+v6, `ssn` US+UK, `phone` length-gated, `aws`, `github`) plus `BrevwickConfig.redact: { disable, custom }`.
- [x] Bundle budget bumped (2.2 → 2.85 kB) — synced across `.size-limit.js`, `chunk-split.test.ts`, `CLAUDE.md`, `packages/sdk/README.md`, and the changeset.
- [x] **`phone` pattern missing from the redaction-matrix `CASES` table** — fixed: added `E.164 phone number` row with raw `+1 415 555 0199` → marker `[phone]` to the `CASES` array (alongside the new UK NI row). The `disable: ['phone']` test continues to live below for the negative-path assertion.

## Clean Architecture (NON-NEGOTIABLE)

- [x] `@tatlacas/brevwick-sdk` stays framework-agnostic. No React / Solid / DOM-only imports leaked into the core.
- [x] `redact()` is **not** re-exported on the public surface — only the `BrevwickConfig.redact` config hook is. Header docstring in `packages/sdk/src/core/internal/redact.ts:5-7` correctly states the contract.
- [x] Redaction continues to happen at the ring boundary (console / network) and at the submit boundary; no payload escapes redact-on-write.
- [x] Per-instance redactor threading: `submit.ts` builds a `Redactor` from `config.redact` and passes it into `composePayload` / `postIssue` / `redactValue` — no module-level mutable state, multiple concurrent SDK instances stay isolated.
- [x] Public type surface in `packages/sdk/src/index.ts` is intentional: `BrevwickRedactConfig`, `BrevwickRingsConfig`, `ConsoleLevel`, `ConsoleRingConfig`, `NetworkRingConfig`, `RedactCustomPattern`, `RedactPatternName` are all exposed, and the `Redactor` runtime helper is correctly **not** exposed.
- [x] `"sideEffects": false` honoured — eager budget verified at 2.72 kB (under the 2.85 kB ceiling).

## Clean Code (NON-NEGOTIABLE)

- [x] No new `any` introduced. The `as unknown as Record<string, unknown>` casts on `console[level] = …` in `rings/console.ts:170` and `:204` are acceptable because the `Console` interface has fixed method names — TS rightly forbids assigning to the typed methods, the cast is the standard escape hatch, and the only callable shape is preserved by the closure.
- [x] `parseRingConfig` in `validate.ts:244-258` is a clean DRY refactor of console + network parsing — both rings share the boolean-or-object handling, max-bound parsing, and the typed `extras` callback.
- [x] `createRedactor` is a closure factory that captures the disable Set + custom array — small, single-responsibility, easy to test (and tested in `redact.test.ts`).
- [x] No commented-out blocks. No stale TODOs introduced.
- [x] `packages/sdk/src/types.ts:64-73` JSDoc — fixed: rewrote the `BrevwickRedactConfig.custom` docstring (and the corresponding `BrevwickConfig.redact` docstring) to state that custom patterns run after built-ins so they can mask substrings the built-ins left alone, and explicitly that they cannot recover text a built-in already replaced. Now in sync with the internal comment in `redact.ts:147`.
- [x] `packages/sdk/src/types.ts:11` — fixed two ways for defence-in-depth: (a) public type is now `levels?: readonly ConsoleLevel[]` so callers see "do not mutate" at compile time; (b) `parseConsoleRing` snapshots with `[...]` so a consumer mutating their array post-init cannot reach inside the validated config (TS `readonly` is erased at runtime). Cheap (≤ 5 entries) and one-shot.

## Public API & Types

- [x] New types exported from `index.ts` are explicit, narrow, and discriminated where it matters (e.g. `ConsoleLevel` is a closed string-literal union).
- [x] `RedactPatternName` enumeration matches the validator's `REDACT_PATTERN_NAMES` and `redact.ts`'s `BUILTIN[].name` set — single source of truth.
- [x] Changeset present (`.changeset/landing-parity-rings.md`), correctly tagged `minor` for the pre-1.0 wire-rename per CLAUDE.md "minor: anything else (no SemVer guarantee in 0.x)".
- [x] JSDoc present on every public export.
- [x] `packages/sdk/README.md:153` — fixed: replaced the semicolon with a comma and added the trailing comma after the `console:` value so the legacy errors-only example is now valid TypeScript matching the style of the block above.

## Cross-Runtime Safety

- [x] `rings/console.ts` still gates the `window.addEventListener` calls implicitly via `installConsoleRing` only running inside `client.ts:install()`, which short-circuits when `window === undefined`. No regression.
- [x] `rings/network.ts` uses `globalThis.fetch` as the patch target with a defensive `typeof window !== 'undefined'` check before mirroring to `window.fetch` (line 384) — edge / worker safe.
- [x] No new Node-only globals (`process`, `Buffer`, `fs`) introduced in browser-safe modules.
- [x] Validator and redactor are pure / synchronous — usable in any runtime.

## Bugs & Gaps

- [x] **Phone matcher false-positive surface is wider than the docs imply.** — addressed by lifting the FP examples (ISO-8601 timestamps, all-digit-prefix SHA hashes, 8-15-digit order/national IDs) into the README's `redact` section so users discover the `disable: ['phone']` override before they see the FP in production payloads. The matrix integration test now also pins the positive `[phone]` masking, so a future tightening of the regex shows up as a focused matrix failure. Empirically (verified by running the BUILTIN array against representative inputs), the phone pattern (`\+?\d[\d\s\-()]{7,}\d`) currently masks:
  - ISO-8601 timestamps: `2026-05-01T10:30:45` → `[phone]T10:30:45`
  - SHA hex hashes whose first 8+ hex chars happen to be all-digits: `0123456789abcdef…` → `[phone]abcdef…` (twice for a 64-char hash)
  - Order numbers / tracking IDs of 8-15 digits: `12345678` → `[phone]`
  - SA-ID and other national-ID formats: `9001015800087` → `[phone]`
  The PR body and README both call this out (most-false-positive-prone, gated behind `disable: ['phone']`), so it is a **documented trade-off** rather than a defect. Flagging because: (a) the README's only example for `disable` is `['phone']`, which suggests the team already knows this is the common-case override — consider lifting the timestamp / hash false-positive examples into the README so users discover the override before they see the FP in production payloads, and (b) the redaction-matrix should pin the failure modes you accept (e.g. an explicit "ISO timestamp DOES get masked by phone — change `disable: ['phone']` if that hurts you" assertion) so a future tightening of the regex doesn't silently break consumers who rely on the current behaviour. Not blocking.
- [x] **IPv6 coverage is partial.** — fixed by broadening the `IPV6` regex to cover compressed link-local (`fe80::1`), ULA (`fc00::1`), generic compressed forms (`<hex>::<hex>` with full hex-block prefixes/suffixes), full eight-group uncompressed forms, and scoped-id forms (`fe80::1%eth0`); reordered `BUILTIN` so IPv6 runs before IPv4 (otherwise IPv4 strips the `::ffff:1.2.3.4` tail first and the generic IPv6 branch is left masking the orphan `::ffff` prefix). Added unit tests in `redact.test.ts` for full + compressed link-local + ULA + scoped + IPv4-mapped + loopback forms, plus a stricter `2001:db8:0:1::abcd` assertion that pins the entire-address-mask contract (was `.toContain('[ip]')` — would silently pass on a future prefix-only regression). Added a link-local-with-zone case to the integration matrix `CASES` table. Confirmed the SemVer / time-of-day negative cases (`12:30`, `^1.2.3`, `localhost:3000`) still pass through unmasked. Bundle eager core size: 2.73 kB / 2.74 kB (still under the 2.85 kB ceiling). For posterity, `IPV6` regex in `redact.ts:42-43` originally matched:
  - `2001:db8:0:1::abcd` ✓
  - `::1` (loopback) ✓
  - `::ffff:1.2.3.4` ✓
  But misses common production forms:
  - `fe80::1` link-local — only the trailing `::1` portion gets masked, leaving `fe80` exposed
  - `fe80::1%eth0` (with zone-id) — same partial mask
  Acceptance criterion in #77 says "IPv4 / IPv6 literals — replace with `[ip]`" without enumerating sub-forms, so this is technically passing — but the matrix only proves `2001:db8:0:1::abcd`. If the partial-mask of `fe80::1` is intentional, document it; if not, broaden the regex.
- [x] Redactor cleanup: every ring's `installXxx` builds a fresh `Redactor` per install, no shared mutable state, no leak.
- [x] Console ring uninstall correctly restores **all five** levels via the `originals` snapshot loop in `console.ts:203-205`. The previous "only `error` + `warn` restored" hole is closed.
- [x] `console: false` (boolean shorthand) → `ringEnabled` returns false → `installConsoleRing` never runs → window error + unhandledrejection listeners do **not** install. This matches issue #75 ("`console: false` is still a full opt-out") and the test at `console.test.ts:282-300` correctly asserts the orthogonal "even with `levels: []` the listeners still fire" path. Consistent.
- [x] No race conditions added. Async ring loaders still gated by the existing `generation` counter in `client.ts`.

## Security

- [x] Redactor still runs **before** payload leaves the device — confirmed via `submit.ts:543` (`createRedactor` per submission) → `composePayload` → wire.
- [x] No `eval` / `Function()` / `dangerouslySetInnerHTML`.
- [x] Custom regexes are user-supplied — they execute in the user's own runtime against the user's own captured strings, no injection risk.
- [x] Redaction is **defence-in-front** of the API sanitiser, per CLAUDE.md ("Server-side sanitiser is defence-in-depth, not a substitute"). Companion brevwick-api PR is mentioned but unchecked in the PR body — out of scope for this repo.

## Tests

- [x] 237/237 tests pass (`pnpm --filter @tatlacas/brevwick-sdk test`).
- [x] Console ring: all-five-levels patched + originals called (`console.test.ts:74-100`); levels filter respected (`console.test.ts:106-124`); FIFO max plumbing (`console.test.ts:126-156`); per-level redaction uniformity (`console.test.ts:158-180`); cross-level dedupe (`console.test.ts:182-194`); window-error capture regardless of levels filter (`console.test.ts:282-300`); clean uninstall across all five levels (`console.test.ts:324-356`).
- [x] Network ring: 200 capture default-on (`network.test.ts:134-156`); `captureSuccess: false` opt-out (`network.test.ts:158-172`); same coverage for XHR (`network.test.ts:587+`).
- [x] Redact unit tests: every new built-in (`redact.test.ts:35-72`), Luhn pass + fail pair, phone length gate (`redact.test.ts:53-57`), `createRedactor` disable + custom (`redact.test.ts:75-94`).
- [x] Validator: console.levels with bad name, console.max above ceiling, network.max above ceiling, redact.disable with unknown name, redact.custom with non-RegExp entry — all rejected with `BREVWICK_INVALID_CONFIG` (`validate.test.ts:80-100`).
- [x] Golden-payload integration covers all-five-levels console interleave + 200 + 500 network interleave under the new `network_calls` wire field (`golden-payload.test.ts:130-208`).
- [x] Redaction-matrix integration covers `card` (Luhn-pass), `ip` v4 + v6, `ssn` US, `aws`, `github`, plus the Luhn-fail false-positive guard, `redact.disable` (phone), and `redact.custom` (`redaction-matrix.test.ts:84-211`).
- [x] **`phone` missing from the matrix `CASES` table** — fixed (see Completeness checklist above).
- [x] **UK NI matcher** — fixed: added a `UK National Insurance number` row (raw `AB 12 34 56 C` → marker `[ssn]`) alongside the US SSN entry in the `CASES` array. The matrix now covers every BUILTIN entry plus the per-class negative-path assertions.

## Build & Bundle

- [x] `pnpm build` succeeds across all packages (verified by passing CI's `check` and `size-check` jobs at <https://github.com/tatlacas-com/brevwick-sdk-js/actions/runs/25195087054>).
- [x] `chunk-split.test.ts` budget bumped to 2850 bytes; current eager gzip 2.72 kB sits comfortably under (PR body line: "+570 B vs prior baseline"). Comment in `chunk-split.test.ts:84-92` is updated and tells future-you exactly which subsystem grew the bundle.
- [x] `.size-limit.js` mirror of the budget is in sync; the comment at `.size-limit.js:33-40` is the single best on-ramp for the next person who has to defend or move this number.
- [x] Public type re-exports in `index.ts` cover the new types — declaration emit is clean.
- [x] No new dependencies introduced. The Luhn helper is hand-rolled (~10 LOC) — correct call vs pulling a 1 kB package.

## PR Hygiene

- [x] Title follows conventional commits (`feat(sdk):`).
- [x] Body links `Closes #75 / #76 / #77`.
- [x] No Claude attribution anywhere (commit author is `Tatenda Caston`, signing key is the user's; PR body explicitly disclaims it).
- [x] Branch name `feat/landing-parity-rings` matches `feat|fix|chore/<short-description>` from CLAUDE.md.
- [x] Changeset entry covers the wire-rename behaviour change in plain language and lists every adapter package — correct since `network_calls` flows through every framework binding.
- [x] CI: all six checks green (`check`, `codecov/patch`, `codecov/project`, `size-check`, `verify-signatures`).
- [x] `packages/sdk/README.md:153` syntax error in the legacy-errors-only example — fixed (see Public API checklist).

## Files Reviewed

| file | status | notes |
| ---- | ------ | ----- |
| `.changeset/landing-parity-rings.md` | ok | Captures the wire-rename behaviour change. |
| `.size-limit.js` | ok | Budget bump + thorough rationale comment. |
| `CLAUDE.md` | ok | Bundle budget mirrored. |
| `packages/sdk/README.md` | **changes** | Line 153 invalid TS (semicolon in object literal). |
| `packages/sdk/src/__tests__/chunk-split.test.ts` | ok | 2850-byte ceiling + updated comment. |
| `packages/sdk/src/__tests__/integration/__fixtures__/composed-payload.json` | ok | `network_calls` rename. |
| `packages/sdk/src/__tests__/integration/full-flow.test.ts` | ok | `network_calls` rename + `find` over indexed access (correct given default-success-capture changes the indexing). |
| `packages/sdk/src/__tests__/integration/golden-payload.test.ts` | ok | Five-level console interleave + 200/500 network mix; asserts `network_errors` is gone. |
| `packages/sdk/src/__tests__/integration/redaction-matrix.test.ts` | **changes** | Missing `phone` in CASES table; UK NI not in matrix. |
| `packages/sdk/src/__tests__/submit.test.ts` | ok | `network_calls` rename. |
| `packages/sdk/src/core/__tests__/validate.test.ts` | ok | New ring-config + redact branches all covered. |
| `packages/sdk/src/core/client.ts` | ok | `ringEnabled` helper handles the route-vs-rest split cleanly. (Pre-existing duplicated comment block at lines 215-220 is from #21 — not this PR.) |
| `packages/sdk/src/core/internal/__tests__/redact.test.ts` | ok | New patterns + `createRedactor` disable / custom paths. |
| `packages/sdk/src/core/internal/redact.ts` | ok | Clean factory; per-pattern guards (`'card'` / `'phone'`); built-in named pattern table is the single source of truth. |
| `packages/sdk/src/core/validate.ts` | ok | `parseRingConfig` shared scaffold; explicit ceilings; closed enum for `redact.disable`. |
| `packages/sdk/src/index.ts` | ok | New public types exported intentionally; `Redactor` runtime helper correctly kept internal. |
| `packages/sdk/src/rings/__tests__/console.test.ts` | ok | 14 cases incl. all-levels patch, levels filter, FIFO plumbing, per-level redaction, cross-level dedupe, window-error fallthrough, clean uninstall. |
| `packages/sdk/src/rings/__tests__/network.test.ts` | ok | New 200-default-capture + `captureSuccess: false` opt-out, both fetch and XHR. |
| `packages/sdk/src/rings/console.ts` | ok | Loop-based patch + restore over `ALL_LEVELS`; per-instance redactor; dedupe key correctly drops `level` so cross-level dedupe still works. |
| `packages/sdk/src/rings/network.ts` | ok | Single `if (!captureSuccess && response.status < 400) return response;` flip is the smallest possible diff for the spec change; XHR mirrors via `if (captureSuccess || xhr.status >= 400)`. |
| `packages/sdk/src/submit.ts` | ok | Per-instance `Redactor` threading; `network_errors` → `network_calls` field rename; no double-redaction (existing comment preserved at line 522). |
| `packages/sdk/src/types.ts` | **changes** | Misleading "unmask" claim in `BrevwickRedactConfig` JSDoc (line 70); `levels?: ConsoleLevel[]` should be `readonly` or copied at validation time. |
| `packages/react/src/__tests__/integration/__fixtures__/composed-payload.json` | ok | `network_calls` rename mirrored. |
