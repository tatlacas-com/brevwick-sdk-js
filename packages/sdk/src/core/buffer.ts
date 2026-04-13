export interface RingBuffer<T> {
  push(entry: T): void;
  snapshot(): readonly T[];
  clear(): void;
  readonly size: number;
}

export function createRingBuffer<T>(cap: number): RingBuffer<T> {
  if (!Number.isInteger(cap) || cap <= 0) {
    throw new Error('ring buffer cap must be a positive integer');
  }
  const items: T[] = [];

  return {
    push(entry) {
      items.push(entry);
      if (items.length > cap) items.shift();
    },
    snapshot() {
      return Object.freeze(items.slice());
    },
    clear() {
      items.length = 0;
    },
    get size() {
      return items.length;
    },
  };
}
