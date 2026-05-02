// Brevwick React Native adapter — public exports added by feature worktrees (#83 onwards).

// `BREVWICK_REACT_NATIVE_VERSION` lives in a generated `./version.ts` (written
// by `scripts/generate-version.mjs` from `package.json#version`) rather than
// being inlined via a tsup/vitest `define`. Metro resolves this package via
// the top-level `react-native` field (`./src/index.ts`) and does not run
// define-style substitution, so an ambient token would crash consumers with
// `ReferenceError` at runtime.
export { BREVWICK_REACT_NATIVE_VERSION } from './version';

// Public route-ring surface. `redactPathParams` is intentionally NOT
// exported — it is an internal helper of `attachRouteRing` and surfacing
// it would freeze a "redact this string for me" capability nothing in the
// public contract requires. `RouteEntry` (the entry shape pushed into the
// ring) lives in `@tatlacas/brevwick-sdk` and is re-exported from there;
// consumers compose against the core type so adapter + core types unify.
export { attachRouteRing } from './rings/route';
export type {
  NavigationContainerRefLike,
  NavigationRefLike,
} from './rings/route';

export { collectDeviceContext, type DeviceContext } from './device';

export { captureScreenshot } from './screenshot';
export type { CaptureScreenshotOpts } from './screenshot';
export { BrevwickSkip } from './skip';
export type { BrevwickSkipProps } from './skip';

export { BrevwickProvider } from './provider';
export type { BrevwickProviderProps } from './provider';
export { useBrevwick } from './context';
export {
  useBrevwickNavigationRef,
  BrevwickNavigationRefContext,
} from './navigation-ref-context';
export type { BrevwickNavigationRef } from './navigation-ref-context';

export { useFeedback } from './use-feedback';
export type {
  FeedbackPhase,
  FeedbackStatus,
  UseFeedbackResult,
} from './use-feedback';

export { FeedbackButton } from './feedback-button';
export type {
  FeedbackButtonProps,
  FeedbackButtonPosition,
} from './feedback-button';
export { FeedbackModal } from './feedback-modal';
export type { FeedbackModalProps } from './feedback-modal';
export type { BrevwickTheme } from './styles';

// Re-export the SDK types RN consumers most often touch so they don't need a
// second `@tatlacas/brevwick-sdk` import in app code. The full SDK surface is
// still available via the underlying package. `ProjectConfig` is included
// because the FeedbackModal's "Format with AI" toggle gate keys off it; any
// consumer composing their own modal alongside `useFeedback()` needs the
// type to discriminate `ai_enabled` / `ai_submitter_choice_allowed`.
export type {
  Brevwick,
  BrevwickConfig,
  FeedbackAttachment,
  FeedbackInput,
  ProjectConfig,
  SubmitError,
  SubmitErrorCode,
  SubmitResult,
} from '@tatlacas/brevwick-sdk';
