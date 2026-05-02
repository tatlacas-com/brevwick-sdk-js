---
'@tatlacas/brevwick-react-native': minor
'@tatlacas/brevwick-sdk': minor
'@tatlacas/brevwick-react': minor
---

feat(react-native): captureScreenshot via react-native-view-shot optional peer (#86)

Adds `captureScreenshot(viewRef, opts?)` and `<BrevwickSkip>` to
`@tatlacas/brevwick-react-native`. `react-native-view-shot` is declared as an
**optional** peer dep so Expo Go consumers (no custom dev client) and
consumers who never capture a screenshot skip the install entirely. The peer
is dynamic-imported on first call; if the module is missing or `captureRef`
rejects, the capture resolves to a 1×1 transparent PNG placeholder rather
than throwing — preserving the never-throws contract from SDD § 12.

`<BrevwickSkip>` mirrors the JS SDK `[data-brevwick-skip]` selector and
Flutter's `BrevwickSkip`: any subtree wrapped by it is hidden via
`setNativeProps({ opacity: 0 })` for the rasterised frame and restored on the
way out, including on the failure path. The hide/restore is refcount-aware so
overlapping captures cannot strand the UI hidden — outermost capture wins.

`dataUriToBlob` rejects non-`image/*` MIME payloads, mirroring the core's
`isValidImageBlob` invariant.

The `@tatlacas/brevwick-sdk` and `@tatlacas/brevwick-react` bumps are the
lockstep pre-1.0 version per the `linked` group in `.changeset/config.json`.
No code change in either package for this PR.
