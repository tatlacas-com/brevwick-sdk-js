/**
 * Brevwick — AI-first QA feedback SDK for browser apps.
 *
 * Public surface is frozen to exactly the symbols re-exported here. See
 * brevwick-ops/docs/brevwick-sdd.md § 12 for the contract.
 */

export { createBrevwick } from './core/client';

export type {
  Brevwick,
  BrevwickConfig,
  Environment,
  FeedbackAttachment,
  FeedbackInput,
  SubmitResult,
} from './types';
