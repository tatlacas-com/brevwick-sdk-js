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
     * Hard ceiling: the eager gzipped chunk must stay under the budget
     * declared in CLAUDE.md and SDD § 12. Bumped from 2048 to 2200 bytes in
     * the issue-9 loopback-http carve-out: `canonicaliseHttpsUrl` now accepts
     * `http://localhost`, `http://127.0.0.1`, `http://[::1]` for local-dev
     * integrators, which costs ~25 gzipped bytes over the prior ceiling. The
     * 2.2 kB budget is still well under the 2.5 kB upper bound the widget-
     * open eager cost targets. CI also enforces this budget end-to-end via
     * the `size-check` job (`.size-limit.json`); this in-suite assertion is
     * kept as a fast-feedback guard during local `pnpm test`.
     */
    it('eager ESM chunk is under the 2.2 kB gzip budget', async () => {
      const { gzipSync } = await import('node:zlib');
      const raw = readFileSync(baseEsm);
      const gzipped = gzipSync(raw).length;
      expect(gzipped).toBeLessThan(2200);
    });
  });
});
