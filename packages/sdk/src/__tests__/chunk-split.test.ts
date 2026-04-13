import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, it, expect } from 'vitest';

/**
 * Chunk-split guard: after `pnpm --filter brevwick-sdk build`, the base
 * `dist/index.js` must not reference `modern-screenshot` — that dependency
 * is loaded only from a dynamically-imported sibling chunk. Skipped when
 * dist/ is absent so plain `pnpm test` (no prior build) still passes.
 */
describe('bundle chunk split', () => {
  const dist = resolve(__dirname, '../../dist');
  const baseFile = join(dist, 'index.js');

  const hasDist = existsSync(baseFile);
  const suite = hasDist ? describe : describe.skip;

  suite('dist/ exists', () => {
    it('base dist/index.js does not contain "modern-screenshot"', () => {
      const src = readFileSync(baseFile, 'utf8');
      expect(src).not.toContain('modern-screenshot');
    });

    it('a sibling chunk imports modern-screenshot', () => {
      const siblings = readdirSync(dist).filter(
        (f) => f.endsWith('.js') && f !== 'index.js' && f !== 'index.cjs',
      );
      const hit = siblings.some((f) =>
        readFileSync(join(dist, f), 'utf8').includes('modern-screenshot'),
      );
      expect(hit).toBe(true);
    });
  });
});
