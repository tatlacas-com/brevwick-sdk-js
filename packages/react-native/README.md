# @tatlacas/brevwick-react-native

[![npm](https://img.shields.io/npm/v/@tatlacas/brevwick-react-native/beta?label=@tatlacas/brevwick-react-native%40beta)](https://www.npmjs.com/package/@tatlacas/brevwick-react-native)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](../../LICENSE)

React Native bindings for [Brevwick](https://brevwick.dev) — a provider, a
`useFeedback` hook, a route-ring helper for React Navigation / Expo Router,
a `BrevwickSkip` wrapper, and a native screenshot path that gracefully
falls back to a placeholder when the optional `react-native-view-shot` peer
isn't installed.

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

| Peer                     | Range          | Notes                                                                   |
| ------------------------ | -------------- | ----------------------------------------------------------------------- |
| `react`                  | `>=18 <20`     | 18.x and 19.x both supported.                                           |
| `react-native`           | `>=0.72 <0.78` | Hermes and JSC both work; New Architecture is supported.                |
| `@tatlacas/brevwick-sdk` | `workspace:*`  | Lockstep with this package — installer pulls a matching version.        |
| `react-native-view-shot` | `^4.0.0`       | **Optional.** Without it, screenshots resolve to a 1×1 placeholder PNG. |

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
  type BrevwickConfig,
} from '@tatlacas/brevwick-react-native';
import { Home } from './screens/Home';
import { Details } from './screens/Details';
import { FeedbackFab } from './FeedbackFab';

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
      <FeedbackFab />
    </BrevwickProvider>
  );
}
```

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

| Prop            | Type                                 | Description                                                                                                                              |
| --------------- | ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `config`        | `BrevwickConfig`                     | SDK config — see the [core SDK reference](https://www.npmjs.com/package/@tatlacas/brevwick-sdk). **Reference-stable**: hoist or memoise. |
| `navigationRef` | `BrevwickNavigationRef \| undefined` | Forwarded to descendants via `BrevwickNavigationRefContext`. Read by the route-ring helper; the provider does not subscribe directly.    |
| `children`      | `ReactNode`                          | Your tree.                                                                                                                               |

## Route ring (React Navigation + Expo Router)

`useNavigationContainerRef()` from `@react-navigation/native` returns a
ref accepted directly by `BrevwickProvider`. Expo Router rides on top of
React Navigation, so the same wiring serves both.

```tsx
import { useEffect } from 'react';
import {
  attachRouteRing,
  useBrevwick,
  useBrevwickNavigationRef,
  type Brevwick,
} from '@tatlacas/brevwick-react-native';
import type { RouteEntry } from '@tatlacas/brevwick-sdk';

type BrevwickWithInternal = Brevwick & {
  _internal?: { push?: (entry: RouteEntry) => void };
};

function RouteRingBridge() {
  const brevwick = useBrevwick() as BrevwickWithInternal;
  const navigationRef = useBrevwickNavigationRef();

  useEffect(() => {
    const push = brevwick._internal?.push;
    if (!navigationRef || typeof push !== 'function') return undefined;
    return attachRouteRing(navigationRef, push);
  }, [brevwick, navigationRef]);

  return null;
}
```

Render `<RouteRingBridge />` anywhere inside `<BrevwickProvider>` and
React Navigation `state` events flow into the SDK's 20-entry route ring
(FIFO, capped automatically). Path params matching `:token`, `:auth`,
`:key`, `:session`, or `:sig` are masked, and every other param value is
redacted via the SDK's global `redact()` before percent-encoding so a JWT
or email carried by a benign-named key is still scrubbed.

> The bridge wires React Navigation's `state` event into the SDK's
> internal `push`. The drop-in `<FeedbackButton />` (#88) will own this
> wiring once it lands; until then, copy the bridge above (or the
> equivalent from `examples/react-native/src/RouteRingBridge.tsx`).

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

| Field               | Type                                              | Description                                                                                              |
| ------------------- | ------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `submit`            | `(input: FeedbackInput) => Promise<SubmitResult>` | Submit feedback. Returns the same tagged union the core SDK returns.                                     |
| `captureScreenshot` | `() => Promise<Blob>`                             | Capture a screenshot. Never throws — returns the placeholder PNG on failure.                             |
| `status`            | `FeedbackStatus`                                  | `'idle' \| 'submitting' \| 'success' \| 'error'`. Backwards-compatible lifecycle.                        |
| `phase`             | `FeedbackPhase`                                   | Submit-pipeline phase driven by the SDK's internal phase event.                                          |
| `error`             | `SubmitError \| null`                             | Tagged error from the most recent failed submit. Cleared on the next `submit()` / `retry()` / `reset()`. |
| `retry`             | `() => Promise<SubmitResult \| undefined>`        | Re-run the most recent `submit()` with the same input. No-op when no submit has been attempted.          |
| `reset`             | `() => void`                                      | Reset `status` + `phase` back to `'idle'`, clear `error`, and forget the last submitted input.           |

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

A `theme` prop on the eventual `<FeedbackButton />` (lands with #88) will
accept `'system' | 'light' | 'dark'` matching the React (web) widget. The
underlying token surface (accent / panel / chip / border) is shared with
`@tatlacas/brevwick-react`; until the RN button lands you control your
own surface in custom UIs (see the `useFeedback` snippet above).

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

Either install it (`npx expo install react-native-view-shot`, then
`pod install` for bare RN), or accept the placeholder fallback. Nothing
in this package hard-imports `react-native-view-shot` — the import is
guarded.

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

- `sideEffects: false` so bundlers tree-shake unused exports.
- `react-native-view-shot` is dynamically `import()`-ed on first capture
  — not at provider mount, not at button render — so an app that never
  takes a screenshot pays nothing for the peer.

## Links

- **Core SDK:** [`@tatlacas/brevwick-sdk`](https://www.npmjs.com/package/@tatlacas/brevwick-sdk)
- **React (web):** [`@tatlacas/brevwick-react`](../react/README.md)
- **Example app:** [`examples/react-native`](https://github.com/tatlacas-com/brevwick-sdk-js/tree/main/examples/react-native)
- **Docs / dashboard:** [brevwick.dev](https://brevwick.dev)
- **Source:** [github.com/tatlacas-com/brevwick-sdk-js](https://github.com/tatlacas-com/brevwick-sdk-js)
- **Issues:** [github.com/tatlacas-com/brevwick-sdk-js/issues](https://github.com/tatlacas-com/brevwick-sdk-js/issues)

## License

[MIT](../../LICENSE)
