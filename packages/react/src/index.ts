/**
 * Brevwick React bindings.
 *
 * Phase 0: ships only a placeholder export so the package publishes cleanly.
 * The provider, FAB, and useFeedback hook land in Phase 4 — see
 * brevwick-ops/docs/brevwick-sdd.md § 12 for the React contract.
 */

declare const __BREVWICK_REACT_VERSION__: string;

// Injected at build/test time from packages/react/package.json via tsup/vitest `define`.
export const BREVWICK_REACT_VERSION: string = __BREVWICK_REACT_VERSION__;
