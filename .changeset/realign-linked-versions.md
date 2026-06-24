---
'@tatlacas/brevwick-sdk': patch
'@tatlacas/brevwick-react': patch
'@tatlacas/brevwick-react-native': patch
'@tatlacas/brevwick-solid': patch
'@tatlacas/brevwick-svelte': patch
'@tatlacas/brevwick-vue': patch
'@tatlacas/brevwick-angular': patch
---

Re-align the seven linked packages onto a single version on the prerelease
channel. The stable `1.0.2` release (PR #150) bumped only the five web
adapters — `react`, `solid`, `vue`, `svelte`, `angular` — because the
consumed changeset listed only those packages, and `.changeset/config.json`
uses `linked` (which shares a version-floor across the group but does not
auto-bump siblings) rather than `fixed`. As a result `@tatlacas/brevwick-sdk`
and `@tatlacas/brevwick-react-native` were left at `1.0.1` on npm while the
others moved to `1.0.2`. Listing all seven here brings every package to the
next prerelease (`1.0.3-beta.0`) together, restoring parity across the
linked group before further work continues on the dev channel.
