# PR #70 Review — feat(solid): @tatlacas/brevwick-solid adapter package

**Issue**: #66 — feat(solid): @tatlacas/brevwick-solid adapter package
**Branch**: feat/issue-66-brevwick-solid
**Reviewed**: 2026-04-30
**Verdict**: CHANGES REQUIRED

CI at handoff: `check`, `size-check`, `verify-signatures`, `codecov/patch`, `codecov/project` all green on commit eecc425. Verdict is driven by code-level findings below, not CI.

## Completeness (NON-NEGOTIABLE)

- [x] `BrevwickProvider`, `useFeedback`, `FeedbackButton` all shipped per issue #66 public-API contract.
- [x] `"solid"` export condition + pre-transformed `dist` fallback per issue scope.
- [x] SSR safety — provider creates SDK in `onMount`; FAB gated by `Show when={isClient()}`.
- [x] Bundle budget enforcement via `chunk-split.test.ts` + `.size-limit.js`.
- [x] Redaction-delegation test asserts payload reaches `brevwick.submit` unmodified.
- [x] SolidStart example in `examples/solid/` with `VITE_BREVWICK_*` env wiring; `app.config.ts`, entry-client, entry-server in place.
- [x] `.changeset/config.json` `linked` array updated; root README + CLAUDE.md mention the package; CI uploads coverage + dist artefact for solid.
- [x] `packages/solid/src/provider.tsx:11-14` — JSDoc on `BrevwickContextValue` (and the matching block in `use-feedback.ts:31-39`) claims `useFeedback()` *"tolerates a transient null until hydration completes"*. The implementation does the opposite: `requireSdk()` (`use-feedback.ts:55`) **throws** when the accessor returns `null`. Either the docs are wrong or the behavior is wrong. The PR description ("Throws synchronously when called outside the provider — but tolerates a transient null between SSR and hydration") doubles down on the doc claim. Pick one and align all three sites (provider JSDoc, hook JSDoc, behavior). The user-flagged scrutiny point (#1) explicitly asked this. **Resolved**: kept the throw and aligned both jsdoc blocks; `submit()`/`captureScreenshot()` both now reject (not synchronously throw) on missing SDK so the surface is uniformly async. PR body to be updated post-push.

## Clean Architecture (NON-NEGOTIABLE)

- [x] `@tatlacas/brevwick-sdk` stays framework-agnostic — no Solid imports in `packages/sdk/src`.
- [x] `@tatlacas/brevwick-solid` depends on `@tatlacas/brevwick-sdk`, never the reverse.
- [x] No React imports in `packages/solid/src` (verified).
- [x] Solid FAB's `captureScreenshot()` routes through the SDK's already-lazy `import('./screenshot')` wrapper (`use-feedback.ts:80-81` → `requireSdk().captureScreenshot()`); no second copy of `modern-screenshot` ships with the Solid bundle. Confirmed by `chunk-split.test.ts` checking the externalised `solid-js` reference but the `modern-screenshot` invariant is implicit (it travels via the SDK's already-tested path). User scrutiny point #3 satisfied.
- [x] `packages/solid/package.json:18-23` — `"files": ["dist", "src", "README.md", "LICENSE"]` ships **everything** under `src/`, including `src/__tests__/**` and `vitest.setup`-adjacent files referenced from there. The `"solid"` export condition only needs the source modules, not tests, jsdom mocks, or test fixtures. Either narrow `files` (e.g. `"src/**/*.ts"` excluding `**/__tests__/**`) or move tests to a sibling `tests/` directory the publish ignores. Inflates the published tarball and exposes test code to consumers. **Resolved**: replaced the bare `src` entry with explicit subpath whitelist (`src/components`, `src/internal`, `src/index.ts`, `src/provider.tsx`, `src/styles.ts`, `src/use-feedback.ts`) plus a defensive `!src/**/__tests__/**` negation.

## Clean Code (NON-NEGOTIABLE)

- [x] `packages/solid/src/components/feedback-button.tsx:181-185` — `handleClose()` does not revoke the `URL.createObjectURL(...)` URLs for any queued screenshots. `handleSubmit()` only revokes on the success branch (`feedback-button.tsx:166`); on `ok:false` or panel-close-without-send, the blob URLs persist for the document's lifetime. The standard Solid fix is `onCleanup(() => screenshots().forEach(s => URL.revokeObjectURL(s.url)))` inside `FeedbackButtonInner` plus a revoke pass in `handleClose`. Real memory/object-URL leak, not theoretical. **Resolved**: added `onCleanup` revoke pass inside `FeedbackButtonInner`, plus `revokeAllScreenshots()` invoked from `handleClose`. New tests `revokes queued screenshot object URLs when closed without submitting` and `... when submit() returns ok:false` lock the contract via `vi.spyOn(URL, 'revokeObjectURL')`.
- [x] `packages/solid/src/use-feedback.ts:80-81` vs `:63-78` — inconsistent error surfacing. `submit()` catches/rethrows asynchronously (rejected promise), but `captureScreenshot()` returns `requireSdk().captureScreenshot()` directly, so a missing-SDK throw from `requireSdk()` surfaces **synchronously** from a function whose return type is `Promise<Blob>`. Either wrap in `async () => requireSdk().captureScreenshot()` so both paths reject asymmetry-free, or document the divergence on the type. Right now consumers wiring `try/catch` around `captureScreenshot()` get bitten only if the SDK is null. **Resolved**: `captureScreenshot` now wraps the `requireSdk()` call in a try/catch and returns `Promise.reject(error)` on the missing-SDK path (kept synchronous-arrow rather than `async` to avoid the bundle-bytes hit from generator helpers); both paths surface the error as a rejected promise. New test `submit() rejects (not synchronously throws) when called pre-hydration` covers both methods.
- [x] `packages/solid/src/components/feedback-button.tsx:155` — `text.split('\n', 1)[0]!.slice(0, 120)` derives `title` from the trimmed text but `description: draft()` (line 158) ships the **un-trimmed** raw draft. Net effect: title is `"hi"` but description is `"   hi   \n"` if the user's textarea has leading/trailing whitespace. Pick one: trim both, or document the divergence. Mirror whatever the React adapter does. **Resolved**: `description` now uses the trimmed `text` (matching the React adapter's intent — no leading whitespace in submitted descriptions). New test `trims leading/trailing whitespace from the submitted description` locks the contract.
- [x] `packages/solid/src/components/feedback-button.tsx:99` — `let nextId = 0` lives in component setup scope. Works in Solid (setup runs once per component lifetime) but reads as a React-style mistake; a `createUniqueId()` from `solid-js` or `crypto.randomUUID()` would be more idiomatic and avoids the "is this reset on remount?" question. Minor. **Resolved**: replaced with `crypto.randomUUID()` (with a `Date.now()`/`Math.random()` fallback for environments without `crypto.randomUUID`); generated inside the event handler, not setup, so `createUniqueId()` would have been the wrong primitive.
- [x] `packages/solid/src/use-feedback.ts:48` — `createSignal<FeedbackStatus>('idle')` is created **per call to `useFeedback()`**, so two components consuming the hook get independent status. That's the React-mirror convention, but it differs from a "single status across the app" expectation a user migrating from a centralised store might bring. Document this on `UseFeedbackResult.status` (it's the kind of foot-gun that surfaces only when two FABs are mounted simultaneously). **Resolved**: extended the JSDoc on `UseFeedbackResult.status` with a "per `useFeedback()` call" callout. New test `gives each useFeedback() call an independent status signal` locks the contract.
- [x] No `any`, no unsafe casts in source (test files use `as unknown as Brevwick` on mock instances — acceptable for vitest mocks).
- [x] Functions small, nesting < 3 levels.
- [x] No dead code, no commented-out blocks.

