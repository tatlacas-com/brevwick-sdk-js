/**
 * Brevwick Vue 3 bindings — plugin, FAB component, useFeedback composable.
 *
 * Public surface is frozen to exactly the symbols re-exported here. Internal
 * helpers (style injection, version constant) ship in the bundle but are not
 * documented entry points.
 */

export { BrevwickPlugin, BREVWICK_INJECTION_KEY } from './plugin';
export { useFeedback } from './composables/use-feedback';
export type {
  FeedbackStatus,
  UseFeedbackResult,
} from './composables/use-feedback';
export { FeedbackButton } from './components/feedback-button';
export type { BrevwickTheme } from './components/feedback-button';
export { BREVWICK_VUE_VERSION } from './internal/version';
export type {
  BrevwickPluginOptions,
  BrevwickConfig,
  FeedbackAttachment,
  FeedbackInput,
  ProjectConfig,
  SubmitError,
  SubmitErrorCode,
  SubmitResult,
} from './types';
