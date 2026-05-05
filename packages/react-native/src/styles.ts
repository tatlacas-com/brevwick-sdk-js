import { StyleSheet } from 'react-native';

/**
 * Forced-palette choice for the React Native widget. Mirrors the
 * `BrevwickTheme` type exported by `@tatlacas/brevwick-react` so consumers
 * can switch adapters without changing the prop's value space. `'system'`
 * defers to the host's color-scheme via `useColorScheme()`.
 */
export type BrevwickTheme = 'light' | 'dark' | 'system';

/**
 * Set of colour tokens the widget consumes. Kept structurally minimal —
 * the widget doesn't expose CSS-variable-style overrides on RN; consumers
 * hand-in `theme="light|dark|system"` and we resolve to one of the two
 * shipped palettes. Re-themed UIs that need to deviate further render
 * their own FAB and call `useFeedback()` directly.
 */
export interface BrevwickPalette {
  panelBg: string;
  fg: string;
  fgMuted: string;
  border: string;
  inputBg: string;
  accent: string;
  accentFg: string;
  bubbleAssistantBg: string;
  bubbleUserBg: string;
  bubbleUserFg: string;
  success: string;
  error: string;
  scrim: string;
  shadow: string;
}

export const LIGHT_PALETTE: BrevwickPalette = {
  panelBg: '#ffffff',
  fg: '#0f172a',
  fgMuted: '#64748b',
  border: '#e2e8f0',
  inputBg: '#f8fafc',
  accent: '#0f172a',
  accentFg: '#ffffff',
  bubbleAssistantBg: '#f1f5f9',
  bubbleUserBg: '#0f172a',
  bubbleUserFg: '#ffffff',
  success: '#15803d',
  error: '#b91c1c',
  scrim: 'rgba(15, 23, 42, 0.45)',
  shadow: 'rgba(15, 23, 42, 0.18)',
};

export const DARK_PALETTE: BrevwickPalette = {
  panelBg: '#0b1220',
  fg: '#f8fafc',
  fgMuted: '#94a3b8',
  border: '#1e293b',
  inputBg: '#0f172a',
  accent: '#f8fafc',
  accentFg: '#0f172a',
  bubbleAssistantBg: '#1e293b',
  bubbleUserBg: '#f8fafc',
  bubbleUserFg: '#0b1220',
  success: '#4ade80',
  error: '#f87171',
  scrim: 'rgba(0, 0, 0, 0.6)',
  shadow: 'rgba(0, 0, 0, 0.55)',
};

/**
 * Resolve a `BrevwickTheme` against the host's current color scheme to a
 * concrete palette. `theme="system"` falls back to light when the host hasn't
 * reported a scheme yet (e.g. early in app startup) — matches the web
 * adapter's `prefers-color-scheme` default.
 */
export function resolvePalette(
  theme: BrevwickTheme,
  systemScheme: 'light' | 'dark' | null | undefined,
): BrevwickPalette {
  const effective =
    theme === 'system' ? (systemScheme === 'dark' ? 'dark' : 'light') : theme;
  return effective === 'dark' ? DARK_PALETTE : LIGHT_PALETTE;
}

/**
 * Build the StyleSheet for one resolved palette. Returned object is
 * memoised by callers (`useMemo` keyed on the palette identity) so a
 * stable theme avoids re-running `StyleSheet.create` between renders.
 */
