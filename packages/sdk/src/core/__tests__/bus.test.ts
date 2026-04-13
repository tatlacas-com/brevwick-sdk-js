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
});
