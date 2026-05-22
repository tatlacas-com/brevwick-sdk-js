---
'@tatlacas/brevwick-react': patch
'@tatlacas/brevwick-solid': patch
---

Re-style the in-widget staged-status rows ("Captured route, console, network,
device" / "PII-sanitised, packaged" / "Formatting with AI…") to match the
marketing landing page's `AnimatedDemo` widget mock. Previously the rows
rendered as assistant-coloured chat bubbles, which read as conversation
messages rather than progress indicators and conflicted with the
neutral-checklist treatment users saw on `brevwick.dev` before adopting the
SDK. The rows now sit under a dashed top divider, render as a compact stacked
list with small emerald check icons, and live outside the `.brw-bubble` class
family so screen readers and consumers that count conversation messages still
see only the greeting + user message as bubbles. The retry row keeps its
standalone bordered alert chrome because it remains a separate failure CTA,
not a checklist line.
