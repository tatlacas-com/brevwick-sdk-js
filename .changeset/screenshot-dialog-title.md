---
'@tatlacas/brevwick-react': patch
'@tatlacas/brevwick-sdk': patch
---

fix(react): add hidden Dialog.Title to screenshot region overlay

Radix `Dialog.Content` emits a `console.error` when no `Dialog.Title`
descendant is present. The region-capture overlay previously labelled
itself with `aria-label` only, so every screenshot button click logged
the warning. Render a visually-hidden `Dialog.Title` (text: "Select
screenshot region") to satisfy the primitive without affecting the
announced name.

The `@tatlacas/brevwick-sdk` bump is a no-op patch to keep the two packages in
lockstep per the repo's pre-1.0 versioning policy.
