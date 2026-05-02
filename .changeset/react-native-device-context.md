---
'@tatlacas/brevwick-react-native': minor
---

feat(react-native): add `collectDeviceContext()` returning the wire-ready
`device_context` payload (`{ ua, locale, viewport: {w,h}, platform:
'react-native-ios' | 'react-native-android', sdk }`). Strict Flutter-parity
shape — `device_context.platform` is the only deliberate divergence so
triage can split RN traffic from web without branching on `sdk.name`.
Static fields (`platform`, `sdk`, `ua`) cache on first call; `locale` and
`viewport` re-read each call so runtime locale switches and orientation
changes ride on the next captured issue. Collector is shipped unwired and
integrated into `composePayload()` by #83+#84 (WT-rn-provider-hook).
