// Brevwick React Native adapter — public exports added by feature worktrees (#83 onwards).

// `BREVWICK_REACT_NATIVE_VERSION` lives in a generated `./version.ts` (written
// by `scripts/generate-version.mjs` from `package.json#version`) rather than
// being inlined via a tsup/vitest `define`. Metro resolves this package via
// the top-level `react-native` field (`./src/index.ts`) and does not run
// define-style substitution, so an ambient token would crash consumers with
// `ReferenceError` at runtime.
export { BREVWICK_REACT_NATIVE_VERSION } from './version';

// Public route-ring surface. `redactPathParams` is intentionally NOT
// exported — it is an internal helper of `attachRouteRing` and surfacing
// it would freeze a "redact this string for me" capability nothing in the
// public contract requires. `RouteEntry` (the entry shape pushed into the
// ring) lives in `@tatlacas/brevwick-sdk` and is re-exported from there;
// consumers compose against the core type so adapter + core types unify.
export { attachRouteRing } from './rings/route';
export type {
  NavigationContainerRefLike,
  NavigationRefLike,
} from './rings/route';
