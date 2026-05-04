import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, it, expect } from 'vitest';

/**
 * Chunk-split guard: after `pnpm --filter @tatlacas/brevwick-sdk build`, the base chunk
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

    /**
     * Submit pipeline must live in a sibling chunk: the base chunk loads it
     * via `import('../submit')` only on the first `submit()` call. If a
     * future inline merges submit symbols into the base chunk, the eager
     * 2 kB gzip budget regresses. We assert by:
     *   1. The base chunk references the submit chunk via dynamic import.
     *   2. The base chunk does not contain any submit-specific error code
     *      literal (those live exclusively in the submit chunk).
     *   3. A sibling chunk file actually contains the submit symbols.
     */
    it.each([
      ['ESM', 'index.js', '.js', 'submit-'],
      ['CJS', 'index.cjs', '.cjs', 'submit-'],
    ])(
      '%s base chunk imports the submit pipeline lazily and ships no submit error literals',
      (_label, baseName, ext, prefix) => {
        const baseSrc = readFileSync(join(dist, baseName), 'utf8');
        // Base must reference the submit chunk filename via a dynamic import.
        expect(baseSrc).toMatch(new RegExp(`['"\`]\\.\\/${prefix}`));
        // Submit error-code literals must not leak into the eager chunk.
        for (const code of [
          'ATTACHMENT_UPLOAD_FAILED',
          'INGEST_REJECTED',
          'INGEST_TIMEOUT',
          'INGEST_INVALID_RESPONSE',
          'INGEST_RETRY_EXHAUSTED',
        ]) {
          expect(baseSrc).not.toContain(code);
        }
        // Submit-only runtime symbols must not be inlined.
        expect(baseSrc).not.toContain('runSubmit');
        expect(baseSrc).not.toContain('INGEST_BACKOFFS_MS');

        const siblings = readdirSync(dist).filter(
          (f) => f.endsWith(ext) && f.startsWith(prefix),
        );
        expect(siblings.length).toBeGreaterThan(0);
        const submitChunk = readFileSync(join(dist, siblings[0]!), 'utf8');
        expect(submitChunk).toContain('INGEST_RETRY_EXHAUSTED');
      },
    );

    /**
     * Hard ceiling: the **true** eager gzipped weight (`index.js` plus every
     * sibling chunk it pulls in via static `import` / `export ... from`)
     * must stay under the budget declared in CLAUDE.md and SDD § 12.
     *
     * Measuring `index.js` alone was misleading — tsup hoists shared symbols
     * into chunk files that the entry statically imports, so the gzipped
     * size of `index.js` does not reflect what the consumer's bundler
     * actually inlines on the eager path. The walker below follows static
     * specifiers only (it deliberately ignores `import('…')` dynamic
     * specifiers, which are the submit / config / screenshot lazy chunks).
     *
     * Bumped from 2.85 kB → 8 kB when the console + network rings moved
     * out of dynamic-import thunks and into the eager registry. The
     * earlier dynamic-load shape opened a capture race (errors / fetches
     * fired after `install()` but before the chunks landed went unrecorded
     * — the headline "missing console + network info on submitted issues"
     * bug). Reliable capture is the SDK's product guarantee, so the budget
     * moved up rather than the rings moving back behind a network round-
     * trip. CI also enforces this end-to-end via `.size-limit.js`; this
     * in-suite assertion is the fast-feedback guard during local
     * `pnpm test`.
     */
    it('eager ESM chunk + statically-imported siblings stay under the 8 kB gzip budget', async () => {
      const { gzipSync } = await import('node:zlib');

      // Static-only specifier: `import x from './foo'`, `export … from
      // './foo'`, or the bare side-effect form `import './foo'`. Excludes
      // `import('…')` (that pair of parens is what makes the lazy chunks
      // lazy) and substring matches inside identifiers (the `[^.\w]`
      // boundary). Tolerates the minifier's "no whitespace before `{`"
      // shape, e.g. `export{x}from'./foo'`.
      const STATIC_SPEC =
        /(?:^|[^.\w])(?:import|export)\b[^'"`(]*?['"](\.\/[^'"]+)['"]/g;

      const visited = new Set<string>();
      const walk = (file: string): void => {
        if (visited.has(file)) return;
        visited.add(file);
        const src = readFileSync(join(dist, file), 'utf8');
        for (const m of src.matchAll(STATIC_SPEC)) {
          walk(m[1]!.replace(/^\.\//, ''));
        }
      };
      walk('index.js');

      let total = 0;
      const breakdown: Array<[string, number]> = [];
      for (const file of visited) {
        const size = gzipSync(readFileSync(join(dist, file))).length;
        total += size;
        breakdown.push([file, size]);
      }
      // Surface the breakdown in failure output so a regression points at
      // which chunk grew.
      expect({ total, breakdown }).toEqual(
        expect.objectContaining({ total: expect.any(Number) }),
      );
      expect(total).toBeLessThan(8 * 1024);
    });
  });
});
