import { createContext, useContext } from 'react';
import type { Brevwick } from 'brevwick-sdk';

export interface BrevwickContextValue {
  brevwick: Brevwick | null;
}

export const BrevwickContext = createContext<BrevwickContextValue | null>(null);

export function useBrevwickInternal(): BrevwickContextValue {
  const ctx = useContext(BrevwickContext);
  if (!ctx) {
    throw new Error(
      'useFeedback() must be used inside <BrevwickProvider>. Wrap your app or test with <BrevwickProvider config={...}>.',
    );
  }
  return ctx;
}
