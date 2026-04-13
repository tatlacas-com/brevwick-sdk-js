/**
 * Internal surface shared between the factory and ring modules. Imported via
 * relative paths inside this package only — not re-exported from the package
 * root and intentionally not listed in `package.json` `exports`, so consumer
 * code can never reach the uninstall-unsafe primitives that live here.
 */
import type {
  ConsoleEntry,
  NetworkEntry,
  RingEntry,
  RouteEntry,
} from '../types';
import type { Bus } from './bus';
import type { RingBuffer } from './buffer';
import type { ValidatedConfig } from './validate';

export type LifecycleState = 'idle' | 'installed' | 'uninstalled';

export type RingName = 'console' | 'network' | 'route';

export type BusEventMap = {
  entry: RingEntry;
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
}

/** Key used by rings + tests to reach the internal API without polluting the public surface. */
export const INTERNAL_KEY = '_internal' as const;
