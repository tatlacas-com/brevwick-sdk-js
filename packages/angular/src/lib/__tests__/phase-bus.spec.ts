import { describe, expect, it } from 'vitest';
import type { Brevwick } from '@tatlacas/brevwick-sdk';
import { getPhaseBus } from '../internal/phase-bus';

const asBrevwick = (value: unknown): Brevwick => value as Brevwick;

describe('getPhaseBus', () => {
  it('returns null when _internal is missing or not an object', () => {
    expect(getPhaseBus(asBrevwick({}))).toBeNull();
    expect(getPhaseBus(asBrevwick({ _internal: null }))).toBeNull();
    expect(getPhaseBus(asBrevwick({ _internal: 'nope' }))).toBeNull();
  });

  it('returns null when _internal.bus is missing or not an object', () => {
    expect(getPhaseBus(asBrevwick({ _internal: {} }))).toBeNull();
    expect(getPhaseBus(asBrevwick({ _internal: { bus: null } }))).toBeNull();
    expect(getPhaseBus(asBrevwick({ _internal: { bus: 'nope' } }))).toBeNull();
  });

  it('returns null when bus is missing the on/off function pair', () => {
    expect(
      getPhaseBus(asBrevwick({ _internal: { bus: { on: () => {} } } })),
    ).toBeNull();
    expect(
      getPhaseBus(asBrevwick({ _internal: { bus: { off: () => {} } } })),
    ).toBeNull();
    expect(
      getPhaseBus(
        asBrevwick({ _internal: { bus: { on: 'nope', off: () => {} } } }),
      ),
    ).toBeNull();
  });

  it('returns the bus when on + off are both functions', () => {
    const bus = { on: () => {}, off: () => {} };
    expect(getPhaseBus(asBrevwick({ _internal: { bus } }))).toBe(bus);
  });
});
