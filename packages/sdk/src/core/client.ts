import type {
  Brevwick,
  BrevwickConfig,
  ConsoleEntry,
  FeedbackInput,
  NetworkEntry,
  RouteEntry,
  SubmitResult,
} from '../types';
import { createBus } from './bus';
import { createRingBuffer } from './buffer';
import {
  INTERNAL_KEY,
  type BrevwickInternal,
  type BusEventMap,
  type LifecycleState,
  type RingContext,
  type RingDefinition,
} from './internal';
import { validateConfig, type ValidatedConfig } from './validate';

/**
 * A ring loader is either a ready {@link RingDefinition} or a thunk that
 * resolves to one. The default set uses dynamic-import thunks so the ring
 * module (patching logic, redaction helpers) ships in its own async chunk
 * — keeping the eager core bundle under the 2 kB gzip budget mandated by
 * `CLAUDE.md`. The registry also accepts ready definitions for tests, which
 * inject concrete fakes synchronously via {@link __setRingsForTesting}.
 */
export type RingLoader = RingDefinition | (() => Promise<RingDefinition>);

/**
 * Rings attached on install, in this order, when their config flag is true.
 * Each entry is lazy-loaded via `import()` so the core eager chunk remains
 * tiny. Order matters: entries emitted while a ring installs must be
 * observable by rings installed later.
 */
const DEFAULT_RING_LOADERS: readonly RingLoader[] = [
  () => import('../rings/network').then((m) => m.networkRing),
];

/**
 * Active ring set. Defaults to {@link DEFAULT_RING_LOADERS}; tests swap it
 * via {@link __setRingsForTesting} to inject synchronous fakes without
 * touching module identity.
 */
let activeRingLoaders: readonly RingLoader[] = DEFAULT_RING_LOADERS;

interface BrevwickWithInternal extends Brevwick {
  readonly [INTERNAL_KEY]: BrevwickInternal;
}

/**
 * Singleton registry. Keyed by `projectKey|endpoint` (canonicalised in
 * {@link validateConfig}) so typo-equivalents never spawn shadow instances.
 * Entries are evicted on {@link Brevwick.uninstall} so a subsequent
 * `createBrevwick(sameKey)` call gets a fresh, installable instance — the
 * instance itself stays terminal once torn down.
 */
const instances = new Map<string, BrevwickWithInternal>();

function instanceKey(config: ValidatedConfig): string {
  return `${config.projectKey}|${config.endpoint}`;
}

function isBrowser(): boolean {
  return typeof window !== 'undefined' && typeof document !== 'undefined';
}

