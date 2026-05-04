---
'@tatlacas/brevwick-angular': patch
'@tatlacas/brevwick-react': patch
'@tatlacas/brevwick-react-native': patch
'@tatlacas/brevwick-sdk': patch
'@tatlacas/brevwick-solid': patch
'@tatlacas/brevwick-svelte': patch
'@tatlacas/brevwick-vue': patch
---

fix(sdk): compensate for inner overflow:auto scrollTop/scrollLeft so the
capture matches what the user is looking at, not the top of the
container's scroll extent.

Apps whose visible viewport lives on an inner element rather than the
window — Tailwind admin shells (`<main class="overflow-y-auto">`),
dashboards with sticky headers and a scrolling content well, anything
that pins `<html>`/`<body>` to viewport size and scrolls a child —
were the original failure mode behind the brevwick-web#254 / PR #103
"blank screenshot" reports. `modern-screenshot` clones the capture
subtree into an SVG `<foreignObject>` and the clone resets `scrollTop`
and `scrollLeft` on every overflow:auto/scroll descendant to (0, 0).
Once the user had scrolled mid-way down, captures rasterized the _top_
of the inner scrollable area rather than the visible content — partial
or fully blank WebPs depending on what happened to live at the top of
that scroll extent.

PR #103 flipped the default capture root from `documentElement` to
`body`, which changed which slice of the page accidentally got
captured but did not fix the underlying reset — the previous
"foreignObject inside documentElement" hypothesis was wrong.

What changed: `screenshot.ts` now walks overflow:auto/scroll
descendants of the capture root with non-zero `scrollTop`/`scrollLeft`,
leaves the container's `overflow` clip in place, and translates each
direct element child by `(-scrollLeft, -scrollTop)` with
`transform-origin: 0 0` for the duration of the capture. The
container's box stays the same so clipping is preserved; the children
render at the offset the user sees, exactly as in the live tree.
Restored unconditionally in the same `try/finally` block as the
`[data-brevwick-skip]` scrub, ref-counted via WeakMap so concurrent
captures do not leak transforms.

Sticky/fixed handling: `position: sticky` and `position: fixed` direct
children are explicitly skipped by the compensation pass — translating
them by `-scrollTop` would rasterize the pinned element off the top of
the captured frame, re-introducing the partial-blank symptom this PR
fixes for sticky-header dashboards. Skipped children render at their
intrinsic flow position in the clone, which is roughly where the user
sees a `top:0`-stuck header. Not pixel-perfect (faithful reconstruction
needs per-child geometry), but strictly better than translating
off-screen.

Other limitations called out in JSDoc: inline `style.transform` on a
direct child composes by _prepending_ the translate; RTL `scrollLeft`
semantics are not normalised; window scroll continues to be handled by
`modern-screenshot` itself. Real-browser pixel coverage of the
rasterized output remains tracked separately via #104.

The non-SDK adapter packages get a no-op patch bump to stay in
lockstep per the repo's pre-1.0 versioning policy.
