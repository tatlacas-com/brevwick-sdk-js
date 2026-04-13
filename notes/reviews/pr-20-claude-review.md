# PR #20 Review — feat(screenshot): captureScreenshot via dynamic import

**Issue**: #5 — feat(screenshot): captureScreenshot() via dynamic import
**Branch**: feat/issue-5-screenshot
**Reviewed**: 2026-04-13
**Verdict**: CHANGES REQUIRED

Summary of findings: the core shape of the PR is strong — dynamic import works, the
chunk split is verified in dist, bundle is under budget (1938 B gzip / 2048 B
ceiling), all 79 + 1 tests pass, lint/type-check/build all clean, CI green, no
Claude attribution. The two hard blockers are correctness defects in
`scrubSkippedNodes` / `restoreSkippedNodes` (concurrent-capture re-entrancy) and
in `capture()`'s error handling (a throw from `internal.push` escapes the
"never throws" contract). Public API hygiene around `CaptureScreenshotOpts`
and the SDD § 12 contract are the remaining items.

## Completeness (NON-NEGOTIABLE)

- [x] `captureScreenshot(opts?)` signature matches issue #5 AC (`{ element?, quality? }`).
- [x] Defaults applied (`document.documentElement`, `quality: 0.85`, `image/webp`) — `packages/sdk/src/screenshot.ts:83-84,89`.
- [x] Graceful fallback: returns placeholder WebP Blob + logs warn on failure.
- [x] `modern-screenshot` declared as optional peer dep, not in `dependencies`.
- [x] Chunk split verified by test + by inspection of built `dist/index.js` (no `modern-screenshot` string).
- [x] DOM pre/during/post state asserted (issue AC satisfied for the single-call case).
- [x] **SDD § 12 not updated for new public surface.** Fixed via companion cross-repo PR tatlacas-com/brevwick-ops#5 — documents `CaptureScreenshotOpts`, defaults, never-throws / placeholder-on-failure contract, `[data-brevwick-skip]` scrub/restore semantics (including the ref-counted concurrent-safe invariant), and `modern-screenshot` as an optional peer dependency.

## Clean Architecture (NON-NEGOTIABLE)

- [x] `brevwick-sdk` stays framework-agnostic — no React, JSX, or hooks introduced.
- [x] `modern-screenshot` isolated behind a dynamic `import('modern-screenshot')` — base chunk does not reference it (verified `packages/sdk/dist/index.js` contains no occurrence).
- [x] Internal seam `captureScreenshotForInstance` not exposed through the package root — `packages/sdk/src/index.ts` re-exports only the opts type and the public `captureScreenshot`; the instance-variant path stays private, wired only from `client.ts:157`.
- [x] `BrevwickInternal` used as a **type-only** import in `screenshot.ts:1` — no runtime coupling.
- [x] `sideEffects: false` honoured; the lazy wrapper in `index.ts` is a const arrow function with no import-time side effects.
- [x] Peer dep + `peerDependenciesMeta.optional` declaration correct; `modern-screenshot` absent from `dependencies`.
- [x] `exports` field remains minimal (single `.` entry). Lazy wrapper approach chosen over `./screenshot` sub-path — documented in `index.ts:21-26`. Correct call.

## Clean Code (NON-NEGOTIABLE)

- [x] **BLOCKER — concurrent-capture re-entrancy silently hides nodes permanently.** Fixed via a reference-counted pair of WeakMaps (`stashedOriginal` + `skipRefCount`) in `screenshot.ts`. Only the outermost concurrent scrub stashes the real `style.visibility`; nested scrubs increment the ref count. Only the final restore (ref count drops to 0) writes the stashed value back. Concurrent-call test added in `screenshot.test.ts` — two gated captures against the same `[data-brevwick-skip]` node; asserts visibility is `hidden` during and `visible` after.
- [x] **BLOCKER — `logFailure` throw escapes the "never throws" contract.** Fixed — `internal.push(...)` is now wrapped in try/catch; a throwing bus listener falls through to `globalThis.console?.warn?.(message)` so the message is still surfaced but the capture promise resolves with the placeholder. Throwing-listener test added — subscribes an `entry` handler that throws, triggers the failure path, and asserts `instance.captureScreenshot()` resolves with a `image/webp` Blob.
- [x] **BLOCKER (minor) — `scrubSkippedNodes` throw skips restore and breaks the never-throws contract.** Fixed — `let skipped: SkippedNode[] = []` is declared outside the try; `skipped = scrubSkippedNodes(element)` is the first statement inside the try. The `finally` therefore always runs, and any scrub-time throw is caught + logged + resolved with the placeholder.
- [x] No `any`, no unsafe casts. `isValidImageBlob` uses a correct user-defined type guard.
- [x] No dead code, no commented-out blocks.
- [x] Functions small (all under 20 lines), nesting stays < 3 levels.
- [x] Names reveal intent (`scrubSkippedNodes`, `restoreSkippedNodes`, `placeholderBlob`, `isValidImageBlob`).
- [x] Single-responsibility split between the public `captureScreenshot`, the instance-aware `captureScreenshotForInstance`, and the shared `capture` implementation.
- [x] Comments explain WHY (the VP8L placeholder comment at `screenshot.ts:11-12`, the lazy re-export comment at `index.ts:21-26`, the fallback-console comment at `screenshot.ts:69-70`).
- [x] **Nit — `placeholderBlob()` is allocated per-call.** Fixed — bytes are decoded once at module load into `PLACEHOLDER_BUFFER: ArrayBuffer`; `placeholderBlob()` constructs a fresh `Blob` around the shared buffer per call (so consumers that revoke are unaffected). Gzip baseline nudged from 1938 → 1936 B.

