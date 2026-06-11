/**
 * Launcher presentation types + placement resolution for the Svelte
 * FeedbackButton. Mirrors the React adapter byte-for-byte (see
 * packages/react/src/feedback-button.tsx) so every adapter resolves the
 * variant/position matrix identically.
 */

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

/**
 * Resolved launcher placement — the single source of truth shared by the
 * FAB class derivation and the panel anchor. See the resolution table in
 * the design spec (mirrored in every adapter):
 *
 * - Explicit `variant` always wins; `position` then only contributes its
 *   horizontal side (a corner's vertical component is ignored for the tab
 *   — tabs are always vertically centered, ± `offset`).
 * - With `variant` unset, an explicit legacy corner implies the bubble so
 *   pre-existing call sites keep their corner pill; everything else is
 *   the tab (the new default), on the right edge unless `position` says
 *   otherwise.
 *
 * Every combination is total — no throws, no dead states.
 */
export function resolveLauncherPlacement(
  variant?: FeedbackButtonVariant,
  position?: FeedbackButtonPosition,
): { variant: FeedbackButtonVariant; side: 'right' | 'left' } {
  const side: 'right' | 'left' =
    position === 'left' || position === 'bottom-left' ? 'left' : 'right';
  if (variant !== undefined) return { variant, side };
  // Legacy compat: an explicit corner without a variant keeps the bubble.
  const isCorner = position === 'bottom-right' || position === 'bottom-left';
  return { variant: isCorner ? 'bubble' : 'tab', side };
}
