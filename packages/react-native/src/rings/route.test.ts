import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  attachRouteRing,
  redactPathParams,
  type NavigationRefLike,
  type RouteRingEntry,
} from './route';

interface MockRoute {
  name: string;
  params?: Record<string, unknown>;
}

/**
 * Mirrors the slice of `NavigationContainerRef` we exercise: an
 * `addListener('state', cb)` returning an unsubscribe function plus a
 * `getCurrentRoute()` that returns whatever the test scripts. Lets us
 * fire `'state'` without spinning up React Navigation.
 */
function createMockNavigationRef(
  initialRoute: MockRoute | undefined = undefined,
): {
  ref: NavigationRefLike;
  fireState: () => void;
  setRoute: (route: MockRoute | undefined) => void;
  unsubscribe: ReturnType<typeof vi.fn>;
  addListener: ReturnType<typeof vi.fn>;
} {
  let route: MockRoute | undefined = initialRoute;
  const listeners = new Set<() => void>();
  const unsubscribe = vi.fn(() => {
    /* set per addListener call */
  });
  const addListener = vi.fn((event: string, cb: () => void) => {
    expect(event).toBe('state');
    listeners.add(cb);
    return () => {
      listeners.delete(cb);
      unsubscribe();
    };
  });
  const ref: NavigationRefLike = {
    current: {
      addListener:
        addListener as unknown as NavigationRefLike['current'] extends infer C
          ? C extends { addListener: infer A }
            ? A
            : never
          : never,
      getCurrentRoute: () => route,
    },
  };
  return {
    ref,
    fireState: () => {
      for (const cb of listeners) cb();
    },
    setRoute: (next) => {
      route = next;
    },
    unsubscribe,
    addListener,
  };
}

describe('attachRouteRing', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-02T12:00:00Z'));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('pushes a redacted entry on each navigation state change', () => {
    const mock = createMockNavigationRef({ name: 'Home' });
    const push = vi.fn<(entry: RouteRingEntry) => void>();
    attachRouteRing(mock.ref, push);

    mock.fireState();
    mock.setRoute({ name: 'Details' });
    mock.fireState();

    expect(push).toHaveBeenCalledTimes(2);
    expect(push).toHaveBeenNthCalledWith(1, {
      path: 'Home',
      timestamp: Date.parse('2026-05-02T12:00:00Z'),
    });
    expect(push).toHaveBeenNthCalledWith(2, {
      path: 'Details',
      timestamp: Date.parse('2026-05-02T12:00:00Z'),
    });
  });

  it('redacts sensitive param keys (token / auth / key / session / sig)', () => {
    const mock = createMockNavigationRef({
      name: 'Reset',
      params: {
        token: 'eyJabc.def.ghi',
        authState: 'in-progress',
        sessionId: 'abc-123',
        signal: 'noisy',
        keyring: 'main',
        id: 42,
      },
    });
    const push = vi.fn<(entry: RouteRingEntry) => void>();
    attachRouteRing(mock.ref, push);

    mock.fireState();

    expect(push).toHaveBeenCalledTimes(1);
    const entry = push.mock.calls[0]![0];
    expect(entry.path).toContain('Reset?');
    expect(entry.path).toContain('token=[redacted]');
    expect(entry.path).toContain('authState=[redacted]');
    expect(entry.path).toContain('sessionId=[redacted]');
    expect(entry.path).toContain('signal=[redacted]');
    expect(entry.path).toContain('keyring=[redacted]');
    expect(entry.path).toContain('id=42');
    expect(entry.path).not.toContain('eyJabc');
    expect(entry.path).not.toContain('abc-123');
  });

  it('redacts named-placeholder path segments while preserving shape', () => {
    expect(redactPathParams('/orders/:id/auth/:token')).toBe(
      '/orders/:id/auth/:token:[redacted]',
    );
    expect(redactPathParams('/u/:Session/edit')).toBe(
      '/u/:Session:[redacted]/edit',
    );
    expect(redactPathParams('Home')).toBe('Home');
  });

  it('caps the ring at 20 entries (FIFO via core buffer contract)', () => {
    // Inline 20-cap FIFO to model the core ring buffer's behaviour without
    // reaching into `@tatlacas/brevwick-sdk` internals; this proves the
    // attach contract — N pushes drop the oldest (N - cap) entries — which
    // is what the SDK's `RingBuffer<RouteEntry>(20)` will do in production.
    const cap = 20;
    const ring: RouteRingEntry[] = [];
    const push = (entry: RouteRingEntry): void => {
      ring.push(entry);
      while (ring.length > cap) ring.shift();
    };
    const mock = createMockNavigationRef({ name: 'Screen0' });
    attachRouteRing(mock.ref, push);

    for (let i = 0; i < 21; i++) {
      mock.setRoute({ name: `Screen${i}` });
      mock.fireState();
    }

    expect(ring).toHaveLength(20);
    expect(ring[0]?.path).toBe('Screen1');
    expect(ring[ring.length - 1]?.path).toBe('Screen20');
  });

  it('returns an unsubscribe that detaches the listener', () => {
    const mock = createMockNavigationRef({ name: 'Home' });
    const push = vi.fn<(entry: RouteRingEntry) => void>();
    const detach = attachRouteRing(mock.ref, push);

    mock.fireState();
    detach();
    mock.setRoute({ name: 'Details' });
    mock.fireState();

    expect(push).toHaveBeenCalledTimes(1);
    expect(mock.unsubscribe).toHaveBeenCalledTimes(1);
  });

  it('is a no-op when navigationRef is missing or has no current', () => {
    const push = vi.fn<(entry: RouteRingEntry) => void>();

    expect(() => attachRouteRing(undefined, push)()).not.toThrow();
    expect(() => attachRouteRing(null, push)()).not.toThrow();
    expect(() => attachRouteRing({ current: null }, push)()).not.toThrow();
    expect(push).not.toHaveBeenCalled();
  });

  it('skips a fire when getCurrentRoute returns undefined', () => {
    const mock = createMockNavigationRef(undefined);
    const push = vi.fn<(entry: RouteRingEntry) => void>();
    attachRouteRing(mock.ref, push);

    mock.fireState();

    expect(push).not.toHaveBeenCalled();
  });
});
