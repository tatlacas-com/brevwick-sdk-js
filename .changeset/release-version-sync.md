---
---

Tooling: have `pnpm version-packages` run `prebuild` in every workspace that
defines it, so each package's generated `src/internal/version.ts` literal is
re-written from the freshly-bumped `package.json#version` and committed into
the same Changesets release PR. Without this the Solid widget's footer test
(which compares the live `pkg.version` against the `BREVWICK_SOLID_VERSION`
literal that the bundler reads from `src/`) failed every release PR. Also
adds defensive `pretest` / `pretest:cover` hooks to `@tatlacas/brevwick-solid`
so a developer running tests on a stale tree locally regenerates the literal.
No published code changes.
