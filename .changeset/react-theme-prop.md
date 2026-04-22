---
'brevwick-react': minor
'brevwick-sdk': patch
---

feat(react): `theme` prop on `<FeedbackButton>` (light / dark / system)

- New `theme?: 'light' | 'dark' | 'system'` prop lets consumers force a
  palette regardless of the OS `prefers-color-scheme` setting. Default
  `'system'` preserves the pre-existing OS-driven behaviour.
- The prop stamps `data-brw-theme` on every `.brw-root` element (FAB,
  dialog panel, region-capture overlay). Two new CSS blocks —
  `.brw-root[data-brw-theme='light'|'dark']` — override the
  `:where(:root)` defaults and the `@media (prefers-color-scheme: dark)`
  rule by specificity. Host-level `:root { --brw-*: ... }` overrides
  still win for the same reason they always have.
- `BrevwickTheme` type exported from `brevwick-react` for consumers that
  want to type their own theme-selecting state.
- SDD § 12 (`brevwick-ops/docs/brevwick-sdd.md`) updated with the new
  prop + contract in a coordinated PR.

The `brevwick-sdk` patch bump is a no-op to keep the two packages in
lockstep per the repo's pre-1.0 versioning policy.
