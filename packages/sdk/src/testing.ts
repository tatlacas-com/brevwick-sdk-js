/**
 * Test-only entry point for `@tatlacas/brevwick-sdk`.
 *
 * Exports mutators that rebind the internal registry backing
 * {@link createBrevwick}. Kept in its own entry so these helpers never ship
 * in the eager production bundle — the production entry imports the
 * registry's *data* exports only, so mutator code is not pulled into the
 * shared chunk.
 *
 * This module is intentionally absent from the package's public contract
 * and must not be imported by consumer code.
 */

import {
  DEFAULT_RING_LOADERS,
  instances,
  registryState,
  type RingLoader,
} from './core/registry';

export type { RingLoader };

/** Test-only: drop the singleton registry so each test starts clean. */
export function __resetBrevwickRegistry(): void {
  instances.clear();
}

/**
 * Test-only: swap in a fake ring set (or restore the default with no args).
 * Accepts both sync {@link RingDefinition}s and async loader thunks so tests
 * can choose between "already-loaded fake" and "exercise the real
 * dynamic-import path".
 */
export function __setRingsForTesting(rings?: readonly RingLoader[]): void {
  registryState.loaders = rings ?? DEFAULT_RING_LOADERS;
}
