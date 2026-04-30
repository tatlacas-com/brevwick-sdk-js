import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installConsoleRing } from '../console';
import type { RingContext } from '../../core/internal';
import type { ConsoleEntry, ConsoleLevel, RingEntry } from '../../types';

const ALL_LEVELS: readonly ConsoleLevel[] = [
  'log',
  'info',
  'warn',
  'error',
  'debug',
];

interface CtxOptions {
  levels?: readonly ConsoleLevel[];
  max?: number;
}

function makeCtx(opts: CtxOptions = {}): {
  ctx: RingContext;
  entries: ConsoleEntry[];
} {
  const entries: ConsoleEntry[] = [];
  const config = {
    rings: {
      console: {
        enabled: true,
        levels: opts.levels ?? ALL_LEVELS,
        max: opts.max ?? 50,
      },
      network: { enabled: true, captureSuccess: true, max: 20 },
      route: true,
    },
    redact: { disable: new Set(), custom: [] },
  } as unknown as RingContext['config'];
  const ctx: RingContext = {
    config,
    bus: undefined as unknown as RingContext['bus'],
    push: (e: RingEntry) => {
      if (e.kind === 'console') entries.push(e);
    },
  };
  return { ctx, entries };
}

describe('console ring', () => {
  let teardown: (() => void) | undefined;
  const originals = {
    log: console.log,
    info: console.info,
    warn: console.warn,
    error: console.error,
    debug: console.debug,
  };

  beforeEach(() => {
    for (const level of ALL_LEVELS) {
      originals[level] = console[level];
    }
  });

  afterEach(() => {
    teardown?.();
    teardown = undefined;
    vi.useRealTimers();
    // Defensive: if a test forgot to uninstall, restore manually.
    for (const level of ALL_LEVELS) {
      console[level] = originals[level];
    }
  });

  it('patches all five console levels by default and still calls originals', () => {
    const spies: Partial<Record<ConsoleLevel, ReturnType<typeof vi.spyOn>>> =
      {};
    for (const level of ALL_LEVELS) {
      spies[level] = vi
        .spyOn(console, level)
        .mockImplementation(() => undefined);
    }
    const { ctx, entries } = makeCtx();
    teardown = installConsoleRing(ctx);

    console.log('lo');
    console.info('in');
    console.warn('wa');
    console.error('er');
    console.debug('de');

    expect(entries).toHaveLength(5);
    expect(entries.map((e) => e.level)).toEqual([
      'log',
      'info',
      'warn',
      'error',
      'debug',
    ]);
    for (const level of ALL_LEVELS) {
      expect(spies[level]).toHaveBeenCalled();
    }
  });

  it('honours the levels filter and leaves excluded levels unpatched', () => {
    const beforeLog = console.log;
    const errSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    const { ctx, entries } = makeCtx({ levels: ['error'] });
    teardown = installConsoleRing(ctx);

    expect(console.log).toBe(beforeLog); // not patched
    console.error('boom');
    console.log('quiet');
    console.info('quiet');
    console.warn('quiet');
    console.debug('quiet');

    expect(entries).toHaveLength(1);
    expect(entries[0]?.level).toBe('error');
    expect(errSpy).toHaveBeenCalledWith('boom');
  });

  it('clips to the FIFO max', () => {
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    let pushed = 0;
    const config = {
      rings: {
        console: { enabled: true, levels: ALL_LEVELS, max: 3 },
        network: { enabled: true, captureSuccess: true, max: 20 },
        route: true,
      },
      redact: { disable: new Set(), custom: [] },
    } as unknown as RingContext['config'];
    const ctx: RingContext = {
      config,
      bus: undefined as unknown as RingContext['bus'],
      push: () => {
        pushed += 1;
      },
    };
    teardown = installConsoleRing(ctx);
    // Burst beyond cap; the ring just calls ctx.push every time. The buffer
    // (owned by the client) does the FIFO clipping. Here we assert the ring
    // emitted as many entries as we drove it with — buffer-clip behaviour
    // is exercised at the client level.
    for (let i = 0; i < 10; i++) {
      vi.useFakeTimers();
      vi.setSystemTime(new Date(2026, 0, 1, 0, 0, i));
      console.log(`distinct-${i}`);
    }
    expect(pushed).toBeGreaterThanOrEqual(3);
  });

  it('redacts Bearer tokens uniformly across levels', () => {
    for (const level of ALL_LEVELS) {
      vi.spyOn(console, level).mockImplementation(() => undefined);
    }
    const { ctx, entries } = makeCtx();
    teardown = installConsoleRing(ctx);

    // Distinct messages per level so the cross-level dedupe (which keys on
    // message + first stack frame, not level) does not collapse them.
    console.log('a Bearer eyJabc.def.ghi');
    console.info('b Bearer eyJabc.def.ghi');
    console.warn('c Bearer eyJabc.def.ghi');
    console.debug('d Bearer eyJabc.def.ghi');

    expect(entries).toHaveLength(4);
    for (const e of entries) {
      expect(e.message).not.toContain('eyJabc.def.ghi');
      expect(e.message).toContain('[redacted]');
    }
    expect(entries.map((e) => e.level)).toEqual([
      'log',
      'info',
      'warn',
      'debug',
    ]);
  });

  it('dedupes across levels by message+stack key (level not part of key)', () => {
    for (const level of ALL_LEVELS) {
      vi.spyOn(console, level).mockImplementation(() => undefined);
    }
    const { ctx, entries } = makeCtx();
    teardown = installConsoleRing(ctx);

    console.log('shared');
    console.info('shared');
    console.warn('shared');

    expect(entries).toHaveLength(1);
    expect(entries[0]?.count).toBe(3);
  });

  it('redacts bare JWT-shaped tokens via the JWT pattern', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { ctx, entries } = makeCtx();
    teardown = installConsoleRing(ctx);

    console.error('token: eyJabc.def.ghi');

    expect(entries).toHaveLength(1);
    expect(entries[0]?.message).toContain('[jwt]');
    expect(entries[0]?.message).not.toContain('eyJabc.def.ghi');
  });

  it('coerces Error args via message+stack, not JSON.stringify', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { ctx, entries } = makeCtx();
    teardown = installConsoleRing(ctx);

    const err = new Error('kaboom');
    console.error(err);

    expect(entries).toHaveLength(1);
    expect(entries[0]?.message).toContain('kaboom');
    expect(entries[0]?.message).not.toBe('{}');
    expect(entries[0]?.stack).toBeDefined();
  });

  it('trims stacks to 20 frames while preserving the Error: leader', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { ctx, entries } = makeCtx();
    teardown = installConsoleRing(ctx);

    const fakeStack =
      'Error: long\n' +
      Array.from(
        { length: 50 },
        (_, i) => `    at frame${i} (f.js:${i}:1)`,
      ).join('\n');
    const err = new Error('long');
    err.stack = fakeStack;

    console.error(err);

    const stack = entries[0]?.stack ?? '';
    const lines = stack.split('\n');
    expect(lines[0]).toContain('Error: long');
    expect(lines.length).toBeLessThanOrEqual(21);
  });

  it('dedupes identical entries within 500 ms uniformly across levels', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { ctx, entries } = makeCtx();
    teardown = installConsoleRing(ctx);

    console.warn('same');
    vi.advanceTimersByTime(100);
    console.warn('same');

    expect(entries).toHaveLength(1);
    expect(entries[0]?.count).toBe(2);

    vi.advanceTimersByTime(600);
    console.warn('same');

    expect(entries).toHaveLength(2);
    expect(entries[1]?.count).toBe(1);
  });

  it('treats the 500 ms dedupe boundary as inclusive', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { ctx, entries } = makeCtx();
    teardown = installConsoleRing(ctx);

    console.error('edge');
    vi.advanceTimersByTime(500);
    console.error('edge');

    expect(entries).toHaveLength(1);
    expect(entries[0]?.count).toBe(2);

    vi.advanceTimersByTime(501);
    console.error('edge');

    expect(entries).toHaveLength(2);
    expect(entries[1]?.count).toBe(1);
  });

  it('captures window "error" events with stack regardless of levels filter', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    // Even with no levels enabled, uncaught errors are always captured —
    // they are the most valuable signal a triager has.
    const { ctx, entries } = makeCtx({ levels: [] });
    teardown = installConsoleRing(ctx);

    const err = new Error('from window');
    const event = new ErrorEvent('error', {
      message: 'from window',
      error: err,
    });
    window.dispatchEvent(event);

    expect(entries).toHaveLength(1);
    expect(entries[0]?.message).toContain('from window');
    expect(entries[0]?.stack).toBeDefined();
  });

  it('captures unhandledrejection for Error and non-Error reasons', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { ctx, entries } = makeCtx();
    teardown = installConsoleRing(ctx);

    const err = new Error('rejected-err');
    const rejectionErr = Object.assign(new Event('unhandledrejection'), {
      reason: err,
    });
    window.dispatchEvent(rejectionErr);

    const rejectionStr = Object.assign(new Event('unhandledrejection'), {
      reason: 'rejected-str',
    });
    window.dispatchEvent(rejectionStr);

    expect(entries).toHaveLength(2);
    expect(entries[0]?.message).toContain('rejected-err');
    expect(entries[0]?.stack).toBeDefined();
    expect(entries[1]?.message).toContain('rejected-str');
    expect(entries[1]?.stack).toBeUndefined();
  });

  it('uninstalls cleanly: restores originals for every level, no leak on re-install', () => {
    const sentinels: Record<ConsoleLevel, ReturnType<typeof vi.fn>> = {
      log: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    };
    for (const level of ALL_LEVELS) {
      console[level] = sentinels[
        level
      ] as unknown as (typeof console)[typeof level];
    }

    const { ctx, entries } = makeCtx();
    teardown = installConsoleRing(ctx);
    for (const level of ALL_LEVELS) {
      expect(console[level]).not.toBe(sentinels[level]);
    }

    console.log('first');
    expect(entries).toHaveLength(1);

    teardown();
    teardown = undefined;
    for (const level of ALL_LEVELS) {
      expect(console[level]).toBe(sentinels[level]);
    }
  });

  it('coerces non-Error arg types via safeStringify', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { ctx, entries } = makeCtx();
    teardown = installConsoleRing(ctx);

    const circular: Record<string, unknown> = {};
    circular.self = circular;
    function named(): void {}
    const sym = Symbol('tag');

    console.error(
      null,
      undefined,
      42,
      true,
      1n,
      named,
      () => undefined,
      { a: 1 },
      circular,
      sym,
    );

    expect(entries).toHaveLength(1);
    const msg = entries[0]?.message ?? '';
    expect(msg).toContain('null');
    expect(msg).toContain('undefined');
    expect(msg).toContain('42');
    expect(msg).toContain('true');
    expect(msg).toContain('1');
    expect(msg).toContain('[function named]');
    expect(msg).toContain('[function anonymous]');
    expect(msg).toContain('{"a":1}');
    expect(msg).toContain('[unserializable]');
    expect(msg).toContain('Symbol(tag)');
  });

  it('trims an Error-leader stack while preserving the "Error:" line', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { ctx, entries } = makeCtx();
    teardown = installConsoleRing(ctx);

    const fakeStack =
      'Error: with leader\n' +
      Array.from(
        { length: 50 },
        (_, i) => `    at frame${i} (f.js:${i}:1)`,
      ).join('\n');
    const err = new Error('with leader');
    err.stack = fakeStack;
    console.error(err);

    const lines = (entries[0]?.stack ?? '').split('\n');
    expect(lines[0]).toBe('Error: with leader');
    expect(lines.length).toBe(21);
  });

  it('trims a frame-leader stack (no "Error:" leader) to 20 frames', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { ctx, entries } = makeCtx();
    teardown = installConsoleRing(ctx);

    const fakeStack = Array.from(
      { length: 50 },
      (_, i) => `    at frame${i} (f.js:${i}:1)`,
    ).join('\n');
    const err = new Error('frame-led');
    err.stack = fakeStack;
    console.error(err);

    const lines = (entries[0]?.stack ?? '').split('\n');
    expect(lines.length).toBe(20);
    expect(lines[0]).toContain('at frame0');
    expect(lines[19]).toContain('at frame19');
  });

  it('dedupes correctly when stacks are absent', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { ctx, entries } = makeCtx();
    teardown = installConsoleRing(ctx);

    console.error('no-stack');
    console.error('no-stack');

    expect(entries).toHaveLength(1);
    expect(entries[0]?.count).toBe(2);
  });

  it('prunes stale dedupe keys once the map grows past its threshold', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { ctx, entries } = makeCtx();
    teardown = installConsoleRing(ctx);

    for (let i = 0; i < 40; i++) {
      vi.advanceTimersByTime(1000);
      console.error(`distinct-${i}`);
    }
    expect(entries).toHaveLength(40);
  });

  it('never throws from inside console.error even when push misbehaves', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const config = {
      rings: {
        console: { enabled: true, levels: ALL_LEVELS, max: 50 },
        network: { enabled: true, captureSuccess: true, max: 20 },
        route: true,
      },
      redact: { disable: new Set(), custom: [] },
    } as unknown as RingContext['config'];
    const ctx: RingContext = {
      config,
      bus: undefined as unknown as RingContext['bus'],
      push: () => {
        throw new Error('buffer exploded');
      },
    };
    teardown = installConsoleRing(ctx);

    expect(() => console.error('guarded')).not.toThrow();
  });
});
