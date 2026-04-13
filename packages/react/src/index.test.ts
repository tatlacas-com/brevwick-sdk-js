import { describe, expect, it } from 'vitest';
import { BREVWICK_REACT_VERSION } from './index';

describe('brevwick-react', () => {
  it('exports a version string', () => {
    expect(typeof BREVWICK_REACT_VERSION).toBe('string');
  });
});
