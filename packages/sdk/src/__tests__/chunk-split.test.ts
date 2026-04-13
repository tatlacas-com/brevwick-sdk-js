import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, it, expect } from 'vitest';

/**
 * Chunk-split guard: after `pnpm --filter brevwick-sdk build`, the base chunk
 * must not reference `modern-screenshot` — that dependency is loaded only
 * from a dynamically-imported sibling chunk. Both ESM and CJS outputs are
 * asserted so the invariant holds regardless of how consumers load the SDK.
 * Skipped when dist/ is absent so plain `pnpm test` (no prior build) still
 * passes.
 */
describe('bundle chunk split', () => {
  const dist = resolve(__dirname, '../../dist');
  const baseEsm = join(dist, 'index.js');

  const hasDist = existsSync(baseEsm);
  const suite = hasDist ? describe : describe.skip;

  suite('dist/ exists', () => {
    it.each([
      ['ESM', 'index.js', '.js'],
      ['CJS', 'index.cjs', '.cjs'],
    ])(
      '%s base chunk excludes modern-screenshot and a sibling chunk imports it',
      (_label, baseName, ext) => {
        const baseSrc = readFileSync(join(dist, baseName), 'utf8');
        expect(baseSrc).not.toContain('modern-screenshot');

        const siblings = readdirSync(dist).filter(
          (f) => f.endsWith(ext) && f !== baseName,
        );
        const hit = siblings.some((f) =>
          readFileSync(join(dist, f), 'utf8').includes('modern-screenshot'),
        );
        expect(hit).toBe(true);
      },
    );
  });
});
