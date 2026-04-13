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
} from './internal';
import {
  instances,
  registryState,
  type BrevwickWithInternal,
} from './registry';
import { validateConfig, type ValidatedConfig } from './validate';

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
    if (typeof window === 'undefined' || typeof document === 'undefined')
      return;
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
    for (const loader of registryState.loaders) {
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
      const { captureScreenshotForInstance } = await import('../screenshot');
      return captureScreenshotForInstance(internal);
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
  const key = `${validated.projectKey}|${validated.endpoint}`;
  const existing = instances.get(key);
  if (existing) {
    // createBrevwick runs before any ring patches console, so the live
    // binding is still the original. Worth revisiting if that ordering
    // ever changes.
    // createBrevwick runs before any ring patches console, so the live
    // binding is still the original. Worth revisiting if that ordering
    // ever changes.
    const originalWarn = (globalThis as { console?: Console }).console?.warn;
    // Log only a prefix — public keys aren't secret per the SDD, but narrow
    // logs keep grep noise small and defuse the accidental "log the secret
    // key" bug class if a live key ever sneaks into dev output.
    const prefix = validated.projectKey.slice(0, 12);
    originalWarn?.(
      `[brevwick] createBrevwick(${prefix}…) called twice; returning existing instance`,
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