## Public API & Types

- [x] **`CaptureScreenshotOpts` fields missing JSDoc.** Fixed — both `element` and `quality` carry JSDoc, plus a top-level doc on the type itself that names the two fields as optional.
- [x] Exported types are explicit and narrow. No unnecessary re-exports.
- [x] No breaking change — pre-1.0 minor bump is correct per CLAUDE.md.
- [x] Public `captureScreenshot` signature preserved on `Brevwick` interface (`types.ts:92`): `captureScreenshot(): Promise<Blob>` — the instance method deliberately has no opts, which keeps the `Brevwick` surface stable and matches SDD.
- [x] No generic `Error` thrown for domain conditions — placeholder fallback instead.
- [x] Discriminated union (`RingEntry`) correctly used when pushing the console entry.

## Cross-Runtime Safety

- [x] `typeof document === 'undefined'` guard at `screenshot.ts:78` keeps the module safe to evaluate (via the lazy wrapper) in SSR / workers without throwing — it resolves to placeholder.
- [x] `atob` is available in Node ≥ 16, browser, and Edge runtimes. Acceptable for the SDK's advertised targets.
- [x] No Node-only globals (`process`, `Buffer`, `fs`) leaked into the module.
- [x] No DOM-only globals used outside the `typeof document !== 'undefined'` branch.
- [x] `globalThis.console?.warn?.(...)` at `screenshot.ts:71` is the correct universal form.

## Bugs & Gaps

