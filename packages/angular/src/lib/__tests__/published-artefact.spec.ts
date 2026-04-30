import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Asserts the published ng-packagr artefact does not regress on the bug
 * that shipped in PR #71's first cut: the `__BREVWICK_ANGULAR_VERSION__`
 * ambient token survived into the FESM bundle because ng-packagr does not
 * honour `define`-style substitution. The fix is a `prebuild` codegen step
 * that writes the literal version string into source — this spec verifies
 * the build product matches.
 *
 * Runs against `dist/`, which CI builds before invoking `pnpm test:cover`
 * (see `.github/workflows/ci.yml`). Locally, run
 * `pnpm --filter @tatlacas/brevwick-angular build` before `pnpm test`.
 */
describe('@tatlacas/brevwick-angular published artefact', () => {
  // `__dirname` is undefined in ESM/vitest; derive it from `import.meta.url`.
  // `new URL('.', import.meta.url).pathname` is brittle on Windows and does
  // not handle URL-encoded characters — `fileURLToPath` is the supported API.
  const here = dirname(fileURLToPath(import.meta.url));
  const distDir = resolve(here, '../../../dist');
  const fesm = resolve(distDir, 'fesm2022/tatlacas-brevwick-angular.mjs');
  const pkgPath = resolve(here, '../../../package.json');

  // In CI we require the build to have run before tests so this assertion
  // actually fires (see `.github/workflows/ci.yml`). Locally a developer
  // running `pnpm test` without a prior build would otherwise get a
  // confusing failure — so we soft-skip outside CI but loud-fail inside.
  // This is the inverse of the previous `bundle-size.test.ts` skip-on-CI
  // anti-pattern: here the skip is locally-scoped and CI is authoritative.
  const isCI = process.env.CI === 'true' || process.env.CI === '1';

  it('FESM2022 bundle exists (CI must build before tests)', () => {
    if (!isCI && !existsSync(fesm)) {
      // Local dev convenience — print a hint instead of failing.
      console.warn(
        `[published-artefact] dist/ missing locally — run \`pnpm --filter @tatlacas/brevwick-angular build\` to exercise this spec.`,
      );
      return;
    }
    expect(
      existsSync(fesm),
      `Expected ${fesm} to exist. CI must build before testing.`,
    ).toBe(true);
  });

  it('FESM2022 bundle contains the literal package version, not the ambient token', () => {
    if (!existsSync(fesm)) {
      if (isCI) {
        throw new Error(
          `dist/ missing in CI — the workflow must build @tatlacas/brevwick-angular before running tests.`,
        );
      }
      return;
    }
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as {
      version: string;
    };
    const source = readFileSync(fesm, 'utf8');
    expect(source).not.toContain('__BREVWICK_ANGULAR_VERSION__');
    // ng-packagr / rollup may emit the literal in either quote style; accept
    // both so a future toolchain swap doesn't break the assertion.
    const escaped = pkg.version.replace(/[.+*?^$(){}|[\]\\-]/g, '\\$&');
    expect(source).toMatch(
      new RegExp(`BREVWICK_ANGULAR_VERSION\\s*=\\s*['"]${escaped}['"]`),
    );
  });

  it('source `version.ts` and package.json#version stay in sync', () => {
    const versionTsPath = resolve(here, '../internal/version.ts');
    const versionTs = readFileSync(versionTsPath, 'utf8');
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as {
      version: string;
    };
    // The codegen writes `export const BREVWICK_ANGULAR_VERSION: string = 'x.y.z';`
    // (single quotes to match the project's Prettier config). Accept either
    // quote style so a future Prettier rule flip doesn't bork the assertion.
    expect(versionTs).toMatch(
      new RegExp(
        `BREVWICK_ANGULAR_VERSION[^=]*=\\s*['"]${pkg.version.replace(
          /[.+*?^$(){}|[\]\\-]/g,
          '\\$&',
        )}['"]`,
      ),
    );
  });
});