export function createWidgetStyles(palette: BrevwickPalette) {
  return StyleSheet.create({
    fab: {
      position: 'absolute',
      minWidth: 48,
      height: 48,
      paddingHorizontal: 18,
      borderRadius: 24,
      backgroundColor: palette.accent,
      alignItems: 'center',
      justifyContent: 'center',
      flexDirection: 'row',
      shadowColor: palette.shadow,
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 1,
      shadowRadius: 12,
      elevation: 6,
    },
    fabPressed: {
      opacity: 0.85,
    },
    fabDisabled: {
      opacity: 0.5,
    },
    fabLabel: {
      color: palette.accentFg,
      fontSize: 14,
      fontWeight: '600',
    },
    scrim: {
      flex: 1,
      backgroundColor: palette.scrim,
      justifyContent: 'flex-end',
    },
    card: {
      backgroundColor: palette.panelBg,
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      paddingHorizontal: 16,
      paddingTop: 12,
      paddingBottom: 12,
      maxHeight: '92%',
    },
    headerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingBottom: 10,
      borderBottomColor: palette.border,
      borderBottomWidth: 1,
    },
    headerAvatar: {
      width: 28,
      height: 28,
      borderRadius: 14,
      backgroundColor: palette.accent,
      color: palette.accentFg,
      textAlign: 'center',
      lineHeight: 28,
      fontSize: 14,
      fontWeight: '700',
      overflow: 'hidden',
    },
    headerTitle: {
      flex: 1,
      color: palette.fg,
      fontSize: 16,
      fontWeight: '600',
    },
    iconButton: {
      paddingHorizontal: 8,
      paddingVertical: 6,
      borderRadius: 8,
    },
    iconButtonLabel: {
      color: palette.fgMuted,
      fontSize: 18,
      lineHeight: 18,
      fontWeight: '600',
    },
    thread: {
      paddingVertical: 8,
    },
    threadContent: {
      paddingBottom: 4,
      gap: 8,
    },
    bubbleAssistant: {
      alignSelf: 'flex-start',
      maxWidth: '85%',
      backgroundColor: palette.bubbleAssistantBg,
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 14,
      borderBottomLeftRadius: 4,
    },
    bubbleAssistantText: {
      color: palette.fg,
      fontSize: 14,
      lineHeight: 20,
    },
    bubbleUser: {
      alignSelf: 'flex-end',
      maxWidth: '85%',
      backgroundColor: palette.bubbleUserBg,
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 14,
      borderBottomRightRadius: 4,
    },
    bubbleUserText: {
      color: palette.bubbleUserFg,
      fontSize: 14,
      lineHeight: 20,
    },
    receipt: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      marginTop: 4,
    },
    receiptText: {
      color: palette.fgMuted,
      fontSize: 11,
    },
    statusRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingVertical: 6,
      paddingHorizontal: 4,
    },
    statusRowLabel: {
      color: palette.fgMuted,
      fontSize: 12,
      flex: 1,
    },
    statusCheck: {
      width: 16,
      height: 16,
      borderRadius: 8,
      backgroundColor: palette.success,
      alignItems: 'center',
      justifyContent: 'center',
    },
    statusCheckLabel: {
      color: '#ffffff',
      fontSize: 11,
      fontWeight: '700',
      lineHeight: 12,
    },
    retryRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingVertical: 8,
      paddingHorizontal: 10,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: palette.error,
      backgroundColor: 'transparent',
    },
    retryText: {
      flex: 1,
      color: palette.error,
      fontSize: 13,
    },
    retryButton: {
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 6,
      borderWidth: 1,
      borderColor: palette.error,
    },
    retryButtonLabel: {
      color: palette.error,
      fontSize: 13,
      fontWeight: '600',
    },
    confirmRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingVertical: 10,
      paddingHorizontal: 10,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: palette.border,
      backgroundColor: palette.inputBg,
    },
    confirmText: {
      flex: 1,
      color: palette.fg,
      fontSize: 13,
    },
    confirmKeepBtn: {
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 6,
      borderWidth: 1,
      borderColor: palette.border,
    },
    confirmKeepLabel: {
      color: palette.fg,
      fontSize: 13,
      fontWeight: '500',
    },
    confirmDiscardBtn: {
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 6,
      backgroundColor: palette.accent,
    },
    confirmDiscardLabel: {
      color: palette.accentFg,
      fontSize: 13,
      fontWeight: '600',
    },
    disclosureToggle: {
      paddingVertical: 8,
      paddingHorizontal: 4,
    },
    disclosureToggleLabel: {
      color: palette.fgMuted,
      fontSize: 13,
      fontWeight: '500',
    },
    disclosurePanel: {
      gap: 8,
      paddingHorizontal: 4,
      paddingBottom: 4,
    },
    disclosureField: {
      gap: 4,
    },
    fieldLabel: {
      color: palette.fgMuted,
      fontSize: 11,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    input: {
      backgroundColor: palette.inputBg,
      color: palette.fg,
      borderColor: palette.border,
      borderWidth: 1,
      borderRadius: 8,
      paddingHorizontal: 10,
      paddingVertical: 8,
      fontSize: 14,
      minHeight: 40,
    },
    composer: {
      borderTopColor: palette.border,
      borderTopWidth: 1,
      paddingTop: 10,
      paddingBottom: 6,
      gap: 8,
    },
    composerShell: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      gap: 8,
    },
    composerInput: {
      flex: 1,
      backgroundColor: palette.inputBg,
      color: palette.fg,
      borderColor: palette.border,
      borderWidth: 1,
      borderRadius: 12,
      paddingHorizontal: 12,
      paddingVertical: 10,
      fontSize: 14,
      minHeight: 40,
      maxHeight: 140,
    },
    composerExtras: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    sendButton: {
      paddingHorizontal: 16,
      paddingVertical: 10,
      borderRadius: 10,
      backgroundColor: palette.accent,
      alignItems: 'center',
      justifyContent: 'center',
      minWidth: 64,
    },
    sendButtonDisabled: {
      opacity: 0.5,
    },
    sendButtonLabel: {
      color: palette.accentFg,
      fontSize: 14,
      fontWeight: '600',
    },
    aiToggleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingHorizontal: 4,
    },
    aiToggleLabel: {
      color: palette.fgMuted,
      fontSize: 12,
    },
    errorText: {
      color: palette.error,
      fontSize: 12,
      paddingHorizontal: 4,
      paddingVertical: 4,
    },
    spinnerInline: {
      width: 16,
      height: 16,
    },
    footer: {
      alignItems: 'center',
      paddingTop: 6,
      paddingBottom: 4,
    },
    footerLink: {
      color: palette.fgMuted,
      fontSize: 11,
    },
  });
}

export type BrevwickWidgetStyles = ReturnType<typeof createWidgetStyles>;
