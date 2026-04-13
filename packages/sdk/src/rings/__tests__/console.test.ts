import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installConsoleRing } from '../console';
import type { RingContext } from '../../core/internal';
import type { ConsoleEntry, RingEntry } from '../../types';

function makeCtx(): { ctx: RingContext; entries: ConsoleEntry[] } {
  const entries: ConsoleEntry[] = [];
  const ctx: RingContext = {
    // Only `push` is exercised by the ring; config + bus are left as
    // typed stubs so a regression that starts reading them fails loudly.
    config: undefined as unknown as RingContext['config'],
    bus: undefined as unknown as RingContext['bus'],
    push: (e: RingEntry) => {
      if (e.kind === 'console') entries.push(e);
    },
  };
  return { ctx, entries };
}

describe('console ring', () => {
  let teardown: (() => void) | undefined;
  let originalError: typeof console.error;
  let originalWarn: typeof console.warn;

  beforeEach(() => {
    originalError = console.error;
    originalWarn = console.warn;
  });

  afterEach(() => {
    teardown?.();
    teardown = undefined;
    vi.useRealTimers();
    // Defensive: if a test forgot to uninstall, restore manually so the
    // next test starts from clean globals.
    console.error = originalError;
    console.warn = originalWarn;
  });

  it('patches console.error and console.warn while still calling originals', () => {
    const origErrorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    const origWarnSpy = vi
      .spyOn(console, 'warn')
      .mockImplementation(() => undefined);
    const { ctx, entries } = makeCtx();

    teardown = installConsoleRing(ctx);

    console.error('boom');
    console.warn('careful');

    expect(origErrorSpy).toHaveBeenCalledWith('boom');
    expect(origWarnSpy).toHaveBeenCalledWith('careful');
    expect(entries).toHaveLength(2);
    expect(entries[0]).toMatchObject({
      kind: 'console',
      level: 'error',
      message: 'boom',
    });
    expect(entries[1]).toMatchObject({
      kind: 'console',
      level: 'warn',
      message: 'careful',
    });
  });

  it('redacts Bearer tokens and JWTs in buffered messages', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { ctx, entries } = makeCtx();
    teardown = installConsoleRing(ctx);

    console.error('auth failed: Bearer eyJabc.def.ghi');

    expect(entries).toHaveLength(1);
    const entry = entries[0];
    expect(entry).toBeDefined();
    // Redaction contract in redact.ts replaces `Bearer <token>` -> `Bearer [redacted]`.
    expect(entry?.message).toContain('[redacted]');
    expect(entry?.message).not.toContain('eyJabc.def.ghi');
  });

  it('redacts bare JWT-shaped tokens (no Bearer prefix) via the JWT pattern', () => {
    // Standalone coverage for the JWT pattern in redact.ts. The Bearer test
    // above incidentally covers JWTs only because the Bearer regex fires
    // first and swallows the token; a JWT with no `Bearer ` prefix must still
    // be scrubbed by the dedicated JWT rule.
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { ctx, entries } = makeCtx();
    teardown = installConsoleRing(ctx);

    console.error('token: eyJabc.def.ghi');

    expect(entries).toHaveLength(1);
    const entry = entries[0];
    expect(entry).toBeDefined();
    expect(entry?.message).toContain('[jwt]');
    expect(entry?.message).not.toContain('eyJabc.def.ghi');
  });

  it('coerces Error args via message+stack, not JSON.stringify', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { ctx, entries } = makeCtx();
    teardown = installConsoleRing(ctx);

    const err = new Error('kaboom');
    console.error(err);

    expect(entries).toHaveLength(1);
    expect(entries[0]?.message).toContain('kaboom');
    // `JSON.stringify(new Error('x'))` is `{}` — regression guard.
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
    expect(lines.length).toBeLessThanOrEqual(21); // leader + 20 frames max
  });

  it('dedupes identical entries within 500 ms and splits outside the window', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { ctx, entries } = makeCtx();
    teardown = installConsoleRing(ctx);

    console.error('same');
    vi.advanceTimersByTime(100);
    console.error('same');

    expect(entries).toHaveLength(1);
    expect(entries[0]?.count).toBe(2);

    vi.advanceTimersByTime(600); // now > 500 ms since last push
    console.error('same');

    expect(entries).toHaveLength(2);
    expect(entries[1]?.count).toBe(1);
  });

  it('treats the 500 ms dedupe boundary as inclusive (exactly 500 ms dedupes)', () => {
    // WT-02 acceptance says "within 500 ms". The boundary is inclusive —
    // a repeat at exactly the window edge still counts as the same event.
    // Regression guard against an off-by-one strict-less-than check.
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { ctx, entries } = makeCtx();
    teardown = installConsoleRing(ctx);

    console.error('edge');
    vi.advanceTimersByTime(500); // exactly at the boundary
    console.error('edge');

    expect(entries).toHaveLength(1);
    expect(entries[0]?.count).toBe(2);

    // One ms past the boundary is a separate event.
    vi.advanceTimersByTime(501);
    console.error('edge');

    expect(entries).toHaveLength(2);
    expect(entries[1]?.count).toBe(1);
  });

  it('captures window "error" events with stack', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { ctx, entries } = makeCtx();
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

    // happy-dom omits PromiseRejectionEvent, so synthesise the minimum
    // shape the ring's listener reads from — a plain Event with `reason`
    // bolted on. This mirrors the subset of the spec we actually depend on.
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

  it('uninstalls cleanly: restores originals, removes listeners, no leak on re-install', () => {
    // Install our own sentinel originals so we can assert identity round-trip
    // without involving happy-dom's console implementation.
    const sentinelError = vi.fn();
    const sentinelWarn = vi.fn();
    console.error = sentinelError as unknown as typeof console.error;
    console.warn = sentinelWarn as unknown as typeof console.warn;

    const { ctx: ctx1, entries: entries1 } = makeCtx();
    const down1 = installConsoleRing(ctx1);
    expect(console.error).not.toBe(sentinelError);

    console.error('first');
    expect(entries1).toHaveLength(1);
    expect(sentinelError).toHaveBeenCalledTimes(1);

    down1();
    expect(console.error).toBe(sentinelError);
    expect(console.warn).toBe(sentinelWarn);

    // Second cycle: log once, confirm exactly one entry is recorded and the
    // sentinel is called exactly once — i.e. no leftover wrapper from
    // cycle 1 is layered underneath cycle 2.
    const { ctx: ctx2, entries: entries2 } = makeCtx();
    teardown = installConsoleRing(ctx2);
    console.error('second');
    expect(entries2).toHaveLength(1);
    expect(sentinelError).toHaveBeenCalledTimes(2); // 1 from first cycle + 1 now

    teardown();
    teardown = undefined;
    expect(console.error).toBe(sentinelError);
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
    expect(lines.length).toBe(21); // leader + 20 frames
  });

  it('trims a frame-leader stack (no "Error:" leader) to 20 frames', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { ctx, entries } = makeCtx();
    teardown = installConsoleRing(ctx);

    // Some engines (e.g. Safari) emit stacks whose first line is already a
    // frame, with no "Error: message" leader. Exercise that branch in trimStack.
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

  it('dedupes correctly when stacks are absent (firstFrame returns empty)', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { ctx, entries } = makeCtx();
    teardown = installConsoleRing(ctx);

    // Plain string args have no stack, so firstFrame() hits its "no frame
    // line" fallback. Two identical stack-less messages should still dedupe.
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

    // Fire 40 distinct messages to push the internal Map past its prune
    // threshold (32) so the prune branch runs at least once. Entries stay
    // at 40; the assertion here is that no throw + no dedupe collisions
    // occurred while the branch executed.
    for (let i = 0; i < 40; i++) {
      vi.advanceTimersByTime(1000); // > 500 ms apart so nothing dedupes
      console.error(`distinct-${i}`);
    }
    expect(entries).toHaveLength(40);
  });

  it('never throws from inside console.error even when push misbehaves', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const ctx: RingContext = {
      config: undefined as unknown as RingContext['config'],
      bus: undefined as unknown as RingContext['bus'],
      push: () => {
        throw new Error('buffer exploded');
      },
    };
    teardown = installConsoleRing(ctx);

    // If the ring let this throw propagate, user code that does
    // `console.error(e)` in a catch block would throw a new error and
    // mask the original failure.
    expect(() => console.error('guarded')).not.toThrow();
  });
});
