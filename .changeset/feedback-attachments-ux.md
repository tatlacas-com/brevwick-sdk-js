---
'@tatlacas/brevwick-react': minor
'@tatlacas/brevwick-sdk': patch
---

feat(react): multi-screenshot, in-flight capture indicator, tap-to-preview

Three feedback-panel UX fixes that together make the screenshot flow
legible end-to-end:

- **In-flight capture indicator** (#55). The region-capture overlay closes
  the moment the user clicks Capture, but `captureScreenshot()` plus the
  optional crop step is async — previously the panel re-appeared with no
  thumbnail and no explanation for the gap. A new `capturing` state
  surfaces a "Capturing screenshot…" bubble in the thread and disables
  the screenshot + file-attach controls so a second click cannot stack
  on top of the first.

- **Multiple screenshots per submission** (#56). The composer now keeps
  a bounded array of screenshots instead of a single field; each capture
  appends rather than replacing the previous one. The combined
  screenshot/file total caps at 5 (mirrors the SDK's
  `MAX_ATTACHMENT_COUNT`); the attach buttons disable with an explanatory
  `aria-label` once the cap is reached. Single-screenshot submissions
  keep the historical `screenshot.<ext>` wire filename; multi-screenshot
  submissions disambiguate as `screenshot-1.<ext>`, `screenshot-2.<ext>`,
  in capture order.

- **Tap thumbnail to preview** (#57). The screenshot chip's image is now
  a button that opens a Radix `Dialog` preview at viewport-fit size. Esc,
  the close button, and the backdrop dismiss; focus restores to the chip
  on close. The chip's × remove stays a sibling so it never opens the
  preview, and removing a screenshot whose preview is open auto-closes
  the dialog.

The `@tatlacas/brevwick-sdk` patch bump is a no-op to keep the two
packages in lockstep per the repo's pre-1.0 versioning policy.
