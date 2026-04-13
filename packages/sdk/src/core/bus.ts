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

export function createBus<
  EventMap extends Record<string, unknown>,
>(): Bus<EventMap> {
  const listeners = new Map<
    keyof EventMap,
    Set<Listener<EventMap[keyof EventMap]>>
  >();

  return {
    on(event, listener) {
      let set = listeners.get(event);
      if (!set) {
        set = new Set();
        listeners.set(event, set);
      }
      set.add(listener as Listener<EventMap[keyof EventMap]>);
    },
    off(event, listener) {
      listeners
        .get(event)
        ?.delete(listener as Listener<EventMap[keyof EventMap]>);
    },
    emit(event, payload) {
      const set = listeners.get(event);
      if (!set) return;
      for (const listener of set)
        (listener as Listener<typeof payload>)(payload);
    },
    clear() {
      listeners.clear();
    },
  };
}
