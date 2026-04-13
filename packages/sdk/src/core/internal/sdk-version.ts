/**
 * SDK version string. Replaced at build and test time via the bundler's
 * `define` option so it stays in sync with `package.json` without an ambient
 * JSON import (which would sit outside `rootDir`).
 *
 * - tsup: `define: { __BREVWICK_VERSION__: JSON.stringify(pkg.version) }`
 * - vitest: same, via the `define` block in vitest.config.ts
 */
declare const __BREVWICK_VERSION__: string;

export const SDK_VERSION: string = __BREVWICK_VERSION__;
export const SDK_USER_AGENT = `brevwick-sdk/${__BREVWICK_VERSION__}`;
