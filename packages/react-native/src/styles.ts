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
      padding: 20,
      maxHeight: '90%',
    },
    headerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 12,
    },
    title: {
      color: palette.fg,
      fontSize: 18,
      fontWeight: '600',
    },
    closeButton: {
      paddingHorizontal: 8,
      paddingVertical: 4,
    },
    closeLabel: {
      color: palette.fgMuted,
      fontSize: 16,
    },
    fieldLabel: {
      color: palette.fgMuted,
      fontSize: 12,
      marginBottom: 4,
      marginTop: 12,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    input: {
      backgroundColor: palette.inputBg,
      color: palette.fg,
      borderColor: palette.border,
      borderWidth: 1,
      borderRadius: 8,
      paddingHorizontal: 12,
      paddingVertical: 10,
      fontSize: 14,
    },
    descriptionInput: {
      minHeight: 88,
      textAlignVertical: 'top',
    },
    toggleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginTop: 16,
    },
    toggleLabel: {
      color: palette.fg,
      fontSize: 14,
    },
    screenshotPreview: {
      marginTop: 12,
      borderColor: palette.border,
      borderWidth: 1,
      borderRadius: 8,
      overflow: 'hidden',
      backgroundColor: palette.inputBg,
      alignItems: 'center',
      justifyContent: 'center',
      height: 140,
    },
    screenshotImage: {
      width: '100%',
      height: '100%',
    },
    screenshotPlaceholder: {
      color: palette.fgMuted,
      fontSize: 12,
    },
    actionsRow: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
      gap: 12,
      marginTop: 20,
    },
    secondaryButton: {
      paddingHorizontal: 16,
      paddingVertical: 10,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: palette.border,
      backgroundColor: 'transparent',
    },
    secondaryLabel: {
      color: palette.fg,
      fontSize: 14,
      fontWeight: '500',
    },
    primaryButton: {
      paddingHorizontal: 16,
      paddingVertical: 10,
      borderRadius: 8,
      backgroundColor: palette.accent,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    primaryButtonDisabled: {
      opacity: 0.5,
    },
    primaryLabel: {
      color: palette.accentFg,
      fontSize: 14,
      fontWeight: '600',
    },
    errorText: {
      color: palette.error,
      fontSize: 13,
      marginTop: 12,
    },
  });
}

export type BrevwickWidgetStyles = ReturnType<typeof createWidgetStyles>;
