import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect } from 'vitest';

/**
 * Local fast-feedback guard for the React bundle ceiling. Mirrors the SDK
 * package's `chunk-split.test.ts` "raw artefact gzipped" assertion so a
 * developer running `pnpm test` after a build sees a clear failure before
 * the CI `size-check` job catches it.
 *
 * The 25 kB ceiling is mandated by `CLAUDE.md` and `brevwick-ops/docs/
 * brevwick-sdd.md` § 11.8 / § 12, and enforced end-to-end via `size-limit`
 * (`.size-limit.js` at repo root). Skipped when `dist/` is absent so plain
 * `pnpm test` (no prior build) still passes.
 */
describe('brevwick-react bundle ceiling', () => {
  const dist = resolve(__dirname, '../../dist');
  const baseEsm = resolve(dist, 'index.js');
  const baseCjs = resolve(dist, 'index.cjs');

  const hasDist = existsSync(baseEsm) && existsSync(baseCjs);
  const suite = hasDist ? describe : describe.skip;

  // 25 kB gzip ceiling, expressed in bytes the way size-limit interprets it
  // (1000-based, matching the value in `.size-limit.js`).
  const LIMIT_BYTES = 25_000;

  suite('dist/ exists', () => {
    it.each([
      ['ESM', baseEsm],
      ['CJS', baseCjs],
    ])('%s bundle is under the 25 kB gzip budget', async (_label, path) => {
      const { gzipSync } = await import('node:zlib');
      const raw = readFileSync(path);
      const gzipped = gzipSync(raw).length;
      expect(gzipped).toBeLessThan(LIMIT_BYTES);
    });
  });
});
