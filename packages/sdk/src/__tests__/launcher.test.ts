import { describe, it, expect } from 'vitest';
import { resolveLauncherPlacement } from '../launcher';

/**
 * Contract for the framework-agnostic launcher resolver hoisted out of the
 * adapters. Every adapter imports this single function, so the full
 * variant/position matrix is pinned here once (the adapters keep only their
 * own class/style-derivation tests on top of it).
 */
describe('resolveLauncherPlacement', () => {
  it('defaults to the right-edge tab with no arguments', () => {
    expect(resolveLauncherPlacement()).toEqual({
      variant: 'tab',
      side: 'right',
    });
  });

  it('an explicit legacy corner without a variant implies the bubble', () => {
    expect(resolveLauncherPlacement(undefined, 'bottom-right')).toEqual({
      variant: 'bubble',
      side: 'right',
    });
    expect(resolveLauncherPlacement(undefined, 'bottom-left')).toEqual({
      variant: 'bubble',
      side: 'left',
    });
  });

  it('an explicit edge side without a variant stays the tab', () => {
    expect(resolveLauncherPlacement(undefined, 'left')).toEqual({
      variant: 'tab',
      side: 'left',
    });
    expect(resolveLauncherPlacement(undefined, 'right')).toEqual({
      variant: 'tab',
      side: 'right',
    });
  });

  it('an explicit variant always wins; position contributes only the side', () => {
    // variant="tab" + a legacy corner: tab wins, corner gives the side only.
    expect(resolveLauncherPlacement('tab', 'bottom-left')).toEqual({
      variant: 'tab',
      side: 'left',
    });
    // variant="bubble" + an edge side: bubble wins, side carried through.
    expect(resolveLauncherPlacement('bubble', 'left')).toEqual({
      variant: 'bubble',
      side: 'left',
    });
    expect(resolveLauncherPlacement('bubble', 'right')).toEqual({
      variant: 'bubble',
      side: 'right',
    });
  });
});
