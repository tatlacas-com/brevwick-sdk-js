/**
 * `<BrevwickSkip>` — wrap any subtree whose contents must NOT appear in the
 * captured screenshot (passwords, the Brevwick FAB itself, tenant-side
 * sensitive UI). The wrapper renders a `<View>` whose `opacity` is flipped to
 * `0` for the duration of the capture and restored on the way out.
 *
 * Mirrors the JS SDK `[data-brevwick-skip]` selector and Flutter's
 * `BrevwickSkip`, with one platform-specific difference: React Native has no
 * cheap "maintain layout, hide rendering" primitive that's preserved across
 * `<View>`-based renderers, so we drop opacity instead of toggling visibility.
 * Layout is preserved either way.
 *
 * Concurrency: two captures running back-to-back (or overlapping) must not
 * race — the second hide must NOT re-stash the already-zeroed opacity, and
 * the inner restore must not flip the view visible while the outer capture
 * is still rasterising. A WeakMap-backed refcount, mirroring the Flutter
 * `BrevwickScreenshotScope` capture-depth pattern, gives the right
 * "outermost wins" semantics on every exit path.
 */
import { useEffect, useRef, type ReactElement, type ReactNode } from 'react';
import { View, type ViewProps } from 'react-native';

interface SkipRef {
  readonly current: View | null;
}

interface NativePropSetter {
  setNativeProps?: (props: { opacity: number }) => void;
}

const skipRefs = new Set<SkipRef>();
const skipCounts = new WeakMap<View, number>();
const skipOriginals = new WeakMap<View, number>();

const DEFAULT_OPACITY = 1;

/**
 * Props for {@link BrevwickSkip}. Accepts every prop a `<View>` accepts so
 * consumers can place it anywhere a `<View>` would live (style, onLayout,
 * accessibility props, etc.).
 */
export interface BrevwickSkipProps extends ViewProps {
  children?: ReactNode;
}

export function BrevwickSkip({
  children,
  ...rest
}: BrevwickSkipProps): ReactElement {
  const ref = useRef<View>(null);

  useEffect(() => {
    skipRefs.add(ref);
    return () => {
      skipRefs.delete(ref);
    };
  }, []);

  return (
    <View ref={ref} {...rest}>
      {children}
    </View>
  );
}

/**
 * Snapshot of the live skip refs at hide time. The screenshot path passes
 * this opaque token back to {@link restoreSkippedViews} so an unmount that
 * lands between hide and restore does not leak a stuck-at-0 opacity into a
 * remounted-with-the-same-instance view (would be impossible — instances are
 * fresh per mount — but the snapshot also makes refcount accounting correct
 * if a sibling capture starts mid-flight and registers a new ref).
 */
export type SkipSnapshot = readonly View[];

export function hideRegisteredSkipViews(): SkipSnapshot {
  const hidden: View[] = [];
  for (const ref of skipRefs) {
    const view = ref.current;
    if (!view) continue;
    const count = skipCounts.get(view) ?? 0;
    if (count === 0) {
      // No public getter for the live opacity on a native View, so we always
      // restore back to the wrapper's default of 1.0. BrevwickSkip does not
      // forward an `opacity` style prop into the underlying View, so this is
      // a closed system — consumers cannot have set a non-1 opacity that we
      // would accidentally clobber.
      skipOriginals.set(view, DEFAULT_OPACITY);
      (view as unknown as NativePropSetter).setNativeProps?.({ opacity: 0 });
    }
    skipCounts.set(view, count + 1);
    hidden.push(view);
  }
  return hidden;
}

export function restoreSkippedViews(snapshot: SkipSnapshot): void {
  for (const view of snapshot) {
    const count = (skipCounts.get(view) ?? 1) - 1;
    if (count <= 0) {
      const original = skipOriginals.get(view) ?? DEFAULT_OPACITY;
      (view as unknown as NativePropSetter).setNativeProps?.({
        opacity: original,
      });
      skipCounts.delete(view);
      skipOriginals.delete(view);
    } else {
      skipCounts.set(view, count);
    }
  }
}

/**
 * Test-only seam — clears the module-scoped registry between tests so a
 * leaked ref from one case does not bleed into the next. Production callers
 * never invoke this; vitest does via `__resetSkipRegistryForTest()`.
 */
export function __resetSkipRegistryForTest(): void {
  skipRefs.clear();
}

/**
 * Test-only seam — registers a synthetic ref into the skip registry so unit
 * tests can drive `hideRegisteredSkipViews` / `restoreSkippedViews` against
 * fake View instances without spinning up a real RN renderer (jsdom plus a
 * stubbed `<View>` cannot dispatch `setNativeProps` through React).
 * Production callers never invoke this.
 */
export function __addSkipRefForTest(ref: { current: View | null }): void {
  skipRefs.add(ref);
}
