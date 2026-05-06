import type { Brevwick } from '@tatlacas/brevwick-sdk';

/**
 * Submit-pipeline progress events. Mirrors `PhaseEvent` in the SDK's
 * `core/internal.ts`. Replicated here (rather than imported) because the
 * SDK intentionally does not export the internal surface from its package
 * root — the Angular adapter reaches the bus through the `_internal`
 * backdoor and types the listener locally, the same way the React adapter
 * does (`packages/react/src/internal-bridge.ts`).
 */
export type PhaseEvent =
  | { phase: 'capturing-done' }
  | { phase: 'sanitising-done' }
  | { phase: 'sent'; aiEnabled: boolean };

/**
 * Subset of the internal `Bus` we need: subscribe / unsubscribe to phase
 * events. Keeping the structural type narrow means a future SDK change
 * that adds new events does not pull broader internal types into the
 * adapter's surface area.
 */
export interface PhaseBus {
  on(event: 'phase', listener: (payload: PhaseEvent) => void): void;
  off(event: 'phase', listener: (payload: PhaseEvent) => void): void;
}

/**
 * Resolve the internal phase bus from a `Brevwick` instance, or return
 * `null` if the runtime shape does not match (e.g. a test mock that does
 * not stamp `_internal`). Adapters in this monorepo and the SDK live in
 * lockstep, so the `'_internal'` string + structural shape is a stable
 * coupling — but the adapter must not crash when consumers pass a
 * differently-shaped object.
 *
 * Internal — not part of the Angular adapter's public API.
 */
export function getPhaseBus(brevwick: Brevwick): PhaseBus | null {
  const internal = (brevwick as unknown as Record<string, unknown>)[
    '_internal'
  ];
  if (!internal || typeof internal !== 'object') return null;
  const bus = (internal as { bus?: unknown }).bus;
  if (!bus || typeof bus !== 'object') return null;
  const candidate = bus as { on?: unknown; off?: unknown };
  if (typeof candidate.on !== 'function' || typeof candidate.off !== 'function')
    return null;
  return bus as PhaseBus;
}
