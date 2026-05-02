import { useEffect, useMemo, type ReactElement, type ReactNode } from 'react';
import {
  createBrevwick,
  type Brevwick,
  type BrevwickConfig,
} from '@tatlacas/brevwick-sdk';
import { BrevwickContext } from './context';
import {
  BrevwickNavigationRefContext,
  type BrevwickNavigationRef,
} from './navigation-ref-context';

/**
 * Props for {@link BrevwickProvider}.
 */
export interface BrevwickProviderProps {
  /**
   * Brevwick SDK configuration. **The object identity matters**: the provider
   * memoises the underlying `Brevwick` instance keyed on this reference, so
   * passing a new object literal each render would cause `install` /
   * `uninstall` to cycle on every render. Hoist the config to module scope or
   * memoise it with `useMemo` in the parent component.
   */
  config: BrevwickConfig;
  /**
   * Optional React Navigation `navigationRef` (or any object with a matching
   * `addListener` shape). Forwarded to descendants via
   * {@link BrevwickNavigationRefContext} and consumed by the route-ring
   * worktree (#87) through {@link useBrevwickNavigationRef}. The provider
   * itself does not subscribe to navigation events — that wiring lives in
   * the route ring.
   */
  navigationRef?: BrevwickNavigationRef;
  children?: ReactNode;
}

/**
 * Provides a `Brevwick` SDK instance to descendant components in a React
 * Native app.
 *
 * - Memoises `createBrevwick(config)` on `config` identity.
 * - Calls `install()` on mount and `uninstall()` on unmount, so global
 *   listeners (network, console, route ring once #87 lands) are attached
 *   only while the provider is mounted.
 * - Forwards an optional `navigationRef` to descendants via
 *   {@link BrevwickNavigationRefContext} so the route-ring worktree (#87)
 *   can subscribe without the adapter taking a hard dep on
 *   `@react-navigation/native`.
 *
 * Mirrors `packages/react/src/provider.tsx` line-for-line except:
 * - No `'use client'` directive (RN has no SSR boundary).
 * - Adds the `navigationRef` prop and its sibling context.
 */
export function BrevwickProvider({
  config,
  navigationRef,
  children,
}: BrevwickProviderProps): ReactElement {
  const brevwick: Brevwick = useMemo(() => createBrevwick(config), [config]);

  useEffect(() => {
    brevwick.install();
    return () => {
      brevwick.uninstall();
    };
  }, [brevwick]);

  return (
    <BrevwickContext.Provider value={brevwick}>
      <BrevwickNavigationRefContext.Provider value={navigationRef ?? null}>
        {children}
      </BrevwickNavigationRefContext.Provider>
    </BrevwickContext.Provider>
  );
}
