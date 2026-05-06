# Brevwick Angular example

Minimal Angular 17+ standalone application that demonstrates `@tatlacas/brevwick-angular`.

## Run it

```bash
pnpm install
pnpm --filter @tatlacas/brevwick-sdk --filter @tatlacas/brevwick-angular build
pnpm --filter brevwick-example-angular start
```

Open http://localhost:4200. The Feedback FAB pins to the bottom-right.

## Configure your project key

Edit `src/environments/environment.ts` (and `environment.prod.ts` for production builds) and replace `pk_test_demo` with your real key from https://brevwick.com.

Angular doesn't ship a built-in `import.meta.env`-style env-var mechanism for app code, so the environment files plus the `fileReplacements` block in `angular.json` are the canonical pattern.

## What this demonstrates

- `bootstrapApplication` + `provideBrevwick(config)` in `src/main.ts`
- Standalone-component import of `BwFeedbackButtonComponent` in `src/app/app.component.ts`
- `(submit)` output binding so the host app can react to submission results
