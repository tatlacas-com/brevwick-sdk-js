import {
  createContext,
  createSignal,
  onCleanup,
  onMount,
  type Accessor,
  type JSX,
  type ParentComponent,
} from 'solid-js';
import {
  createBrevwick,
  type Brevwick,
  type BrevwickConfig,
} from '@tatlacas/brevwick-sdk';

/**
 * Internal context value. Not part of the public surface — it is consumed via
 * {@link useFeedback}, which guards the nullable accessor and surfaces a
 * non-nullable SDK to callers.
 *
 * The accessor stays `null` during SSR and on the very first client render
 * before `onMount` runs. `useFeedback()` throws synchronously if it is invoked
 * before the SDK has hydrated; this matches the FAB's `Show when={isClient}`
 * gate, which only mounts the click handlers post-hydration.
 *
 * @internal
 */
interface BrevwickContextValue {
  brevwick: Accessor<Brevwick | null>;
}

/**
 * Internal Solid context for the Brevwick SDK instance. Not exported from the
 * package — consumers should always go through {@link useFeedback}.
 *
 * @internal
 */
export const BrevwickContext = createContext<BrevwickContextValue | null>(null);

export interface BrevwickProviderProps {
  /**
   * Brevwick SDK configuration. Captured once on mount — changing the
   * `config` prop after mount has no effect (consistent with the React
   * adapter's "hoist config to module scope" guidance and Solid's preference
   * for stable owner objects). To swap configs, unmount + remount the
   * provider.
   */
  config: BrevwickConfig;
  children?: JSX.Element;
}

/**
 * Provides a `Brevwick` SDK instance to descendant components.
 *
 * SSR-safe: `createBrevwick` only runs inside `onMount`, which Solid skips
 * during server rendering. The accessor stays `null` until the client
 * hydrates and the SDK installs.
 */
export const BrevwickProvider: ParentComponent<BrevwickProviderProps> = (
  props,
) => {
  const [brevwick, setBrevwick] = createSignal<Brevwick | null>(null);

  onMount(() => {
    // Defensive: `onMount` is client-only, but a Solid renderer running in a
    // worker without `window` would otherwise blow up inside the SDK's
    // install path. Skip cleanly so the provider degrades to "no-op" rather
    // than crashing the host app.
    if (typeof window === 'undefined') return;
    const instance = createBrevwick(props.config);
    instance.install();
    setBrevwick(instance);
    onCleanup(() => {
      instance.uninstall();
    });
  });

  return (
    <BrevwickContext.Provider value={{ brevwick }}>
      {props.children}
    </BrevwickContext.Provider>
  );
};
