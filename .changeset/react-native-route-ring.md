---
'@tatlacas/brevwick-react-native': minor
'@tatlacas/brevwick-sdk': minor
---

feat(react-native): route ring via React Navigation + Expo Router (#87)

Ships the React Native route ring as the third capture surface for the
adapter, alongside console + network. New public surface:

- `attachRouteRing({ navigationRef, push })` — subscribes to React
  Navigation's `state` event on the captured `navigationRef.current`,
  resolves `getCurrentRoute()` after each transition, runs the route
  name + every param value through `redact()` before
  `encodeURIComponent` (so the regex set still matches literals), and
  pushes a wire-ready `RouteEntry` (`{ kind: 'route', path, timestamp }`).
- `NavigationContainerRefLike` / `NavigationRefLike` — minimal
  structural slices over React Navigation v6.x and v7.x so the
  attach helper compiles without a hard `@react-navigation/native`
  peer dependency.

Core public surface widens narrowly to support adapter composition:

- `redact` — the global redactor function, so adapters can apply the
  same pattern set used by every payload that leaves the device.
- `SENSITIVE_PARAM_KEYS` — the shared regex covering query/path keys
  flagged by name (`token`, `auth`, `key`, `secret`, `password`,
  `session`, `apikey`, `access_token`, `refresh_token`, `id_token`).
  Single source of truth — `packages/sdk/src/rings/network.ts` now
  consumes the same constant in place of its old inline literal so
  the network ring and the RN route ring cannot drift.
- `RouteEntry` — re-exported from the core ring-entry union so
  adapter packages compose against the same name.

The `@tatlacas/brevwick-sdk` bump is the lockstep pre-1.0 minor; the
linked group in `.changeset/config.json` propagates the bump across
the suite.
