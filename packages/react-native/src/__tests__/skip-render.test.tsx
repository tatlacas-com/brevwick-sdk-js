/**
 * Render-driven `<BrevwickSkip>` test. The unit-level tests in `skip.test.ts`
 * exercise the registry helpers (`hideRegisteredSkipViews` /
 * `restoreSkippedViews`) against synthetic refs registered via
 * `__addSkipRefForTest` — they prove the registry's contract but NOT that
 * the production wrapper component actually populates and cleans up the
 * registry through React's mount/unmount lifecycle.
 *
 * This file closes that gap by mounting `<BrevwickSkip>` under
 * `react-test-renderer` and asserting:
 *   1. mount → registry size goes from N → N+1 (the `useEffect` registered
 *      the ref);
 *   2. unmount → registry size returns to N (the cleanup function ran);
 *   3. while mounted, the ref is reachable via `hideRegisteredSkipViews`,
 *      i.e. the snapshot includes the underlying View instance.
 *
 * `react-test-renderer` is preferred over `@testing-library/react-native`
 * here because:
 *   - it has zero jest dependencies (RNTL pulls `jest-matcher-utils`
 *     transitively and is built around jest's `expect`),
 *   - it works without a DOM, fitting our happy-dom + minimal `<View>` stub,
 *   - it is the same renderer RNTL itself uses internally, so the lifecycle
 *     semantics are identical.
 *
 * The `<View>` stub from `test/__mocks__/react-native.ts` is a regular React
 * class component returning `this.props.children`. When `useRef<View>(null)`
 * resolves under `react-test-renderer`, `ref.current` is the live class
 * instance — the same instance type the registry's `WeakMap` keys against
 * in production.
 */
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { afterEach, describe, expect, it } from 'vitest';

import { BrevwickSkip } from '../skip';
import {
  __resetSkipRegistryForTest,
  hideRegisteredSkipViews,
  restoreSkippedViews,
} from '../skip';

afterEach(() => {
  __resetSkipRegistryForTest();
});

describe('BrevwickSkip — useEffect registers and cleans up the ref', () => {
  it('mount adds exactly one entry to the registry; unmount removes it', async () => {
    // Baseline. The registry is module-scoped; the afterEach hook above
    // resets it between cases, so this snapshot must be empty.
    expect(hideRegisteredSkipViews()).toHaveLength(0);

    let renderer: ReactTestRenderer | undefined;
    await act(async () => {
      renderer = create(<BrevwickSkip />);
    });

    // Effect ran on mount. The registered SkipRef now resolves to the live
    // View instance — `hideRegisteredSkipViews` returns a snapshot of length
    // 1, confirming the production code path (not just the test seam) wired
    // the ref into the registry.
    const mountedSnapshot = hideRegisteredSkipViews();
    expect(mountedSnapshot).toHaveLength(1);

    // Restore so the unmount assertion below is not muddied by a stuck
    // refcount on the unmounting view.
    restoreSkippedViews(mountedSnapshot);

    await act(async () => {
      renderer!.unmount();
    });

    // Cleanup ran on unmount. The registry is empty again.
    expect(hideRegisteredSkipViews()).toHaveLength(0);
  });

  it('two mounted BrevwickSkip wrappers register two distinct entries', async () => {
    let renderer: ReactTestRenderer | undefined;
    await act(async () => {
      renderer = create(
        <>
          <BrevwickSkip />
          <BrevwickSkip />
        </>,
      );
    });

    const snapshot = hideRegisteredSkipViews();
    expect(snapshot).toHaveLength(2);
    // Distinct View instances — refs MUST not collapse, otherwise the
    // refcount accounting in `restoreSkippedViews` would treat two siblings
    // as the same hidden surface.
    expect(snapshot[0]).not.toBe(snapshot[1]);

    restoreSkippedViews(snapshot);

    await act(async () => {
      renderer!.unmount();
    });

    expect(hideRegisteredSkipViews()).toHaveLength(0);
  });
});
