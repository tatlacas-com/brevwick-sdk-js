import {
  type EnvironmentProviders,
  makeEnvironmentProviders,
} from '@angular/core';
import type { BrevwickConfig } from '@tatlacas/brevwick-sdk';
import { BREVWICK_CONFIG } from './brevwick.tokens';

/**
 * Bootstrap helper that wires {@link BrevwickConfig} into Angular's DI tree
 * for {@link BrevwickService}. Pass the result to `bootstrapApplication`'s
 * `providers` array (or to a route's `providers`).
 *
 * @example
 * ```ts
 * import { bootstrapApplication } from '@angular/platform-browser';
 * import { provideBrevwick } from '@tatlacas/brevwick-angular';
 * import { AppComponent } from './app/app.component';
 *
 * bootstrapApplication(AppComponent, {
 *   providers: [
 *     provideBrevwick({ projectKey: 'pk_live_…' }),
 *   ],
 * });
 * ```
 */
export function provideBrevwick(config: BrevwickConfig): EnvironmentProviders {
  return makeEnvironmentProviders([
    { provide: BREVWICK_CONFIG, useValue: config },
  ]);
}
