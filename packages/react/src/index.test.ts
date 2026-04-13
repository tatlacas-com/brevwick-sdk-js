import { describe, expect, it } from 'vitest';
import { COMPILERFISH_REACT_VERSION } from './index';

describe('compilerfish-react', () => {
  it('exports a version string', () => {
    expect(typeof COMPILERFISH_REACT_VERSION).toBe('string');
  });
});
