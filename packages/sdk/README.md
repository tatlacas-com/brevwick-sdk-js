# @tatlacas/brevwick-sdk

[![npm](https://img.shields.io/npm/v/@tatlacas/brevwick-sdk/beta?label=@tatlacas/brevwick-sdk%40beta)](https://www.npmjs.com/package/@tatlacas/brevwick-sdk)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](../../LICENSE)

Framework-agnostic core SDK for [Brevwick](https://brevwick.dev). Submit issues from any browser app — screenshot, redact, send. AI-formatted into clean, triage-ready GitHub issues.

For React apps, use [`@tatlacas/brevwick-react`](https://www.npmjs.com/package/@tatlacas/brevwick-react) (provider, hook, floating-action-button widget). This package is the underlying primitive and ships the entire wire protocol.

## Install

```bash
npm install @tatlacas/brevwick-sdk@beta
```

Or with pnpm / yarn / bun — same name. Pre-1.0 releases track the `beta` dist-tag.

## Quick start

```ts
import { createBrevwick } from '@tatlacas/brevwick-sdk';

const bw = createBrevwick({
  projectKey: 'pk_live_...',
  buildSha: process.env.BUILD_SHA,
});

// Start capturing console + network + route rings. Safe to call multiple times.
bw.install();

const result = await bw.submit({
  description: 'Checkout hangs after pressing Pay the second time',
  expected: 'Order completes and confirmation page loads',
  actual: 'Button stays spinning for 30s, then nothing',
  attachments: [await bw.captureScreenshot()],
});

if (result.ok) {
  console.log('Issue filed:', result.issue_id);
} else {
  console.error(result.error.code, result.error.message);
}
```

`submit()` never throws for normal failures — callers discriminate on `result.ok`.

## Configuration

```ts
createBrevwick(config: BrevwickConfig): Brevwick
```

### `BrevwickConfig`

| Field               | Type                                   | Default                    | Description                                                                                                                                                                             |
| ------------------- | -------------------------------------- | -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `projectKey`        | `string`                               | **required**               | Public ingest key, e.g. `pk_live_xxx` or `pk_test_xxx`. Safe to ship in client bundles.                                                                                                 |
| `endpoint`          | `string`                               | `https://api.brevwick.com` | Override the ingest endpoint. Useful for self-hosted or staging.                                                                                                                        |
| `environment`       | `'dev' \| 'stg' \| 'prod'`             | _unset_                    | Tag issues with the environment they came from.                                                                                                                                         |
| `enabled`           | `boolean`                              | `true`                     | Set `false` to make every method a no-op. Useful in tests or during incidents.                                                                                                          |
| `buildSha`          | `string`                               | _unset_                    | Build SHA included on every issue. Typically `process.env.BUILD_SHA` or your CI commit.                                                                                                 |
| `release`           | `string`                               | _unset_                    | Released app version, e.g. `1.4.2`.                                                                                                                                                     |
| `userContext`       | `() => Record<string, unknown>`        | _unset_                    | Resolved at submit time and merged into `user_context`. Use a function so changing values (route, feature flags, auth state) are captured at the moment of submission, not at SDK init. |
| `user`              | `{ id: string; [k: string]: unknown }` | _unset_                    | Opaque user identity attached to issues. `id` is required; any extra fields ride along.                                                                                                 |
| `rings`             | `{ console?, network?, route? }`       | all `true`                 | Per-ring toggles. Each ring captures at most a small rolling buffer of recent events.                                                                                                   |
| `fingerprintOptOut` | `boolean`                              | `false`                    | Send `X-Brevwick-Fingerprint-Optout: 1` to skip the server-side salted fingerprint.                                                                                                     |

### Example with everything set

```ts
const bw = createBrevwick({
  projectKey: 'pk_live_abc123',
  environment: 'prod',
  buildSha: process.env.NEXT_PUBLIC_BUILD_SHA,
  release: process.env.NEXT_PUBLIC_APP_VERSION,
  user: { id: currentUser.id, plan: currentUser.plan },
  userContext: () => ({
    route: window.location.pathname,
    locale: document.documentElement.lang,
  }),
  rings: { console: true, network: true, route: true },
});

bw.install();
```

## The `Brevwick` instance

`createBrevwick(config)` returns a `Brevwick` object with the following methods.

### `install(): void`

Starts the enabled rings (console / network / route). Safe to call more than once — subsequent calls while already installed are no-ops. Full no-op in non-browser contexts (SSR, workers).

### `uninstall(): void`

Restores every patched global and drains internal buffers. A second call is a no-op. After `uninstall()`, calling `install()` again on the same instance is **not supported** and will throw — create a new instance if you need to restart.

### `submit(input: FeedbackInput): Promise<SubmitResult>`

Send a feedback issue. Resolves to a tagged union — **does not throw** for ingest errors.

**`FeedbackInput`:**

| Field         | Type                                | Description                                                                                                                                             |
| ------------- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `description` | `string`                            | **Required.** The body of the issue — what happened, from the user's perspective.                                                                       |
| `title`       | `string`                            | Optional issue title. Defaults to the first line of `description`, truncated to 120 chars.                                                              |
| `expected`    | `string`                            | What the user expected to see.                                                                                                                          |
| `actual`      | `string`                            | What actually happened.                                                                                                                                 |
| `attachments` | `Array<Blob \| FeedbackAttachment>` | Up to 5 files, each ≤ 10 MB, MIME in `image/png`, `image/jpeg`, `image/webp`, `video/webm`.                                                             |
| `use_ai`      | `boolean`                           | Per-issue AI formatting opt-in/out. Only honoured when the project enables submitter choice; omit otherwise and the server applies the project default. |

**`FeedbackAttachment`:**

```ts
interface FeedbackAttachment {
  blob: Blob;
  filename?: string;
}
```

Plain `Blob`s also work — Brevwick will derive a filename from the MIME type.

**`SubmitResult`:**

```ts
type SubmitResult =
  | { ok: true; issue_id: string }
  | { ok: false; error: { code: SubmitErrorCode; message: string } };
```

**`SubmitErrorCode`:**

| Code                       | When it fires                                                                                                                                                                                                   |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ATTACHMENT_UPLOAD_FAILED` | Client-side validation rejected an attachment (count > 5, size > 10 MB, disallowed MIME), or the presign / R2 PUT failed before the issue POST was reached.                                                     |
| `INGEST_REJECTED`          | Ingest endpoint returned a 4xx (e.g. quota exceeded, payload too large). Not retried — the same payload would be rejected again. The server-echoed message is appended (capped at 256 chars, already redacted). |
| `INGEST_RETRY_EXHAUSTED`   | Ingest POST hit the max retry count (one initial + two backoffs) on 5xx / thrown fetch and never succeeded.                                                                                                     |
| `INGEST_TIMEOUT`           | The 30 s total-budget AbortController fired before the pipeline completed.                                                                                                                                      |
| `INGEST_INVALID_RESPONSE`  | Ingest returned 2xx with a body that didn't parse as JSON or didn't include a string `issue_id`.                                                                                                                |

The one case where `submit()` rejects instead of resolving is an environmental failure before the pipeline runs — the lazy `submit` chunk fails to load (offline, CDN outage, deploy mismatch). A rejection is the honest signal that the request never reached the ingest. Wrap in `.catch` if your app runs in hostile environments.

### `captureScreenshot(opts?): Promise<Blob>`

Capture a WebP screenshot of the current page (or a sub-tree). **Never throws** — on failure, returns a 1×1 transparent WebP placeholder so callers that always attach the result still get a valid `image/webp` blob.

```ts
const blob = await bw.captureScreenshot({
  element: document.getElementById('app') ?? undefined,
  quality: 0.9,
});
```

**Options:**

| Field     | Type           | Default                    | Description                                                                                                                     |
| --------- | -------------- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `element` | `HTMLElement`  | `document.documentElement` | Sub-tree to capture. Only _descendants_ with `[data-brevwick-skip]` are scrubbed — a skip marker on the root itself is ignored. |
| `quality` | `number` (0–1) | `0.85`                     | WebP encoder quality, forwarded to `modern-screenshot`'s `domToBlob`.                                                           |

**Screenshot privacy:** any element marked `data-brevwick-skip` is hidden before capture and restored afterwards, even on failure. Use it on password fields, PII, card numbers, anything that should never land in a bug report:

```html
<input data-brevwick-skip type="password" />
<div data-brevwick-skip>{customerEmail}</div>
```

A tree-shakable top-level `captureScreenshot` is also exported for standalone use (no Brevwick instance required). It's dynamically imported on first call so `modern-screenshot` stays out of your initial bundle:

```ts
import { captureScreenshot } from '@tatlacas/brevwick-sdk';
const blob = await captureScreenshot({ quality: 0.9 });
```

### `getConfig(): Promise<ProjectConfig | null>`

Fetches project-level AI config from `GET /v1/ingest/config`. Used by the React widget to decide whether to render the per-issue "Format with AI" toggle. Returns `null` on non-2xx, malformed JSON, or thrown fetch — treat `null` as "no submitter choice, use server default". Cached per instance for the session.

```ts
interface ProjectConfig {
  ai_enabled: boolean;
  ai_submitter_choice_allowed: boolean;
}
```

## Redaction

Every payload runs through the redactor before it leaves the browser:

- **Console ring** — `log`/`info`/`warn`/`error`/`debug` messages, deduped across identical repeats within a window.
- **Network ring** — failed requests (status ≥ 400 or thrown). Request body capped at 2 kB, response body at 4 kB, both redacted. Headers are allow-listed.
- **Route ring** — `pushState` / `popstate` / `hashchange` route transitions.

Built-in patterns cover Bearer tokens, cookies, email addresses, credit-card-shaped numbers, and common API-key prefixes. Server-side sanitisation runs as defence-in-depth, but **the client redactor is the primary guarantee** — nothing leaves the device unredacted.

You never need to wire redaction yourself — it's always on.

## Bundle size

Enforced in CI via `size-limit` and asserted in tests:

- **Initial chunk (`createBrevwick` + rings + `submit`):** ≤ 2.2 kB gzip.
- **On first `captureScreenshot()` call:** `modern-screenshot` dynamic-imports and adds up to ≤ 25 kB gzip.

Everything heavy is dynamic-imported on demand — importing this package does not pull in the screenshot encoder until a capture actually runs.

## `sideEffects: false`

The package is marked `"sideEffects": false`. Bundlers will tree-shake away everything you don't import.

## TypeScript

First-class TS — the package ships `.d.ts` for both ESM and CJS. Key types re-exported:

```ts
import type {
  Brevwick,
  BrevwickConfig,
  CaptureScreenshotOpts,
  Environment,
  FeedbackAttachment,
  FeedbackInput,
  ProjectConfig,
  SubmitError,
  SubmitErrorCode,
  SubmitResult,
} from '@tatlacas/brevwick-sdk';
```

## Browser support

ES2020 targets — modern evergreen browsers (Chrome/Edge 90+, Firefox 90+, Safari 15+). No IE, no transpile-down. Runs fine inside SSR / workers as a no-op (methods defer to real work on first client mount).

## Links

- **Docs / dashboard:** [brevwick.dev](https://brevwick.dev)
- **React bindings:** [`@tatlacas/brevwick-react`](https://www.npmjs.com/package/@tatlacas/brevwick-react)
- **Source:** [github.com/tatlacas-com/brevwick-sdk-js](https://github.com/tatlacas-com/brevwick-sdk-js)
- **Issues:** [github.com/tatlacas-com/brevwick-sdk-js/issues](https://github.com/tatlacas-com/brevwick-sdk-js/issues)

## License

[MIT](../../LICENSE)
