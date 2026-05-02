import { useEffect, type ReactElement } from 'react';
import {
  attachRouteRing,
  useBrevwick,
  useBrevwickNavigationRef,
  type Brevwick,
} from '@tatlacas/brevwick-react-native';
import type { RouteEntry } from '@tatlacas/brevwick-sdk';

// Wires React Navigation `state` events into the SDK's 20-entry route
// ring buffer. The `BrevwickProvider` only forwards `navigationRef` to
// descendants via context (see `BrevwickNavigationRefContext`); the
// actual subscription is owned by this bridge so apps that prefer to
// drive the route ring from a different navigator can swap us out.
//
// `_internal.push` is the SDK's lockstep coupling between adapters and
// the core ring buffers. The same backdoor is documented in
// `packages/react-native/src/internal-bridge.ts` — both are stable
// because the SDK + adapters version in lockstep.
type BrevwickWithInternal = Brevwick & {
  _internal?: { push?: (entry: RouteEntry) => void };
};

export function RouteRingBridge(): ReactElement | null {
  const brevwick = useBrevwick() as BrevwickWithInternal;
  const navigationRef = useBrevwickNavigationRef();

  useEffect(() => {
    const push = brevwick._internal?.push;
    if (!navigationRef || typeof push !== 'function') return undefined;
    return attachRouteRing(navigationRef, push);
  }, [brevwick, navigationRef]);

  return null;
}
