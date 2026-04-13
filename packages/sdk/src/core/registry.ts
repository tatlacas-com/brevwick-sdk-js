/**
 * Internal mutable registry backing {@link createBrevwick}. Lives in its own
 * module so the test-only mutators (in the package's `testing` entry) share
 * state with the production factory without pulling setter code into the
 * eager base bundle.
 *
 * Only *data* is exported here — no setter functions. The testing entry
 * mutates {@link registryState} and {@link instances} directly. That shape
 * is what lets `tsup` keep the eager `index.js` below the 2 kB gzip budget:
 * the entry point references two data exports and the shared chunk carries
 * nothing else.
 */
import type { Brevwick } from '../types';
import type {
  INTERNAL_KEY,
  BrevwickInternal,
  RingDefinition,
} from './internal';

/**
 * A ring loader is either a ready {@link RingDefinition} or a thunk that
 * resolves to one. The default set uses dynamic-import thunks so each ring
 * module (patching logic, redaction helpers) ships in its own async chunk
 * — keeping the eager core bundle under the 2 kB gzip budget mandated by
 * `CLAUDE.md`.
 */
export type RingLoader = RingDefinition | (() => Promise<RingDefinition>);

export interface BrevwickWithInternal extends Brevwick {
  readonly [INTERNAL_KEY]: BrevwickInternal;
}

/**
 * Default ring set. Each entry is lazy-loaded via `import()` so the core
 * eager chunk remains tiny. Order matters: entries emitted while a ring
 * installs must be observable by rings installed later.
 */
export const DEFAULT_RING_LOADERS: readonly RingLoader[] = [
  () => import('../rings/console').then((m) => m.consoleRing),
  () => import('../rings/network').then((m) => m.networkRing),
];

/**
 * Mutable registry state. Wrapped in an object so the testing entry can
 * rebind `loaders` without a setter function leaking into the eager bundle.
 */
export const registryState: { loaders: readonly RingLoader[] } = {
  loaders: DEFAULT_RING_LOADERS,
};

/**
 * Singleton instance registry. Keyed by `projectKey|endpoint` (canonicalised
 * in `validateConfig`) so typo-equivalents never spawn shadow instances.
 * Entries are evicted on `Brevwick.uninstall`.
 */
export const instances = new Map<string, BrevwickWithInternal>();
