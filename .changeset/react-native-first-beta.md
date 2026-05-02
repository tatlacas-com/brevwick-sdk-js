---
'@tatlacas/brevwick-react-native': minor
---

chore(release): @tatlacas/brevwick-react-native first beta (#91)

Initial React Native adapter package: BrevwickProvider, useFeedback hook,
FeedbackButton + Modal, react-native-view-shot optional-peer screenshot,
React Navigation route ring, device context, Expo example app, canonical
README. Mirrors @tatlacas/brevwick-react with RN primitives. Wire format
identical except `device_context.platform = react-native-{ios,android}`.

Lockstep with the rest of the SDK suite via the `linked` group in
`.changeset/config.json` — the package version syncs to the next
`1.0.0-beta.x` when the Release PR runs. Ships with npm provenance
(`publishConfig.provenance: true`) and the 25 kB gzip size-limit gate
mirroring the React adapter.
