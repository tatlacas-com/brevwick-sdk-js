---
'@tatlacas/brevwick-react': patch
'@tatlacas/brevwick-solid': patch
'@tatlacas/brevwick-vue': patch
'@tatlacas/brevwick-svelte': patch
'@tatlacas/brevwick-angular': patch
---

Re-style the in-widget staged-status rows ("Captured route, console, network,
device" / "PII-sanitised, packaged" / "Formatting with AI…") to match the
marketing landing page's `AnimatedDemo` widget mock across every web-rendered
adapter — React, Solid, Vue, Svelte, and Angular. Previously the rows rendered
as assistant-coloured chat bubbles, which read as conversation messages rather
than progress indicators and conflicted with the neutral-checklist treatment
users saw on `brevwick.dev` before adopting the SDK. The rows now sit under a
dashed top divider inside a `.brw-status-rows` (`brw-svelte-status-rows` on
Svelte) wrapper, render as a compact stacked list with small emerald check
icons, and live outside the `.brw-bubble` class family so screen readers and
consumers that count conversation messages still see only the greeting + user
message as bubbles. The per-row stagger now correctly targets
`animation-delay` (the entrance is a CSS `@keyframes`, not a transition), so
the cascade is no longer a no-op. The retry row keeps its standalone alert
chrome — padding, radius, red border, transparent background — because it
remains a separate failure CTA, not a checklist line. React Native is
intentionally out of scope (different rendering surface, native StyleSheet
not CSS).
