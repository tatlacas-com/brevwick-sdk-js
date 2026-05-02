// Minimal `react-native` stub for unit tests running under jsdom. Feature
// worktrees extend this surface as new RN APIs are touched; the goal here is
// only to keep import-time evaluation safe when modules pull in
// `react-native` for `Platform.OS`, dimensions, or locale lookups.

export const Platform = {
  OS: 'ios' as 'ios' | 'android' | 'web' | 'windows' | 'macos',
  Version: '17.0' as string | number,
  select: <T>(spec: { ios?: T; android?: T; default?: T }): T | undefined =>
    spec.ios ?? spec.default,
};

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
