'use client';

import { useEffect, useMemo, type ReactElement, type ReactNode } from 'react';
import { createBrevwick, type Brevwick, type BrevwickConfig } from 'brevwick-sdk';
import { BrevwickContext, type BrevwickContextValue } from './context';

export interface BrevwickProviderProps {
  config: BrevwickConfig;
  children?: ReactNode;
}

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
    <BrevwickContext.Provider value={value}>{children}</BrevwickContext.Provider>
  );
}
