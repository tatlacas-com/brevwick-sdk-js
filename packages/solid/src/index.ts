/**
 * Brevwick Solid bindings.
 */

export { BREVWICK_SOLID_VERSION } from './internal/version';

export { BrevwickProvider } from './provider';
export type { BrevwickProviderProps } from './provider';

export { useFeedback } from './use-feedback';
export type { FeedbackStatus, UseFeedbackResult } from './use-feedback';

export { FeedbackButton } from './components/feedback-button';
export type {
  BrevwickTheme,
  FeedbackButtonProps,
} from './components/feedback-button';

export type {
  BrevwickConfig,
  FeedbackAttachment,
  FeedbackInput,
  SubmitResult,
} from '@tatlacas/brevwick-sdk';
