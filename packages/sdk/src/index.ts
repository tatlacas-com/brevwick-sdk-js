/**
 * Brevwick — AI-first QA feedback SDK for browser apps.
 *
 * Public surface is frozen to exactly the symbols re-exported here. See
 * brevwick-ops/docs/brevwick-sdd.md § 12 for the contract.
 */

export { createBrevwick } from './core/client';

export type {
  Brevwick,
  BrevwickConfig,
  Environment,
  FeedbackAttachment,
  FeedbackInput,
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
