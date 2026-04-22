---
'@tatlacas/brevwick-react': minor
'@tatlacas/brevwick-sdk': minor
---

feat(react): screenshot icon + drag-to-select region capture

- The composer's screenshot icon is now a monitor-plus-selection glyph
  (previously a camera), with `aria-label="Capture screenshot of this
page"` so keyboard and screen-reader users discover the affordance
  without relying on the surrounding tooltip. The paperclip file-upload
  button next to it is unchanged.
- Clicking the screenshot icon now opens a full-viewport region-capture
  overlay (Radix `Dialog.Root`, focus-trapped, Escape-to-dismiss). The
  submitter drags to mark a rectangle; "Capture" crops the full-page
  screenshot to that region, "Capture full page" preserves the pre-#31
  behaviour, and "Cancel" closes without a capture.
- Crop runs through `OffscreenCanvas` when available and falls back to
  a detached `<canvas>` + `toBlob` — both branches multiply the source
  rectangle by `devicePixelRatio` so the crop is sharp on HiDPI displays.
- Overlay nodes carry `data-brevwick-skip=""` so the SDK's capture scrub
  excludes them from the image (defence-in-depth — the overlay is
  unmounted before `captureScreenshot()` resolves).
- `prefers-reduced-motion: reduce` opts out of the selection shake
  animation on a degenerate confirm.
- Keyboard Enter confirms the drawn region only when the overlay root
  itself has focus; tabbing to Cancel / Capture full page and pressing
  Enter activates the focused button as expected.

The `@tatlacas/brevwick-sdk` bump is a no-op minor to keep the two packages in
lockstep per the repo's pre-1.0 versioning policy; the core SDK has no
code changes in this release. `FeedbackButtonProps` is unchanged; no
new runtime dependency; no SDD § 12 contract change.
