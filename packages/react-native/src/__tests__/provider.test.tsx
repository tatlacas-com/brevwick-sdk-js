// Use the `/pure` entry to skip RNTL's automatic `expect.extend(matchers)`
// and `afterEach(cleanup)` registration: the provider tests cover state
// transitions, not visual matchers, and Vitest's `expect` global is not
// available at module-load time when the auto-register would run.
import { render, renderHook } from '@testing-library/react-native/pure';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import type { Brevwick, BrevwickConfig } from '@tatlacas/brevwick-sdk';

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
import { useBrevwick } from '../context';
import { useBrevwickNavigationRef } from '../navigation-ref-context';

const makeInstance = (): Brevwick =>
  ({
    install,
    uninstall,
    submit,
    captureScreenshot,
  }) as unknown as Brevwick;

// Inert child for renders that only need a tree to mount; the provider
// renders context — there's no DOM/RN host element under test here.
const InertChild = (): null => null;

afterEach(() => {
  vi.clearAllMocks();
});

describe('BrevwickProvider', () => {
  it('calls createBrevwick + install on mount, uninstall on unmount', () => {
    createBrevwick.mockReturnValueOnce(makeInstance());
    const { unmount } = render(
      <BrevwickProvider config={{ projectKey: 'pk_test_provider' }}>
        <InertChild />
      </BrevwickProvider>,
    );
    expect(createBrevwick).toHaveBeenCalledTimes(1);
    expect(install).toHaveBeenCalledTimes(1);
    expect(uninstall).not.toHaveBeenCalled();

    unmount();
    expect(uninstall).toHaveBeenCalledTimes(1);
  });

  it('reuses the same instance while config identity is stable', () => {
    createBrevwick.mockReturnValue(makeInstance());
    const config: BrevwickConfig = { projectKey: 'pk_test_stable' };
    const { rerender } = render(
      <BrevwickProvider config={config}>
        <InertChild />
      </BrevwickProvider>,
    );
    rerender(
      <BrevwickProvider config={config}>
        <InertChild />
      </BrevwickProvider>,
    );
    expect(createBrevwick).toHaveBeenCalledTimes(1);
    expect(install).toHaveBeenCalledTimes(1);
    expect(uninstall).not.toHaveBeenCalled();
  });

  it('re-creates the instance when a new config object is passed each render', () => {
    // Documents the memoisation contract: consumers MUST hoist `config` or
    // wrap it in `useMemo`. Passing a fresh object literal each render cycles
    // install/uninstall on every render.
    createBrevwick.mockImplementation(() => makeInstance());
    const { rerender } = render(
      <BrevwickProvider config={{ projectKey: 'pk_test_identity_a' }}>
        <InertChild />
      </BrevwickProvider>,
    );
    rerender(
      <BrevwickProvider config={{ projectKey: 'pk_test_identity_a' }}>
        <InertChild />
      </BrevwickProvider>,
    );
    rerender(
      <BrevwickProvider config={{ projectKey: 'pk_test_identity_a' }}>
        <InertChild />
      </BrevwickProvider>,
    );
    expect(createBrevwick).toHaveBeenCalledTimes(3);
    expect(install.mock.calls.length).toBeGreaterThanOrEqual(3);
    expect(uninstall.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it('exposes the installed instance to descendants via useBrevwick()', () => {
    const instance = makeInstance();
    createBrevwick.mockReturnValueOnce(instance);
    const wrapper = ({ children }: { children: ReactNode }) => (
      <BrevwickProvider config={{ projectKey: 'pk_test_probe' }}>
        {children}
      </BrevwickProvider>
    );
    const { result } = renderHook(() => useBrevwick(), { wrapper });
    expect(result.current).toBe(instance);
  });

  it('forwards the navigationRef to descendants via useBrevwickNavigationRef()', () => {
    // Proves the prop reaches the sibling context #87 reads — without
    // forcing the route ring to land first, the slot is visibly wired.
    createBrevwick.mockReturnValueOnce(makeInstance());
    const navigationRef = {
      current: {
        addListener: vi.fn(() => () => {}),
        getCurrentRoute: () => ({ name: 'Home' }),
      },
    };
    const wrapper = ({ children }: { children: ReactNode }) => (
      <BrevwickProvider
        config={{ projectKey: 'pk_test_nav' }}
        navigationRef={navigationRef}
      >
        {children}
      </BrevwickProvider>
    );
    const { result } = renderHook(() => useBrevwickNavigationRef(), {
      wrapper,
    });
    expect(result.current).toBe(navigationRef);
  });

  it('useBrevwickNavigationRef() returns null when the prop is omitted', () => {
    // Documents the no-op default: without the prop, descendants see `null`
    // and can branch on it — there is no install/subscribe side effect.
    createBrevwick.mockReturnValueOnce(makeInstance());
    const wrapper = ({ children }: { children: ReactNode }) => (
      <BrevwickProvider config={{ projectKey: 'pk_test_no_nav' }}>
        {children}
      </BrevwickProvider>
    );
    const { result } = renderHook(() => useBrevwickNavigationRef(), {
      wrapper,
    });
    expect(result.current).toBeNull();
  });

  it('useBrevwickNavigationRef() returns null outside any provider', () => {
    // Unlike `useBrevwick`, this hook does NOT throw — it is opt-in for the
    // route-ring consumer, and a missing provider is a valid configuration.
    const { result } = renderHook(() => useBrevwickNavigationRef());
    expect(result.current).toBeNull();
  });
});
