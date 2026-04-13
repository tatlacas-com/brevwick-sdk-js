import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  __registerRing,
  __resetBrevwickRegistry,
  __resetRingRegistry,
  createBrevwick,
} from '../client';
import type { BrevwickInternal, RingDefinition } from '../internal';
import type { RingEntry } from '../../types';

const KEY_A = 'pk_test_aaaaaaaaaaaaaaaa01';
const KEY_B = 'pk_test_bbbbbbbbbbbbbbbb02';

function getInternal(instance: unknown): BrevwickInternal {
  return (instance as { _internal: BrevwickInternal })._internal;
}

beforeEach(() => {
  __resetBrevwickRegistry();
  __resetRingRegistry();
});

afterEach(() => {
  __resetBrevwickRegistry();
  __resetRingRegistry();
});

describe('createBrevwick', () => {
  it('returns an instance with the frozen public surface', () => {
    const instance = createBrevwick({ projectKey: KEY_A });
    expect(typeof instance.install).toBe('function');
    expect(typeof instance.uninstall).toBe('function');
    expect(typeof instance.submit).toBe('function');
    expect(typeof instance.captureScreenshot).toBe('function');
    expect(Object.keys(instance)).not.toContain('_internal');
  });

  it('throws BREVWICK_INVALID_CONFIG for invalid input', () => {
    expect(() => createBrevwick({ projectKey: 'nope' })).toThrowError(
      expect.objectContaining({ code: 'BREVWICK_INVALID_CONFIG' }),
    );
  });

  it('returns the same instance for identical projectKey+endpoint', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const a = createBrevwick({ projectKey: KEY_A });
    const b = createBrevwick({ projectKey: KEY_A });
    expect(b).toBe(a);
    expect(warn).toHaveBeenCalled();
    // Warning must log only a prefix, never the full key suffix.
    const args = warn.mock.calls[0]?.[0] as string;
    expect(args).toContain('pk_test_aaaa');
    expect(args).not.toContain(KEY_A);
    warn.mockRestore();
  });

  it('returns distinct instances when endpoint differs', () => {
    const a = createBrevwick({ projectKey: KEY_A });
    const b = createBrevwick({
      projectKey: KEY_A,
      endpoint: 'https://eu.brevwick.com',
    });
    expect(b).not.toBe(a);
  });

  it('keys singletons by projectKey', () => {
    const a = createBrevwick({ projectKey: KEY_A });
    const b = createBrevwick({ projectKey: KEY_B });
    expect(b).not.toBe(a);
  });
});

describe('install / uninstall', () => {
  it('snapshot: uninstall restores every global a ring patched during install', () => {
    // Fake console ring: patches `console.error` on install, restores it on teardown.
    const originalError = console.error;
    const ring: RingDefinition = {
      name: 'console',
      install: () => {
        console.error = (() => undefined) as typeof console.error;
        return () => {
          console.error = originalError;
        };
      },
    };
    __registerRing(ring);

    const instance = createBrevwick({ projectKey: KEY_A });
    const before = console.error;

    instance.install();
    expect(console.error).not.toBe(before);
    // Double install is a no-op.
    instance.install();

    instance.uninstall();
    // Double uninstall is a no-op — second call after uninstall stays safe.
    instance.uninstall();
    expect(console.error).toBe(before);
  });

  it('no-ops when window is undefined (SSR / worker)', () => {
    const stash = (globalThis as { window?: unknown }).window;
    vi.stubGlobal('window', undefined);
    try {
      const instance = createBrevwick({ projectKey: KEY_A });
      expect(() => instance.install()).not.toThrow();
    } finally {
      vi.stubGlobal('window', stash);
    }
  });

  it('disabled instance: install + uninstall are no-ops and leave state idle', () => {
    const instance = createBrevwick({ projectKey: KEY_A, enabled: false });
    const internal = getInternal(instance);
    expect(() => {
      instance.install();
      instance.uninstall();
    }).not.toThrow();
    // Critical: disabled must never flip to `uninstalled` — otherwise a later
    // install() on the same instance would be rejected as terminal.
    expect(internal.state()).toBe('idle');
  });

  it('runs registered rings in order and tears them down in reverse', () => {
    const events: string[] = [];
    const mkRing = (name: 'console' | 'network' | 'route'): RingDefinition => ({
      name,
      install: () => {
        events.push(`install:${name}`);
        return () => events.push(`teardown:${name}`);
      },
    });
    __registerRing(mkRing('console'));
    __registerRing(mkRing('network'));
    __registerRing(mkRing('route'));

    const instance = createBrevwick({ projectKey: KEY_A });
    instance.install();
    instance.uninstall();

    expect(events).toEqual([
      'install:console',
      'install:network',
      'install:route',
      'teardown:route',
      'teardown:network',
      'teardown:console',
    ]);
  });

  it('skips rings whose config flag is false', () => {
    const installed: string[] = [];
    __registerRing({
      name: 'console',
      install: () => {
        installed.push('console');
        return () => undefined;
      },
    });
    __registerRing({
      name: 'network',
      install: () => {
        installed.push('network');
        return () => undefined;
      },
    });

    const instance = createBrevwick({
      projectKey: KEY_A,
      rings: { network: false },
    });
    instance.install();
    instance.uninstall();
    expect(installed).toEqual(['console']);
  });

  it('ring teardown errors do not block sibling teardowns', () => {
    const torn: string[] = [];
    __registerRing({
      name: 'console',
      install: () => () => torn.push('console'),
    });
    __registerRing({
      name: 'network',
      install: () => () => {
        throw new Error('boom');
      },
    });
    __registerRing({
      name: 'route',
      install: () => () => torn.push('route'),
    });

    const instance = createBrevwick({ projectKey: KEY_A });
    instance.install();
    expect(() => instance.uninstall()).not.toThrow();
    // Route tears down before network (reverse order); console still fires after the throw.
    expect(torn).toEqual(['route', 'console']);
  });

  it('install() after uninstall() throws — the instance is terminal', () => {
    const instance = createBrevwick({ projectKey: KEY_A });
    instance.install();
    instance.uninstall();
    expect(() => instance.install()).toThrowError(
      /cannot be called after uninstall/,
    );
  });

  it('__registerRing is idempotent for duplicate names (HMR / test re-import safe)', () => {
    const installs: string[] = [];
    const mk = (tag: string): RingDefinition => ({
      name: 'console',
      install: () => {
        installs.push(tag);
        return () => undefined;
      },
    });
    __registerRing(mk('first'));
    __registerRing(mk('second')); // same name, must be skipped

    const instance = createBrevwick({ projectKey: KEY_A });
    instance.install();
    expect(installs).toEqual(['first']);
  });
});

