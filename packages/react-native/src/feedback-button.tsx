import { useCallback, useMemo, useState, type ReactElement } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  useColorScheme,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useFeedback, type FeedbackPhase } from './use-feedback';
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
   * Style overrides applied to the FAB Pressable. Composed *after* the
   * built-in styles so a consumer can rewrite anything (background, size,
   * shadow) without forking the component.
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
}

const DEFAULT_INSET = 24;

/**
 * Map the SDK's submit-pipeline phase to the FAB label. The SDK fires
 * phase events via the bus that `useFeedback()` subscribes to, so two
 * `useFeedback()` instances (FAB + Modal) advance together even though
 * only one of them owns the in-flight `submit()` call.
 */
function fabLabelForPhase(phase: FeedbackPhase, fallback: string): string {
  switch (phase) {
    case 'capturing':
    case 'sanitising':
      return 'Capturing…';
    case 'formatting':
      return 'Sending…';
    case 'sent':
      return 'Sent ✓';
    case 'error':
      return 'Try again';
    case 'idle':
    default:
      return fallback;
  }
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
 * label tracks the SDK's submit phase so users see real progress
 * (`Capturing…` → `Sending…` → `Sent ✓`) when the modal is open or
 * minimized. Tapping the FAB opens {@link FeedbackModal}; the modal owns
 * the form draft and survives a Cancel + reopen cycle.
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
}: FeedbackButtonProps): ReactElement | null {
  const [modalOpen, setModalOpen] = useState(false);
  const { phase, reset } = useFeedback();
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
    setModalOpen(true);
  }, []);

  const handleClose = useCallback(() => {
    setModalOpen(false);
    // Roll the FAB hook's phase back to idle once the modal is gone so the
    // label returns to its default copy on the next render. Without this,
    // a `phase === 'sent'` lingers after the modal's auto-dismiss and the
    // FAB would still read "Sent ✓" until the next submit.
    reset();
  }, [reset]);

  if (hidden) return null;

  const resolvedLabel = label ?? fabLabelForPhase(phase, 'Send feedback');

  return (
    <>
      <Pressable
        onPress={handleOpen}
        disabled={disabled}
        accessibilityLabel="Send feedback"
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
      <FeedbackModal visible={modalOpen} onClose={handleClose} theme={theme} />
    </>
  );
}
