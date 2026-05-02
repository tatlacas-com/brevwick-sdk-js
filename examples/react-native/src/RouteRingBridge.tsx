import { type ReactElement } from 'react';
import { useRouteRing } from '@tatlacas/brevwick-react-native';

/**
 * Wires React Navigation `state` events into the SDK's 20-entry route
 * ring buffer via the public {@link useRouteRing} hook. The hook owns the
 * lockstep `_internal.push` coupling so consumer apps don't need to
 * re-implement the cast or the runtime guard.
 *
 * Render this component anywhere inside `<BrevwickProvider>` and the
 * provider's forwarded `navigationRef` is picked up via context.
 */
export function RouteRingBridge(): ReactElement | null {
  useRouteRing();
  return null;
}
