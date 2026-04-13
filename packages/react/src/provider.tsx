'use client';

import { useEffect, useMemo, type ReactElement, type ReactNode } from 'react';
import {
  createBrevwick,
  type Brevwick,
  type BrevwickConfig,
} from 'brevwick-sdk';
import { BrevwickContext, type BrevwickContextValue } from './context';

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
  children?: ReactNode;
}

/**
 * Provides a `Brevwick` SDK instance to descendant components.
 *
 * - Memoises `createBrevwick(config)` on `config` identity.
 * - Calls `install()` on mount and `uninstall()` on unmount, so global
 *   listeners (network, console, visibility) are attached only while the
 *   provider is mounted.
 */
export function BrevwickProvider({
  config,
  children,
}: BrevwickProviderProps): ReactElement {
  const brevwick: Brevwick = useMemo(() => createBrevwick(config), [config]);

  useEffect(() => {
    brevwick.install();
    return () => {
      brevwick.uninstall();
    };
  }, [brevwick]);

  const value = useMemo<BrevwickContextValue>(() => ({ brevwick }), [brevwick]);

  return (
    <BrevwickContext.Provider value={value}>
      {children}
    </BrevwickContext.Provider>
  );
}
