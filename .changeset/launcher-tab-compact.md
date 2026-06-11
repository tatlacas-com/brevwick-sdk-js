---
'@tatlacas/brevwick-react': minor
'@tatlacas/brevwick-solid': minor
'@tatlacas/brevwick-vue': minor
'@tatlacas/brevwick-svelte': minor
'@tatlacas/brevwick-angular': minor
'@tatlacas/brevwick-react-native': minor
---

feat: launcher `variant` (vertical edge tab is the new default) + `compact` icon-only mode

The FeedbackButton launcher now supports two presentations across every adapter (React, Solid, Vue, Svelte, Angular, React Native):

- `variant="tab"` — **the new default**: a vertical tab flush against the right viewport edge (right edge of the host view on React Native), vertically centered. A new `offset` prop nudges the tab up/down from center in px.
- `variant="bubble"` — the legacy floating corner pill.
- `compact` — icon-only mode for either variant (circular bubble / square edge tab); the `label` is not rendered but becomes the launcher's `aria-label`.
- `position` gains the edge sides `'right' | 'left'` alongside the legacy corners. Defaults: `'right'` for the tab, `'bottom-right'` for the bubble.

Backwards compatibility: passing a legacy corner `position` (`'bottom-right'` / `'bottom-left'` — or the offset-object form on React Native) without an explicit `variant` keeps the corner bubble, so existing call sites render exactly as before. When both are set, `variant` wins and `position` contributes only its horizontal side.
