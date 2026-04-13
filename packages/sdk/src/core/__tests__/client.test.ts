import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { __resetBrevwickRegistry, createBrevwick } from '../client';
import type { RingEntry } from '../../types';

const KEY_A = 'pk_test_aaaaaaaaaaaaaaaa01';
const KEY_B = 'pk_test_bbbbbbbbbbbbbbbb02';

beforeEach(() => {
  __resetBrevwickRegistry();
});

afterEach(() => {
  __resetBrevwickRegistry();
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
  it('double install is safe and leaves globals untouched (no rings yet)', () => {
    const instance = createBrevwick({ projectKey: KEY_A });
    const beforeConsole = { ...window.console };
    const beforeFetch = window.fetch;
    const beforeOnError = window.onerror;

    instance.install();
    instance.install();

    expect({ ...window.console }).toEqual(beforeConsole);
    expect(window.fetch).toBe(beforeFetch);
    expect(window.onerror).toBe(beforeOnError);

    instance.uninstall();
    instance.uninstall();

    expect({ ...window.console }).toEqual(beforeConsole);
    expect(window.fetch).toBe(beforeFetch);
    expect(window.onerror).toBe(beforeOnError);
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

  it('no-ops when enabled=false', () => {
    const instance = createBrevwick({ projectKey: KEY_A, enabled: false });
    instance.install();
    instance.uninstall();
  });
});

describe('_internal ring buffers', () => {
  it('pushes entries into the correct bounded buffer', () => {
    const instance = createBrevwick({ projectKey: KEY_A }) as unknown as {
      _internal: {
        buffers: {
          console: { snapshot(): readonly RingEntry[] };
          network: { snapshot(): readonly RingEntry[] };
          route: { snapshot(): readonly RingEntry[] };
        };
        push(entry: RingEntry): void;
      };
    };

    for (let i = 0; i < 60; i++) {
      instance._internal.push({
        kind: 'console',
        level: 'error',
        message: `msg ${i}`,
        timestamp: i,
      });
    }
    const snap = instance._internal.buffers.console.snapshot();
    expect(snap).toHaveLength(50);
    expect(snap[0]).toMatchObject({ message: 'msg 10' });

    instance._internal.push({
      kind: 'route',
      path: '/home',
      timestamp: 1,
    });
    expect(instance._internal.buffers.route.snapshot()).toHaveLength(1);
    expect(instance._internal.buffers.network.snapshot()).toHaveLength(0);
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
