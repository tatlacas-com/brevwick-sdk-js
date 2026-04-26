---
'@tatlacas/brevwick-react': patch
'@tatlacas/brevwick-sdk': patch
---

fix(react): hide feedback panel while region-capture overlay is up

Clicking the screenshot button opens a drag-to-select overlay over the
page, but the feedback panel itself stayed painted at its anchor corner
the whole time — covering page content the user was specifically trying
to screenshot. Toggle a new `brw-panel-hidden` class
(`visibility: hidden; pointer-events: none`) on the panel for the
lifetime of the overlay so the page underneath is fully visible during
selection. The panel stays mounted, so the composer draft, attachments,
and Radix focus management survive an open / cancel round-trip; only
painting and hit-testing are suppressed. The existing
`data-brevwick-skip` on the panel is unchanged — it still scrubs the
panel from the rasterised image during the actual capture pass; this
fix is strictly about pre-capture occlusion.

The `@tatlacas/brevwick-sdk` patch bump is a no-op to keep the two
packages in lockstep per the repo's pre-1.0 versioning policy.
