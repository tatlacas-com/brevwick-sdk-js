import { createContext, useContext } from 'react';
import type { Brevwick } from '@tatlacas/brevwick-sdk';

/**
 * Internal context value carried by {@link BrevwickProvider}. The provider
 * always supplies a non-null `Brevwick` instance; consumers rely on
 * {@link useBrevwickInternal} to narrow and throw if the provider is missing.
 */
export interface BrevwickContextValue {
  brevwick: Brevwick;
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