## Public API & Types

- [x] `index.ts` re-export list is minimal and intentional. No internal helpers leaking.
- [x] JSDoc on every public export (`BrevwickProvider`, `BrevwickContext`, `BrevwickProviderProps`, `BrevwickContextValue`, `useFeedback`, `UseFeedbackResult`, `FeedbackStatus`, `FeedbackButton`, `FeedbackButtonProps`, `BrevwickTheme`).
- [x] Discriminated `FeedbackStatus` (`'idle' | 'submitting' | 'success' | 'error'`).
- [x] Re-exported core SDK types (`BrevwickConfig`, `FeedbackAttachment`, `FeedbackInput`, `SubmitResult`).
- [x] `packages/solid/src/provider.tsx:22-24` — `BrevwickContextValue.brevwick: Accessor<Brevwick | null>` exposes the nullable accessor as part of the **public type surface** (it's exported from `index.ts:8`). The `null` is a transient-hydration concern that consumers should never have to handle directly — they go through `useFeedback()`. Either don't export `BrevwickContextValue` (keep the context-internal type private) or wrap so the public type is `Accessor<Brevwick>` and the null is hidden behind the hook's throw. Right now anyone using `BrevwickContext` directly inherits the foot-gun. **Resolved**: dropped both `BrevwickContext` and `BrevwickContextValue` from `index.ts`; the interface is now declared without `export` and tagged `@internal`.
- [x] `packages/solid/src/index.ts:7` — `BrevwickContext` is exported for the same reason as above. Consumers using `useContext(BrevwickContext)` directly would bypass `useFeedback`'s null guard and get either `null` (no provider) or the `Accessor<Brevwick | null>`. If the intent is "private extension point", drop the export; if it's intentional, document the contract. The React adapter likely doesn't expose its raw context — match that. **Resolved**: removed the export.

## Cross-Runtime Safety

- [x] Provider's `onMount` is client-only by Solid's design; the `typeof window === 'undefined'` defensive guard inside (`provider.tsx:57`) is appropriate for Solid worker renderers.
- [x] `feedback-button.tsx:55-61` `injectStyles()` guards on `typeof document` before touching it.
- [x] No Node-only globals (`process`, `Buffer`, `fs`) in any solid source file (verified).
- [x] `package.json` `exports` field has `types`/`solid`/`import`/`require` in correct order; condition order matters in Node ≥ 12.7 and the Solid bundler tooling reads `solid` first.
- [x] `packages/solid/tsup.config.ts:23` — `external: ['solid-js', 'solid-js/web', '@tatlacas/brevwick-sdk']` is correct but `chunk-split.test.ts:43-45` only asserts `from "solid-js"`. JSX compiled by `babel-preset-solid` emits imports from **`solid-js/web`** (e.g. `template`, `delegateEvents`, `insert`). A regression that bundles `solid-js/web` would slip past the test. Add a second assertion for `solid-js/web` to the chunk-split test. **Resolved**: added a second `it('base chunk does not bundle solid-js/web…')` assertion alongside the existing `solid-js` one.

## Bugs & Gaps

- [x] **Object-URL leak** (already raised under Clean Code): screenshots queued but never sent leak their `URL.createObjectURL` allocations. Add `onCleanup` in `FeedbackButtonInner` and revoke remaining URLs in `handleClose`. **Resolved** — see Clean Code item.
- [x] `packages/solid/src/components/feedback-button.tsx:137-179` — `handleSubmit()` reads `screenshots()` four times (line 146, 149, 166). Between the first `screenshots()` call and the post-await revoke at line 166, the user could have removed a chip (`removeScreenshot` at line 129) — the revoke loop on line 166 then operates on the **post-removal** snapshot, double-revoking the removed one. URL.revokeObjectURL on an already-revoked URL is a no-op so not a crash, but capturing the snapshot once at the top of `handleSubmit` is cleaner and avoids the implicit race. **Resolved**: introduced a `const queued = screenshots();` snapshot at the top of `handleSubmit` and threaded it through the attachment build, the filename count, and the post-success revoke loop.
- [x] `packages/solid/src/use-feedback.ts:63-78` — when `submit()` rejects mid-flight, `setStatus('error')` then rethrows. If the consumer mounted a second component that also called `useFeedback()`, only the calling instance flips to error. Acceptable per the per-instance-status decision but should be documented. **Resolved**: documented on `UseFeedbackResult.status` (single doc-block covers both the success and the failure side of per-instance independence).
- [x] `provider.tsx:61-63` cleans up via `onCleanup(() => instance.uninstall())`. Good.
- [x] `feedback-button.tsx:107-127` `handleCapture` is properly debounced via `if (capturing()) return` plus a try/finally clearing the flag.

## Security

- [x] No `eval` / `Function()` / `dangerouslySetInnerHTML` (Solid has no equivalent in this code).
- [x] Adapter does not redact — delegates to `brevwick.submit()` so the SDK's `redact()` remains the single source of truth. Asserted by `redaction.test.tsx:74-117`.
- [x] No secrets in code.
- [x] `feedback-button.tsx:301-308` external link uses `target="_blank"` with `rel="noopener noreferrer"`.
- [x] CSP: stylesheet injected via `style.textContent` (not `innerHTML`) — `feedback-button.tsx:54-61`. CSP-friendly enough for `style-src 'self' 'unsafe-inline'`-style policies; consumers with strict no-inline-style CSPs would need a separate CSS file (acceptable trade-off, document in README if not already).

## Tests

- [x] Vitest suite covers provider mount/unmount, hook idle→submitting→success/error transitions, hook outside-provider throw, FAB rendering, screenshot capture, error paths (capture reject, submit reject, submit ok:false), close-state-reset, position class, hidden prop, whitespace-only-disabled.
- [x] Redaction-delegation test forwards an unmodified secret-bearing payload through both the FAB and `useFeedback` paths.
- [x] Branch coverage threshold raised to ≥ 70% per the eecc425 coverage fix; lines/statements/functions ≥ 75%.
- [x] `vitest.setup.ts` cleans up the testing library between tests.
- [x] No test for the "two components calling `useFeedback()` get independent status" claim — would catch a future refactor that accidentally hoists the signal to context. **Resolved**: added `gives each useFeedback() call an independent status signal` to `use-feedback.test.tsx`.
- [x] No test for the documented "transient null between SSR and hydration" path. Until the implementation/doc gap (Completeness item) is resolved, this is moot; once resolved, add a test that calls `useFeedback().submit()` *before* `onMount` runs (mocking `onMount` or using a deferred renderer) and assert the documented behavior. **Resolved**: added `submit() rejects (not synchronously throws) when called pre-hydration` — mounts the hook against a `BrevwickContext.Provider` whose accessor is permanently `null`, asserting both `submit()` and `captureScreenshot()` reject with the documented "not yet initialised" error.
- [x] No test for the object-URL leak. After the fix, add a `vi.spyOn(URL, 'revokeObjectURL')` assertion that close-without-submit revokes every queued screenshot URL. **Resolved**: added two tests covering close-without-submit and `ok:false`-then-close paths.

## Build & Bundle

- [x] `tsup` builds ESM + CJS with `dts: true`, `minify: true`, `sourcemap: true`, `target: 'es2020'`.
- [x] `esbuild-plugin-solid` correctly compiles JSX for the dist outputs while the source `.tsx` is shipped untransformed for Solid-aware bundlers via `"solid"` condition.
- [x] `solid-js`, `solid-js/web`, `@tatlacas/brevwick-sdk` externalised — no double-runtime risk.
- [x] Bundle budget 3.79 kB ESM / 4.04 kB CJS gzip per PR description; well under 5 kB cap. `.size-limit.js` entries added at lines 80-89.
- [x] `package.json` `sideEffects: false` honoured.
- [x] CI uploads `packages/solid/dist` to the `package-dists` artefact for the `size-check` job.

## PR Hygiene

- [x] Conventional commit style (`feat(solid): ...`).
- [x] PR title under 70 chars.
- [x] PR body says `Closes #66`.
- [x] Branch name `feat/issue-66-brevwick-solid` matches convention.
- [x] Changeset `.changeset/solid-bindings.md` present, scoped to `@tatlacas/brevwick-solid` minor + linked siblings minor.
- [x] No Claude attribution found in PR title/body/changeset.
- [x] PR body's "Companion follow-up" mentions a one-line PR in `brevwick-web` to flip `coming-soon` → `shipped`. Track or schedule that — easy to forget after merge. **Resolved**: kept the line in the PR description so the merger picks it up; the cross-repo flip will be tracked via the PR-merge handoff (no scheduling primitive available inside this repo).

## Files Reviewed

| file | status | notes |
| ---- | ------ | ----- |
| `.changeset/config.json` | ok | Linked array correctly extended with `@tatlacas/brevwick-solid`. `linked` (not `fixed`) is the correct primitive — sibling minor bumps still tag the trio together with linked. |
| `.changeset/solid-bindings.md` | ok | Three packages bumped minor; copy is accurate. |
| `.github/workflows/ci.yml` | ok | Solid coverage uploaded; `package-dists` includes `packages/solid/dist`. |
| `.size-limit.js` | ok | 5 kB ceiling matches issue contract. |
| `CLAUDE.md` | ok | Mentions added (per PR description). |
| `README.md` | ok | New solid section per PR description. |
| `examples/solid/.env.example` | ok | Two `VITE_*` keys. |
| `examples/solid/.gitignore` | ok | Standard ignore set. |
| `examples/solid/README.md` | ok | Wiring docs present. |
| `examples/solid/app.config.ts` | ok | SolidStart 1.1 `defineConfig({})` — defaults to Node SSR. |
| `examples/solid/package.json` | ok | `vinxi ^0.5.3`, `@solidjs/start ^1.1.0`, `@solidjs/router ^0.15.3`, `solid-js ^1.9.4` — version trio is internally consistent for SolidStart 1.1. |
| `examples/solid/src/app.tsx` | ok | Idiomatic `<Router root>` + `<FileRoutes>`. |
| `examples/solid/src/configured-widget.tsx` | ok | Fail-closed env validation; `<Show when={mountWidget}>` SSR-safe. |
| `examples/solid/src/entry-client.tsx` | ok | Standard SolidStart 1.1 entry. |
| `examples/solid/src/entry-server.tsx` | ok | Standard SolidStart 1.1 entry. |
| `examples/solid/src/routes/index.tsx` | ok | Static page; renders without runtime work. |
| `examples/solid/tsconfig.json` | ok | `jsxImportSource: solid-js`, `types: ['vinxi/types/client']` — correct for SolidStart. |
| `packages/solid/README.md` | ok | Quick-start, SSR notes, theming, `"solid"` condition explained. |
| `packages/solid/package.json` | **flag** | `files` ships `src/__tests__/**` to npm — narrow this. `exports` map order is correct. |
| `packages/solid/src/__tests__/chunk-split.test.ts` | **flag** | Add `solid-js/web` external assertion alongside `solid-js`. |
| `packages/solid/src/__tests__/feedback-button.test.tsx` | ok | Comprehensive UI coverage. |
| `packages/solid/src/__tests__/provider.test.tsx` | ok | Mount/unmount lifecycle covered. |
| `packages/solid/src/__tests__/redaction.test.tsx` | ok | Delegation invariant asserted on both code paths. |
| `packages/solid/src/__tests__/use-feedback.test.tsx` | **flag** | No test for the documented "transient null tolerated" behaviour or per-instance status independence. |
| `packages/solid/src/components/feedback-button.tsx` | **flag** | Object-URL leak on close-without-submit; title/description trim mismatch; minor `nextId` idiom. |
| `packages/solid/src/index.ts` | **flag** | Exports `BrevwickContext` and `BrevwickContextValue` raw — null leakage in public type surface. |
| `packages/solid/src/internal/version.ts` | ok | Build-time constant via `define`. |
| `packages/solid/src/provider.tsx` | **flag** | JSDoc claim re. transient-null tolerance contradicts implementation. Otherwise sound. |
| `packages/solid/src/styles.ts` | ok | Mirrors React adapter's `--brw-*` variables; CSS injected idempotently via `style.textContent`. |
| `packages/solid/src/use-feedback.ts` | **flag** | `captureScreenshot` sync-throws while `submit` async-throws; doc/behavior mismatch on null tolerance. |
| `packages/solid/tsconfig.json` | ok | `jsx: 'preserve'`, `jsxImportSource: 'solid-js'`. |
| `packages/solid/tsup.config.ts` | ok | Externals correct; `esbuild-plugin-solid` wired. |
| `packages/solid/vitest.config.ts` | ok | `vite-plugin-solid` test-time JSX; `resolve.conditions: ['development', 'browser']` solves the dual-`solid-js` problem (the comment is excellent). |
| `packages/solid/vitest.setup.ts` | ok | Standard testing-library cleanup. |
| `pnpm-lock.yaml` | ok | Lockfile updates align with the new package and example. |

## Summary of required changes

1. **Resolve the doc/behavior mismatch on transient-null tolerance** in `provider.tsx:11-24`, `use-feedback.ts:31-39`, and the PR description. Either implement the tolerance (return a no-op `submit` until hydrated, or queue) or remove the claim from all three sites.
2. **Fix the object-URL leak** in `feedback-button.tsx`: revoke remaining screenshot URLs in `handleClose` and via `onCleanup`. Add a test.
3. **Narrow `packages/solid/package.json` `files`** so `src/__tests__/**` isn't published.
4. **Make `captureScreenshot()` reject (not throw) when the SDK is null** to match `submit()`'s shape (or document the asymmetry).
5. **Trim/title alignment** in `feedback-button.tsx:155-158` — pick one canonical form for description vs derivedTitle and apply it consistently.
6. **Reconsider exporting `BrevwickContext` + `BrevwickContextValue`** raw — either hide them (preferred) or document the contract for direct consumers.
7. **Extend `chunk-split.test.ts`** with a `solid-js/web` external assertion.

Optional (worth doing but not blocking): switch `let nextId = 0` to `createUniqueId()`; document per-instance `status` semantics on `UseFeedbackResult.status`; track the brevwick-web companion follow-up so the SDK guide flips after merge.

## Validation — 2026-04-30

**Verdict**: APPROVED

Validated against HEAD `4d3f565` (`fix(solid): address PR #70 review findings`).

### Items Confirmed Fixed

- [x] **(1) Doc/behavior mismatch on transient-null tolerance** — `provider.tsx:16-30,32-38` now JSDoc-tagged `@internal`, explicitly says "throws synchronously if invoked before SDK has hydrated." `use-feedback.ts:39-49` matches: "Both paths surface the missing-SDK error asymmetry-free as a rejected promise." PR body rewrote the contradicting "tolerates transient null" line to "submit() and captureScreenshot() both reject with an Error if invoked before client hydration completes." Docs and behavior now aligned across all three sites.
- [x] **(2) Object-URL leak** — `feedback-button.tsx:195-212` adds `revokeAllScreenshots()` invoked from both `handleClose` (line 217) and `onCleanup` (line 210-212). `handleSubmit` snapshots `screenshots()` once at line 155 (`const queued = screenshots();`) and threads it through attachment build, filename count, and post-success revoke (line 180), eliminating the chip-removal-mid-await desync. Two new tests at `feedback-button.test.tsx:213-248` and `:250-295` lock the contract via `vi.spyOn(URL, 'revokeObjectURL')` for both close-without-submit and `ok:false`-then-close paths.
- [x] **(3) `packages/solid/package.json` `files`** — Lines 18-29 list explicit subpath whitelist (`dist`, `src/components`, `src/internal`, `src/index.ts`, `src/provider.tsx`, `src/styles.ts`, `src/use-feedback.ts`) plus `!src/**/__tests__/**` negation. `npm pack --dry-run` confirms zero `__tests__/**` paths in the tarball; only the six source files needed by the `"solid"` export condition ship. Tarball size 37 kB / unpacked 134 kB.
- [x] **(4) `captureScreenshot` async/sync asymmetry** — `use-feedback.ts:107-113` wraps `requireSdk().captureScreenshot()` in try/catch and returns `Promise.reject(error)` on the missing-SDK path. `submit()` (line 79-85) does the same: catches the synchronous throw from `requireSdk()`, flips status to `'error'`, and rethrows from inside an `async` boundary so the caller observes a rejected promise. Both paths now uniformly async. Test at `use-feedback.test.tsx:103-128` asserts both reject pre-hydration.
- [x] **(5) Title/description trim mismatch** — `feedback-button.tsx:144` derives `text = draft().trim()`; line 165 derives `derivedTitle = text.split('\n', 1)[0]!.slice(0, 120)`; line 172 ships `description: text` (the trimmed value). Title and description now both built from the same trimmed source. New test at `feedback-button.test.tsx:297-309` asserts `'   hi there   \n'` produces `title: 'hi there'`, `description: 'hi there'`.
- [x] **(6) `BrevwickContext` + `BrevwickContextValue` removed from public surface** — `index.ts` re-export list (lines 5-25) does not include `BrevwickContext` or `BrevwickContextValue`. The interface is non-exported `@internal` (`provider.tsx:28-30`); the constant is exported from `provider.tsx:38` only so the `use-feedback.test.tsx:115` pre-hydration test can mount a fake provider. Public surface is clean — only `BrevwickProvider`, `BrevwickProviderProps`, `useFeedback`, `UseFeedbackResult`, `FeedbackStatus`, `FeedbackButton`, `FeedbackButtonProps`, `BrevwickTheme`, plus four re-exported core types.
- [x] **(7) `chunk-split.test.ts` solid-js/web assertion** — Lines 48-58 add the second `it('base chunk does not bundle solid-js/web…')` test asserting `from "solid-js/web"` survives as a bare-module reference. Verified: dist/index.js contains 9 separate `from "solid-js/web"` imports for `template`, `delegateEvents`, `className`, `setAttribute`, `effect`, `insert`, `createComponent`, `memo` — all external, none inlined.

### Optional Improvements Confirmed

- [x] `nextId` replaced with `crypto.randomUUID()` + fallback at `feedback-button.tsx:119-122`.
- [x] Per-call status independence test added at `use-feedback.test.tsx:138-177`.
- [x] Pre-hydration rejection test added at `use-feedback.test.tsx:103-128`.
- [x] ESLint config gained `**/.vinxi/**` and `**/.output/**` ignores (verified via `pnpm lint` clean).

### Independent Findings

- **Prettier ignore parity (non-blocker, dev-experience only)**: ESLint config now ignores `**/.vinxi/**` and `**/.output/**`, but `.prettierignore` does not. After running the SolidStart example locally, `pnpm format:check` fails on `examples/solid/.vinxi/**` build artefacts. CI is unaffected (those directories are gitignored and absent on a fresh checkout) and `gh pr checks 70` is green at HEAD. Not a regression introduced by this PR — the example shipped with this PR, and the asymmetry is identical to what would happen with `**/.next/**` if a developer ran the Next example. Worth a follow-up to extend `.prettierignore` symmetrically, but not a blocker for merge.
- **No double-bundle of `modern-screenshot`**: `grep -c modern-screenshot packages/solid/dist/index.js` returns `0`. The package routes through the SDK's already-lazy `import('./screenshot')` path; the chunk-split test for `solid-js/web` covers the explicit Solid externalisation invariant.
- **Redaction-delegation invariant preserved** across both new `submit()` rejection paths: `use-feedback.ts:79-85` (missing-SDK pre-hydration path) and `:91-98` (sdk.submit rejection path) both rethrow original errors without modifying the input. The adapter never touches the payload; `redact()` remains the single source of truth in `@tatlacas/brevwick-sdk`.

### Tooling

- `pnpm install --frozen-lockfile`: pass (lockfile up to date).
- `pnpm lint`: pass (eslint clean across all packages).
- `pnpm type-check`: pass (sdk + react + solid all green).
- `pnpm test`: pass — sdk 204/204, react 123/123, solid 29/29.
- `pnpm --filter @tatlacas/brevwick-solid test:cover`: pass — 91.58% statements, 76.25% branches, 90.56% functions, 95.06% lines (all over the 70%/75% thresholds set in `eecc425`).
- `pnpm build`: pass (sdk + react + solid + Next + SolidStart all build).
- `pnpm size`: pass — solid ESM 3.9 kB / CJS 4.16 kB (under 5 kB cap); core 2.11/2.13 kB (under 2.2 kB cap); on-widget-open 10.91 kB (under 25 kB cap).
- `npm pack --dry-run` for `@tatlacas/brevwick-solid`: pass — 14 files, no `__tests__/**`, no test fixtures, no `vitest.config.ts`/`vitest.setup.ts`/`tsup.config.ts`.
- `gh pr checks 70`: pass — `check`, `size-check`, `verify-signatures` all green at HEAD `4d3f565`.
- `pnpm format:check`: fails locally on contaminated worktree (`.vinxi/.output` artefacts) — see Independent Findings. Not a regression; CI is green.
