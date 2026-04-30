/**
 * Brevwick Svelte bindings — context setter, FAB component, getFeedback().
 *
 * @see https://github.com/tatlacas-com/brevwick-sdk-js
 */

export { setBrevwickContext, getFeedback } from './context';
export type { FeedbackHandle, FeedbackStatus } from './context';

export { default as FeedbackButton } from './components/FeedbackButton.svelte';

export { BREVWICK_SVELTE_VERSION } from './internal/version';

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
