import { createContext, useContext } from 'react';
import type { Brevwick } from '@tatlacas/brevwick-sdk';

/**
 * Context carrying the `Brevwick` instance installed by
 * {@link BrevwickProvider}. Mirrors the web React adapter's context shape but
 * stores the instance directly (no `{ brevwick }` wrapper) — RN consumers
 * don't have an SSR / hydration story that benefits from the wrapper.
 *
 * `null` only appears outside a provider; the {@link useBrevwick} guard
 * narrows it for callers.
 */
export const BrevwickContext = createContext<Brevwick | null>(null);

/**
 * Resolve the {@link Brevwick} instance from the nearest
 * {@link BrevwickProvider}. Throws synchronously when called outside one so
 * misuse fails loudly at render time rather than producing a silent no-op
 * `submit()` later.
 *
 * The thrown message intentionally mentions `BrevwickProvider` so consumers
 * (and the matching test in `__tests__/use-feedback.test.tsx`) can match on
 * a stable substring.
 */
export function useBrevwick(): Brevwick {
  const ctx = useContext(BrevwickContext);
  if (!ctx) {
    throw new Error(
      'useBrevwick() must be used inside <BrevwickProvider>. Wrap your app or test with <BrevwickProvider config={...}>.',
    );
  }
  return ctx;
}
