# @tatlacas/brevwick-react-native

[![npm](https://img.shields.io/npm/v/@tatlacas/brevwick-react-native/beta?label=@tatlacas/brevwick-react-native%40beta)](https://www.npmjs.com/package/@tatlacas/brevwick-react-native)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](../../LICENSE)

React Native bindings for [Brevwick](https://brevwick.dev) — a provider, a
drop-in `<FeedbackButton />` launcher + modal feedback form, a
`useFeedback` hook, a `useRouteRing` helper for React Navigation / Expo
Router, a `BrevwickSkip` wrapper, and a native screenshot path that
gracefully falls back to a placeholder when the optional
`react-native-view-shot` peer isn't installed.

Wraps [`@tatlacas/brevwick-sdk`](https://www.npmjs.com/package/@tatlacas/brevwick-sdk)
— all configuration, redaction, and submit semantics live there. This
package adds the React Native ergonomics (Hermes-safe imports, RN device
context, native screenshot via `react-native-view-shot`).

For React on the web (Next.js, Remix, Vite, CRA, Astro), see
[`@tatlacas/brevwick-react`](../react).

## Install

### Expo (managed or bare)

```bash
npx expo install @tatlacas/brevwick-react-native @tatlacas/brevwick-sdk
# Optional — required for real screenshots; without it the SDK returns
# a 1×1 transparent PNG placeholder (never-throws contract).
npx expo install react-native-view-shot
```

### Bare React Native

```bash
npm install @tatlacas/brevwick-react-native @tatlacas/brevwick-sdk
npm install react-native-view-shot   # optional — see Screenshots below
cd ios && pod install && cd ..       # iOS only — react-native-view-shot ships native code
```

`@tatlacas/brevwick-sdk` is a peer dependency. Installers that respect peer
deps (npm 7+, pnpm, yarn 3+) pull it in automatically.

### Peer dependency matrix

| Peer                     | Range                                     | Notes                                                                                                                                                                                                          |
| ------------------------ | ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `react`                  | `>=18 <20`                                | 18.x and 19.x both supported.                                                                                                                                                                                  |
| `react-native`           | `>=0.72 <0.78`                            | Hermes and JSC both work; New Architecture is supported.                                                                                                                                                       |
| `@tatlacas/brevwick-sdk` | matches `@tatlacas/brevwick-react-native` | Lockstep with this package — `npm install @tatlacas/brevwick-react-native` resolves the matching version automatically.                                                                                        |
| `react-native-view-shot` | `>=3.8.0 <5`                              | **Optional.** Without it, screenshots resolve to a 1×1 placeholder PNG. Expo SDK 51 ships `~3.8.0`; bare RN typically pins `^4.0.0`. Both work — `captureRef` returns the same data-URI shape on either major. |

## Quick start

```tsx
import { useMemo } from 'react';
import {
  NavigationContainer,
  useNavigationContainerRef,
} from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import {
  BrevwickProvider,
  FeedbackButton,
  type BrevwickConfig,
} from '@tatlacas/brevwick-react-native';
import { Home } from './screens/Home';
import { Details } from './screens/Details';

const Stack = createStackNavigator();

export default function App() {
  const navigationRef = useNavigationContainerRef();
  // Hoist or memoise — the provider keys its SDK instance on config identity.
  const config = useMemo<BrevwickConfig>(
    () => ({
      projectKey: process.env.EXPO_PUBLIC_BREVWICK_PROJECT_KEY!,
    }),
    [],
  );

  return (
    <BrevwickProvider config={config} navigationRef={navigationRef}>
      <NavigationContainer ref={navigationRef}>
        <Stack.Navigator>
          <Stack.Screen name="Home" component={Home} />
          <Stack.Screen name="Details" component={Details} />
        </Stack.Navigator>
      </NavigationContainer>
      <FeedbackButton />
    </BrevwickProvider>
  );
}
```

`<FeedbackButton />` renders a vertical feedback tab flush against the
right edge of the host view by default — see
[`FeedbackButton`](#feedbackbutton) for the bubble variant, placement,
and compact mode.

End-to-end runnable app:
[`examples/react-native`](https://github.com/tatlacas-com/brevwick-sdk-js/tree/main/examples/react-native).

> **Hoist `config` to module scope or memoise with `useMemo`.** The provider
> keys the underlying SDK instance on config identity — passing a new
> literal each render would cycle `install` / `uninstall` on every render.

## `BrevwickProvider`

Top-level provider. Memoises a single SDK instance on `config` identity,
calls `install()` on mount and `uninstall()` on unmount, and forwards an
optional `navigationRef` to descendants via context for the route-ring
wiring.

```tsx
<BrevwickProvider config={brevwickConfig} navigationRef={navigationRef}>
  {children}
</BrevwickProvider>
```

| Prop             | Type                    | Description                                                                                                                                     |
| ---------------- | ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `config`         | `BrevwickConfig`        | SDK config — see the [core SDK reference](https://www.npmjs.com/package/@tatlacas/brevwick-sdk). **Reference-stable**: hoist or memoise.        |
| `navigationRef?` | `BrevwickNavigationRef` | Optional. Forwarded to descendants via `BrevwickNavigationRefContext`. Read by the route-ring helper; the provider does not subscribe directly. |
| `children?`      | `ReactNode`             | Your tree.                                                                                                                                      |

## Route ring (React Navigation + Expo Router)

`useNavigationContainerRef()` from `@react-navigation/native` returns a
ref accepted directly by `BrevwickProvider`. Expo Router rides on top of
React Navigation, so the same wiring serves both.

```tsx
import { useRouteRing } from '@tatlacas/brevwick-react-native';

function RouteRingBridge() {
  useRouteRing();
  return null;
}
```

Render `<RouteRingBridge />` anywhere inside `<BrevwickProvider>` and
React Navigation `state` events flow into the SDK's 20-entry route ring
(FIFO, capped automatically). Path params matching `:token`, `:auth`,
`:key`, `:session`, or `:sig` are masked, and every other param value is
redacted via the SDK's global `redact()` before percent-encoding so a JWT
or email carried by a benign-named key is still scrubbed.

`useRouteRing` resolves both the `Brevwick` instance and the
`navigationRef` from context (the prop you forwarded to
`<BrevwickProvider>`). For unusual layouts where the bridge is mounted
outside the provider tree, pass an explicit ref:

```tsx
useRouteRing(navigationRef);
```

The drop-in `<FeedbackButton />` does not own this wiring — keep the
bridge mounted alongside it when you want route breadcrumbs in submits.
Under the hood the hook composes `attachRouteRing(navigationRef, push)`
with a captured `Brevwick._internal.push` — the lockstep coupling that
the SDK + adapters version together. Consumers should prefer the hook
over reaching into `_internal` directly so the documented-private surface
crosses the adapter boundary in exactly one place.

## `FeedbackButton`

Drop-in feedback launcher + modal feedback form. The launcher renders as
a vertical tab flush against the right edge of the host view by default
(vertically centered), or as the classic floating corner bubble via
`variant="bubble"`. The label tracks the submit lifecycle
(`Send feedback` → `Capturing…` → `Sending…` → `Sent ✓` / `Try again`).

```tsx
// Default: vertical tab on the right edge, vertically centered.
<FeedbackButton />

// Icon-only tab, nudged 120 logical px above the vertical center. The
// label becomes the launcher's accessibilityLabel.
<FeedbackButton compact offset={-120} label="Report a bug" />

// Legacy floating corner bubble (24px inset), or with explicit offsets
// to clear a tab bar / safe area — both imply the bubble:
<FeedbackButton position="bottom-right" />
<FeedbackButton position={{ bottom: 96, right: 16 }} />
```

> **Migration:** the default presentation changed from the corner bubble
> to the right-edge tab. Pass `position="bottom-right"` (or your previous
> corner / offset object) to keep the old look — a legacy corner or
> offset-object `position` without an explicit `variant` still renders
> the bubble, so existing call sites are unaffected.

### Props

| Prop       | Type                                                                                 | Default                                     | Description                                                                                                                                                                                                                    |
| ---------- | ------------------------------------------------------------------------------------ | ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `variant`  | `'tab' \| 'bubble'`                                                                  | `'tab'`                                     | Launcher presentation — vertical edge tab (the new default) or the legacy floating corner pill. A legacy corner / offset-object `position` without an explicit `variant` implies `'bubble'`.                                   |
| `position` | `'right' \| 'left' \| 'bottom-right' \| 'bottom-left' \| { bottom?, right?, left? }` | `'right'` (tab) / `'bottom-right'` (bubble) | Where the launcher sits. The offset-object form is RN-only (safe areas / tab bars have no DOM analogue) and applies to the bubble; when `variant` and `position` disagree, `variant` wins and `position` contributes its side. |
| `compact`  | `boolean`                                                                            | `false`                                     | Icon-only launcher (circular bubble / square edge tab). The label — including the phase-tracking copy — is not rendered; `label` (or `'Feedback'`) becomes the `accessibilityLabel`.                                           |
| `offset`   | `number`                                                                             | `0`                                         | Tab only: vertical offset in logical px from the host view's vertical center. Positive moves the tab down, negative up. Ignored for the bubble.                                                                                |
| `label`    | `string`                                                                             | phase-driven                                | Label override. Default copy advances by submission phase, so most apps leave it unset. Hidden visually when `compact`.                                                                                                        |
| `theme`    | `'system' \| 'light' \| 'dark'`                                                      | `'system'`                                  | Forced palette. `'system'` follows the host color scheme.                                                                                                                                                                      |
| `style`    | `StyleProp<ViewStyle>`                                                               | —                                           | Style overrides applied last to the launcher Pressable, so consumer entries win.                                                                                                                                               |
| `hidden`   | `boolean`                                                                            | `false`                                     | Renders nothing — useful for feature flags.                                                                                                                                                                                    |
| `disabled` | `boolean`                                                                            | `false`                                     | Launcher renders disabled and cannot open the modal.                                                                                                                                                                           |

Must be rendered inside `<BrevwickProvider>` — `useFeedback()` throws
synchronously otherwise.

## `useFeedback`

Hook for building a custom feedback UI against the `BrevwickProvider`
instance.

```tsx
import { useState } from 'react';
import { Modal, Pressable, Text, TextInput, View } from 'react-native';
import { useFeedback } from '@tatlacas/brevwick-react-native';

export function FeedbackFab() {
  const [open, setOpen] = useState(false);
  const [description, setDescription] = useState('');
  const { submit, status, error, reset } = useFeedback();

  async function handleSubmit() {
    const result = await submit({ description });
    if (result.ok) {
      setDescription('');
      setOpen(false);
      reset();
    }
  }

  return (
    <>
      <Pressable onPress={() => setOpen(true)}>
        <Text>Feedback</Text>
      </Pressable>
      <Modal visible={open} animationType="slide" transparent>
        <View>
          <TextInput
            multiline
            value={description}
            onChangeText={setDescription}
          />
          {status === 'error' && error ? <Text>{error.message}</Text> : null}
          <Pressable onPress={handleSubmit} disabled={status === 'submitting'}>
            <Text>{status === 'submitting' ? 'Sending…' : 'Send'}</Text>
          </Pressable>
        </View>
      </Modal>
    </>
  );
}
```

### Return value

| Field               | Type                                                                         | Description                                                                                                                                                                                                                                                                                                     |
| ------------------- | ---------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `submit`            | `(input: FeedbackInput) => Promise<SubmitResult>`                            | Submit feedback. Returns the same tagged union the core SDK returns.                                                                                                                                                                                                                                            |
| `captureScreenshot` | `(viewRef?: RefObject<View>, opts?: CaptureScreenshotOpts) => Promise<Blob>` | Capture a screenshot. **Pass a `viewRef` for real captures on RN** — it routes through `react-native-view-shot` (placeholder PNG when the optional peer is missing). Without a `viewRef` the call falls through to the core SDK's DOM-based path, which on RN always resolves to the placeholder. Never throws. |
| `status`            | `FeedbackStatus`                                                             | `'idle' \| 'submitting' \| 'success' \| 'error'`. Backwards-compatible lifecycle.                                                                                                                                                                                                                               |
| `phase`             | `FeedbackPhase`                                                              | Submit-pipeline phase driven by the SDK's internal phase event.                                                                                                                                                                                                                                                 |
| `error`             | `SubmitError \| null`                                                        | Tagged error from the most recent failed submit. Cleared on the next `submit()` / `retry()` / `reset()`.                                                                                                                                                                                                        |
| `retry`             | `() => Promise<SubmitResult \| undefined>`                                   | Re-run the most recent `submit()` with the same input. No-op when no submit has been attempted.                                                                                                                                                                                                                 |
| `reset`             | `() => void`                                                                 | Reset `status` + `phase` back to `'idle'`, clear `error`, and forget the last submitted input.                                                                                                                                                                                                                  |

Throws synchronously on mount when rendered outside a `BrevwickProvider`.

## Screenshots

`react-native-view-shot` is an optional peer dependency. When present, the
SDK rasterises the View tree rooted at the supplied ref via `captureRef`.
When absent — or in Expo Go, where the native module is not bundled — the
SDK returns a 1×1 transparent PNG placeholder so callers that always
attach the result still see a valid `image/png` Blob (the never-throws
contract from SDD § 12).

```tsx
import { useRef } from 'react';
import { View } from 'react-native';
import {
  captureScreenshot,
  BrevwickSkip,
} from '@tatlacas/brevwick-react-native';

function Screen() {
  const ref = useRef<View>(null);

  async function snap() {
    const blob = await captureScreenshot(ref); // never throws
    // …attach to your submit payload
  }

  return (
    <View ref={ref}>
      <BrevwickSkip>
        {/* hidden during capture, restored after */}
        <SecretToken />
      </BrevwickSkip>
    </View>
  );
}
```

> **Expo Go limitation.** `react-native-view-shot` ships native code, so
> Expo Go cannot load it; capture falls through to the placeholder. Build
> a custom dev client to see real screenshots:
> <https://docs.expo.dev/develop/development-builds/introduction/>.

## Device context

`collectDeviceContext()` returns a wire-ready object that mirrors the
core SDK's `device_context` shape with one deliberate divergence:
`platform` is `'react-native-ios'` / `'react-native-android'` so triage
dashboards can split the cohort without branching on `sdk.name`.

```ts
import { collectDeviceContext } from '@tatlacas/brevwick-react-native';

const ctx = collectDeviceContext();
// → { ua, locale?, viewport?: { w, h }, platform, sdk: { name, version, platform } }
```

Read once on first call (static fields) and re-reads `viewport` per call
so orientation / locale changes show up on the next submit.

## Theming

The `theme` prop on `<FeedbackButton />` accepts
`'system' | 'light' | 'dark'`, matching the React (web) widget —
`'system'` (the default) follows the host's color scheme. The underlying
token surface (accent / panel / chip / border) is shared with
`@tatlacas/brevwick-react`; custom UIs built on `useFeedback` control
their own surface (see the snippet above).

## Hiding sensitive content from screenshots

Wrap the subtree in `<BrevwickSkip>`. The wrapper installs a refcount-aware
hide / restore on the underlying View ref so concurrent captures cannot
strand the UI hidden:

```tsx
<BrevwickSkip>
  <Text>{customerEmail}</Text>
</BrevwickSkip>
```

The skip pattern mirrors `data-brevwick-skip` on the web SDK.

## Troubleshooting

### Metro can't resolve `@tatlacas/brevwick-react-native` in a monorepo

In a pnpm / yarn workspace, Metro defaults to walking only the project's
`node_modules` — which under pnpm only contains a symlink. Add the
workspace root to `watchFolders`:

```js
// metro.config.js
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];
config.resolver.disableHierarchicalLookup = true;

module.exports = config;
```

Reference:
[`examples/react-native/metro.config.js`](https://github.com/tatlacas-com/brevwick-sdk-js/tree/main/examples/react-native/metro.config.js).

### "Unable to resolve module react-native-view-shot"

Nothing in this package hard-imports `react-native-view-shot` — the
runtime `await import('react-native-view-shot')` is wrapped in a
`.catch(() => null)` so a missing peer falls through to the placeholder.
Metro, however, walks `import()` calls statically at bundle time and
will still raise the resolver error before the runtime guard runs.

Pick one:

- **Install the peer** (recommended). `npx expo install react-native-view-shot`,
  then `pod install` for bare RN. The placeholder path then only fires
  when the native module fails to load (e.g. running in Expo Go).
- **Tell Metro to skip the resolution.** Add the package to Metro's
  `resolver.blockList` so the dynamic `import()` is replaced with a
  resolver miss the runtime guard catches:

  ```js
  // metro.config.js
  const exclusionList = require('metro-config/src/defaults/exclusionList');

  config.resolver.blockList = exclusionList([
    /node_modules\/react-native-view-shot\/.*/,
  ]);
  ```

  Captures resolve to the placeholder PNG; `useFeedback().captureScreenshot`
  and the standalone `captureScreenshot(viewRef)` keep their never-throws
  contract.

### Hermes vs JSC

Both are supported. The package uses no Hermes-specific features and no
APIs missing from JSC. The screenshot path is the only place where the
runtime matters, and it gates on `react-native-view-shot`'s presence (a
native-module question, not a JS-engine one).

### Workspace `react-native` field

This package publishes `"react-native": "./src/index.ts"` so Metro
prefers the source over the `dist/` build. If you see "Cannot find
module … react-native-view-shot" only in production bundles, ensure your
Metro `resolver.assetExts` / `resolver.sourceExts` defaults are intact —
overriding them without including the originals strips `.ts` resolution.

## `BREVWICK_REACT_NATIVE_VERSION`

Exported semver string of the installed package — useful for diagnostics.

```ts
import { BREVWICK_REACT_NATIVE_VERSION } from '@tatlacas/brevwick-react-native';
console.log('@tatlacas/brevwick-react-native', BREVWICK_REACT_NATIVE_VERSION);
```

## TypeScript

Full types ship as `.d.ts` for both ESM and CJS. Re-exports include the
SDK types RN consumers most often touch:

```ts
import type {
  BrevwickProviderProps,
  BrevwickNavigationRef,
  CaptureScreenshotOpts,
  DeviceContext,
  FeedbackPhase,
  FeedbackStatus,
  UseFeedbackResult,
  // re-exported from @tatlacas/brevwick-sdk for convenience:
  Brevwick,
  BrevwickConfig,
  FeedbackAttachment,
  FeedbackInput,
  SubmitError,
  SubmitErrorCode,
  SubmitResult,
} from '@tatlacas/brevwick-react-native';
```

## Bundle

- `react-native-view-shot` is dynamically `import()`-ed on first capture
  — not at provider mount, not at button render — so an app that never
  takes a screenshot pays nothing for the peer (and the package can ship
  as a true optional dependency).
- `sideEffects: false` is set on the package. **Metro** does not honour
  the `sideEffects` field today — its bundler runs its own dead-code
  elimination pass instead. The flag is still present so non-Metro
  consumers (web bundlers re-using this package's `dist/`, monorepo
  bundle-analysis tooling) keep their tree-shaking guarantees intact.

## Links

- **Core SDK:** [`@tatlacas/brevwick-sdk`](https://www.npmjs.com/package/@tatlacas/brevwick-sdk)
- **React (web):** [`@tatlacas/brevwick-react`](../react/README.md)
- **Example app:** [`examples/react-native`](https://github.com/tatlacas-com/brevwick-sdk-js/tree/main/examples/react-native)
- **Docs / dashboard:** [brevwick.dev](https://brevwick.dev)
- **Source:** [github.com/tatlacas-com/brevwick-sdk-js](https://github.com/tatlacas-com/brevwick-sdk-js)
- **Issues:** [github.com/tatlacas-com/brevwick-sdk-js/issues](https://github.com/tatlacas-com/brevwick-sdk-js/issues)

## License

[MIT](../../LICENSE)
