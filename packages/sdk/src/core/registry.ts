/**
 * Internal mutable registry backing {@link createBrevwick}. Lives in its own
 * module so the test-only mutators (in the package's `testing` entry) share
 * state with the production factory without pulling setter code into the
 * eager base bundle.
 *
 * Only *data* is exported here — no setter functions. The testing entry
 * mutates {@link registryState} and {@link instances} directly. That shape
 * is what keeps the registry surface itself minimal; the eager core bundle
 * carries the default ring code (see {@link DEFAULT_RING_LOADERS} for why).
 */
import type { Brevwick } from '../types';
import { consoleRing } from '../rings/console';
import { networkRing } from '../rings/network';
import type {
  INTERNAL_KEY,
  BrevwickInternal,
  RingDefinition,
} from './internal';

/**
 * A ring loader is either a ready {@link RingDefinition} or a thunk that
 * resolves to one. The default set is eager — see {@link DEFAULT_RING_LOADERS}.
 * Async loaders remain supported on the type so adapter packages and tests
 * can register experimental rings that genuinely need code-splitting.
 */
export type RingLoader = RingDefinition | (() => Promise<RingDefinition>);

export interface BrevwickWithInternal extends Brevwick {
  readonly [INTERNAL_KEY]: BrevwickInternal;
}

/**
 * Default ring set. **Eager** — both rings install synchronously inside
 * `install()` so the patches on `globalThis.fetch`, `XMLHttpRequest.prototype`
 * and `console.*` are live the instant `install()` returns.
 *
 * The earlier shape used dynamic-import thunks to keep the eager core chunk
 * under a 2 kB gzip budget. That made every error and request fired between
 * `install()` and the chunks landing invisible — which was the
 * "submitted issue is missing console + network info" bug. Reliable capture
 * is the SDK's headline guarantee, so the bundle ceiling moved up rather
 * than the rings moving back behind a network round-trip. See
 * `__tests__/integration/install-race.test.ts` for the regression and
 * SDD § 12 for the updated budget.
 */
export const DEFAULT_RING_LOADERS: readonly RingLoader[] = [
  consoleRing,
  networkRing,
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
