/**
 * Brevwick React bindings.
 *
 * See brevwick-ops/docs/brevwick-sdd.md § 12 for the React contract.
 */

declare const __BREVWICK_REACT_VERSION__: string;

/**
 * Semantic version of the installed `brevwick-react` package. Surfaced at
 * runtime so consumers can include it in bug issues or diagnostics.
 */
export const BREVWICK_REACT_VERSION: string = __BREVWICK_REACT_VERSION__;

export { BrevwickProvider } from './provider';
export type { BrevwickProviderProps } from './provider';

export { useFeedback } from './use-feedback';
export type { FeedbackStatus, UseFeedbackResult } from './use-feedback';

export { FeedbackButton } from './feedback-button';
export type { BrevwickTheme, FeedbackButtonProps } from './feedback-button';

export type {
  BrevwickConfig,
  FeedbackAttachment,
  FeedbackInput,
  SubmitResult,
} from 'brevwick-sdk';
