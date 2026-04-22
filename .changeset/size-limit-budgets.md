---
'brevwick-react': patch
'brevwick-sdk': patch
---

Internal: enable `minify: true` in the React package's tsup build (~2 kB
gzip smaller delivered artefact for consumers; no API or runtime-behaviour
change). Adds `size-limit` budgets enforced in CI: core eager chunk ≤ 2.2 kB
gzip, screenshot wrapper ≤ 1.5 kB gzip, React bundle ≤ 25 kB gzip, and a
re-bundled "on-widget-open" measurement (screenshot wrapper + resolved
`modern-screenshot` peer) ≤ 25 kB gzip. SDK source unchanged; bumped in
lockstep with `brevwick-react` per the project's lockstep policy.
