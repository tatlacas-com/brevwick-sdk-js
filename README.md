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

## Status

Phase 0 — scaffolding. The packages publish as `0.0.0` placeholders containing only types and the redaction helpers. Real submit/screenshot/rings land in Phase 4 alongside `brevwick-api` Phase 2.
