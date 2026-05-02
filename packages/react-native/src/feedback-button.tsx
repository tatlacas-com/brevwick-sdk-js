import {
  useCallback,
  useMemo,
  useState,
  type ReactElement,
  type RefObject,
} from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  useColorScheme,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import {
  useFeedback,
  type FeedbackPhase,
  type FeedbackStatus,
} from './use-feedback';
import { FeedbackModal } from './feedback-modal';
import {
  createWidgetStyles,
  resolvePalette,
  type BrevwickTheme,
} from './styles';

/**
 * Where the FAB pins itself within its absolute-positioned parent. Either
 * one of the two named corners (default 24px inset, 24px from the bottom)
 * or an explicit `{ bottom?, right?, left? }` triplet for callers that
 * need to clear a custom safe-area / tab-bar.
 *
 * @remarks
 * **Web parity divergence.** The web React adapter restricts `position` to
 * the `'bottom-right' | 'bottom-left'` named corners. The RN adapter
 * widens the type with the `{ bottom?, right?, left? }` object form to
 * accommodate the platform-specific safe-area / tab-bar / notch insets
 * that have no analogue in the DOM. This widening is RN-only — consumers
 * porting code between adapters must use the named-corner form for
 * portable call sites.
 */
export type FeedbackButtonPosition =
  | 'bottom-right'
  | 'bottom-left'
  | { bottom?: number; right?: number; left?: number };

/**
 * Props for {@link FeedbackButton}. Mirrors the React adapter's prop shape
 * 1:1 except for `style` / `position` which adapt to RN primitives.
 */
export interface FeedbackButtonProps {
  /**
   * Corner the FAB pins to, or an explicit offset object. Default
   * `'bottom-right'`.
   */
  position?: FeedbackButtonPosition;
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
   * when the brand voice demands different copy.
   */
  label?: string;
  /** When true, the FAB renders nothing. Useful for feature-flagging. */
  hidden?: boolean;
  /** When true, the FAB renders disabled and cannot open the modal. */
  disabled?: boolean;
  /**
   * Optional ref to a host `<View>` whose subtree should be rasterised
   * for the "Include screenshot" attachment in the modal. Forwarded
   * verbatim to {@link FeedbackModal} — see its `viewRef` prop for the
   * native-vs-placeholder selection contract.
   */
  viewRef?: RefObject<View | null>;
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

function resolvePositionStyle(position: FeedbackButtonPosition): ViewStyle {
  if (position === 'bottom-right') {
    return { bottom: DEFAULT_INSET, right: DEFAULT_INSET };
  }
  if (position === 'bottom-left') {
    return { bottom: DEFAULT_INSET, left: DEFAULT_INSET };
  }
  // Explicit offsets — only spread the keys that were provided so we don't
  // overwrite a `right` that the caller intentionally omitted in favour of
  // `left`.
  const out: ViewStyle = {};
  if (typeof position.bottom === 'number') out.bottom = position.bottom;
  if (typeof position.right === 'number') out.right = position.right;
  if (typeof position.left === 'number') out.left = position.left;
  if (
    out.bottom === undefined &&
    out.right === undefined &&
    out.left === undefined
  ) {
    return { bottom: DEFAULT_INSET, right: DEFAULT_INSET };
  }
  return out;
}

/**
 * Drop-in floating-action button + modal feedback form for React Native.
 *
 * Renders an absolute-positioned FAB pinned to the configured corner. The
 * label tracks the SDK's submit lifecycle so users see real progress
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
  position = 'bottom-right',
  theme = 'system',
  style,
  label,
  hidden = false,
  disabled = false,
  viewRef,
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

  const positionStyle = useMemo(
    () => resolvePositionStyle(position),
    [position],
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

  return (
    <>
      <Pressable
        onPress={handleOpen}
        disabled={disabled}
        // Track the visible label so VoiceOver/TalkBack announce the
        // post-submit terminal copy (`Sent ✓` / `Try again`) instead of a
        // stale static "Send feedback". `accessibilityLabel` overrides the
        // child Text for screen readers in RN, so a static value here
        // would silently disagree with what the user sees on screen.
        accessibilityLabel={resolvedLabel}
        accessibilityRole="button"
        accessibilityState={{ disabled }}
        style={({ pressed }) =>
          StyleSheet.flatten([
            styles.fab,
            positionStyle,
            pressed && styles.fabPressed,
            disabled && styles.fabDisabled,
            style,
          ]) as ViewStyle
        }
      >
        <Text style={styles.fabLabel}>{resolvedLabel}</Text>
      </Pressable>
      <FeedbackModal
        visible={modalOpen}
        onClose={handleClose}
        theme={theme}
        feedback={feedback}
        viewRef={viewRef}
      />
    </>
  );
}