describe('stub public methods', () => {
  it('submit() returns a rejecting Promise (no sync throw)', async () => {
    const instance = createBrevwick({ projectKey: KEY_A });
    const caught = vi.fn();
    // Sync throw would bypass .catch — this test guards against that regression.
    const p = instance.submit({ description: 'x' });
    expect(p).toBeInstanceOf(Promise);
    await p.catch(caught);
    expect(caught).toHaveBeenCalledTimes(1);
    await expect(instance.submit({ description: 'x' })).rejects.toThrow(
      /not yet implemented/,
    );
  });

  it('captureScreenshot() returns a rejecting Promise (no sync throw)', async () => {
    const instance = createBrevwick({ projectKey: KEY_A });
    const caught = vi.fn();
    const p = instance.captureScreenshot();
    expect(p).toBeInstanceOf(Promise);
    await p.catch(caught);
    expect(caught).toHaveBeenCalledTimes(1);
    await expect(instance.captureScreenshot()).rejects.toThrow(
      /not yet implemented/,
    );
  });
});

describe('_internal ring buffers', () => {
  it('pushes entries into the correct bounded buffer', () => {
    const instance = createBrevwick({ projectKey: KEY_A });
    const internal = getInternal(instance);

    for (let i = 0; i < 60; i++) {
      internal.push({
        kind: 'console',
        level: 'error',
        message: `msg ${i}`,
        timestamp: i,
      });
    }
    const snap = internal.buffers.console.snapshot();
    expect(snap).toHaveLength(50);
    expect(snap[0]).toMatchObject({ message: 'msg 10' });

    internal.push({
      kind: 'route',
      path: '/home',
      timestamp: 1,
    });
    expect(internal.buffers.route.snapshot()).toHaveLength(1);
    expect(internal.buffers.network.snapshot()).toHaveLength(0);
  });

  it('emits entry events through the internal bus', () => {
    const instance = createBrevwick({ projectKey: KEY_A });
    const internal = getInternal(instance);
    const seen: RingEntry[] = [];
    internal.bus.on('entry', (e) => seen.push(e));
    internal.push({
      kind: 'network',
      method: 'GET',
      url: 'https://x/y',
      status: 500,
      timestamp: 1,
    });
    expect(seen).toHaveLength(1);
    expect(seen[0]?.kind).toBe('network');
  });

  it('_internal is present but non-enumerable', () => {
    const instance = createBrevwick({ projectKey: KEY_A });
    expect(
      Object.prototype.propertyIsEnumerable.call(instance, '_internal'),
    ).toBe(false);
    const descriptor = Object.getOwnPropertyDescriptor(instance, '_internal');
    expect(descriptor).toBeDefined();
    expect(descriptor?.writable).toBe(false);
  });
});
