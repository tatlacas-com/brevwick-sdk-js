// Minimal `react-native` stub for unit tests running under jsdom. Feature
// worktrees extend this surface as new RN APIs are touched; the goal here is
// only to keep import-time evaluation safe when modules pull in
// `react-native` for `Platform.OS`, dimensions, or locale lookups.
//
// This stub intentionally lives outside `src/` so it does not ship in the
// published npm tarball (the package's `files` array globs `src/`, which is
// shipped uncompiled to satisfy Metro's `react-native` source-preference
// field). Vitest aliases `react-native` to this path via
// `vitest.config.ts`'s `resolve.alias`.

type PlatformOS = 'ios' | 'android' | 'web' | 'windows' | 'macos';

export const Platform: {
  OS: PlatformOS;
  Version: string | number;
  select: <T>(spec: {
    ios?: T;
    android?: T;
    web?: T;
    windows?: T;
    macos?: T;
    native?: T;
    default?: T;
  }) => T | undefined;
} = {
  OS: 'ios',
  Version: '17.0',
  // Honour the live `Platform.OS` value at call time so tests that flip
  // `Platform.OS = 'android'` see the matching branch — real `react-native`
  // does the same. Falls back to `default` when no platform-specific entry
  // exists, matching the upstream type signature.
  select<T>(spec: {
    ios?: T;
    android?: T;
    web?: T;
    windows?: T;
    macos?: T;
    native?: T;
    default?: T;
  }): T | undefined {
    const key = this.OS as keyof typeof spec;
    if (key in spec) {
      return spec[key];
    }
    return spec.default;
  },
};

// `screen` and `window` return the same fixture for the scaffold; feature
// worktrees that need to assert different status-bar / safe-area math
// should branch on the argument here.
export const Dimensions = {
  get: (_dim: 'window' | 'screen') => ({
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
export const I18nManager: { localeIdentifier?: string; isRTL: boolean } = {
  localeIdentifier: 'en_US',
  isRTL: false,
};

export const NativeModules: {
  SettingsManager: {
    settings:
      | { AppleLocale?: string; AppleLanguages?: readonly string[] }
      | undefined;
  };
  I18nManager: { localeIdentifier?: string; isRTL: boolean };
} = {
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
