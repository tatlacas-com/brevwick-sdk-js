import { describe, expect, it, vi } from 'vitest';
import { createBus } from '../bus';

type Events = {
  ping: { id: number };
  pong: { ok: boolean };
};

describe('createBus', () => {
  it('delivers payloads to every registered listener for the event', () => {
    const bus = createBus<Events>();
    const a = vi.fn();
    const b = vi.fn();
    bus.on('ping', a);
    bus.on('ping', b);

    bus.emit('ping', { id: 1 });

    expect(a).toHaveBeenCalledWith({ id: 1 });
    expect(b).toHaveBeenCalledWith({ id: 1 });
  });

  it('off removes the listener', () => {
    const bus = createBus<Events>();
    const listener = vi.fn();
    bus.on('pong', listener);
    bus.off('pong', listener);
    bus.emit('pong', { ok: true });
    expect(listener).not.toHaveBeenCalled();
  });

  it('clear removes every listener', () => {
    const bus = createBus<Events>();
    const listener = vi.fn();
    bus.on('ping', listener);
    bus.clear();
    bus.emit('ping', { id: 2 });
    expect(listener).not.toHaveBeenCalled();
  });

  it('emit with no listeners is a no-op', () => {
    const bus = createBus<Events>();
    expect(() => bus.emit('ping', { id: 3 })).not.toThrow();
  });

  it('a listener that off()s itself during emit still receives the current payload', () => {
    const bus = createBus<Events>();
    const selfRemoving = vi.fn(() => {
      bus.off('ping', selfRemoving);
    });
    bus.on('ping', selfRemoving);

    bus.emit('ping', { id: 1 });
    bus.emit('ping', { id: 2 });

    expect(selfRemoving).toHaveBeenCalledTimes(1);
    expect(selfRemoving).toHaveBeenCalledWith({ id: 1 });
  });

  it('a listener registered during emit does not receive the in-flight payload', () => {
    const bus = createBus<Events>();
    const late = vi.fn();
    bus.on('ping', () => bus.on('ping', late));

    bus.emit('ping', { id: 1 });
    expect(late).not.toHaveBeenCalled();

    bus.emit('ping', { id: 2 });
    // Registered once during the first emit — still called once on the second.
    expect(late).toHaveBeenCalledTimes(1);
    expect(late).toHaveBeenCalledWith({ id: 2 });
  });

  it('does not throw when a later listener is removed mid-iteration', () => {
    const bus = createBus<Events>();
    const second = vi.fn();
    const first = vi.fn(() => {
      bus.off('ping', second);
    });
    bus.on('ping', first);
    bus.on('ping', second);

    // Snapshot semantics: second is still called for this payload because we
    // cloned the set before iterating. Mutation only affects future emits.
    expect(() => bus.emit('ping', { id: 1 })).not.toThrow();
    expect(second).toHaveBeenCalledTimes(1);

    bus.emit('ping', { id: 2 });
    expect(second).toHaveBeenCalledTimes(1);
  });
});
