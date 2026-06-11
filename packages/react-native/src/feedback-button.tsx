import { useCallback, useMemo, useState, type ReactElement } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  useColorScheme,
  View,
  type LayoutChangeEvent,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import {
  useFeedback,
  type FeedbackPhase,
  type FeedbackStatus,
} from './use-feedback';
import { FeedbackModal } from './feedback-modal';
import { ChatIcon } from './icons';
import {
  createWidgetStyles,
  resolvePalette,
  type BrevwickTheme,
} from './styles';
import { resolveLauncherPlacement as resolveBasePlacement } from '@tatlacas/brevwick-sdk/launcher';

/** Launcher presentation. `'tab'` (NEW DEFAULT) is a vertical button flush
 *  against an edge of the absolute-positioned host view; `'bubble'` is the
 *  legacy floating corner pill. */
export type FeedbackButtonVariant = 'bubble' | 'tab';

/**
 * Launcher placement.
 * - `'right' | 'left'`        — edge sides (natural home of the tab).
 * - `'bottom-right' | 'bottom-left'` — legacy corners (natural home of the
 *   bubble; default 24px inset on both axes). Passing one of these WITHOUT
 *   an explicit `variant` opts into the bubble, preserving pre-2.x call
 *   sites byte-for-byte.
 * - `{ bottom?, right?, left? }` — explicit offset triplet for callers that
 *   need to clear a custom safe-area / tab-bar. Like the named corners,
 *   the object form implies the bubble when `variant` is unset.
 *
 * @remarks
 * **Web parity divergence.** The web React adapter restricts `position` to
 * the four named strings. The RN adapter widens the type with the
 * `{ bottom?, right?, left? }` object form to accommodate the
 * platform-specific safe-area / tab-bar / notch insets that have no
 * analogue in the DOM. This widening is RN-only — consumers porting code
 * between adapters must use the named-string forms for portable call sites.
 */
export type FeedbackButtonPosition =
  | 'right'
  | 'left'
  | 'bottom-right'
  | 'bottom-left'
  | { bottom?: number; right?: number; left?: number };

/**
 * RN superset of the shared placement resolver. The named-string matrix is
 * the framework-agnostic `resolveLauncherPlacement` in
 * `@tatlacas/brevwick-sdk/launcher` (one home for the logic, per CLAUDE.md).
 * This wrapper only adds the RN-only `{ bottom?, right?, left? }` offset
 * object — a platform safe-area/tab-bar inset with no DOM analogue — then
 * delegates the named-string cases to core:
 *
 * - Object form: `left` set without `right` → left edge, otherwise right;
 *   its pixel values apply to the bubble only. Like a legacy corner, an
 *   offset object without an explicit `variant` implies the bubble.
 * - Everything else is resolved by the shared core function.
 *
 * Every combination is total — no throws, no dead states.
 */
function resolveLauncherPlacement(
  variant?: FeedbackButtonVariant,
  position?: FeedbackButtonPosition,
): { variant: FeedbackButtonVariant; side: 'right' | 'left' } {
  if (typeof position === 'object') {
    const side: 'right' | 'left' =
      position.left !== undefined && position.right === undefined
        ? 'left'
        : 'right';
    // An offset object without a variant keeps the bubble (like a corner).
    return { variant: variant ?? 'bubble', side };
  }
  return resolveBasePlacement(variant, position);
}

/**
 * Props for {@link FeedbackButton}. Mirrors the React adapter's prop shape
 * 1:1 except for `style` / `position` which adapt to RN primitives.
 */
