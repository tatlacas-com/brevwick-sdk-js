---
'@tatlacas/brevwick-sdk': patch
---

fix(sdk): default `captureScreenshot()` to `document.body`

`captureScreenshot()` previously defaulted its capture root to
`document.documentElement` (`<html>`). Empirically, the `<body>` default
produces a non-blank capture in the brevwick-web reproduction reported in
tatlacas-com/brevwick-web#254, where the previous default was returning a
~2 KiB image with no visible content. The exact failure mode of the
`documentElement` path is **not** yet root-caused — the change is a
behaviour-improving switch matching `modern-screenshot`'s documented
usage, not a verified upstream-bug fix. See JSDoc on
`CaptureScreenshotOpts.element` for the provisional hypothesis (`<html>`
inside an SVG `<foreignObject>` may not render as flow content) which is
the leading suspicion but has not been pinned to a specific Chromium
issue.

Behavioural notes for adopters:

- Callers that explicitly pass `opts.element` are unaffected.
- Nodes portalled outside `<body>` (e.g. into `document.documentElement`
  by browser extensions or atypical portal libraries) are now **outside**
  the capture tree. Most React/Solid/Vue portal libraries portal into
  `document.body` and are unaffected.
- `:root` (i.e. `html`-scoped) CSS custom properties continue to be
  inherited by the cloned `<body>` subtree at clone time because
  `modern-screenshot` inlines computed styles before reparenting into
  `<foreignObject>`.
- Capture invoked before `<body>` parses (e.g. a `<head>` script) now
  yields the placeholder + warn entry instead of attempting to rasterize
  a `<body>`-less tree.
- The `@tatlacas/brevwick-sdk` patch lockstep-bumps every adapter
  (`-react`, `-vue`, `-solid`, `-svelte`, `-angular`, `-react-native`)
  per the changesets `linked` config; consumers of any adapter who call
  `bw.captureScreenshot()` (or top-level `captureScreenshot()`) inherit
  the new default automatically.
