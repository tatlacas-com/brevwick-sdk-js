---
'@tatlacas/brevwick-sdk': patch
'@tatlacas/brevwick-react': patch
'@tatlacas/brevwick-vue': patch
'@tatlacas/brevwick-svelte': patch
'@tatlacas/brevwick-solid': patch
'@tatlacas/brevwick-angular': patch
'@tatlacas/brevwick-react-native': patch
---

Point each package's `homepage` field at the framework-specific docs page on
`brevwick.dev` instead of the GitHub repo. npm renders `homepage` as a
prominent link on the package page, and Google treats `npmjs.com/package/<x>`
as a high-authority backlink source — pointing it at `brevwick.dev` gives
the brand reciprocal-link credit alongside the JSON-LD `sameAs` graph the
website ships in its marketing layout.
