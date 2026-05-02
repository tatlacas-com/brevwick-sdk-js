// Brevwick React Native adapter — public exports added by feature worktrees (#83 onwards).

// `BREVWICK_REACT_NATIVE_VERSION` lives in a generated `./version.ts` (written
// by `scripts/generate-version.mjs` from `package.json#version`) rather than
// being inlined via a tsup/vitest `define`. Metro resolves this package via
// the top-level `react-native` field (`./src/index.ts`) and does not run
// define-style substitution, so an ambient token would crash consumers with
// `ReferenceError` at runtime.
export { BREVWICK_REACT_NATIVE_VERSION } from './version';

export { collectDeviceContext, type DeviceContext } from './device';

export { captureScreenshot } from './screenshot';
export type { CaptureScreenshotOpts } from './screenshot';
export { BrevwickSkip } from './skip';
export type { BrevwickSkipProps } from './skip';
