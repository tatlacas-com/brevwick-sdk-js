/**
 * Brevwick — AI-first QA feedback SDK for browser apps.
 *
 * Public surface is frozen to exactly the symbols re-exported here.
 */

export { createBrevwick } from './core/client';

/**
 * Module-level default redactor + the shared sensitive-parameter key matcher.
 *
 * Adapter packages (e.g. `@tatlacas/brevwick-react-native`) use these to keep
 * their ring entries on the same redaction contract as the core SDK without
 * duplicating the regex set or the redactor implementation. Per CLAUDE.md
 * "every payload that leaves the device runs through `redact()` first" —
 * this re-export is what makes that enforceable from outside core.
 *
 * The richer per-instance `createRedactor(disable, custom)` factory stays
 * internal until an adapter actually needs it; widening the surface
 * pre-emptively would lock in a contract we may want to revise.
 */
export { redact, SENSITIVE_PARAM_KEYS } from './core/internal/redact';

export type {
  Brevwick,
  BrevwickConfig,
  BrevwickRedactConfig,
  BrevwickRingsConfig,
  ConsoleLevel,
  ConsoleRingConfig,
  Environment,
  FeedbackAttachment,
  FeedbackInput,
  NetworkRingConfig,
  ProjectConfig,
  RedactCustomPattern,
  RedactPatternName,
  RouteEntry,
  SubmitError,
  SubmitErrorCode,
  SubmitResult,
} from './types';

export type { CaptureScreenshotOpts } from './screenshot';

/**
 * Lazy re-export: the real module (and its `modern-screenshot` peer dep) is
 * resolved only on the first call so the base chunk stays below its 2 kB gzip
 * budget. `export { captureScreenshot } from './screenshot'` would pull the
 * module — and through it, `modern-screenshot` — into the root bundle.
 */
export const captureScreenshot: typeof import('./screenshot').captureScreenshot =
  (...args) => import('./screenshot').then((m) => m.captureScreenshot(...args));
