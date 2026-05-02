---
'@tatlacas/brevwick-react-native': minor
'@tatlacas/brevwick-sdk': minor
'@tatlacas/brevwick-react': minor
---

feat(react-native): public `useRouteRing` hook + RN-aware
`useFeedback().captureScreenshot(viewRef)`; SDK exports
`PROJECT_KEY_PATTERN` (#89, #90)

Public surface added by this PR (PR #101 review action items):

- `useRouteRing(navigationRef?)` from `@tatlacas/brevwick-react-native` —
  owns the `_internal.push` reach-around the example previously copy/
  pasted into every consumer's `RouteRingBridge`. Resolves both the
  `Brevwick` instance and the `navigationRef` from context, attaches via
  `attachRouteRing`, and detaches on unmount. Pass an explicit
  `navigationRef` for layouts that mount the bridge outside the provider
  tree.
- `useFeedback().captureScreenshot` now accepts an optional `viewRef`
  (and `CaptureScreenshotOpts`) and routes RN captures through the
  package's native `captureScreenshot` (`react-native-view-shot` when
  the peer is installed, placeholder PNG otherwise) instead of always
  falling through to the core SDK's DOM-based path. Calls without a
  `viewRef` keep the previous behaviour.
- `BrevwickNavigationRef.current.addListener` now narrows the event
  parameter to the `'state'` literal (the only event the route ring
  subscribes to), so `useNavigationContainerRef<TParamList>()`'s
  strictly-typed ref is structurally assignable to
  `BrevwickProviderProps.navigationRef` without an
  `as unknown as BrevwickNavigationRef` cast at the consumer site.

Core SDK surface widens narrowly to support adapter + example
composition without duplication:

- `PROJECT_KEY_PATTERN` — the validator's project-key regex, exported
  so adapters and example apps can gate UI on the same source of truth
  `validateConfig` enforces. Use as `PROJECT_KEY_PATTERN.test(value)`;
  no boolean-returning helper is shipped because the eager bundle is
  within ~30 B of its 2.85 kB ceiling and a one-line `.test(value)` is
  no friction for callers.

Also fixes the `examples/react-native` peer-dep mismatch: the package
now declares `react-native-view-shot: >=3.8.0 <5` so both Expo SDK 51
(`~3.8.0`) and bare RN (`^4.0.0`) sit inside the supported range. CI
gains a `pnpm --filter @tatlacas/brevwick-react-native build` step
ahead of `pnpm type-check` so a clean checkout no longer fails on
TS2307 from `examples/react-native/tsconfig.json` (`moduleResolution:
Bundler`) trying to resolve `dist/` before it has been built.

The `@tatlacas/brevwick-sdk` bump is the lockstep pre-1.0 minor; the
linked group in `.changeset/config.json` propagates the bump across
the suite.
