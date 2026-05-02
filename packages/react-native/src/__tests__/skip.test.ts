/**
 * `<BrevwickSkip>` registry semantics. Verified via the exported
 * `hideRegisteredSkipViews` / `restoreSkippedViews` helpers against
 * fake View instances — covers the refcount-aware concurrency contract
 * without spinning up a real RN renderer (jsdom plus a stubbed `<View>`
 * cannot faithfully dispatch `setNativeProps` through React).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  __addSkipRefForTest,
  __resetSkipRegistryForTest,
  hideRegisteredSkipViews,
  restoreSkippedViews,
} from '../skip';

class FakeView {
  setNativeProps = vi.fn<(props: { opacity: number }) => void>();
}

afterEach(() => {
  __resetSkipRegistryForTest();
});

describe('skip registry — refcount-aware hide/restore', () => {
  it('flips opacity to 0 on hide and restores on the matching restore', () => {
    const view = new FakeView();
    __addSkipRefForTest({ current: view as unknown as never });

    const snapshot = hideRegisteredSkipViews();
    expect(view.setNativeProps).toHaveBeenCalledWith({ opacity: 0 });

    restoreSkippedViews(snapshot);
    expect(view.setNativeProps).toHaveBeenLastCalledWith({ opacity: 1 });
    expect(view.setNativeProps).toHaveBeenCalledTimes(2);
  });

  it('does not double-stash when two captures overlap on the same view', () => {
    const view = new FakeView();
    __addSkipRefForTest({ current: view as unknown as never });

    const outer = hideRegisteredSkipViews();
    const inner = hideRegisteredSkipViews();

    // Only the FIRST hide flips opacity to 0; the second hide bumps the
    // refcount without re-issuing setNativeProps. Otherwise the inner hide
    // would re-stash the already-zeroed opacity and the outer restore
    // would later write 0 back as the "original" value.
    expect(view.setNativeProps).toHaveBeenCalledTimes(1);
    expect(view.setNativeProps).toHaveBeenLastCalledWith({ opacity: 0 });

    restoreSkippedViews(inner);
    expect(view.setNativeProps).toHaveBeenCalledTimes(1);

    restoreSkippedViews(outer);
    expect(view.setNativeProps).toHaveBeenCalledTimes(2);
    expect(view.setNativeProps).toHaveBeenLastCalledWith({ opacity: 1 });
  });

  it('skips refs that have unmounted (current === null)', () => {
    __addSkipRefForTest({ current: null });
    const live = new FakeView();
    __addSkipRefForTest({ current: live as unknown as never });

    const snapshot = hideRegisteredSkipViews();
    expect(live.setNativeProps).toHaveBeenCalledWith({ opacity: 0 });
    expect(snapshot).toHaveLength(1);

    restoreSkippedViews(snapshot);
    expect(live.setNativeProps).toHaveBeenLastCalledWith({ opacity: 1 });
  });

  it('an unmount between hide and restore does not strand opacity at 0', () => {
    const view = new FakeView();
    const ref: { current: FakeView | null } = { current: view };
    __addSkipRefForTest(ref as { current: never });

    const snapshot = hideRegisteredSkipViews();
    expect(view.setNativeProps).toHaveBeenLastCalledWith({ opacity: 0 });

    // Simulate the consumer unmounting BrevwickSkip mid-capture: the ref's
    // current goes null, the registry entry stays (BrevwickSkip's effect
    // cleanup would normally remove it; under jsdom we do that manually).
    ref.current = null;

    // Restore consumes the snapshot, which still holds the View instance
    // captured at hide-time. setNativeProps fires against the unmounted View
    // — that is harmless (the bridge no-ops) and is the cost of guaranteeing
    // a live capture path never strands opacity.
    restoreSkippedViews(snapshot);
    expect(view.setNativeProps).toHaveBeenLastCalledWith({ opacity: 1 });
    expect(view.setNativeProps).toHaveBeenCalledTimes(2);
  });
});
