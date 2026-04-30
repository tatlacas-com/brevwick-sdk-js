/**
 * Brevwick Angular bindings — public surface frozen to the symbols below.
 * Aligned with [SDD § 12 SDK contracts].
 */

export { provideBrevwick } from './lib/provide-brevwick';
export { BREVWICK_CONFIG } from './lib/brevwick.tokens';
export { BrevwickService, type FeedbackStatus } from './lib/brevwick.service';
export {
  BwFeedbackButtonComponent,
  type BwFeedbackButtonPosition,
} from './lib/components/feedback-button.component';
export { BREVWICK_ANGULAR_VERSION } from './lib/internal/version';

export type {
  Brevwick,
  BrevwickConfig,
  Environment,
  FeedbackAttachment,
  FeedbackInput,
  ProjectConfig,
  SubmitError,
  SubmitErrorCode,
  SubmitResult,
} from '@tatlacas/brevwick-sdk';
