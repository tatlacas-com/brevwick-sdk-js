---
'brevwick-react': minor
'brevwick-sdk': patch
---

feat(react): light/dark theming + composer shell polish

- Introduce a `--brw-*` CSS custom-property token set on `:where(:root)`
  (specificity 0) so any host rule re-themes the widget without
  `!important`. Surface, text, border, accent, shadow, and divider
  tokens are covered; status colours (`--brw-error`) stay widget-internal.
- Light defaults ship out of the box; a
  `@media (prefers-color-scheme: dark)` override swaps the palette when
  the host OS reports dark mode. Host overrides persist across modes.
- Composer controls are wrapped in a rounded `.brw-composer-shell`
  with a `:focus-within` ring, so the textarea + icon buttons + send +
  AI toggle read as a single input affordance.
- Multiline textarea retains the 1–5 row autogrow; `align-items:
flex-end` keeps the send button pinned to the bottom as the textarea
  grows.
- JSDoc on `<FeedbackButton>` documents every public token, including
  `--brw-bubble-user-fg` and `--brw-divider`.
- vitest-axe added as a devDep and runs clean on the rendered panel in
  both light and dark matchMedia stubs.
- No public API change (props / hooks / payload unchanged); no new
  runtime dependency.

The `brevwick-sdk` bump is a no-op patch to keep the two packages in
lockstep per the repo's pre-1.0 versioning policy; the core SDK has
no code changes in this release.