export interface FeedbackButtonProps {
  /**
   * Launcher presentation. Default `'tab'` — **this changed in vNEXT**:
   * the zero-config launcher is now a vertical tab on the right edge of
   * the host view. Pass `variant="bubble"` (or a legacy corner / offset
   * `position`) to keep the floating corner pill.
   */
  variant?: FeedbackButtonVariant;
  /**
   * Where the launcher sits. Defaults: `'right'` for the tab,
   * `'bottom-right'` for the bubble.
   *
   * Compatibility: passing a legacy corner (`'bottom-right'` /
   * `'bottom-left'`) or the `{ bottom?, right?, left? }` offset object
   * without an explicit `variant` renders the BUBBLE at that position —
   * existing call sites keep their pre-vNEXT presentation. When `variant`
   * and `position` disagree (e.g. `variant="tab"` +
   * `position="bottom-left"`), `variant` wins and `position` contributes
   * only its horizontal side (for the offset object: `left` set without
   * `right` → left edge, otherwise right; its pixel values apply to the
   * bubble only).
   */
  position?: FeedbackButtonPosition;
  /**
   * Icon-only mode. Bubble → 48px circular icon button; tab → compact
   * square edge chip with just the chat icon. The visible label is not
   * rendered — including the phase-tracking copy (`Capturing…` /
   * `Sending…` / `Sent ✓`), so the FAB surfaces no submit progress in
   * compact mode (the modal still shows it). The `label` (or
   * `'Feedback'` when unset) becomes the launcher's
   * `accessibilityLabel`. Default `false`.
   */
  compact?: boolean;
  /**
   * Tab-only: vertical offset in logical px from the vertical center of
   * the host view. Positive moves the tab down, negative up. Ignored for
   * the bubble. Default `0`.
   */
  offset?: number;
  /**
   * Forced palette. `'system'` (default) follows the host's color scheme;
   * `'light'`/`'dark'` override it.
   */
  theme?: BrevwickTheme;
  /**
   * Style overrides applied to the FAB Pressable. Composed via
   * `StyleSheet.flatten` and placed last in the array so consumer entries
   * win over the built-in styles — pass `style={{ backgroundColor: '#f00' }}`
   * to recolour the FAB without forking the component.
   */
  style?: StyleProp<ViewStyle>;
  /**
   * FAB label override. The default copy advances by submission phase
   * (`Send feedback` → `Capturing…` → `Sending…` → `Sent ✓` / `Try again`),
   * so most consumers should leave this unset; pass an explicit label only
   * when the brand voice demands different copy. Hidden visually when
   * `compact` — the string then becomes the launcher's `accessibilityLabel`.
   */
  label?: string;
  /** When true, the FAB renders nothing. Useful for feature-flagging. */
  hidden?: boolean;
  /** When true, the FAB renders disabled and cannot open the modal. */
  disabled?: boolean;
}

const DEFAULT_INSET = 24;

/**
 * Map the SDK's submission lifecycle (`status` + `phase`) to the FAB
 * label. We branch on `status` first so the post-submit terminal states
 * (`success` → `Sent ✓`, `error` → `Try again`) are reachable even though
 * the SDK's phase bus does not emit an error event — the parent owns the
 * `useFeedback()` instance and forwards both `status` and `phase` here so
 * the FAB and Modal stay in lockstep.
 */
function fabLabelForState(
  status: FeedbackStatus,
  phase: FeedbackPhase,
  fallback: string,
): string {
  if (status === 'success' || phase === 'sent') return 'Sent ✓';
  if (status === 'error' || phase === 'error') return 'Try again';
  if (status === 'submitting') {
    // `'capturing'` is set synchronously by `useFeedback().submit` before
    // any bus event fires; the bus then advances through `sanitising` →
    // `formatting` → `sent`. Collapsing capturing+sanitising matches the
    // web adapter's "Capturing…" copy because the user perceives both as
    // the same waiting beat.
    if (phase === 'formatting') return 'Sending…';
    return 'Capturing…';
  }
  return fallback;
}

/**
 * Pin style for the bubble. The offset-object form keeps its pre-vNEXT
 * semantics (only the provided keys are spread); every other input —
 * named corners, edge sides (`'right'`/`'left'` → the bottom corner of
 * that side, matching the web `variant="bubble" position="left"` rule),
 * or no position at all — collapses to the resolved `side`'s default
 * 24px-inset bottom corner.
 */
function resolveBubblePositionStyle(
  position: FeedbackButtonPosition | undefined,
  side: 'right' | 'left',
): ViewStyle {
  if (typeof position === 'object') {
    // Explicit offsets — only spread the keys that were provided so we
    // don't overwrite a `right` that the caller intentionally omitted in
    // favour of `left`.
    const out: ViewStyle = {};
    if (typeof position.bottom === 'number') out.bottom = position.bottom;
    if (typeof position.right === 'number') out.right = position.right;
    if (typeof position.left === 'number') out.left = position.left;
    if (
      out.bottom !== undefined ||
      out.right !== undefined ||
      out.left !== undefined
    ) {
      return out;
    }
    // Empty object — same fallthrough as no position at all.
  }
  return side === 'left'
    ? { bottom: DEFAULT_INSET, left: DEFAULT_INSET }
    : { bottom: DEFAULT_INSET, right: DEFAULT_INSET };
}

