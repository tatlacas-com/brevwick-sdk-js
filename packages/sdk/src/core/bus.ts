type Listener<T> = (payload: T) => void;

export interface Bus<EventMap extends Record<string, unknown>> {
  on<K extends keyof EventMap>(event: K, listener: Listener<EventMap[K]>): void;
  off<K extends keyof EventMap>(
    event: K,
    listener: Listener<EventMap[K]>,
  ): void;
  emit<K extends keyof EventMap>(event: K, payload: EventMap[K]): void;
  clear(): void;
}

/**
 * Minimal typed pub/sub. Emission snapshots the listener set before
 * iterating so listeners may safely `off()` themselves or register new
 * listeners without breaking delivery of the in-flight event.
 */
export function createBus<
  EventMap extends Record<string, unknown>,
>(): Bus<EventMap> {
  // The map is keyed by event name but each set only ever contains listeners
  // for that event. Internally we treat payloads as `unknown`; the public
  // per-method generics preserve type safety at every call site.
  const listeners = new Map<keyof EventMap, Set<Listener<unknown>>>();

  return {
    on(event, listener) {
      let set = listeners.get(event);
      if (!set) {
        set = new Set();
        listeners.set(event, set);
      }
      set.add(listener as Listener<unknown>);
    },
    off(event, listener) {
      listeners.get(event)?.delete(listener as Listener<unknown>);
    },
    emit(event, payload) {
      const set = listeners.get(event);
      if (!set) return;
      // Snapshot: a listener that mutates the set (off-self, add-new) must
      // not corrupt iteration or miss delivery of the current payload.
      for (const listener of [...set]) {
        (listener as Listener<typeof payload>)(payload);
      }
    },
    clear() {
      listeners.clear();
    },
  };
}
