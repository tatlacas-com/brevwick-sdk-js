import { createContext, useContext } from 'react';

/**
 * Loose ref type accepted by {@link BrevwickProviderProps.navigationRef}.
 *
 * Typed structurally rather than imported from `@react-navigation/native` so
 * the adapter does not pull React Navigation in as a hard dependency for
 * consumers that don't use it. The route-ring worktree (#87) reads this
 * via {@link useBrevwickNavigationRef} and subscribes through `addListener`.
 */
export interface BrevwickNavigationRef {
  current: {
    addListener: (
      event: string,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      cb: (...args: any[]) => void,
    ) => () => void;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    getCurrentRoute?: () => any;
  } | null;
}

/**
 * Context carrying the `navigationRef` prop forwarded by
 * {@link BrevwickProvider} to descendants — primarily the route-ring
 * worktree (#87), which subscribes to React Navigation events without
 * forcing the adapter to depend on `@react-navigation/native`.
 *
 * `null` either means no provider is mounted OR the provider was rendered
 * without a `navigationRef` prop. Callers must handle both — see
 * {@link useBrevwickNavigationRef}.
 */
export const BrevwickNavigationRefContext =
  createContext<BrevwickNavigationRef | null>(null);

/**
 * Read the `navigationRef` forwarded by the nearest {@link BrevwickProvider}.
 *
 * Returns `null` when:
 * - the call site is not wrapped in a provider, OR
 * - the provider was rendered without a `navigationRef` prop.
 *
 * Unlike {@link useBrevwick}, this hook does NOT throw when used outside a
 * provider: the route-ring consumer (#87) is opt-in and a missing ref is a
 * valid configuration, not a misuse. Callers branch on the `null` to decide
 * whether to register listeners.
 */
export function useBrevwickNavigationRef(): BrevwickNavigationRef | null {
  return useContext(BrevwickNavigationRefContext);
}
