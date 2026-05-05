import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect } from 'vitest';

/**
 * Local fast-feedback guard for the Solid bundle ceiling. Mirrors the
 * SDK + React packages' "raw artefact gzipped" assertion so a developer
 * running `pnpm test` after a build sees the budget breach before the CI
 * `size-check` job catches it.
 *
 * The 5 kB ceiling is set by the issue-66 SDD update and enforced
 * end-to-end via `size-limit` (`.size-limit.js`). Skipped when `dist/`
 * is absent so plain `pnpm test` (no prior build) still passes.
 */
describe('@tatlacas/brevwick-solid bundle ceiling', () => {
  const dist = resolve(__dirname, '../../dist');
  const baseEsm = resolve(dist, 'index.js');
  const baseCjs = resolve(dist, 'index.cjs');

  const hasDist = existsSync(baseEsm) && existsSync(baseCjs);
  const suite = hasDist ? describe : describe.skip;

  // 12 kB gzip ceiling, expressed in 1000-based bytes the way size-limit
  // reads it. Bumped from 5 kB → 12 kB in issue #113 when the Solid widget
  // reached UX parity with the React adapter — kept in lockstep with the
  // entries in `.size-limit.js` and the `CLAUDE.md` budget table.
  const LIMIT_BYTES = 12_000;

  suite('dist/ exists', () => {
    it.each([
      ['ESM', baseEsm],
      ['CJS', baseCjs],
    ])('%s bundle is under the 12 kB gzip budget', async (_label, path) => {
      const { gzipSync } = await import('node:zlib');
      const raw = readFileSync(path);
      const gzipped = gzipSync(raw).length;
      expect(gzipped).toBeLessThan(LIMIT_BYTES);
    });

    it('base chunk does not bundle solid-js (peer dep is external)', () => {
      const baseSrc = readFileSync(baseEsm, 'utf8');
      // `solid-js` import specifiers must survive in the output as
      // bare-module references rather than be inlined. A copy of the
      // runtime in the package output would inflate the gzip well past
      // the 5 kB budget and cause double-runtime issues at consumption.
      expect(baseSrc).toMatch(
        /from\s*["']solid-js["']|require\(["']solid-js["']\)/,
      );
    });

    it('base chunk does not bundle solid-js/web (peer dep is external)', () => {
      const baseSrc = readFileSync(baseEsm, 'utf8');
      // JSX compiled by `babel-preset-solid` emits imports from
      // `solid-js/web` (`template`, `delegateEvents`, `insert`, …). They
      // must remain bare-module references; bundling the DOM runtime would
      // both inflate the chunk and cause two copies of the reactive root to
      // exist alongside the consumer's own `solid-js/web`.
      expect(baseSrc).toMatch(
        /from\s*["']solid-js\/web["']|require\(["']solid-js\/web["']\)/,
      );
    });
  });
});
