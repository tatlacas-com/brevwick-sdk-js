// Brevwick React Native adapter — public exports added by feature worktrees (#83 onwards).

declare const __BREVWICK_REACT_NATIVE_VERSION__: string;

/**
 * Package version, injected at build time from `package.json`.
 *
 * Exposed for diagnostics and parity with the other Brevwick adapters
 * (`@tatlacas/brevwick-sdk`, `@tatlacas/brevwick-react`,
 * `@tatlacas/brevwick-solid`, ...). Issue #82 specified an empty
 * `export {}` placeholder; the constant is included here so feature
 * worktrees (#83 onwards) can reference it without a follow-up
 * scaffolding change.
 */
export const BREVWICK_REACT_NATIVE_VERSION: string =
  __BREVWICK_REACT_NATIVE_VERSION__;
