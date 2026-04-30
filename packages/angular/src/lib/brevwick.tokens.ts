import { InjectionToken } from '@angular/core';
import type { BrevwickConfig } from '@tatlacas/brevwick-sdk';

/**
 * DI token carrying the resolved {@link BrevwickConfig}. Populated by
 * {@link provideBrevwick}; consumed by {@link BrevwickService}.
 *
 * Direct injection is supported but unusual — most apps should call
 * `provideBrevwick(config)` and let the service own the SDK lifecycle.
 */
export const BREVWICK_CONFIG = new InjectionToken<BrevwickConfig>(
  'BREVWICK_CONFIG',
);
