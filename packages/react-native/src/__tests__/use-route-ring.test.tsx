// Same `/pure` rationale as `provider.test.tsx`: the route-ring tests
// inspect listener registration, not visual output, so we skip the
// auto-extended matchers / cleanup.
import { render } from '@testing-library/react-native/pure';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ReactElement, ReactNode } from 'react';
import type {
  Brevwick,
  BrevwickConfig,
  RouteEntry,
} from '@tatlacas/brevwick-sdk';

const install = vi.fn();
const uninstall = vi.fn();
const submit = vi.fn();
const captureScreenshot = vi.fn();
const createBrevwick = vi.fn<(config: BrevwickConfig) => Brevwick>();

vi.mock('@tatlacas/brevwick-sdk', async () => {
  const actual = await vi.importActual<typeof import('@tatlacas/brevwick-sdk')>(
    '@tatlacas/brevwick-sdk',
  );
  return {
    ...actual,
    createBrevwick: (config: BrevwickConfig) => createBrevwick(config),
  };
});

import { BrevwickProvider } from '../provider';
import { useRouteRing } from '../use-route-ring';
import type { BrevwickNavigationRef } from '../navigation-ref-context';

const stampInternal = (
  base: Partial<Brevwick>,
  push: (entry: RouteEntry) => void,
): Brevwick =>
  ({
    install,
    uninstall,
    submit,
    captureScreenshot,
    ...base,
    _internal: { push },
  }) as unknown as Brevwick;

const noInternalInstance = (): Brevwick =>
  ({ install, uninstall, submit, captureScreenshot }) as unknown as Brevwick;

// `addListener` is structurally `(event: 'state', cb: (...args: any[]) =>
// void) => () => void`. Returning the typed signature directly from
// `vi.fn<>()` lets the captured-call sites read the args without per-test
// `.mock.calls[0]?.[0]` index assertions tripping noUncheckedIndexedAccess.
type AddListener = (
  event: 'state',
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  cb: (...args: any[]) => void,
) => () => void;

const Wrap = ({
  children,
  navigationRef,
}: {
  children: ReactNode;
  navigationRef?: BrevwickNavigationRef;
}): ReactElement => (
  <BrevwickProvider
    config={{ projectKey: 'pk_test_useRouteRingTests0000' }}
    navigationRef={navigationRef}
  >
    {children}
  </BrevwickProvider>
);

const Bridge = (): null => {
  useRouteRing();
  return null;
};

const ExplicitBridge = ({
  navigationRef,
}: {
  navigationRef: BrevwickNavigationRef;
}): null => {
  useRouteRing(navigationRef);
  return null;
};

afterEach(() => {
  vi.clearAllMocks();
});

describe('useRouteRing', () => {
  it('registers a `state` listener via the navigationRef forwarded by the provider', () => {
    const detach = vi.fn();
    const addListener = vi.fn<AddListener>(() => detach);
    const push = vi.fn();
    createBrevwick.mockReturnValueOnce(stampInternal({}, push));

    const navigationRef: BrevwickNavigationRef = {
      current: {
        addListener,
        getCurrentRoute: () => ({ name: 'Home' }),
      },
    };

    const { unmount } = render(
      <Wrap navigationRef={navigationRef}>
        <Bridge />
      </Wrap>,
    );

    expect(addListener).toHaveBeenCalledTimes(1);
    const [event, cb] = addListener.mock.calls[0] ?? ['state', () => {}];
    expect(event).toBe('state');

    // Firing the captured listener should funnel a RouteEntry into push.
    cb();
    expect(push).toHaveBeenCalledTimes(1);
    const entry = push.mock.calls[0]?.[0] as RouteEntry;
    expect(entry.kind).toBe('route');
    expect(entry.path).toBe('Home');

    unmount();
    expect(detach).toHaveBeenCalledTimes(1);
  });

  it('is a no-op when no navigationRef is forwarded by the provider', () => {
    createBrevwick.mockReturnValueOnce(stampInternal({}, vi.fn()));
    // No `navigationRef` prop on the wrapper — the hook must not crash and
    // must not leak any side effects when the provider's slot is empty.
    expect(() =>
      render(
        <Wrap>
          <Bridge />
        </Wrap>,
      ),
    ).not.toThrow();
  });

  it('is a no-op when the Brevwick instance does not expose `_internal.push`', () => {
    // Real `createBrevwick(...)` always stamps `_internal`; this branch
    // covers consumer-supplied mocks that do not. Without the guard the
    // hook would call `attachRouteRing(ref, undefined)` and crash on the
    // first navigation event.
    const addListener = vi.fn<AddListener>(() => () => {});
    createBrevwick.mockReturnValueOnce(noInternalInstance());

    const navigationRef: BrevwickNavigationRef = {
      current: {
        addListener,
        getCurrentRoute: () => ({ name: 'Home' }),
      },
    };

    render(
      <Wrap navigationRef={navigationRef}>
        <Bridge />
      </Wrap>,
    );

    expect(addListener).not.toHaveBeenCalled();
  });

  it('accepts an explicit navigationRef argument that overrides context', () => {
    const detach = vi.fn();
    const addListener = vi.fn<AddListener>(() => detach);
    createBrevwick.mockReturnValueOnce(stampInternal({}, vi.fn()));

    const navigationRef: BrevwickNavigationRef = {
      current: {
        addListener,
        getCurrentRoute: () => ({ name: 'Details' }),
      },
    };

    render(
      <Wrap>
        <ExplicitBridge navigationRef={navigationRef} />
      </Wrap>,
    );

    expect(addListener).toHaveBeenCalledTimes(1);
    const [event] = addListener.mock.calls[0] ?? ['state', () => {}];
    expect(event).toBe('state');
  });
});
