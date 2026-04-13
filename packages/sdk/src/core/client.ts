import type {
  Brevwick,
  BrevwickConfig,
  FeedbackInput,
  RingEntry,
  SubmitResult,
} from '../types';
import { createBus } from './bus';
import { createRingBuffer, type RingBuffer } from './buffer';
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
 * Rings are attached in this order when their config flag is true. Ring
 * modules (landing in #2 / #3) register themselves via `__registerRing` so
 * the factory stays ring-agnostic. Order matters: entries emitted during a
 * ring's install run must be observable by later rings' listeners.
 */
const registeredRings: RingDefinition[] = [];

interface BrevwickWithInternal extends Brevwick {
  readonly [INTERNAL_KEY]: BrevwickInternal;
}

/**
 * Singleton registry. Keyed by `projectKey|endpoint` so a tenant pointing
 * the SDK at an alternate ingest (EU shard, test mock) still gets distinct
 * instances. Test code MUST call {@link __resetBrevwickRegistry} between
 * runs — module-scoped state survives Vitest's module graph otherwise.
 */
const instances = new Map<string, BrevwickWithInternal>();

function instanceKey(config: ValidatedConfig): string {
  return `${config.projectKey}|${config.endpoint}`;
}

function isBrowser(): boolean {
  return typeof window !== 'undefined' && typeof document !== 'undefined';
}

function bufferFor(
  entry: RingEntry,
  buffers: BrevwickInternal['buffers'],
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

function build(config: ValidatedConfig): BrevwickWithInternal {
  const buffers = {
    console: createRingBuffer<RingEntry>(50),
    network: createRingBuffer<RingEntry>(50),
    route: createRingBuffer<RingEntry>(20),
  } as const;
  const bus = createBus<BusEventMap>();

  let state: LifecycleState = 'idle';
  let teardowns: Array<() => void> = [];

  const internal: BrevwickInternal = {
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
    // Once torn down, the instance is terminal — re-install would leak
    // captured buffers and invite double-patched globals. Tenants that
    // genuinely need a fresh lifecycle should build a new instance.
    if (state === 'uninstalled') {
      throw new Error(
        'Brevwick.install() cannot be called after uninstall(); create a new instance instead',
      );
    }
    if (!isBrowser()) return;
    if (!config.enabled) return;

    const ctx: RingContext = {
      config,
      bus,
      push: internal.push,
    };
    for (const ring of registeredRings) {
      if (!config.rings[ring.name]) continue;
      teardowns.push(ring.install(ctx));
    }
    state = 'installed';
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
    buffers.console.clear();
    buffers.network.clear();
    buffers.route.clear();
    bus.clear();
    state = 'uninstalled';
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

  // _internal is reachable for downstream rings but intentionally hidden from
  // enumeration/iteration so it stays off the public surface.
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
    // Capture-time console binding would be stronger, but createBrevwick is
    // called before any ring patches `console.warn`, so the live binding is
    // the original. Worth revisiting if the ordering ever changes.
    const originalWarn = (globalThis as { console?: Console }).console?.warn;
    // Log only the key prefix — full public keys are safe per the SDD but
    // narrow logs make grep noise smaller and defuse the accidental "log the
    // secret key" bug class if a live key ever sneaks into dev output.
    const prefix = validated.projectKey.slice(0, 12);
    originalWarn?.(
      `[brevwick] createBrevwick called twice for projectKey=${prefix}…; returning existing instance`,
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

/**
 * Internal: ring modules call this at module-evaluation time to register
 * themselves with the factory. Duplicate names are ignored (idempotent so
 * HMR / test re-imports stay safe). Not part of the public API.
 */
export function __registerRing(ring: RingDefinition): void {
  if (registeredRings.some((r) => r.name === ring.name)) return;
  registeredRings.push(ring);
}

/** Test-only: drop ring registrations so each test can inject fakes. */
export function __resetRingRegistry(): void {
  registeredRings.length = 0;
}
