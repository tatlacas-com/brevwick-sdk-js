---
'@tatlacas/brevwick-react-native': minor
'@tatlacas/brevwick-sdk': minor
'@tatlacas/brevwick-react': minor
---

chore(react-native): scaffold @tatlacas/brevwick-react-native (#82)

Empty workspace package skeleton for the upcoming React Native adapter.
Mirrors `packages/react/` conventions (tsup CJS+ESM build, vitest,
tsconfig). Adds the `react-native` field for Metro source preference
and declares `react-native-view-shot` as an optional peer dep so the
never-throws screenshot path can lazy-import without forcing every
consumer to install it.

Public surface this PR ships:

- `BREVWICK_REACT_NATIVE_VERSION` — diagnostics literal injected by
  tsup `define`, mirroring the React/Solid/Vue/Svelte/Angular adapters.

Feature work (provider, hook, FAB, screenshot, route ring, device
context) lands in #83–#88; example app + canonical README in #89/#90;
beta release flips in #91.

The `@tatlacas/brevwick-sdk` and `@tatlacas/brevwick-react` bumps are
the lockstep pre-1.0 version — the `linked` group in
`.changeset/config.json` keeps the suite moving together. No code
change in either package for this PR.
