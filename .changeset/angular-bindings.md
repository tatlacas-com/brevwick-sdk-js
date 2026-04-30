---
'@tatlacas/brevwick-angular': minor
'@tatlacas/brevwick-react': minor
'@tatlacas/brevwick-sdk': minor
---

feat(angular): @tatlacas/brevwick-angular adapter package

Ships the Angular 17+ standalone bindings:

- `provideBrevwick(config)` — returns `EnvironmentProviders` for
  `bootstrapApplication`-style DI bootstrap.
- `BrevwickService` (`providedIn: 'root'`) — Signals-first wrapper around
  `Brevwick`, SSR-safe via `PLATFORM_ID` + `isPlatformBrowser`. Exposes
  `submit()`, `captureScreenshot()`, `reset()`, and a `status` Signal that
  walks `'idle' | 'submitting' | 'success' | 'error'`.
- `<bw-feedback-button>` (`BwFeedbackButtonComponent`) — drop-in standalone
  FAB with a minimal text-only panel. Wraps `BrevwickService`, emits the
  SDK's `SubmitResult`, and short-circuits on non-browser platforms.
- `BREVWICK_ANGULAR_VERSION` — diagnostics literal, written into source by
  a `prebuild` codegen step (ng-packagr does not honour `define`).

Build pipeline uses ng-packagr (Angular Package Format) — divergent from the
rest of the monorepo's tsup adapters. Eager FESM2022 bundle measures 4.58 kB
gzip vs the 8 kB envelope; `modern-screenshot` stays lazy via the SDK.

The `@tatlacas/brevwick-sdk` and `@tatlacas/brevwick-react` bumps are the
lockstep pre-1.0 version (no code change in either package for this PR).
