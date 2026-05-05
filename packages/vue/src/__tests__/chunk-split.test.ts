import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect } from 'vitest';

/**
 * Local fast-feedback guard for the Vue bundle ceiling. Mirrors the
 * `.size-limit.js` Vue entry — bumped from 5 kB → 10 kB when the adapter's
 * `<FeedbackButton>` reached UX parity with the React widget (issue #112,
 * see PR body for the bundle delta). Region capture and the screenshot
 * preview dialog stay behind a future-flag in v1, so the eager artefact
 * still sits ~2 kB below the React adapter's 25 kB ceiling.
 *
 * Runs only when `dist/` exists so plain `pnpm test` (no prior build) still
 * passes; CI's `size-check` job is the end-to-end enforcement via
 * `.size-limit.js`. A duplicate budget here keeps the failure visible during
 * local iteration.
 */
describe('@tatlacas/brevwick-vue bundle ceiling', () => {
  const dist = resolve(__dirname, '../../dist');
  const baseEsm = resolve(dist, 'index.js');
  const baseCjs = resolve(dist, 'index.cjs');

  const hasDist = existsSync(baseEsm) && existsSync(baseCjs);
  const suite = hasDist ? describe : describe.skip;

  // 10 kB gzip ceiling, expressed in bytes the way size-limit interprets it.
  const LIMIT_BYTES = 10_000;

  suite('dist/ exists', () => {
    it.each([
      ['ESM', baseEsm],
      ['CJS', baseCjs],
    ])('%s bundle is under the 10 kB gzip budget', async (_label, path) => {
      const { gzipSync } = await import('node:zlib');
      const raw = readFileSync(path);
      const gzipped = gzipSync(raw).length;
      expect(gzipped).toBeLessThan(LIMIT_BYTES);
    });

    it.each([
      ['ESM', baseEsm],
      ['CJS', baseCjs],
    ])(
      '%s bundle does not statically reference modern-screenshot',
      (_label, path) => {
        const src = readFileSync(path, 'utf8');
        // The screenshot module is dynamic-imported by `@tatlacas/brevwick-sdk`
        // — the Vue adapter must not resurrect it as a static import.
        expect(src).not.toContain('modern-screenshot');
      },
    );
  });
});
