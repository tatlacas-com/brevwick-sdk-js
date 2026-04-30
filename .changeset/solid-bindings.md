---
'@tatlacas/brevwick-solid': minor
'@tatlacas/brevwick-react': minor
'@tatlacas/brevwick-sdk': minor
---

feat(solid): @tatlacas/brevwick-solid adapter — BrevwickProvider + useFeedback + FeedbackButton

Ships the Solid bindings per the issue-66 SDD update:

- `<BrevwickProvider config>` — creates the SDK inside `onMount` so SSR
  emits no Brevwick state and the install hook only fires after client
  hydration.
- `useFeedback()` → `{ submit, captureScreenshot, status, reset }` where
  `status` is a Solid `Accessor<'idle' | 'submitting' | 'success' | 'error'>`.
  Throws synchronously when called outside the provider.
- `<FeedbackButton>` — drop-in FAB + popover with textarea + screenshot
  capture + send. SSR-safe via the provider's hydration boundary; injects
  its stylesheet on first mount; reuses the React widget's `--brw-*`
  custom-property contract so cross-adapter theming stays consistent.
- `"solid"` export condition pointing at the unbuilt `.tsx` source so
  Vite + `vite-plugin-solid` and SolidStart pick up the JSX-source for
  compile-time reactivity tracking. Pre-built `dist/index.js` /
  `dist/index.cjs` cover non-Solid-aware bundlers.
- Bundle budget: < 5 kB gzip eager (enforced by `chunk-split.test.ts` +
  `.size-limit.js`).

The `@tatlacas/brevwick-sdk` and `@tatlacas/brevwick-react` bumps are the
lockstep pre-1.0 versions (no code change in either for this PR).
