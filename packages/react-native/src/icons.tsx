/**
 * SVG icons used by the feedback widget. Renders via `react-native-svg` so
 * the visual is identical across iOS / Android / web — same paths the web
 * React adapter (`packages/react/src/feedback-button.tsx`) uses, just
 * translated to the RN component primitives. We intentionally avoid Unicode
 * glyph fallbacks here because their rendering varies per font and they
 * looked off-brand in beta testing (issue #127 follow-up).
 *
 * `react-native-svg` is a peer dep of the package — required, not optional,
 * because the icons are core widget UI rather than a feature gate. Expo
 * ships it out of the box and most bare-RN apps already depend on it
 * transitively.
 */
import type { ReactElement } from 'react';
import Svg, { Path } from 'react-native-svg';

interface IconProps {
  /** Stroke colour. Maps to the web adapter's `currentColor`. */
  color: string;
  /** Square box size in px. Defaults to 16 — matches `.brw-icon-btn svg`. */
  size?: number;
}

const STROKE_WIDTH = 2;

/**
 * Paperclip icon used by the file-attach button in the composer. Path from
 * the React adapter's `PaperclipIcon`.
 */
export function PaperclipIcon({ color, size = 18 }: IconProps): ReactElement {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M21 10.5l-8.5 8.5a5 5 0 0 1-7-7l9-9a3.5 3.5 0 0 1 5 5l-9 9a2 2 0 0 1-3-3l7.5-7.5"
        stroke={color}
        strokeWidth={STROKE_WIDTH}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

/**
 * Paper-plane send icon. Two-path glyph identical to the web adapter's
 * `SendIcon` — outer body + interior fold line.
 */
export function SendIcon({ color, size = 18 }: IconProps): ReactElement {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M4 20l16-8L4 4l2 8-2 8z"
        stroke={color}
        strokeWidth={STROKE_WIDTH}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M6 12h14"
        stroke={color}
        strokeWidth={STROKE_WIDTH}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

/**
 * Single-stroke minus glyph for the minimize button in the panel header.
 */
export function MinimizeIcon({ color, size = 18 }: IconProps): ReactElement {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M5 14h14"
        stroke={color}
        strokeWidth={STROKE_WIDTH}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

/**
 * Two-stroke "×" glyph for the close / dismiss button in the panel header
 * and the attachment chip remove control.
 */
export function CloseIcon({ color, size = 18 }: IconProps): ReactElement {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M6 6l12 12M18 6L6 18"
        stroke={color}
        strokeWidth={STROKE_WIDTH}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

/**
 * Tick mark for the staged-status rows ("Captured route…", "PII-sanitised…")
 * and the issue-sent receipt. Slightly heavier stroke than the other icons
 * so it reads at small sizes inside the 16px confirmation chip.
 */
export function CheckIcon({ color, size = 12 }: IconProps): ReactElement {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M5 12l5 5L20 7"
        stroke={color}
        strokeWidth={2.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}
