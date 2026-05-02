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

export const NativeModules = {
  SettingsManager: {
    settings: {
      AppleLocale: 'en_US',
      AppleLanguages: ['en_US'],
    },
  },
};

export const I18nManager = {
  localeIdentifier: 'en_US',
  isRTL: false,
};
