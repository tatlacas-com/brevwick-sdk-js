import { describe, expect, it } from 'vitest';
import type { Brevwick } from '@tatlacas/brevwick-sdk';

import { getPhaseBus } from '../internal-bridge';

// Cast helper: every test forges a `Brevwick`-shaped object that exercises
// one of the defensive branches in `getPhaseBus`. The real SDK always
// stamps `_internal.bus` with `on`/`off`; these branches exist so the
// adapter does not crash when fed a bare mock.
const asBrevwick = (value: unknown): Brevwick => value as Brevwick;

describe('getPhaseBus', () => {
  it('returns null when `_internal` is missing', () => {
    expect(getPhaseBus(asBrevwick({}))).toBeNull();
  });

  it('returns null when `_internal.bus` is missing', () => {
    expect(getPhaseBus(asBrevwick({ _internal: {} }))).toBeNull();
  });

  it('returns null when bus is not a function-bearing object', () => {
    // Bus exists but lacks `on`/`off` — e.g. a half-implemented mock.
    expect(
      getPhaseBus(asBrevwick({ _internal: { bus: { on: 'nope' } } })),
    ).toBeNull();
  });

  it('returns the bus when shape matches', () => {
    const bus = { on() {}, off() {} };
    expect(getPhaseBus(asBrevwick({ _internal: { bus } }))).toBe(bus);
  });
});
