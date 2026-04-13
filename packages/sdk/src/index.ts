/**
 * Brevwick — AI-first QA feedback SDK for browser apps.
 *
 * Phase 0: types and redaction primitives only. The full client (rings,
 * screenshot, submit) lands in Phase 4 — see brevwick-ops/docs/brevwick-sdd.md
 * § 12 for the contract.
 */

export type {
  Brevwick,
  BrevwickConfig,
  Environment,
  FeedbackInput,
  SubmitResult,
} from './types';

export { redact, redactValue } from './rings/redact';
