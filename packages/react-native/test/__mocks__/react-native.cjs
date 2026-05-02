// Minimal `react-native` stub for unit tests running under jsdom. Feature
// worktrees extend this surface as new RN APIs are touched; the goal here is
// only to keep import-time evaluation safe when modules pull in
// `react-native` for `Platform.OS`, dimensions, locale lookups, or
// `StyleSheet.flatten` (the latter reached via
// `@testing-library/react-native`'s `helpers/map-props`).
//
// This stub intentionally lives outside `src/` so it does not ship in the
// published npm tarball (the package's `files` array globs `src/`, which is
// shipped uncompiled to satisfy Metro's `react-native` source-preference
// field). Vitest aliases `react-native` to this path via
// `vitest.config.ts`'s `resolve.alias`.
//
// The file is plain JS (CommonJS) — not TypeScript — so that
// `test/setup.ts`'s `Module._load` patch can synchronously `require()` it
// under Node 20 (the engine the repo declares and CI runs). Node 20's CJS
// loader does not strip TypeScript syntax, so a `.ts` stub fed to `require`
// crashes the process before any test loads. Type information is not
// load-bearing for the stub's purpose, so dropping it is the cleanest fix.

const Platform = {
  OS: 'ios',
  Version: '17.0',
  // Honour the live `Platform.OS` value at call time so tests that flip
  // `Platform.OS = 'android'` see the matching branch — real `react-native`
  // does the same. Falls back to `default` when no platform-specific entry
  // exists, matching the upstream type signature.
  select(spec) {
    const key = this.OS;
    if (key in spec) {
      return spec[key];
    }
    return spec.default;
  },
};

// `screen` and `window` return the same fixture for the scaffold; feature
// worktrees that need to assert different status-bar / safe-area math
// should branch on the argument here.
const Dimensions = {
  get: (_dim) => ({
    width: 390,
    height: 844,
    scale: 3,
    fontScale: 1,
  }),
};

// `I18nManager` is exported BOTH as a top-level `react-native` symbol AND as
// `NativeModules.I18nManager` — real React Native does the same, with both
// references pointing at the same underlying native-module table. The shared
// reference matters: tests that mutate one path (e.g. `I18nManager
// .localeIdentifier = 'de_DE'`) should see the change reflected on the other,
// and `device.ts` reads from the `NativeModules` path per issue #85.
const I18nManager = {
  localeIdentifier: 'en_US',
  isRTL: false,
};

const NativeModules = {
  SettingsManager: {
    settings: {
      AppleLocale: 'en_US',
      AppleLanguages: ['en_US'],
    },
  },
  I18nManager,
};

// Minimal `<View>` shim for unit tests. Real RN `View` is a host component
// backed by a native module; under happy-dom we only need a class identifier
// that:
//   1. is callable as a React component (so `<View>{children}</View>` does
//      not crash at render time — most tests in this package do not render
//      it; `skip-render.test.tsx` is the exception, via react-test-renderer),
//   2. carries a `setNativeProps` instance method so the screenshot path's
//      hide / restore can dispatch via the ref.
// Tests that need to assert `setNativeProps` calls construct fake `View`
// instances directly rather than going through React rendering.
import { Component, type ReactNode } from 'react';

export interface ViewProps {
  children?: ReactNode;
  style?: unknown;
  testID?: string;
  onLayout?: (event: unknown) => void;
  accessibilityLabel?: string;
  accessibilityRole?: string;
  pointerEvents?: 'auto' | 'none' | 'box-none' | 'box-only';
}

export class View extends Component<ViewProps> {
  setNativeProps(_props: { opacity?: number; [key: string]: unknown }): void {
    // Default no-op; individual tests override on the instance to capture
    // calls. Production code reaches the real RN setNativeProps via the
    // host bridge — this stub exists only for vitest/happy-dom.
  }

  render(): ReactNode {
    return this.props.children ?? null;
  }
}

// `@testing-library/react-native@13` pulls in `helpers/map-props.js` which
// calls `StyleSheet.flatten(props.style)` to extract a few diagnostic
// styles for failure messages. The provider/hook tests don't render any
// styled host components, so the simplest faithful behaviour is: collapse
// an array of style objects into a single object (mirroring upstream's
// shallow-merge semantics) and pass non-array values through unchanged.
const StyleSheet = {
  flatten(style) {
    if (style == null) return {};
    if (!Array.isArray(style)) return style;
    return style.reduce(
      (acc, entry) => (entry ? { ...acc, ...entry } : acc),
      {},
    );
  },
};

module.exports = {
  Platform,
  Dimensions,
  I18nManager,
  NativeModules,
  StyleSheet,
};
