# @tatlacas/brevwick-angular

[![npm](https://img.shields.io/npm/v/@tatlacas/brevwick-angular/beta?label=@tatlacas/brevwick-angular%40beta)](https://www.npmjs.com/package/@tatlacas/brevwick-angular)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](../../LICENSE)

Angular bindings for [Brevwick](https://brevwick.dev) — `provideBrevwick` for DI bootstrap, an injectable `BrevwickService`, and a drop-in `<bw-feedback-button>` standalone component.

Wraps [`@tatlacas/brevwick-sdk`](https://www.npmjs.com/package/@tatlacas/brevwick-sdk) — all configuration and submit semantics live there. This package adds the Angular ergonomics: DI tokens, an `@Injectable` service with Signals reactivity, and an SSR-safe standalone component.

## Install

```bash
npm install @tatlacas/brevwick-angular@beta @tatlacas/brevwick-sdk@beta
```

`@tatlacas/brevwick-sdk`, `@angular/core`, and `@angular/common` are peer dependencies. Installers that respect peer deps (npm 7+, pnpm, yarn 3+) will pull the SDK in automatically; Angular packages come from your existing app.

**Angular:** 17+ (standalone-only, Signals-first). Earlier majors are not supported — the public API uses standalone components and `signal()`.

## Quick start

### Bootstrap

```ts
// src/main.ts
import { bootstrapApplication } from '@angular/platform-browser';
import { provideBrevwick } from '@tatlacas/brevwick-angular';
import { AppComponent } from './app/app.component';

bootstrapApplication(AppComponent, {
  providers: [provideBrevwick({ projectKey: 'pk_live_...' })],
});
```

### Drop-in floating button

```ts
// src/app/app.component.ts
import { Component } from '@angular/core';
import { BwFeedbackButtonComponent } from '@tatlacas/brevwick-angular';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [BwFeedbackButtonComponent],
  template: ` <bw-feedback-button (submit)="onResult($event)" /> `,
})
export class AppComponent {
  onResult(result: unknown) {
    console.log(result);
  }
}
```

### Imperative submit via the service

```ts
import { Component, inject } from '@angular/core';
import { BrevwickService } from '@tatlacas/brevwick-angular';

@Component({
  selector: 'report-bug',
  standalone: true,
  template: `
    <button
      type="button"
      (click)="report()"
      [disabled]="brevwick.status() === 'submitting'"
    >
      {{ brevwick.status() === 'submitting' ? 'Sending…' : 'Report' }}
    </button>
  `,
})
export class ReportBugComponent {
  brevwick = inject(BrevwickService);

  async report() {
    const result = await this.brevwick.submit({
      title: 'Checkout hangs on second attempt',
      description: 'Spinner forever after clicking Pay.',
    });
    if (result.ok) {
      console.log('Filed', result.issue_id);
    }
  }
}
```

## API

### `provideBrevwick(config: BrevwickConfig): EnvironmentProviders`

Bootstrap helper. Pass the result to `bootstrapApplication`'s `providers` array (or to a route's `providers`). Wires `BREVWICK_CONFIG` into Angular's DI tree where `BrevwickService` picks it up.

`BrevwickConfig` is the SDK's configuration object — see the [core SDK config reference](https://www.npmjs.com/package/@tatlacas/brevwick-sdk#brevwickconfig).

### `BrevwickService` (`providedIn: 'root'`)

Single instance per Angular app. SSR-safe via `inject(PLATFORM_ID)` + `isPlatformBrowser`. Handles SDK lifecycle: calls `install()` in the constructor (browser only) and `uninstall()` when the root injector is destroyed.

| Member                         | Type                                                     | Description                                                                                                             |
| ------------------------------ | -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `status`                       | `Signal<'idle' \| 'submitting' \| 'success' \| 'error'>` | Read-only Signal tracking the most recent `submit()` lifecycle. Use directly in templates.                              |
| `submit(input: FeedbackInput)` | `Promise<SubmitResult>`                                  | Forwards to `Brevwick.submit`. Updates `status` automatically. Returns `{ ok: false, error }` on non-browser platforms. |
| `captureScreenshot()`          | `Promise<Blob \| null>`                                  | Forwards to `Brevwick.captureScreenshot`. Returns `null` on non-browser platforms.                                      |
| `reset()`                      | `void`                                                   | Resets `status` to `'idle'`. Does not cancel an in-flight submit.                                                       |

### `<bw-feedback-button>` (`BwFeedbackButtonComponent`)

Standalone component — import it directly into any `@Component({ standalone: true, imports: [BwFeedbackButtonComponent] })`. Renders a launcher (a vertical tab on the right viewport edge by default; a floating corner bubble via `variant="bubble"`) plus a chat-style feedback panel. Opens to a composer with:

- **Textarea** with Enter-to-send (Shift+Enter for newline).
- **Screenshot** capture with region-select overlay (drag a rectangle, or "Capture full page"), tap-to-preview thumbnails, and a combined 5-attachment cap.
- **File attachments** via paperclip icon.
- **Optional "Expected vs Actual"** disclosure.
- **Optional AI-format toggle** (only visible when the project allows per-submitter choice).

Submission goes through `BrevwickService` automatically.

```ts
// Default: vertical tab on the right edge, vertically centered.
<bw-feedback-button
  label="Report a bug"
  (submit)="onResult($event)"
/>

// Legacy floating corner bubble.
<bw-feedback-button variant="bubble" position="bottom-right" />

// Icon-only tab, nudged 120px above the vertical center. The label
// becomes the launcher's aria-label.
<bw-feedback-button [compact]="true" [offset]="-120" label="Report a bug" />
```

> **Migration:** the default presentation changed from the corner bubble to the right-edge tab. Pass `position="bottom-right"` (or your previous corner) to keep the old look — a legacy corner `position` without an explicit `variant` still renders the bubble, so existing call sites are unaffected.

| Input / Output | Type                                                   | Default                                     | Description                                                                                                                                                                          |
| -------------- | ------------------------------------------------------ | ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `variant`      | `'tab' \| 'bubble'`                                    | `'tab'`                                     | Launcher presentation — vertical edge tab (the new default) or the legacy floating corner pill. A legacy corner `position` without an explicit `variant` implies `'bubble'`.         |
| `position`     | `'right' \| 'left' \| 'bottom-right' \| 'bottom-left'` | `'right'` (tab) / `'bottom-right'` (bubble) | Where the launcher sits. Edge sides are the tab's home, corners the bubble's. When `variant` and `position` disagree, `variant` wins and `position` contributes its horizontal side. |
| `compact`      | `boolean`                                              | `false`                                     | Icon-only launcher (circular bubble / square edge tab). The `label` is not rendered but becomes the launcher's `aria-label`.                                                         |
| `offset`       | `number`                                               | `0`                                         | Tab only: vertical offset in px from the viewport's vertical center. Positive moves the tab down, negative up. Ignored for the bubble.                                               |
| `disabled`     | `boolean`                                              | `false`                                     | Launcher renders as disabled and cannot open the panel.                                                                                                                              |
| `hidden`       | `boolean`                                              | `false`                                     | Component renders nothing — useful for feature flags.                                                                                                                                |
| `label`        | `string`                                               | `'Feedback'`                                | Launcher label. Hidden visually when `compact`.                                                                                                                                      |
| `theme`        | `'system' \| 'light' \| 'dark'`                        | `'system'`                                  | Force a palette regardless of OS `prefers-color-scheme`.                                                                                                                             |
| `(submit)`     | `EventEmitter<SubmitResult>`                           | —                                           | Fired after every submit (success or failure).                                                                                                                                       |

### Hiding sensitive content from screenshots

The widget captures the page via `@tatlacas/brevwick-sdk`'s `captureScreenshot()`. Any element tagged `data-brevwick-skip` is hidden before capture and restored after:

```html
<input data-brevwick-skip type="password" />
<div data-brevwick-skip>{{ customerEmail }}</div>
```

The FAB, panel, region overlay, and preview dialog all carry `data-brevwick-skip` themselves, so they never appear in the screenshots they capture.

## SSR / Angular Universal

`BrevwickService` injects `PLATFORM_ID` and gates SDK construction on `isPlatformBrowser`. On the server, `submit()` returns an `error` `SubmitResult` and `captureScreenshot()` returns `null` so consumer code can `await` either without branching on the platform itself.

The standalone component renders nodes server-side but its click handler short-circuits on non-browser platforms, so a server-rendered FAB never attempts DOM-only work.

```ts
// main.server.ts (Angular Universal)
import { provideServerRendering } from '@angular/platform-server';
import { provideBrevwick } from '@tatlacas/brevwick-angular';

bootstrap = () =>
  bootstrapApplication(AppComponent, {
    providers: [
      provideServerRendering(),
      provideBrevwick({ projectKey: 'pk_live_...' }), // safe — service is a no-op on server
    ],
  });
```

## Bundle size

| Surface                | Budget          | Notes                                                                                                               |
| ---------------------- | --------------- | ------------------------------------------------------------------------------------------------------------------- |
| Eager (`fesm2022.mjs`) | **≤ 8 kB gzip** | Angular's `@Injectable`, standalone-component, and Signals scaffolding accounts for ~4-5 kB; our code lands on top. |
| On widget open         | ≤ 25 kB gzip    | `modern-screenshot` is dynamic-imported on the first capture via the SDK — same lazy chunk every adapter shares.    |

The Angular envelope is intentionally larger than the React/Vue/Svelte/Solid adapters because the underlying framework has irreducible runtime overhead per `@Injectable` + standalone component. The eager budget is enforced by [`size-limit`](../../.size-limit.js). `<bw-feedback-button>` only reaches `captureScreenshot` when the user clicks the screenshot button, so `modern-screenshot` stays on the lazy widget-open chunk.

## Build & versioning

This package is built with **`ng-packagr`** (Angular Package Format) — divergent from the rest of the monorepo's `tsup` adapters. The output is a single FESM2022 ESM bundle plus `.d.ts` types; no CJS counterpart, in line with Angular's library guidance.

Versions move in lockstep with `@tatlacas/brevwick-sdk` and `@tatlacas/brevwick-react` until the API stabilises post-1.0.

## License

MIT — see [LICENSE](../../LICENSE).