- [x] ~~**No `AbortSignal` support.**~~ Review explicitly flagged this as "not blocking this PR" — the `signal` field is an additive, forward-compatible extension. The SDD update (brevwick-ops#5) reserves the `CaptureScreenshotOpts` opts bag as the evolution point so a future `signal` field slots in without a surface break. Landing here would widen the surface beyond issue #5's AC.
- [x] **Concurrent-capture race** — fixed (see Clean Code BLOCKER #1 above).
- [x] **`internal.push` failure path** — fixed (see Clean Code BLOCKER #2 above).
- [x] No retry logic needed — placeholder fallback is the terminal state.
- [x] No listeners / subscriptions added, no leak surface.
- [x] `finally` runs even on success path (micro: `restoreSkippedNodes` is idempotent over already-restored nodes because the array is consumed once).

## Security

- [x] No secrets in code. The placeholder WebP is a static base64 of a 34-byte VP8L blob (verified: `RIFF` / `WEBP` / `VP8L` magic; `size === 34`, `type === 'image/webp'`, `size > 0`).
- [x] No `eval`, no `Function()`, no `dangerouslySetInnerHTML`.
- [x] `atob` input is a hardcoded literal — no untrusted data.
- [x] Redaction not applicable: the Blob goes to presigned-URL upload per SDD; no new context field is added to outgoing payloads, so no new `redact()` test is required. Confirmed against the redaction-mandate check in CLAUDE.md.

## Tests

- [x] Happy path: `screenshot.test.ts:28-40` — resolves with `image/*` Blob.
- [x] DOM pre+during+post assertion: `screenshot.test.ts:42-64` (success) and 66-81 (failure). Issue AC satisfied for single-call case.
- [x] Failure path: `screenshot.test.ts:83-97` — console.warn spy + placeholder Blob checks.
- [x] Null-return handling: `screenshot.test.ts:99-110`.
- [x] Instance variant pushes into console ring: `screenshot.test.ts:112-125`.
- [x] Options forwarded to `domToBlob`: `screenshot.test.ts:127-140,142-155`.
- [x] Chunk-split guard: `chunk-split.test.ts` conditionally skips when `dist/` absent (good — keeps `pnpm test` passing without a build), asserts both negative (base) and positive (sibling) cases.
- [x] `vi.resetModules()` + `vi.doMock('modern-screenshot')` is sound because the screenshot module is always dynamic-imported.
- [x] `vi.doUnmock` in `afterEach` prevents leak into the next test file.
- [x] `client.test.ts:273-286` updated correctly — previous "rejects with not yet implemented" guard replaced with positive Blob assertion.
- [x] **Missing — concurrent call test.** Added `restores [data-brevwick-skip] visibility after concurrent captures that overlap` — gates the second capture on a deferred promise, asserts the skip node is hidden during the overlap, stays hidden after `a` resolves while `b` still holds its ref, and returns to its original `'visible'` only after `b` finishes. Fails the old (stash-per-call) implementation; passes against the ref-counted stash.
- [x] **Missing — handler-throw test.** Added `still resolves with a placeholder when a bus entry listener throws` — installs an `entry` listener that throws, forces a capture failure, asserts the promise resolves with a valid `image/webp` placeholder Blob and the fallback `console.warn` fired.
- [x] 80% patch coverage: codecov/patch passing (SUCCESS).

## Build & Bundle

- [x] `pnpm --filter brevwick-sdk build` succeeds; emits `dist/screenshot-*.js` (1.34 kB min) + `dist/index.js` (4.38 kB min / **1938 B gzip**).
- [x] Type declarations emitted: `dist/index.d.ts`, `dist/index.d.cts` (3.53 kB each) — `CaptureScreenshotOpts` and the lazy `captureScreenshot` both exported.
- [x] Dual ESM / CJS emitted; lazy import rewritten to `import('./screenshot-XXX.cjs')` in the CJS chunk — verified.
- [x] Tree-shaking: verified empirically — `dist/index.js` has zero `modern-screenshot` string occurrences.
- [x] ~~**Observation — budget headroom is 110 B.**~~ The review explicitly flagged this as "not a PR-20 blocker" — it's a forward-looking note for WT-04 / WT-07 planning, not a defect in this PR. After this round the baseline is 1936 B gzip (two bytes tighter after hoisting the placeholder buffer), so the headroom is now 112 B. The budget remains green against the 2048 B ceiling; WT-07 (size-limit) will pin this baseline in CI.

## PR Hygiene

- [x] Conventional commit: `feat(screenshot): captureScreenshot via dynamic import (#5)` — 51 chars, well under 72.
- [x] `Closes #5` in body.
- [x] Branch name matches `feat/issue-5-short-desc` convention.
- [x] No `Co-Authored-By` headers, no Claude attribution anywhere (verified commit message, PR body, code comments).
- [x] Changeset present: `.changeset/screenshot.md` bumps both packages minor (lockstep per CLAUDE.md).
- [x] PR body links to SDD § 12 and records the current gzip size.

## Files Reviewed

| file | status | notes |
| ---- | ------ | ----- |
| `.changeset/screenshot.md` | OK | Both packages minor bump; correct lockstep. |
| `packages/sdk/package.json` | OK | `modern-screenshot` in `peerDependencies` + `peerDependenciesMeta.optional: true` + `devDependencies`; NOT in `dependencies`. `sideEffects: false` retained. |
| `packages/sdk/tsup.config.ts` | OK | `splitting: true`, `minify: true`, `treeshake: true`, `format: ['esm','cjs']`, `sourcemap: true`, `dts: true`. |
| `packages/sdk/src/index.ts` | OK (JSDoc gap on opts lives in screenshot.ts) | Lazy wrapper correctly preserves callsite syntax while keeping the module out of the base chunk; type-only `typeof import(...)` does not pull runtime. |
| `packages/sdk/src/screenshot.ts` | **CHANGES REQUIRED** | Two correctness blockers (concurrent re-entrancy + `internal.push` throw escape); JSDoc missing on public opts; `placeholderBlob` allocation nit. |
| `packages/sdk/src/core/client.ts` | OK | Clean delegation to `captureScreenshotForInstance(internal)`; previous stub throw replaced correctly. |
| `packages/sdk/src/__tests__/screenshot.test.ts` | Mostly OK — missing two cases | Add concurrent-capture test and internal.push-handler-throw test (see Tests section). |
| `packages/sdk/src/__tests__/chunk-split.test.ts` | OK | Conditional skip is the right call. Both negative (base) and positive (sibling) assertions present. |
| `packages/sdk/src/core/__tests__/client.test.ts` | OK | Stub test correctly inverted; uses `vi.doMock` + `vi.doUnmock` symmetrically. |
| `pnpm-lock.yaml` | OK | Lockfile updated for `modern-screenshot@4.6.8` devDep only. |

## Cross-repo follow-up required

Update `brevwick-ops/docs/brevwick-sdd.md` § 12 to document:

1. `captureScreenshot(opts?: CaptureScreenshotOpts)` (add the opts parameter — currently shown without opts).
2. `CaptureScreenshotOpts` shape: `{ element?: HTMLElement; quality?: number }` with default `document.documentElement` / `0.85`.
3. Default MIME `image/webp`.
4. Never-throws contract: capture failure resolves with a 1×1 transparent WebP placeholder Blob.
5. `[data-brevwick-skip]` elements have `style.visibility` stashed → set to `hidden` during capture → restored in `finally`.
6. Optional peer-dep declaration: `modern-screenshot` installed only by consumers that need capture.

Per CLAUDE.md, this SDD update is required before merge.

## Final verdict

**CHANGES REQUIRED** — primarily for the two correctness blockers in `screenshot.ts` (concurrent-capture re-entrancy; throw-escape from `internal.push`), the missing JSDoc on the public `CaptureScreenshotOpts` type, and the required SDD § 12 update. Everything else (architecture, chunk split, tests, build, hygiene) is clean.