function build(
  config: ValidatedConfig,
  onUninstall: () => void,
): BrevwickWithInternal {
  const buffers = {
    console: createRingBuffer<ConsoleEntry>(50),
    network: createRingBuffer<NetworkEntry>(50),
    route: createRingBuffer<RouteEntry>(20),
  } as const;
  const bus = createBus<BusEventMap>();

  let state: LifecycleState = 'idle';
  let teardowns: Array<() => void> = [];
  // Generation counter: incremented on every install so an async ring
  // loader that resolves AFTER uninstall was called can detect the flip
  // and skip installation. Without this, a dynamic import landing late
  // would silently re-patch globals against an already-torn-down instance.
  let generation = 0;
  // Resolved when every async ring loader from the most recent install
  // has either mounted or been skipped. Tests await this so they can
  // safely exercise patched globals; production callers never touch it.
  let ready: Promise<void> = Promise.resolve();

  const internal: BrevwickInternal = {
    buffers,
    bus,
    config,
    push(entry) {
      // Inline dispatch keeps per-buffer type narrowing — `bufferFor(entry)`
      // would widen back to `RingBuffer<RingEntry>` and lose the invariant
      // that each buffer only holds its own kind.
      switch (entry.kind) {
        case 'console':
          buffers.console.push(entry);
          break;
        case 'network':
          buffers.network.push(entry);
          break;
        case 'route':
          buffers.route.push(entry);
          break;
      }
      bus.emit('entry', entry);
    },
    state: () => state,
    ready: () => ready,
  };

  function install(): void {
    if (state === 'installed') return;
    // Once torn down, the instance is terminal — re-install would leak
    // captured buffers and invite double-patched globals. The registry
    // already evicted this key on uninstall, so the "create a new instance"
    // path is just another `createBrevwick(...)` call.
    if (state === 'uninstalled') {
      throw new Error(
        'Brevwick.install() cannot be called after uninstall(); call createBrevwick() again for a fresh instance',
      );
    }
    if (!isBrowser()) return;
    if (!config.enabled) return;

    generation += 1;
    const thisGeneration = generation;

    const ctx: RingContext = {
      config,
      bus,
      push: internal.push,
    };
    state = 'installed';

    const pending: Promise<void>[] = [];
    for (const loader of activeRingLoaders) {
      // Sync loaders resolve immediately; async loaders go through a thunk
      // that we race against the uninstall generation counter.
      if (typeof loader === 'function') {
        pending.push(
          loader().then(
            (ring) => {
              if (generation !== thisGeneration) return;
              if (state !== 'installed') return;
              if (!config.rings[ring.name]) return;
              teardowns.push(ring.install(ctx));
            },
            (err: unknown) => {
              // A single failed ring loader must not take out the SDK.
              const w = (globalThis as { console?: Console }).console?.warn;
              w?.(`[brevwick] ring loader failed: ${String(err)}`);
            },
          ),
        );
      } else {
        if (!config.rings[loader.name]) continue;
        teardowns.push(loader.install(ctx));
      }
    }
    ready =
      pending.length === 0
        ? Promise.resolve()
        : Promise.all(pending).then(() => undefined);
  }

  function uninstall(): void {
    // Early out before the state flip: a disabled or never-installed
    // instance calling uninstall() must stay `idle`, otherwise a
    // subsequent install() would be mis-routed through the terminal path.
    if (state !== 'installed') return;

    for (let i = teardowns.length - 1; i >= 0; i--) {
      try {
        teardowns[i]?.();
      } catch {
        // Individual ring teardown failures must not block the others.
      }
    }
    teardowns = [];
    // Bump generation so any still-pending async loader from this install
    // short-circuits when it resolves.
    generation += 1;
    buffers.console.clear();
    buffers.network.clear();
    buffers.route.clear();
    bus.clear();
    state = 'uninstalled';
    onUninstall();
  }

  const instance: Brevwick = {
    install,
    uninstall,
    async submit(_input: FeedbackInput): Promise<SubmitResult> {
      // Promise-returning so `.catch()` handlers attach before the rejection
      // fires — a synchronous throw here would short-circuit any chain built
      // in user code. Real implementation lands in #4.
      throw new Error('Brevwick.submit is not yet implemented');
    },
    async captureScreenshot(): Promise<Blob> {
      throw new Error('Brevwick.captureScreenshot is not yet implemented');
    },
  };

  Object.defineProperty(instance, INTERNAL_KEY, {
    value: internal,
    enumerable: false,
    writable: false,
    configurable: false,
  });

  return instance as BrevwickWithInternal;
}

export function createBrevwick(config: BrevwickConfig): Brevwick {
  const validated = validateConfig(config);
  const key = instanceKey(validated);
  const existing = instances.get(key);
  if (existing) {
    // createBrevwick runs before any ring patches console, so the live
    // binding is still the original. Worth revisiting if that ordering
    // ever changes.
    const originalWarn = (globalThis as { console?: Console }).console?.warn;
    // Log only a prefix — public keys aren't secret per the SDD, but narrow
    // logs keep grep noise small and defuse the accidental "log the secret
    // key" bug class if a live key ever sneaks into dev output.
    const prefix = validated.projectKey.slice(0, 12);
    originalWarn?.(
      `[brevwick] createBrevwick called twice for projectKey=${prefix}…; returning existing instance`,
    );
    return existing;
  }
  const instance = build(validated, () => {
    // Evict on uninstall so the next createBrevwick() call for this key
    // returns a fresh, installable instance. The torn-down instance itself
    // stays terminal — any handle still held by caller code cannot re-install.
    instances.delete(key);
  });
  instances.set(key, instance);
  return instance;
}

/** Test-only: drop the singleton registry so each test starts clean. */
export function __resetBrevwickRegistry(): void {
  instances.clear();
}

/**
 * Test-only: swap in a fake ring set (or restore the default with no args).
 * Accepts both sync {@link RingDefinition}s and async loader thunks so
 * tests can choose between "already-loaded fake" and "exercise the real
 * dynamic-import path".
 */
export function __setRingsForTesting(rings?: readonly RingLoader[]): void {
  activeRingLoaders = rings ?? DEFAULT_RING_LOADERS;
}
