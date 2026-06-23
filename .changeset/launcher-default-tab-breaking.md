---
'@tatlacas/brevwick-sdk': major
'@tatlacas/brevwick-react': major
'@tatlacas/brevwick-solid': major
'@tatlacas/brevwick-vue': major
'@tatlacas/brevwick-svelte': major
'@tatlacas/brevwick-angular': major
'@tatlacas/brevwick-react-native': major
---

BREAKING CHANGE: the launcher's default presentation changes from the corner
bubble to the vertical edge tab.

In 1.x, rendering `<FeedbackButton />` with no `position` (or `variant`) prop
produced a floating corner pill pinned to `bottom-right`. As of 2.0 the default
resolves to `variant: 'tab'` — a vertical button flush against the right
viewport edge, vertically centered (`resolveLauncherPlacement`,
`@tatlacas/brevwick-sdk/launcher`). Every adapter (React, Solid, Vue, Svelte,
Angular, React Native) shares this default.

Migration: call sites that want the legacy corner bubble must now opt in
explicitly. Pass a legacy corner `position` without a `variant`
(`<FeedbackButton position="bottom-right" />`) — which keeps the bubble
byte-for-byte — or set `variant="bubble"` directly. Call sites that already
pass a corner `position` are unaffected and render exactly as before; only the
bare-default usage changes.
