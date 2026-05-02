---
'@tatlacas/brevwick-react-native': minor
---

feat(react-native): provider + useFeedback hook (#83, #84)

Initial public API for `@tatlacas/brevwick-react-native`, mirroring
`@tatlacas/brevwick-react` 1:1 with React-Native-specific wiring:

- `BrevwickProvider` — memoises `createBrevwick(config)` on config
  identity, installs on mount, uninstalls on unmount; forwards an optional
  `navigationRef` to descendants via `BrevwickNavigationRefContext` so the
  route-ring worktree (#87) can subscribe without the adapter taking a
  hard dep on `@react-navigation/native`.
- `useBrevwick()` — reads the SDK instance from the provider; throws
  synchronously when used outside one.
- `useBrevwickNavigationRef()` — opt-in hook returning the forwarded
  `navigationRef` (or `null` when omitted/outside any provider).
- `useFeedback()` — `{ submit, captureScreenshot, status, phase, error,
retry, reset }`, structurally identical to web React's
  `UseFeedbackResult`.

Lockstep policy keeps the rest of the suite at the same beta cycle (see
`.changeset/config.json` `linked` group); only the React Native package
version actually advances here.
