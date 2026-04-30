import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { BREVWICK_CONFIG } from '../brevwick.tokens';
import { provideBrevwick } from '../provide-brevwick';

describe('provideBrevwick', () => {
  it('makes BREVWICK_CONFIG resolvable from the resulting EnvironmentProviders', () => {
    const config = { projectKey: 'pk_test_provide' };
    TestBed.configureTestingModule({
      providers: [provideBrevwick(config)],
    });
    expect(TestBed.inject(BREVWICK_CONFIG)).toBe(config);
  });

  it('returns a value Angular recognises as EnvironmentProviders (no plain Provider[] leak)', () => {
    // makeEnvironmentProviders returns an opaque object — the test asserts
    // we forward that wrapper rather than raw `Provider[]`, so callers can
    // pass our return value to `bootstrapApplication`'s `providers` array
    // without TypeScript or Angular runtime grumbling.
    const result = provideBrevwick({ projectKey: 'pk_test_shape' });
    expect(result).toBeTruthy();
    expect(typeof result).toBe('object');
    expect(Array.isArray(result)).toBe(false);
  });
});
