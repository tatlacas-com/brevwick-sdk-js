export interface RingBuffer<T> {
  push(entry: T): void;
  snapshot(): readonly T[];
  clear(): void;
  readonly size: number;
}

/**
 * Fixed-capacity FIFO ring buffer. Uses a pre-allocated slot array plus a
 * head pointer so push stays O(1) even at large caps — `Array.prototype.shift`
 * would be O(n) and turn a burst of events into O(n²) work.
 */
export function createRingBuffer<T>(cap: number): RingBuffer<T> {
  if (!Number.isInteger(cap) || cap <= 0) {
    throw new Error('ring buffer cap must be a positive integer');
  }
  const slots: Array<T | undefined> = new Array(cap);
  let head = 0;
  let count = 0;

  function snapshot(): readonly T[] {
    const out: T[] = new Array(count);
    const start = count < cap ? 0 : head;
    for (let i = 0; i < count; i++) {
      out[i] = slots[(start + i) % cap] as T;
    }
    return Object.freeze(out);
  }

  return {
    push(entry) {
      slots[head] = entry;
      head = (head + 1) % cap;
      if (count < cap) count++;
    },
    snapshot,
    clear() {
      for (let i = 0; i < cap; i++) slots[i] = undefined;
      head = 0;
      count = 0;
    },
    get size() {
      return count;
    },
  };
}
