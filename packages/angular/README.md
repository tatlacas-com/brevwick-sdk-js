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

Standalone component — import it directly into any `@Component({ standalone: true, imports: [BwFeedbackButtonComponent] })`. Renders a FAB plus a minimal text-only panel (textarea + send button); the component does not capture screenshots — apps that need that fidelity wrap `BrevwickService.captureScreenshot()` themselves and pass the resulting `Blob` through `submit()`'s `attachments` field. Submission goes through `BrevwickService` automatically.

```ts
<bw-feedback-button
  position="bottom-right"
  label="Report a bug"
  (submit)="onResult($event)"
/>
```

| Input / Output | Type                              | Default          | Description                                           |
| -------------- | --------------------------------- | ---------------- | ----------------------------------------------------- |
| `position`     | `'bottom-right' \| 'bottom-left'` | `'bottom-right'` | Which corner the FAB pins to.                         |
| `disabled`     | `boolean`                         | `false`          | FAB renders as disabled and cannot open the panel.    |
| `hidden`       | `boolean`                         | `false`          | Component renders nothing — useful for feature flags. |
| `label`        | `string`                          | `'Feedback'`     | FAB label.                                            |
| `(submit)`     | `EventEmitter<SubmitResult>`      | —                | Fired after every submit (success or failure).        |

> The Angular component is a deliberately lean baseline. The full chat-style panel — multi-screenshot, region-select capture, AI toggle, etc. — currently lives in `@tatlacas/brevwick-react`. Apps that need that fidelity in Angular today should wrap `BrevwickService` with their own component using whichever Angular UI library they already use.

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

| Surface                | Budget          | Notes                                                                                                                                                                                |
| ---------------------- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Eager (`fesm2022.mjs`) | **≤ 8 kB gzip** | Angular's `@Injectable`, standalone-component, and Signals scaffolding accounts for ~4-5 kB; our code lands on top.                                                                  |
| On widget open         | ≤ 25 kB gzip    | If you wire `BrevwickService.captureScreenshot()` into your own component, `modern-screenshot` is dynamic-imported on first call via the SDK — same lazy chunk every adapter shares. |

The Angular envelope is intentionally larger than the React/Vue/Svelte/Solid adapters because the underlying framework has irreducible runtime overhead per `@Injectable` + standalone component. The eager budget is enforced by [`size-limit`](../../.size-limit.js); `<bw-feedback-button>` itself does not invoke `captureScreenshot` — the lean baseline submits text only.

## Build & versioning

This package is built with **`ng-packagr`** (Angular Package Format) — divergent from the rest of the monorepo's `tsup` adapters. The output is a single FESM2022 ESM bundle plus `.d.ts` types; no CJS counterpart, in line with Angular's library guidance.

Versions move in lockstep with `@tatlacas/brevwick-sdk` and `@tatlacas/brevwick-react` until the API stabilises post-1.0.

## License

MIT — see [LICENSE](../../LICENSE).
