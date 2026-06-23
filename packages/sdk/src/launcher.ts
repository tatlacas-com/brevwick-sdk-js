/**
 * Framework-agnostic launcher placement resolution.
 *
 * The `<FeedbackButton>` variant/position matrix is identical across every
 * adapter (react, solid, vue, svelte, angular, react-native) — historically
 * each shipped a byte-for-byte copy of `resolveLauncherPlacement`. That is a
 * pure function with no DOM / React / Node dependency, so it lives here in
 * core and every adapter imports it (CLAUDE.md: "shared utilities go in
 * core"). Adapters keep their own public prop TYPES (so each can carry
 * adapter-specific JSDoc, and the RN adapter can widen `position` with its
 * offset-object form), but the resolution LOGIC has exactly one home.
 *
 * Shipped on its own `@tatlacas/brevwick-sdk/launcher` entry so it is fully
 * tree-shakeable and never lands in the eager core bundle that has its own
 * gzip ceiling (CLAUDE.md "Bundle Budget").
 *
 * @module
 */

/**
 * Launcher presentation. `'tab'` (the default) is a vertical button flush
 * against a viewport edge; `'bubble'` is the legacy floating corner pill.
 */
export type FeedbackButtonVariant = 'bubble' | 'tab';

/**
 * Launcher placement.
 * - `'right' | 'left'` — edge sides (natural home of the tab).
 * - `'bottom-right' | 'bottom-left'` — legacy corners (natural home of the
 *   bubble). Passing one of these WITHOUT an explicit `variant` opts into
 *   the bubble, preserving pre-2.x call sites byte-for-byte.
 */
export type FeedbackButtonPosition =
  | 'right'
  | 'left'
  | 'bottom-right'
  | 'bottom-left';

/**
 * Resolved launcher placement — the single source of truth shared by an
 * adapter's FAB class/style derivation and its panel anchor.
 */
export interface ResolvedLauncherPlacement {
  variant: FeedbackButtonVariant;
  side: 'right' | 'left';
}

/**
 * Resolve the `variant` / `position` props into the concrete placement an
 * adapter renders. See the resolution table in the design spec (SDD § 12):
 *
 * - Explicit `variant` always wins; `position` then only contributes its
 *   horizontal side (a corner's vertical component is ignored for the tab
 *   — tabs are always vertically centered, ± `offset`).
 * - With `variant` unset, an explicit legacy corner implies the bubble so
 *   pre-existing call sites keep their corner pill; everything else is the
 *   tab (the default), on the right edge unless `position` says otherwise.
 *
 * Every combination is total — no throws, no dead states.
 */
export function resolveLauncherPlacement(
  variant?: FeedbackButtonVariant,
  position?: FeedbackButtonPosition,
): ResolvedLauncherPlacement {
  const side: 'right' | 'left' =
    position === 'left' || position === 'bottom-left' ? 'left' : 'right';
  if (variant !== undefined) return { variant, side };
  // Legacy compat: an explicit corner without a variant keeps the bubble.
  const isCorner = position === 'bottom-right' || position === 'bottom-left';
  return { variant: isCorner ? 'bubble' : 'tab', side };
}
