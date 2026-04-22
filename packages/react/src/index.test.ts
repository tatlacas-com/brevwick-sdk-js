import { describe, expect, it } from 'vitest';
import pkg from '../package.json' with { type: 'json' };
import { BREVWICK_REACT_VERSION } from './index';

describe('@tatlacas/brevwick-react', () => {
  it('exports a version string that matches package.json', () => {
    expect(BREVWICK_REACT_VERSION).toBe(pkg.version);
  });
});
