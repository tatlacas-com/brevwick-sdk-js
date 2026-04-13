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

## Releasing

Releases are driven by [Changesets](https://github.com/changesets/changesets). The two packages are **linked** (version in lockstep) pre-1.0.

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

- `npm add brevwick-sdk` resolves to the latest `latest`-tagged version (stable). During the pre-1.0 beta line this may not yet exist.
- `npm add brevwick-sdk@beta` is the bleeding edge.

### Repo secrets

- `NPM_TOKEN` — automation token with publish rights for `brevwick-sdk` and `brevwick-react`. Set under **Settings → Secrets and variables → Actions**. Required by the `release` workflow; `id-token: write` permission is also granted so npm provenance can attest the build.
- `GITHUB_TOKEN` — provided by Actions; the workflow requests `contents: write` and `pull-requests: write` so Changesets can open the Version Packages PR and create releases.

## Status

Phase 0 — scaffolding. The packages publish as `0.0.0` placeholders containing only types and the redaction helpers. Real submit/screenshot/rings land in Phase 4 alongside `brevwick-api` Phase 2.
