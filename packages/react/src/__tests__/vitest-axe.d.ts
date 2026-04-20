// Ambient type augmentation for vitest-axe.
//
// vitest-axe@0.1.0 ships matcher declarations that target the legacy `Vi`
// namespace; vitest 4 moved the assertion interface to `Assertion` on the
// main `vitest` module. Without this augmentation TypeScript does not see
// `toHaveNoViolations` on `expect(...)`, and each test has to cast the
// return of `expect()` to an ad-hoc interface. Registering the matchers
// once via `expect.extend(axeMatchers)` in `vitest.setup.ts` wires them at
// runtime; this file wires them at the type level.
//
// This file is test-only: it lives under `__tests__/` and is not reachable
// from the package entry (`src/index.ts`), so tsup's dts bundler does not
// emit it into the published `dist/*` types.
import 'vitest';
import type { AxeMatchers } from 'vitest-axe/matchers';

declare module 'vitest' {
  // Augmenting vitest's library interfaces to pull in `AxeMatchers`. The
  // empty bodies are the idiomatic TS interface-merging shape: the members
  // come from the `extends` clause. The generic param on `Assertion` must
  // stay to match the upstream signature.
  /* eslint-disable @typescript-eslint/no-empty-object-type, @typescript-eslint/no-unused-vars */
  interface Assertion<T = unknown> extends AxeMatchers {}
  interface AsymmetricMatchersContaining extends AxeMatchers {}
  /* eslint-enable @typescript-eslint/no-empty-object-type, @typescript-eslint/no-unused-vars */
}
