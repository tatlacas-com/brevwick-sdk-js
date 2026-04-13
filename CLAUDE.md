# Compilerfish JS SDK

## Working Style

Critical thinking, no rubber-stamping, no shortcuts. Auto-commit + push + PR on branches without asking.

**Never commit and push directly to `main`.**

## Project Overview

pnpm workspace publishing two npm packages: `compilerfish-sdk` (core, framework-agnostic) and `compilerfish-react` (React bindings).

The canonical SDK contract lives at [`compilerfish-ops/docs/compilerfish-sdd.md` § 12](https://github.com/tatlacas-com/compilerfish-ops/blob/main/docs/compilerfish-sdd.md#12-client-sdk-contracts). Public API changes require an SDD update in the same PR (cross-repo).

**GitHub:** https://github.com/tatlacas-com/compilerfish-sdk-js

## Common Commands

```bash
pnpm install
pnpm build           # build all packages (tsup)
pnpm test            # vitest in all packages
pnpm lint
pnpm type-check
pnpm format
```

Per-package:
```bash
pnpm --filter compilerfish-sdk build
pnpm --filter compilerfish-react test
```

## Bundle Budget — DO NOT EXCEED

- Core `compilerfish-sdk` initial chunk: **< 2 kB gzip**
- On widget open (`modern-screenshot` dynamic-imported): **< 25 kB gzip**

Anything heavy must be dynamic-imported (`await import('modern-screenshot')`) so it doesn't ship until the user clicks the FAB.

## Redaction Is Mandatory

Every payload that leaves the device runs through `redact()` first. Adding a new context field? Add a redaction test for it. Server-side sanitiser is defence-in-depth, not a substitute.

## Versioning

Both packages move together for now (kept in lockstep). Once Phase 4 ships and the API is stable, they may diverge — at that point introduce changesets.

Pre-1.0 (`0.x.y`):
- patch: bug fixes, internal refactors
- minor: anything else (no SemVer guarantee in 0.x)

## Branching

```
main (protected)
  └── feat/<short-description>
  └── fix/<short-description>
```

- Conventional commits
- Subject ≤ 72 chars
- No `Co-Authored-By` headers