/**
 * Pin style for the edge tab: flush against the resolved side, vertically
 * centered via `top: '50%'` + `translateY: '-50%'` (percentage translate
 * is relative to the FAB's own height, mirroring the CSS
 * `transform: translateY(-50%)` the web adapter uses), then nudged by the
 * caller's `offset`. The second `translateY` composes with the first —
 * RN applies transform entries in order — and is emitted only when it has
 * an effect, matching the web adapter's conditional
 * `--brw-fab-tab-offset` inline variable.
 */
function tabPlacementStyle(side: 'right' | 'left', offset: number): ViewStyle {
  const transform: ViewStyle['transform'] =
    offset !== 0
      ? [{ translateY: '-50%' }, { translateY: offset }]
      : [{ translateY: '-50%' }];
  return side === 'left'
    ? { top: '50%', left: 0, transform }
    : { top: '50%', right: 0, transform };
}

/**
 * Rotated label for the tab variant. RN has no `writing-mode`, so the
 * vertical text is a plain `<Text>` rotated ±90° — `'90deg'` on the right
 * edge (reads top→bottom) and `'-90deg'` on the left (reads bottom→top),
 * matching the web adapter's `vertical-rl` + `rotate: 180deg` pair.
 *
 * RN transforms are paint-only (layout still uses the unrotated box) and
 * rotate around the center, so the wrapper `View` is sized to the rotated
 * extents — width/height swapped from the `onLayout`-measured text box —
 * and the absolutely-positioned text is centered inside it. Until the
 * first layout callback lands the wrapper is unsized for one frame;
 * re-measures (e.g. when the phase label advances `Send feedback` →
 * `Capturing…`) resize the wrapper automatically because the absolute
 * text is never width-constrained by its parent.
 */
function VerticalTabLabel({
  text,
  side,
  textStyle,
}: {
  text: string;
  side: 'right' | 'left';
  textStyle: StyleProp<TextStyle>;
}): ReactElement {
  const [box, setBox] = useState<{ width: number; height: number } | null>(
    null,
  );
  const handleLayout = useCallback((event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setBox((prev) =>
      prev && prev.width === width && prev.height === height
        ? prev
        : { width, height },
    );
  }, []);
  return (
    <View
      style={[
        { alignItems: 'center', justifyContent: 'center' },
        box ? { width: box.height, height: box.width } : null,
      ]}
    >
      <Text
        numberOfLines={1}
        onLayout={handleLayout}
        style={[
          textStyle,
          {
            position: 'absolute',
            transform: [{ rotate: side === 'right' ? '90deg' : '-90deg' }],
          },
        ]}
      >
        {text}
      </Text>
    </View>
  );
}

/**
 * Drop-in feedback launcher + modal feedback form for React Native.
 *
 * Renders an absolute-positioned launcher — by default (vNEXT) a vertical
 * tab flush against the right edge of the host view; legacy corner
 * `position` call sites keep the floating corner pill (see
 * {@link FeedbackButtonProps.position}). The label tracks the SDK's
 * submit lifecycle so users see real progress
 * (`Capturing…` → `Sending…` → `Sent ✓` / `Try again`) when the modal is
 * open or minimized. Tapping the FAB opens {@link FeedbackModal}; the
 * modal owns the form draft and survives a Cancel + reopen cycle.
 *
 * The FAB owns a single `useFeedback()` instance and forwards it to the
 * modal so both render against the same `status` / `phase` / `error`
 * tuple. This is the deliberate fix for the "FAB stuck on Sending… after
 * an ingest rejection" gap: the SDK's phase bus does not emit an error
 * event, so two independent `useFeedback()` instances would diverge on
 * the failure path — sharing one keeps them in lockstep.
 *
 * The component is a no-op without a surrounding `<BrevwickProvider>` —
 * `useFeedback()` throws synchronously in that case to fail loudly during
 * development.
 */
