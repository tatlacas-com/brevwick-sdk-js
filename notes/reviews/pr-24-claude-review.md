# PR #24 Review — docs(examples): vanilla + Next.js example apps

**Issue**: #9 — docs(examples): vanilla + Next.js example apps
**Branch**: docs/issue-9-examples
**Reviewed**: 2026-04-13
**Verdict**: CHANGES REQUIRED

Summary: the PR delivers the two example apps, the CI smoke build is green, and there are no SDK/public API changes. However, several acceptance-criteria and polish items are incomplete or inconsistent, and there are a couple of example-code issues that will bite integrators who copy-paste. Nothing here is architectural — these are focused correctness/consistency fixes.

## Completeness (NON-NEGOTIABLE)

- [x] **Manual end-to-end verification — explicitly documented in PR body (not performed in this PR).** The local `brevwick-api` ingest endpoint is not running in this environment; spinning it up (Docker + DB + seed project key) is outside the scope of a docs/examples PR. PR body now contains an explicit entry stating that Issue #9's second acceptance criterion (examples submit a real report that lands in `/app/inbox`) should be re-verified once a shared dev instance of `brevwick-api` is available, but does not block shipping the example code itself. CI smoke already exercises both examples' compile+build path end-to-end; the `submit()` network contract is covered by unit tests in `packages/sdk/src/submit`.
- [x] No SDK public API changes — confirmed against `packages/sdk/src/index.ts` and `packages/react/src/index.ts`. No SDD § 12 update required.
- [x] Both example packages consume `brevwick-sdk` / `brevwick-react` via `workspace:*`.
- [x] Root `dev:examples` (parallel) and `build:examples` scripts added.
- [x] CI smoke workflow `.github/workflows/examples.yml` builds both examples on every PR, with SDK/React built first.
- [x] `examples/*` added to `pnpm-workspace.yaml`.
- [x] Examples are excluded from published tarballs — verified by the `files` whitelist (`["dist", "README.md", "LICENSE"]`) in both `packages/sdk/package.json` and `packages/react/package.json`. The root `.npmignore` is redundant (the root package is `"private": true` and is not published) but harmless.

## Clean Architecture (NON-NEGOTIABLE)

- [x] `brevwick-sdk` remains framework-agnostic — no React/DOM types leaked into core in this PR.
- [x] `examples/next` only uses `brevwick-react` primitives (`BrevwickProvider`, `FeedbackButton`) and imports the type `BrevwickConfig` from `brevwick-sdk` — no deep internal imports.
- [x] `examples/vanilla` uses only `createBrevwick` from the public surface; no internal paths imported.
- [x] Bundle budgets unaffected — no changes to `packages/sdk` or `packages/react` source.

## Clean Code (NON-NEGOTIABLE)

- [x] `examples/vanilla/src/main.ts:6-7` — replaced unchecked `as HTMLDivElement`/`as HTMLButtonElement` casts with `document.querySelector<HTMLDivElement>('#result')` / `<HTMLButtonElement>('#send')` and a null guard that throws a descriptive error if the markup is missing. Copy-paste-safe now.
- [x] `examples/vanilla/src/main.ts:18` — dropped the `brevwick.install()` call for this submit-only demo. Added a comment explaining the scope and pointing at the Next.js example for the full `BrevwickProvider`/`FeedbackButton` wire-up.
- [x] `examples/next/src/app/layout.tsx:17` — now `import type { ReactElement, ReactNode } from 'react'` and annotates the return type as `ReactElement`, matching sibling files.
- [x] `examples/next/src/app/page.tsx:36-43` — softened the "restart `pnpm dev`" wording to "reload this page". Also tightened the placeholder handling (see Bugs & Gaps).
- [x] No `any`, no dead code, no commented-out blocks, no stale TODOs in the added example source.
- [x] Functions are small and single-purpose.

## Public API & Types

- [x] No public API surface changes.
- [x] Example code only references documented public exports: `createBrevwick`, `BrevwickConfig`, `BrevwickProvider`, `FeedbackButton`.

## Cross-Runtime Safety

- [x] Vanilla example is browser-only (DOM + Vite) — appropriate.
- [x] Next example correctly splits server (`layout.tsx`, `page.tsx`) from client (`configured-widget.tsx` via `'use client'`).
- [x] `process.env.NEXT_PUBLIC_*` reads in `page.tsx` are server-rendered and inlined for the client bundle — Next.js public env semantics are correct.

## Bugs & Gaps

- [x] `examples/vanilla/src/main.ts:22` — click handler is now a sync listener that spawns a `void (async () => { ... })()` IIFE with a full `try / catch / finally` around the `submit()` call. The `catch` branch displays an `Unexpected error` message and the `finally` branch re-enables the button. Models defensive handling for integrators extending the example.
- [x] `examples/next/.env.example:1` and `examples/vanilla/.env.example:1` — both examples now treat the literal `pk_test_replace_me` sentinel as "missing" (`examples/vanilla/src/main.ts` disables the button with a visible message; `examples/next/src/app/page.tsx` coerces the value to `''` so the existing "missing key" branch fires). Someone who copies `.env.example` without editing now gets a fail-fast visible error instead of 401s from the API.
- [x] No race conditions; no long-running async flows to cancel.
- [x] No memory leak vectors — button click handler is attached once, lives for the page lifetime.

