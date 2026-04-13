/**
 * Internal surface shared between the factory and ring modules. Not exported
 * from the package root — only downstream ring code (landing in #2 / #3) and
 * tests import from `brevwick-sdk/core/internal`.
 */
import type { RingEntry } from '../types';
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
    readonly console: RingBuffer<RingEntry>;
    readonly network: RingBuffer<RingEntry>;
    readonly route: RingBuffer<RingEntry>;
  };
  readonly bus: Bus<BusEventMap>;
  readonly config: ValidatedConfig;
  push(entry: RingEntry): void;
  state(): LifecycleState;
}

/** Key used by rings + tests to reach the internal API without polluting the public surface. */
export const INTERNAL_KEY = '_internal' as const;
