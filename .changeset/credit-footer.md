---
'@tatlacas/brevwick-react': patch
'@tatlacas/brevwick-sdk': patch
---

feat(react): credit footer with version + brevwick.dev link

- Thin `Brevwick v<x.y.z>` credit anchored below the composer, rendered
  inside the existing `<FeedbackButton>` panel in both compose and
  success states.
- Single link to https://brevwick.dev with `target="_blank"` and
  `rel="noopener noreferrer"`; label reads as one affordance rather
  than two competing elements.
- Muted 10 px styling driven by `--brw-fg-muted` + `--brw-composer-bg`,
  so the footer sits quietly in both light and dark themes. Hover/focus
  lifts opacity and underlines, keeping it discoverable without
  intruding.
- Version text comes from the existing `__BREVWICK_REACT_VERSION__`
  build-time constant that already powers `BREVWICK_REACT_VERSION` —
  no new source of truth.
- No public API change; props, hooks, and payload are unchanged.

The `@tatlacas/brevwick-sdk` bump is a no-op patch to keep both packages in
lockstep per the repo's pre-1.0 versioning policy; the core SDK has
no code changes in this release.
