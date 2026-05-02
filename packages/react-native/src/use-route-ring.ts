/**
 * Public route-ring helper. Wraps the `_internal.push` reach-around the
 * route bridge previously copy-pasted into every consumer (`docs/issue-89-90`
 * review #101) so the documented-private SDK surface only crosses the
 * adapter boundary in **one** place.
 *
 * The previous shape (a copy/pasted `BrevwickWithInternal` cast in every
 * consumer) violated the encapsulation `INTERNAL_KEY` exists to enforce —
 * widening `_internal.push` to N consumer apps means the SDK can never
 * tighten the backdoor without breaking each one. This hook owns the cast
 * (and the runtime guard) so the SDK can evolve the internal contract
 * freely as long as this file keeps up.
 */
import { useEffect } from 'react';
import type { Brevwick, RouteEntry } from '@tatlacas/brevwick-sdk';
import { useBrevwick } from './context';
import {
  useBrevwickNavigationRef,
  type BrevwickNavigationRef,
} from './navigation-ref-context';
import { attachRouteRing, type NavigationRefLike } from './rings/route';

/**
 * Adapter-internal lockstep coupling with the SDK's `_internal` backdoor.
 * Documented in `internal-bridge.ts` for the phase bus; this file owns the
 * coupling for the route ring. Both surfaces live in lockstep with the
 * core package via the linked changeset group, so the `'_internal'` /
 * `'push'` strings are stable.
 */
type BrevwickWithInternal = Brevwick & {
  _internal?: { push?: (entry: RouteEntry) => void };
};

function getPush(brevwick: Brevwick): ((entry: RouteEntry) => void) | null {
  const internal = (brevwick as BrevwickWithInternal)._internal;
  if (!internal) return null;
  const push = internal.push;
  return typeof push === 'function' ? push : null;
}

/**
 * Subscribe React Navigation's `state` event to the SDK's route ring.
 *
 * Resolves both the {@link Brevwick} instance and the `navigationRef`
 * forwarded by {@link BrevwickProvider} from context, attaches a listener
 * via {@link attachRouteRing}, and detaches on unmount.
 *
 * No-op (returns silently from the effect) when:
 * - The provider was rendered without a `navigationRef` prop, OR
 * - The mounted `Brevwick` instance does not expose `_internal.push`
 *   (e.g. a custom mock in a test). Apps that follow the documented setup
 *   never hit this branch — the production `createBrevwick` always stamps
 *   `_internal`.
 *
 * @example
 * ```tsx
 * function App() {
 *   const navigationRef = useNavigationContainerRef();
 *   const config = useMemo(() => ({ projectKey: '…' }), []);
 *   return (
 *     <BrevwickProvider config={config} navigationRef={navigationRef}>
 *       <NavigationContainer ref={navigationRef}>{routes}</NavigationContainer>
 *       <RouteRingBridge />
 *     </BrevwickProvider>
 *   );
 * }
 *
 * function RouteRingBridge() {
 *   useRouteRing();
 *   return null;
 * }
 * ```
 *
 * Pass an explicit `navigationRef` argument when the bridge is mounted
 * outside the provider tree (rare — most consumers use the no-arg form
 * and let the context resolve the ref).
 */
export function useRouteRing(navigationRef?: BrevwickNavigationRef): void {
  const brevwick = useBrevwick();
  const ctxNavigationRef = useBrevwickNavigationRef();
  const ref = navigationRef ?? ctxNavigationRef;

  useEffect(() => {
    if (!ref) return undefined;
    const push = getPush(brevwick);
    if (!push) return undefined;
    // `BrevwickNavigationRef` and `NavigationRefLike` describe the same
    // structural shape (a `current` slot with `addListener` and an
    // optional `getCurrentRoute`); the cast is safe and stays here so
    // consumers never see it. `attachRouteRing`'s runtime guard handles
    // the `null` / missing-method cases defensively.
    return attachRouteRing(ref as unknown as NavigationRefLike, push);
  }, [brevwick, ref]);
}
