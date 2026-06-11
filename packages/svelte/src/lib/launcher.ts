/**
 * Launcher presentation types for the Svelte FeedbackButton.
 *
 * The placement RESOLUTION (`resolveLauncherPlacement`) is a pure,
 * framework-agnostic function shared by every adapter, so it is hoisted into
 * `@tatlacas/brevwick-sdk/launcher` (CLAUDE.md: "shared utilities go in
 * core") and re-exported here for the component. Only the public prop TYPES
 * stay adapter-local so this package can carry its own JSDoc.
 */

export { resolveLauncherPlacement } from '@tatlacas/brevwick-sdk/launcher';

/** Launcher presentation. `'tab'` (NEW DEFAULT) is a vertical button flush
 *  against a viewport edge; `'bubble'` is the legacy floating corner pill. */
export type FeedbackButtonVariant = 'bubble' | 'tab';

/**
 * Launcher placement.
 * - `'right' | 'left'`        — edge sides (natural home of the tab).
 * - `'bottom-right' | 'bottom-left'` — legacy corners (natural home of the
 *   bubble). Passing one of these WITHOUT an explicit `variant` opts into
 *   the bubble, preserving pre-2.x call sites byte-for-byte.
 */
export type FeedbackButtonPosition =
  | 'right'
  | 'left'
  | 'bottom-right'
  | 'bottom-left';
