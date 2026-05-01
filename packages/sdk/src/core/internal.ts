/**
 * Internal surface shared between the factory and ring modules. Imported via
 * relative paths inside this package only — not re-exported from the package
 * root and intentionally not listed in `package.json` `exports`, so consumer
 * code can never reach the uninstall-unsafe primitives that live here.
 */
import type {
  ConsoleEntry,
  NetworkEntry,
  ProjectConfig,
  RingEntry,
  RouteEntry,
} from '../types';
import type { Bus } from './bus';
import type { RingBuffer } from './buffer';
import type { ValidatedConfig } from './validate';

export type LifecycleState = 'idle' | 'installed' | 'uninstalled';

export type RingName = 'console' | 'network' | 'route';

/**
 * Submit-pipeline progress signal. Fired by the submit chunk at three
 * boundaries the React adapter (and any other binding) animates against.
 *
 * - `'capturing-done'` — the buffers snapshot has landed in the in-memory
 *   payload (`composePayload` complete).
 * - `'sanitising-done'` — `redact()` has run over the payload; the next
 *   action is the ingest POST.
 * - `'sent'` — ingest returned 2xx. `aiEnabled` is the resolved
 *   `ProjectConfig.ai_enabled` so the adapter can decide whether to render
 *   a "Formatting with AI" affordance after the issue lands.
 *
 * **Internal surface** — emitted on the same `internal.bus` the rings use
 * (event key `'phase'`) and intentionally **not** re-exported from the
 * package root. Adapters in this monorepo reach the bus via the
 * `INTERNAL_KEY` backdoor; external consumers should not depend on this
 * channel — it is not part of the public SDK contract.
 */
export type PhaseEvent =
  | { phase: 'capturing-done' }
  | { phase: 'sanitising-done' }
  | { phase: 'sent'; aiEnabled: boolean };

export type BusEventMap = {
  entry: RingEntry;
  phase: PhaseEvent;
};

export interface RingContext {
  readonly config: ValidatedConfig;
  readonly bus: Bus<BusEventMap>;
  push(entry: RingEntry): void;
}

export interface RingDefinition {
  readonly name: RingName;
  install(ctx: RingContext): () => void;
}

export interface BrevwickInternal {
  readonly buffers: {
    readonly console: RingBuffer<ConsoleEntry>;
    readonly network: RingBuffer<NetworkEntry>;
    readonly route: RingBuffer<RouteEntry>;
  };
  readonly bus: Bus<BusEventMap>;
  readonly config: ValidatedConfig;
  push(entry: RingEntry): void;
  state(): LifecycleState;
  /**
   * Promise that resolves once every async ring loader from the most recent
   * `install()` call has either mounted its ring or been skipped because
   * the instance was uninstalled before the loader landed. Exposed for
   * tests that need to deterministically await patched globals; production
   * consumers should not depend on this handle.
   */
  ready(): Promise<void>;
  /**
   * Cached `ProjectConfig` lookup mirroring `Brevwick.getConfig()`. Exposed
   * on the internal surface so the submit pipeline can derive the
   * `phase: 'sent'` event's `aiEnabled` flag without spinning up a parallel
   * cache. Resolves to `null` on any failure (offline, malformed JSON, 4xx
   * / 5xx) — never throws.
   */
  getConfig(): Promise<ProjectConfig | null>;
}

/** Key used by rings + tests to reach the internal API without polluting the public surface. */
export const INTERNAL_KEY = '_internal' as const;
