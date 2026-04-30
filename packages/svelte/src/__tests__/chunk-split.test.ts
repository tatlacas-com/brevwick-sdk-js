import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Local fast-feedback guard for the Svelte adapter bundle. svelte-package
 * does not bundle dependencies — it transpiles the source tree and leaves
 * `import '@tatlacas/brevwick-sdk'` as a runtime resolution to the consumer's
 * bundler. So the only invariants worth asserting at this layer are:
 *
 *  1. `modern-screenshot` does not leak into any emitted artefact (it is a
 *     peer of `@tatlacas/brevwick-sdk` resolved lazily on first
 *     `captureScreenshot()`; the adapter never imports it directly).
 *  2. The main entry chunk gzips small (< 5 kB) — the adapter is mostly
 *     re-exports plus a single SFC.
 *
 * Skipped when dist/ is absent so plain `pnpm test` (no prior build) still
 * passes.
 */
describe('@tatlacas/brevwick-svelte chunk split', () => {
  const dist = resolve(__dirname, '../../dist');
  const indexEsm = resolve(dist, 'index.js');
  const hasDist = existsSync(indexEsm);
  const suite = hasDist ? describe : describe.skip;

  suite('dist/ exists', () => {
    it('no emitted file references modern-screenshot', () => {
      const walk = (dir: string): string[] => {
        const out: string[] = [];
        for (const entry of readdirSync(dir, { withFileTypes: true })) {
          const full = join(dir, entry.name);
          if (entry.isDirectory()) out.push(...walk(full));
          else if (entry.name.endsWith('.js') || entry.name.endsWith('.svelte'))
            out.push(full);
        }
        return out;
      };
      const files = walk(dist);
      expect(files.length).toBeGreaterThan(0);
      for (const f of files) {
        const src = readFileSync(f, 'utf8');
        expect(src, `${f} mentions modern-screenshot`).not.toContain(
          'modern-screenshot',
        );
      }
    });

    it('main entry chunk gzips under the 5 kB eager budget', async () => {
      const { gzipSync } = await import('node:zlib');
      const raw = readFileSync(indexEsm);
      const gzipped = gzipSync(raw).length;
      expect(gzipped).toBeLessThan(5_000);
    });
  });
});
