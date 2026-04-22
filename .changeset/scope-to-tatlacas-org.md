---
'@tatlacas/brevwick-sdk': minor
'@tatlacas/brevwick-react': minor
---

Rename packages to the `@tatlacas` npm scope: `brevwick-sdk` → `@tatlacas/brevwick-sdk` and `brevwick-react` → `@tatlacas/brevwick-react`. The public API surface is unchanged — only the install name differs.

**Consumers must update their `package.json` and imports:**

```diff
- import { createBrevwick } from 'brevwick-sdk';
+ import { createBrevwick } from '@tatlacas/brevwick-sdk';
```

```diff
- import { BrevwickProvider, FeedbackButton } from 'brevwick-react';
+ import { BrevwickProvider, FeedbackButton } from '@tatlacas/brevwick-react';
```

Wire-level identifiers (the `sdk.name: 'brevwick-sdk'` field in ingest payloads and the `X-Brevwick-SDK` request header) are intentionally preserved, so server-side filters on the SDK identifier continue to match.
