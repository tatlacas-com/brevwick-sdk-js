import type { App, InjectionKey } from 'vue';
import { createBrevwick, type Brevwick } from '@tatlacas/brevwick-sdk';
import type { BrevwickPluginOptions } from './types';

/**
 * Internal `provide()` key carrying the SDK instance from {@link BrevwickPlugin}
 * to {@link useFeedback} and {@link FeedbackButton}. Exported as `Symbol`
 * (not a string) so it can never collide with consumer-provided keys.
 *
 * Typed against `Brevwick | null`: SSR installations cannot call
 * `createBrevwick()` (it touches `window`), so the plugin provides `null` on
 * the server. Consumers re-resolve on client hydration when the plugin's
 * `install()` re-runs in a browser context.
 */
export const BREVWICK_INJECTION_KEY: InjectionKey<Brevwick | null> =
  Symbol('brevwick');

/**
 * Vue plugin that creates a single `Brevwick` SDK instance and exposes it to
 * descendants via `provide()`. SSR-safe: when no `window` is present the
 * plugin provides `null` and defers SDK creation to client hydration. The
 * SDK's `install()` call attaches the global ring listeners (network,
 * console, visibility); `uninstall()` runs on `app.unmount()` so listeners
 * are released when the host app tears down.
 *
 * Usage:
 *
 * ```ts
 * import { createApp } from 'vue';
 * import { BrevwickPlugin } from '@tatlacas/brevwick-vue';
 *
 * const app = createApp(App);
 * app.use(BrevwickPlugin, { projectKey: 'pk_live_...' });
 * app.mount('#app');
 * ```
 */
export const BrevwickPlugin = {
  install(app: App, options: BrevwickPluginOptions): void {
    if (typeof window === 'undefined') {
      // SSR: provide a sentinel `null` so `useFeedback()` can throw a
      // distinguishable "called during SSR" error if a consumer reaches
      // for it from a non-`onMounted` code path. Client hydration re-runs
      // the plugin install (Vue/Nuxt convention) and overwrites this with
      // a real instance.
      app.provide(BREVWICK_INJECTION_KEY, null);
      return;
    }

    const sdk = createBrevwick(options);
    sdk.install();
    app.provide(BREVWICK_INJECTION_KEY, sdk);

    // Vue's `App` does not expose an `onUnmount` hook directly; wrap
    // `app.unmount` so the SDK's global listeners are released when the
    // host app tears down. Tests rely on this — `app.unmount()` must call
    // `sdk.uninstall()` so listener registration does not leak across
    // mount/unmount cycles.
    const originalUnmount = app.unmount.bind(app);
    app.unmount = () => {
      try {
        sdk.uninstall();
      } finally {
        originalUnmount();
      }
    };
  },
};
