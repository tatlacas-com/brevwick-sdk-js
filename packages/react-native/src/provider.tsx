import { useEffect, useMemo, type ReactElement, type ReactNode } from 'react';
import {
  createBrevwick,
  type Brevwick,
  type BrevwickConfig,
} from '@tatlacas/brevwick-sdk';
import { BrevwickContext } from './context';

/**
 * Loose ref type accepted by {@link BrevwickProviderProps.navigationRef}.
 *
 * Typed structurally rather than imported from `@react-navigation/native` so
 * the adapter does not pull React Navigation in as a hard dependency for
 * consumers that don't use it. The route-ring worktree (#87) reads this
 * prop; this provider only forwards it via context (future tier) and keeps
 * the surface stable.
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
   * `addListener` shape). Consumed by the route-ring worktree (#87); this
   * provider holds the prop slot so #87 can rebase without touching the
   * provider's public API.
   */
  navigationRef?: BrevwickNavigationRef;
  children?: ReactNode;
}

/**
 * Detects whether we are running in an environment where it makes sense to
 * install global listeners. Returns `true` on:
 *
 * - The browser / jsdom (`globalThis.window` defined — covers unit tests).
 * - React Native runtime (`globalThis.HermesInternal` defined — Hermes JS
 *   engine, the default since RN 0.70). For the rare JSC build, RN still
 *   exposes a `window` polyfill, so the first branch covers it.
 *
 * Returns `false` on a bare Node.js or SSR context (no `window`, no Hermes),
 * where the SDK has nothing meaningful to install. RN has no SSR story today
 * but the guard is cheap defence-in-depth against accidental imports from a
 * Next.js / Remix server bundle that ends up evaluating this file.
 */
function isLiveRuntime(): boolean {
  const g = globalThis as { window?: unknown; HermesInternal?: unknown };
  return (
    typeof g.window !== 'undefined' || typeof g.HermesInternal !== 'undefined'
  );
}

/**
 * Provides a `Brevwick` SDK instance to descendant components in a React
 * Native app.
 *
 * - Memoises `createBrevwick(config)` on `config` identity.
 * - Calls `install()` on mount and `uninstall()` on unmount, so global
 *   listeners (network, console, route ring once #87 lands) are attached
 *   only while the provider is mounted.
 * - No-ops in non-runtime environments (see {@link isLiveRuntime}). RN dev
 *   server / Hermes / jsdom unit tests all trip the runtime check.
 *
 * Mirrors `packages/react/src/provider.tsx` 1:1 except:
 * - No `'use client'` directive (RN has no SSR boundary).
 * - Adds the `navigationRef` prop slot.
 * - Adds the {@link isLiveRuntime} guard.
 */
export function BrevwickProvider({
  config,
  children,
}: BrevwickProviderProps): ReactElement {
  const brevwick: Brevwick | null = useMemo(
    () => (isLiveRuntime() ? createBrevwick(config) : null),
    [config],
  );

  useEffect(() => {
    if (!brevwick) return;
    brevwick.install();
    return () => {
      brevwick.uninstall();
    };
  }, [brevwick]);

  return (
    <BrevwickContext.Provider value={brevwick}>
      {children}
    </BrevwickContext.Provider>
  );
}
