import { describe, expect, it } from 'vitest';
import { createRingBuffer } from '../buffer';

describe('createRingBuffer', () => {
  it('rejects non-positive caps', () => {
    expect(() => createRingBuffer(0)).toThrow();
    expect(() => createRingBuffer(-1)).toThrow();
    expect(() => createRingBuffer(1.5)).toThrow();
  });

  it('drops oldest entries in FIFO order once at cap', () => {
    const buf = createRingBuffer<number>(50);
    for (let i = 1; i <= 60; i++) buf.push(i);

    const snap = buf.snapshot();
    expect(snap).toHaveLength(50);
    expect(snap[0]).toBe(11);
    expect(snap[snap.length - 1]).toBe(60);
  });

  it('snapshot is frozen and decoupled from subsequent pushes', () => {
    const buf = createRingBuffer<string>(3);
    buf.push('a');
    const snap = buf.snapshot();
    buf.push('b');
    expect(Object.isFrozen(snap)).toBe(true);
    expect(snap).toEqual(['a']);
  });

  it('clear resets the buffer', () => {
    const buf = createRingBuffer<number>(3);
    buf.push(1);
    buf.push(2);
    buf.clear();
    expect(buf.snapshot()).toEqual([]);
    expect(buf.size).toBe(0);
  });

  it('push after clear starts a fresh window', () => {
    const buf = createRingBuffer<number>(3);
    buf.push(1);
    buf.push(2);
    buf.push(3);
    buf.clear();
    buf.push(9);
    expect(buf.snapshot()).toEqual([9]);
    expect(buf.size).toBe(1);
  });

  it('head pointer wraps correctly across many cycles', () => {
    // Catches the "shift()/slice() replacement got FIFO order wrong" regression
    // that a head-pointer implementation could introduce.
    const buf = createRingBuffer<number>(4);
    for (let i = 1; i <= 10; i++) buf.push(i);
    expect(buf.snapshot()).toEqual([7, 8, 9, 10]);
    expect(buf.size).toBe(4);
  });

  it('size tracks inserts up to cap and stays pinned at cap', () => {
    const buf = createRingBuffer<number>(2);
    expect(buf.size).toBe(0);
    buf.push(1);
    expect(buf.size).toBe(1);
    buf.push(2);
    expect(buf.size).toBe(2);
    buf.push(3);
    expect(buf.size).toBe(2);
  });
});