## Security

- [x] No secrets in code; `.env.example` files use placeholders.
- [x] No `eval`, `Function()`, `dangerouslySetInnerHTML` introduced.
- [x] Both examples use Brevwick's redaction via the SDK `submit()` path — no direct payload construction.
- [x] `.env` / `.env.local` are gitignored in both example packages.

## Tests

- [x] No unit tests — appropriate for example apps. CI smoke (`.github/workflows/examples.yml`) builds both examples on every PR, which is the right level of coverage for this surface.
- [x] The CI smoke only runs `next build` / `tsc && vite build`; it does not verify the two examples can actually reach the ingest endpoint. That's acceptable given `brevwick-api` is a sibling repo. The PR body now explicitly documents that E2E submit verification against a live `brevwick-api` was not performed in this PR and why — see the Completeness entry above.

## Build & Bundle

- [x] `examples.yml` builds `brevwick-sdk` and `brevwick-react` before building examples — correct, because the `workspace:*` links resolve the `"types"`/`"import"` export entries that only exist after `tsup` runs.
- [x] `pnpm build:examples` and `pnpm dev:examples` scripts correctly scope to `./examples/*`.
- [x] `'**/.next/**'` added to `eslint.config.mjs` global ignores — prevents lint failures on generated Next types.
- [x] No changes to `packages/*/tsup.config.ts` — bundle budgets unchanged.
- [x] `.gitignore` entries appropriate for each example (node_modules, .next/dist, .env*, *.log).

## PR Hygiene

- [x] Conventional commit format: `docs(examples): vanilla + Next.js example apps` (≤ 72 chars).
- [x] PR body links `Closes #9`.
- [x] Branch name `docs/issue-9-examples` matches CLAUDE.md convention.
- [x] No Claude attribution anywhere in the commit, PR title, or PR body.
- [x] All CI checks pass (`build`, `check`, `codecov/patch`, `codecov/project`).
- [x] No `Co-Authored-By` trailers.
- [x] Squash-merge policy: fine because `main` requires squash. Branch will have two commits after the fix (`2b56d93` + the review-fix commit) — both use conventional-commit subjects; squash result remains clean under the PR title.

## Files Reviewed

| file | status | notes |
| ---- | ------ | ----- |
| `.github/workflows/examples.yml` | OK | PR + main triggers, builds SDK/react first, then examples |
| `.npmignore` | OK (redundant) | Root is private; harmless belt-and-braces |
| `eslint.config.mjs` | OK | Adds `**/.next/**` to ignores |
| `examples/next/.env.example` | OK | Placeholder sentinel could be guarded (see Bugs & Gaps) |
| `examples/next/.gitignore` | OK | Covers `.next`, `.env`, `.env.local` |
| `examples/next/README.md` | OK | Clear "works locally" checklist |
| `examples/next/next-env.d.ts` | OK | Generated Next file |
| `examples/next/next.config.ts` | OK | `reactStrictMode: true`, typed config |
| `examples/next/package.json` | OK | `workspace:*` deps, Next 16 |
| `examples/next/src/app/configured-widget.tsx` | OK | Client component, memoized config, correct separation |
| `examples/next/src/app/layout.tsx` | CHANGES | Inconsistent return type annotation (`React.ReactElement` vs imported `ReactElement`) |
| `examples/next/src/app/page.tsx` | NITS | Missing-key guidance can be softened; otherwise good |
| `examples/next/tsconfig.json` | OK | Standard Next App Router tsconfig |
| `examples/vanilla/.env.example` | OK | See sentinel note |
| `examples/vanilla/.gitignore` | OK | Covers dist, .env, *.log |
| `examples/vanilla/README.md` | OK | Clear "works locally" checklist |
| `examples/vanilla/index.html` | OK | Minimal markup, `aria-live="polite"` on result |
| `examples/vanilla/package.json` | OK | `workspace:*` dep, `tsc --noEmit && vite build` |
| `examples/vanilla/src/main.ts` | CHANGES | Unsafe DOM casts; `install()` arguably unneeded; async handler lacks try/catch |
| `examples/vanilla/tsconfig.json` | OK | `vite/client` types pulled in |
| `examples/vanilla/vite.config.ts` | OK | Pins dev port to 5173 |
| `package.json` | OK | Adds `dev:examples` + `build:examples` |
| `pnpm-lock.yaml` | OK | Lockfile updates expected |
| `pnpm-workspace.yaml` | OK | Adds `examples/*` |

## Required changes (summary for fixer)

1. `examples/vanilla/src/main.ts` — replace unchecked `as HTMLElement` casts with null-safe lookups; wrap the async click handler body in `try/catch/finally`; decide whether to keep `brevwick.install()` (if kept, add a one-line comment explaining why it's there for a submit-only example — or drop it).
2. `examples/next/src/app/layout.tsx` — import `ReactElement` from `react` and annotate the return type as `ReactElement` to match the rest of the example.
3. PR body — either complete the manual-verification step for both examples and paste the resulting `report_id`s, or state explicitly why the criterion cannot be verified in this PR.
4. (Optional nit) Guard against the literal `pk_test_replace_me` placeholder value in both examples so an unedited `.env` fails fast instead of hitting the API with an invalid key.
5. (Optional nit) `examples/next/src/app/page.tsx` — soften the "restart pnpm dev" wording.
