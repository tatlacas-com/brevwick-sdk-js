# brevwick-sdk-js

JS/TS SDK for [Brevwick](https://github.com/tatlacas-com/brevwick-ops) — the AI-first QA feedback SaaS.

This is a pnpm workspace publishing two packages to npm:

| Package                              | Purpose                                                        |
| ------------------------------------ | -------------------------------------------------------------- |
| [`brevwick-sdk`](./packages/sdk)     | Framework-agnostic core. Submit feedback from any browser app. |
| [`brevwick-react`](./packages/react) | React provider, floating FAB, `useFeedback` hook.              |

**Canonical contract:** [`brevwick-ops/docs/brevwick-sdd.md` § 12](https://github.com/tatlacas-com/brevwick-ops/blob/main/docs/brevwick-sdd.md#12-client-sdk-contracts).

## Quick start (Phase 4 preview)

```ts
import { createBrevwick } from 'brevwick-sdk';

const bw = createBrevwick({
  projectKey: 'pk_live_...',
  buildSha: process.env.BUILD_SHA,
});

const uninstall = bw.install(); // installs console + fetch rings

await bw.submit({
  description: 'Customer modal hangs on second open',
  expected: 'Modal opens with details',
  actual: 'Spinner forever',
});
```

```tsx
import { BrevwickProvider, FeedbackButton } from 'brevwick-react';

<BrevwickProvider config={{ projectKey: 'pk_live_...' }}>
  <App />
  <FeedbackButton />
</BrevwickProvider>;
```

## Bundle budget

- Initial chunk (no widget open): **< 2 kB gzip**
- On widget open (`modern-screenshot` dynamic-imported): **< 25 kB gzip**

## Common commands

```bash
pnpm install
pnpm build           # build all packages
pnpm test            # run vitest in all packages
pnpm test:cover      # with coverage
pnpm lint
pnpm type-check
pnpm format
```

## Local testing in a host app (pre-publish)

Before a package hits npm, you can consume it from a sibling app checkout (e.g. `tradekit-web`). On Next.js 16+ the `link:` / symlink route does **not** work — Turbopack refuses to resolve packages outside the consumer's project root, even with `transpilePackages` or `turbopack.resolveAlias`. Use a tarball install instead.

**One-shot sync (build → pack → reinstall in the consumer):**

```bash
scripts/sync-to-tradekit-web.sh
```

The script defaults to `/home/tatlacas/repos/tradekit/tradekit-web`. Override with `BREVWICK_CONSUMER=/path/to/other/app scripts/sync-to-tradekit-web.sh`. Tarballs land at `packages/{sdk,react}/*.tgz` (git-ignored).

**Consumer-side wiring** (one-time, in the host app's `package.json`):

```json
{
  "dependencies": {
    "brevwick-sdk": "0.1.0-beta.0",
    "brevwick-react": "0.1.0-beta.0"
  },
  "pnpm": {
    "overrides": {
      "brevwick-sdk": "file:/abs/path/to/brevwick-sdk-js/packages/sdk/brevwick-sdk-0.1.0-beta.0.tgz",
      "brevwick-react": "file:/abs/path/to/brevwick-sdk-js/packages/react/brevwick-react-0.1.0-beta.0.tgz"
    }
  }
}
```

The `dependencies` entries stay after the package publishes to npm; the `pnpm.overrides` block **must be deleted before merging the consumer's PR** (CI installs from npm, not from a local path). Re-run the sync script whenever you change SDK code — there is no live-reload through a tarball.

## Releasing

Releases are driven by [Changesets](https://github.com/changesets/changesets). The two packages are **linked** (version in lockstep) pre-1.0 and currently in **pre-release mode** (`beta`) — `.changeset/pre.json` pins the tag so `changeset version` emits `0.1.0-beta.x` suffixes until the next `changeset pre exit` (planned for the `0.1.0` stabilisation / tradekit cutover, per issue #8).

### Contributor flow

1. On any PR that changes `packages/**`, add a changeset:

   ```bash
   pnpm changeset
   ```

   Pick the affected package(s), the bump type, and write a short summary. Commit the generated `.changeset/*.md` file.

2. CI (`changeset-check`) fails the PR if no changeset is present.

### Publish flow

- On merge to `main`, the `release` workflow runs `changesets/action@v1`.
- If pending changesets exist, the action opens (or updates) a **Version Packages** PR that consumes the changesets, bumps both package versions in lockstep, and updates changelogs.
- **Squash-merging the Version Packages PR** triggers the same workflow on `main`, which then runs `pnpm release` — building and publishing both packages to npm under the `beta` dist-tag with [provenance](https://docs.npmjs.com/generating-provenance-statements).
- GitHub Releases are generated automatically from the changelog body.

### npm dist-tags

- `npm add brevwick-sdk@beta` — canonical install during the `0.1.0-beta.x` MVP line (bleeding edge).
- `npm add brevwick-sdk` — resolves to the `latest` dist-tag once stabilisation at `0.1.0` ships (tradekit cutover). The `latest` tag is intentionally unpopulated during the beta line. The full dist-tag policy is documented in [`brevwick-ops/docs/brevwick-sdd.md` § 12](https://github.com/tatlacas-com/brevwick-ops/blob/main/docs/brevwick-sdd.md#12-client-sdk-contracts) (tracking: brevwick-ops#3).

### Repo secrets

- `NPM_TOKEN` — automation token with publish rights for `brevwick-sdk` and `brevwick-react`. Set under **Settings → Secrets and variables → Actions**. Required by the `release` workflow; `id-token: write` permission is also granted so npm provenance can attest the build.
- `GITHUB_TOKEN` — provided by Actions; the workflow requests `contents: write` and `pull-requests: write` so Changesets can open the Version Packages PR and create releases.

## Status

Phase 0 — scaffolding. Both packages are baselined at `0.1.0-beta.0` on the `beta` dist-tag line; the first published artefact will be `0.1.0-beta.1` once the next real changeset merges to `main` (requires `NPM_TOKEN`, tracked in #15). The packages currently contain only types and the redaction helpers. Real submit/screenshot/rings land in Phase 4 alongside `brevwick-api` Phase 2. Issue #8 targets stabilisation at `0.1.0` on tradekit cutover.