export function FeedbackButton({
  variant,
  position,
  compact = false,
  offset = 0,
  theme = 'system',
  style,
  label,
  hidden = false,
  disabled = false,
}: FeedbackButtonProps): ReactElement | null {
  const [modalOpen, setModalOpen] = useState(false);
  // Single hook instance shared with the modal. The modal accepts the
  // tuple via the `feedback` prop and skips its own `useFeedback()` call
  // when it is provided, so `status`/`phase`/`error` updates triggered by
  // the modal's `submit` flow are observed here in the same render.
  const feedback = useFeedback();
  const { status, phase, reset } = feedback;
  const colorScheme = useColorScheme();
  const palette = useMemo(
    () => resolvePalette(theme, colorScheme),
    [theme, colorScheme],
  );
  const styles = useMemo(() => createWidgetStyles(palette), [palette]);

  // Resolution happens here — never default `variant` at the prop layer,
  // or the corner-implies-bubble compat rule could no longer see "unset".
  const { variant: resolvedVariant, side } = useMemo(
    () => resolveLauncherPlacement(variant, position),
    [variant, position],
  );

  const placementStyle = useMemo(
    () =>
      resolvedVariant === 'tab'
        ? tabPlacementStyle(side, offset)
        : resolveBubblePositionStyle(position, side),
    [resolvedVariant, side, offset, position],
  );

  const handleOpen = useCallback(() => {
    // Defence in depth: `Pressable`'s `disabled` prop already gates the
    // native `onPress` invocation, but a future analytics shim wrapping
    // the FAB could still call `onPress` directly. Guarding here ensures
    // the modal cannot open behind a visually-disabled FAB regardless of
    // how the press arrives.
    if (disabled) return;
    setModalOpen(true);
  }, [disabled]);

  const handleClose = useCallback(() => {
    setModalOpen(false);
    // Roll the shared hook's phase back to idle once the modal is gone so
    // the FAB label returns to its default copy on the next render.
    // Without this, a `status === 'success'` (or `'error'`) lingers after
    // the modal's auto-dismiss and the FAB would still read "Sent ✓"
    // (or "Try again") until the next submit.
    reset();
  }, [reset]);

  if (hidden) return null;

  const resolvedLabel =
    label ?? fabLabelForState(status, phase, 'Send feedback');
  // Compact removes the visible text, so the explicit `label` (or the
  // 'Feedback' fallback — same rule in every adapter) becomes the
  // accessible name. Non-compact keeps the established behavior: track
  // the visible label so VoiceOver/TalkBack announce the post-submit
  // terminal copy (`Sent ✓` / `Try again`) instead of a stale static
  // "Send feedback". `accessibilityLabel` overrides the child Text for
  // screen readers in RN, so a static value here would silently disagree
  // with what the user sees on screen.
  const accessibilityLabel = compact ? (label ?? 'Feedback') : resolvedLabel;

  return (
    <>
      <Pressable
        onPress={handleOpen}
        disabled={disabled}
        accessibilityLabel={accessibilityLabel}
        accessibilityRole="button"
        accessibilityState={{ disabled }}
        style={({ pressed }) =>
          StyleSheet.flatten([
            resolvedVariant === 'tab' ? styles.fabTab : styles.fab,
            resolvedVariant === 'tab' &&
              (side === 'left' ? styles.fabTabLeft : styles.fabTabRight),
            resolvedVariant === 'tab' && compact && styles.fabTabCompact,
            resolvedVariant === 'bubble' && compact && styles.fabCompact,
            placementStyle,
            pressed && styles.fabPressed,
            disabled && styles.fabDisabled,
            style,
          ]) as ViewStyle
        }
      >
        {compact ? (
          // Icon-only chip — no phase feedback on the FAB surface (the
          // modal still shows submit progress).
          <ChatIcon color={palette.accentFg} size={18} />
        ) : resolvedVariant === 'tab' ? (
          // Column order mirrors the web tab: icon above the label on the
          // right edge (label reads top→bottom), below it on the left
          // (label reads bottom→top, Userback-style).
          <>
            {side === 'right' ? (
              <ChatIcon color={palette.accentFg} size={18} />
            ) : null}
            <VerticalTabLabel
              text={resolvedLabel}
              side={side}
              textStyle={styles.fabLabel}
            />
            {side === 'left' ? (
              <ChatIcon color={palette.accentFg} size={18} />
            ) : null}
          </>
        ) : (
          <Text style={styles.fabLabel}>{resolvedLabel}</Text>
        )}
      </Pressable>
      <FeedbackModal
        visible={modalOpen}
        onClose={handleClose}
        theme={theme}
        feedback={feedback}
      />
    </>
  );
}
