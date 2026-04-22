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
  `.brw-root[data-brw-theme='light'|'dark']` — override the internal
  `--brw-*-base` defaults set on `:where(:root)` (and the
  `@media (prefers-color-scheme: dark)` swap).
- Host-level `:root { --brw-*: ... }` overrides still win even under a
  forced theme: every widget rule consumes
  `var(--brw-X, var(--brw-X-base))`, and the forced-theme blocks only
  rewrite `--brw-X-base`, never the public `--brw-X`. So
  `theme="dark"` + a consumer `--brw-accent: hotpink` still paints the
  accent hotpink.
- `BrevwickTheme` type exported from `brevwick-react` for consumers that
  want to type their own theme-selecting state.

The `brevwick-sdk` patch bump is a no-op to keep the two packages in
lockstep per the repo's pre-1.0 versioning policy.
