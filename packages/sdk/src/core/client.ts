import type {
  Brevwick,
  BrevwickConfig,
  FeedbackInput,
  RingEntry,
  SubmitResult,
} from '../types';
import { createBus, type Bus } from './bus';
import { createRingBuffer, type RingBuffer } from './buffer';
import { validateConfig, type ValidatedConfig } from './validate';

type LifecycleState = 'idle' | 'installed' | 'uninstalled';

type RingName = 'console' | 'network' | 'route';

type BusEventMap = {
  entry: RingEntry;
};

interface RingContext {
  readonly config: ValidatedConfig;
  readonly bus: Bus<BusEventMap>;
  push(entry: RingEntry): void;
}

interface RingDefinition {
  readonly name: RingName;
  install(ctx: RingContext): () => void;
}

/**
 * Rings are attached in this order when their config flag is true. Populated
 * by the individual ring modules (landing in #2 / #3); kept as an internal
 * hook so the factory stays ring-agnostic and stays under the 2 kB budget.
 */
const DEFAULT_RINGS: readonly RingDefinition[] = [];

interface InternalApi {
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

interface BrevwickInstance extends Brevwick {
  readonly _internal: InternalApi;
}

const instances = new Map<string, BrevwickInstance>();

function instanceKey(config: ValidatedConfig): string {
  return `${config.projectKey}|${config.endpoint}`;
}

function isBrowser(): boolean {
  return typeof window !== 'undefined' && typeof document !== 'undefined';
}

function bufferFor(
  entry: RingEntry,
  buffers: InternalApi['buffers'],
): RingBuffer<RingEntry> {
  switch (entry.kind) {
    case 'console':
      return buffers.console;
    case 'network':
      return buffers.network;
    case 'route':
      return buffers.route;
  }
}

function notImplemented(method: string): never {
  throw new Error(`Brevwick.${method} is not yet implemented`);
}

function build(config: ValidatedConfig): BrevwickInstance {
  const buffers = {
    console: createRingBuffer<RingEntry>(50),
    network: createRingBuffer<RingEntry>(50),
    route: createRingBuffer<RingEntry>(20),
  } as const;
  const bus = createBus<BusEventMap>();

  let state: LifecycleState = 'idle';
  let teardowns: Array<() => void> = [];

  const internal: InternalApi = {
    buffers,
    bus,
    config,
    push(entry) {
      bufferFor(entry, buffers).push(entry);
      bus.emit('entry', entry);
    },
    state: () => state,
  };

  function install(): void {
    if (state === 'installed') return;
    if (!isBrowser()) return;
    if (!config.enabled) return;

    const ctx: RingContext = {
      config,
      bus,
      push: internal.push,
    };
    for (const ring of DEFAULT_RINGS) {
      if (!config.rings[ring.name]) continue;
      teardowns.push(ring.install(ctx));
    }
    state = 'installed';
  }

  function uninstall(): void {
    if (state !== 'installed') {
      state = 'uninstalled';
      return;
    }
    for (let i = teardowns.length - 1; i >= 0; i--) {
      try {
        teardowns[i]?.();
      } catch {
        // Individual ring teardown failures must not block the others.
      }
    }
    teardowns = [];
    buffers.console.clear();
    buffers.network.clear();
    buffers.route.clear();
    bus.clear();
    state = 'uninstalled';
  }

  const instance: Brevwick = {
    install,
    uninstall,
    submit(_input: FeedbackInput): Promise<SubmitResult> {
      return notImplemented('submit');
    },
    captureScreenshot(): Promise<Blob> {
      return notImplemented('captureScreenshot');
    },
  };

  // _internal is reachable for downstream rings but intentionally hidden from
  // enumeration/iteration so it stays off the public surface.
  Object.defineProperty(instance, '_internal', {
    value: internal,
    enumerable: false,
    writable: false,
    configurable: false,
  });

  return instance as BrevwickInstance;
}

export function createBrevwick(config: BrevwickConfig): Brevwick {
  const validated = validateConfig(config);
  const key = instanceKey(validated);
  const existing = instances.get(key);
  if (existing) {
    const original = (globalThis as { console?: Console }).console;
    original?.warn?.(
      `[brevwick] createBrevwick called twice for projectKey=${validated.projectKey}; returning existing instance`,
    );
    return existing;
  }
  const instance = build(validated);
  instances.set(key, instance);
  return instance;
}

/** Test-only: drop the singleton registry so each test starts clean. */
export function __resetBrevwickRegistry(): void {
  instances.clear();
}
