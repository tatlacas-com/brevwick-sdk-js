import type { BrevwickConfig } from '@tatlacas/brevwick-sdk';

/**
 * Options for {@link BrevwickPlugin}. Identical shape to `BrevwickConfig`
 * from the core SDK — kept as its own type alias so consumers can import a
 * Vue-flavoured name and so we have a stable place to extend with Vue-only
 * options later without bumping the SDK's public surface.
 */
export type BrevwickPluginOptions = BrevwickConfig;

export type {
  BrevwickConfig,
  FeedbackAttachment,
  FeedbackInput,
  ProjectConfig,
  SubmitError,
  SubmitErrorCode,
  SubmitResult,
} from '@tatlacas/brevwick-sdk';
