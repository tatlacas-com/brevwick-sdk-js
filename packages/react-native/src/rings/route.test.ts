import type { RouteEntry } from '@tatlacas/brevwick-sdk';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  attachRouteRing,
  redactPathParams,
  type NavigationContainerRefLike,
  type NavigationRefLike,
} from './route';

interface MockRoute {
  name: string;
  params?: Record<string, unknown>;
}

interface MockNav {
  ref: NavigationRefLike;
  fireState: () => void;
  setRoute: (route: MockRoute | undefined) => void;
  unsubscribe: ReturnType<typeof vi.fn>;
  addListener: ReturnType<typeof vi.fn>;
}

/**
 * Mirrors the slice of `NavigationContainerRef` we exercise: an
 * `addListener('state', cb)` returning an unsubscribe function plus a
 * `getCurrentRoute()` that returns whatever the test scripts. Lets us
 * fire `'state'` without spinning up React Navigation.
 *
 * `addListenerOverride` lets a test substitute a stub that returns
 * something other than a function, exercising the defensive guard in
 * `attachRouteRing`.
 */
function createMockNavigationRef(
  initialRoute: MockRoute | undefined = undefined,
  addListenerOverride?: NavigationContainerRefLike['addListener'],
): MockNav {
  let route: MockRoute | undefined = initialRoute;
  const listeners = new Set<() => void>();
  const unsubscribe = vi.fn(() => {
    /* asserted in detach tests */
  });
  const addListener = vi.fn(((event: string, cb: () => void) => {
    expect(event).toBe('state');
    listeners.add(cb);
    return () => {
      listeners.delete(cb);
      unsubscribe();
    };
  }) as NavigationContainerRefLike['addListener']);
  const ref: NavigationRefLike = {
    current: {
      addListener: addListenerOverride ?? addListener,
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
    const push = vi.fn<(entry: RouteEntry) => void>();
    attachRouteRing(mock.ref, push);

    mock.fireState();
    mock.setRoute({ name: 'Details' });
    mock.fireState();

    expect(push).toHaveBeenCalledTimes(2);
    expect(push).toHaveBeenNthCalledWith(1, {
      kind: 'route',
      path: 'Home',
      timestamp: Date.parse('2026-05-02T12:00:00Z'),
    });
    expect(push).toHaveBeenNthCalledWith(2, {
      kind: 'route',
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
    const push = vi.fn<(entry: RouteEntry) => void>();
    attachRouteRing(mock.ref, push);

    mock.fireState();

    expect(push).toHaveBeenCalledTimes(1);
    const entry = push.mock.calls[0]![0];
    expect(entry.kind).toBe('route');
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

  it('runs the global redactor over benign-keyed param values (JWT / email / IP)', () => {
    const mock = createMockNavigationRef({
      name: 'Invoice',
      params: {
        invoiceId:
          'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NSJ9.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c',
        ref: 'user@example.com',
        peer: '10.0.42.55',
      },
    });
    const push = vi.fn<(entry: RouteEntry) => void>();
    attachRouteRing(mock.ref, push);

    mock.fireState();

    const entry = push.mock.calls[0]![0];
    // The keys themselves are benign — they survive (key-name redaction
    // does not flag them). The VALUES go through `redact()` so the JWT,
    // email, and IP are masked anyway. This is the redaction-mandatory
    // contract — without the global sweep, these values would ship raw.
    expect(entry.path).toContain('invoiceId=');
    expect(entry.path).toContain('ref=');
    expect(entry.path).toContain('peer=');
    expect(entry.path).not.toContain('eyJhbGciOiJIUzI1NiJ9');
    expect(entry.path).not.toContain('user%40example.com');
    expect(entry.path).not.toContain('user@example.com');
    expect(entry.path).not.toContain('10.0.42.55');
    // The redactor's substitution markers (URL-encoded `[…]` → `%5B…%5D`,
    // since redaction runs BEFORE encoding) should be visible somewhere
    // in the serialised path — proves the sweep ran rather than
    // coincidentally failing to find the literals.
    expect(entry.path).toMatch(/%5Bjwt%5D|%5Bemail%5D|%5Bip%5D/);
  });

  it('redacts named-placeholder path segments while preserving shape', () => {
    expect(redactPathParams('/orders/:id/auth/:token')).toBe(
      '/orders/%3Aid/auth/%3Atoken:[redacted]',
    );
    expect(redactPathParams('/u/:Session/edit')).toBe(
      '/u/%3ASession:[redacted]/edit',
    );
    expect(redactPathParams('Home')).toBe('Home');
  });

  it('URL-encodes route names, keys, and values so separators cannot collide', () => {
    // Route name with a `?` would have collided with the query separator
    // pre-fix and produced `Search??q=foo`.
    const path = redactPathParams('Search?', { q: 'foo & bar=baz' });
    expect(path.startsWith('Search%3F')).toBe(true);
    expect(path).toContain('q=foo%20%26%20bar%3Dbaz');
  });

  it('serialises object params via JSON.stringify', () => {
    const path = redactPathParams('Profile', {
      meta: { foo: 'bar', n: 1 },
    });
    // `{` / `}` / `"` / `:` are URL-encoded in the value. The structural
    // shape is still recoverable on the triage side.
    expect(path).toBe(
      `Profile?meta=${encodeURIComponent('{"foo":"bar","n":1}')}`,
    );
  });

  it('falls back to [unserializable] for circular-reference values', () => {
    interface Node {
      self?: Node;
    }
    const a: Node = {};
    a.self = a;
    const path = redactPathParams('Cycle', { x: a });
    expect(path).toBe(`Cycle?x=${encodeURIComponent('[unserializable]')}`);
  });

  it('falls back to [unserializable] when JSON.stringify returns undefined', () => {
    // JSON.stringify(undefined) and JSON.stringify(() => {}) both return
    // the string undefined → the JS value `undefined`. Without the
    // explicit fallback in stringifyParam, this would emit `key=` —
    // indistinguishable from `params: { key: '' }`.
    const path = redactPathParams('Fn', { handler: () => undefined });
    expect(path).toBe(`Fn?handler=${encodeURIComponent('[unserializable]')}`);
  });

  it('sorts param keys alphabetically for stable triage paths', () => {
    const a = redactPathParams('S', { z: 1, a: 2, m: 3 });
    const b = redactPathParams('S', { m: 3, a: 2, z: 1 });
    expect(a).toBe(b);
    expect(a).toBe('S?a=2&m=3&z=1');
  });

  it('caps the ring at 20 entries (FIFO via core buffer contract)', () => {
    // Inline 20-cap FIFO models the core ring buffer's behaviour without
    // reaching into `@tatlacas/brevwick-sdk` internals; this proves the
    // attach contract — N pushes drop the oldest (N - cap) entries — which
    // is what the SDK's `RingBuffer<RouteEntry>(20)` does in production.
    // (`createRingBuffer` is intentionally not on the public surface, so
    // wiring up a real Brevwick instance for this assertion would mean
    // exercising `createBrevwick` end-to-end — that integration coverage
    // lands with #83's provider once the bus accessor is stable.)
    const cap = 20;
    const ring: RouteEntry[] = [];
    const push = (entry: RouteEntry): void => {
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
    const push = vi.fn<(entry: RouteEntry) => void>();
    const detach = attachRouteRing(mock.ref, push);

    mock.fireState();
    detach();
    mock.setRoute({ name: 'Details' });
    mock.fireState();

    expect(push).toHaveBeenCalledTimes(1);
    expect(mock.unsubscribe).toHaveBeenCalledTimes(1);
  });

  it('detach() is idempotent — second call is a no-op', () => {
    const mock = createMockNavigationRef({ name: 'Home' });
    const push = vi.fn<(entry: RouteEntry) => void>();
    const detach = attachRouteRing(mock.ref, push);

    detach();
    detach();
    detach();

    expect(mock.unsubscribe).toHaveBeenCalledTimes(1);
  });

  it('treats a non-function unsubscribe as a no-op without throwing', () => {
    // Off-spec stubs (and some lazy-mounted shims) return undefined from
    // addListener. The defensive guard in attachRouteRing must swallow
    // this so cleanup in a useEffect never crashes the provider.
    const offSpecAddListener = vi.fn(((event: string, _cb: () => void) => {
      expect(event).toBe('state');
      // Off-spec: no unsubscribe returned.
      return undefined as unknown as () => void;
    }) as NavigationContainerRefLike['addListener']);
    const mock = createMockNavigationRef({ name: 'Home' }, offSpecAddListener);
    const push = vi.fn<(entry: RouteEntry) => void>();
    const detach = attachRouteRing(mock.ref, push);

    expect(() => detach()).not.toThrow();
  });

  it('is a no-op when navigationRef is missing or has no current', () => {
    const push = vi.fn<(entry: RouteEntry) => void>();

    expect(() => attachRouteRing(undefined, push)()).not.toThrow();
    expect(() => attachRouteRing(null, push)()).not.toThrow();
    expect(() => attachRouteRing({ current: null }, push)()).not.toThrow();
    expect(push).not.toHaveBeenCalled();
  });

  it('skips a fire when getCurrentRoute returns undefined', () => {
    const mock = createMockNavigationRef(undefined);
    const push = vi.fn<(entry: RouteEntry) => void>();
    attachRouteRing(mock.ref, push);

    mock.fireState();

    expect(push).not.toHaveBeenCalled();
  });
});
