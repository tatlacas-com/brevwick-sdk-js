import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { Dimensions, I18nManager, NativeModules, Platform } from 'react-native';

import { __resetDeviceContextCache, collectDeviceContext } from '../device';
import { BREVWICK_REACT_NATIVE_VERSION } from '../version';

interface MutableSettings {
  AppleLocale?: string;
  AppleLanguages?: readonly string[];
}

const settingsManager = NativeModules.SettingsManager as {
  settings: MutableSettings | undefined;
};

const platform = Platform as unknown as {
  OS: 'ios' | 'android' | 'web' | 'macos' | 'windows';
  Version: string | number;
};

const i18n = I18nManager as unknown as { localeIdentifier?: string };

const baselineSettings: MutableSettings = {
  AppleLocale: 'en_US',
  AppleLanguages: ['en_US'],
};

const baselineDimensions = (
  Dimensions as { get: (dim: 'window' | 'screen') => unknown }
).get('window');

let originalDimensionsGet: typeof Dimensions.get;

beforeEach(() => {
  // Reset every globally-mutable bit of the `react-native` stub so a flip
  // in one test (e.g. `Platform.OS = 'android'`) does not leak into the
  // next. The static cache is also dropped because it embeds `Platform.OS`
  // / `Platform.Version` from first call.
  platform.OS = 'ios';
  platform.Version = '17.0';
  settingsManager.settings = { ...baselineSettings };
  i18n.localeIdentifier = 'en_US';
  originalDimensionsGet = Dimensions.get;
  __resetDeviceContextCache();
});

afterEach(() => {
  // Restore Dimensions.get if a test reassigned it for a viewport scenario.
  (Dimensions as unknown as { get: typeof Dimensions.get }).get =
    originalDimensionsGet;
  // Settings shape needs the `settings` key restored even if a test
  // deleted it — the stub exposes the property as a plain field.
  settingsManager.settings = { ...baselineSettings };
  __resetDeviceContextCache();
});

describe('collectDeviceContext', () => {
  it('matches the iOS wire shape snapshot', () => {
    platform.OS = 'ios';
    platform.Version = '17.0';
    const ctx = collectDeviceContext();
    expect(ctx).toEqual({
      ua: 'react-native ios 17.0',
      locale: 'en_US',
      viewport: { w: 390, h: 844 },
      platform: 'react-native-ios',
      sdk: {
        name: 'brevwick-react-native',
        version: BREVWICK_REACT_NATIVE_VERSION,
        platform: 'ios',
      },
    });
  });

  it('matches the Android wire shape snapshot', () => {
    platform.OS = 'android';
    platform.Version = 34;
    settingsManager.settings = undefined;
    i18n.localeIdentifier = 'de_DE';
    const ctx = collectDeviceContext();
    expect(ctx).toEqual({
      ua: 'react-native android 34',
      locale: 'de_DE',
      viewport: { w: 390, h: 844 },
      platform: 'react-native-android',
      sdk: {
        name: 'brevwick-react-native',
        version: BREVWICK_REACT_NATIVE_VERSION,
        platform: 'android',
      },
    });
  });

  it('produces a react-native-macos shape on RN-macOS without throwing', () => {
    // `DeviceContext.platform` is typed as `string` precisely so future RN
    // platforms (`react-native-macos`, `react-native-windows`,
    // `react-native-web`) flow through unchanged. RN-macOS / Windows are
    // explicitly out of the launch targets, but pinning the matrix here
    // catches an accidental "throw on unknown OS" regression and confirms
    // the wider-platform contract the worktree.md alludes to. The cohort
    // intentionally splits from `device_context.platform: 'web'` that the
    // core JS SDK emits — backend triage can branch on the prefix.
    platform.OS = 'macos';
    platform.Version = '14.0';
    settingsManager.settings = undefined;
    i18n.localeIdentifier = 'en_US';
    const ctx = collectDeviceContext();
    expect(ctx.platform).toBe('react-native-macos');
    expect(ctx.sdk.platform).toBe('macos');
    expect(ctx.ua).toBe('react-native macos 14.0');
  });

  it('only diverges from the iOS snapshot in the platform string when the same call is made on Android', () => {
    // Wire-shape parity guard: the only documented divergence between the
    // RN and the Flutter `device_context` is `platform`. If a future edit
    // accidentally introduces an `os_version` / `scale` / `fontScale`
    // field, this test fails — every other key must match between
    // platforms (other than the obvious sdk.platform / locale / version).
    platform.OS = 'ios';
    platform.Version = '17.0';
    const ios = collectDeviceContext();
    __resetDeviceContextCache();

    platform.OS = 'android';
    platform.Version = '17.0';
    settingsManager.settings = undefined;
    i18n.localeIdentifier = 'en_US';
    const android = collectDeviceContext();

    const iosKeys = Object.keys(ios).sort();
    const androidKeys = Object.keys(android).sort();
    expect(iosKeys).toEqual(androidKeys);
    expect(iosKeys).toEqual(['locale', 'platform', 'sdk', 'ua', 'viewport']);
  });
});

describe('locale fallback chain', () => {
  it('prefers SettingsManager.settings.AppleLocale (iOS)', () => {
    settingsManager.settings = { AppleLocale: 'fr_FR' };
    i18n.localeIdentifier = 'en_US';
    expect(collectDeviceContext().locale).toBe('fr_FR');
  });

  it('falls back to SettingsManager.settings.AppleLanguages[0] when AppleLocale is missing', () => {
    settingsManager.settings = { AppleLanguages: ['ja_JP', 'en_US'] };
    i18n.localeIdentifier = 'en_US';
    expect(collectDeviceContext().locale).toBe('ja_JP');
  });

  it('falls back to I18nManager.localeIdentifier when SettingsManager.settings is undefined (Android)', () => {
    settingsManager.settings = undefined;
    i18n.localeIdentifier = 'de_DE';
    expect(collectDeviceContext().locale).toBe('de_DE');
  });

  it('falls back to en-US when both SettingsManager and I18nManager are unavailable', () => {
    settingsManager.settings = undefined;
    i18n.localeIdentifier = undefined;
    expect(collectDeviceContext().locale).toBe('en-US');
  });

  it('falls back to en-US when SettingsManager.settings.AppleLocale is empty', () => {
    settingsManager.settings = { AppleLocale: '' };
    i18n.localeIdentifier = '';
    expect(collectDeviceContext().locale).toBe('en-US');
  });

  it('skips an empty-string AppleLanguages[0] and falls through to the next link', () => {
    // The AppleLanguages branch uses the same `length > 0` guard as the
    // AppleLocale branch — an empty first entry must not be returned, it
    // falls through to I18nManager.localeIdentifier.
    settingsManager.settings = { AppleLanguages: [''] };
    i18n.localeIdentifier = 'pt_BR';
    expect(collectDeviceContext().locale).toBe('pt_BR');
  });
});

describe('static-field caching', () => {
  it('caches platform and sdk across calls; locale and viewport refresh', () => {
    platform.OS = 'ios';
    platform.Version = '17.0';
    settingsManager.settings = { AppleLocale: 'en_US' };
    const first = collectDeviceContext();

    // Mutate runtime state in ways that real RN can change at runtime.
    settingsManager.settings = { AppleLocale: 'fr_FR' };
    (
      Dimensions as unknown as { get: (d: 'window' | 'screen') => unknown }
    ).get = () => ({ width: 1024, height: 768, scale: 2, fontScale: 1 });

    const second = collectDeviceContext();

    expect(second.platform).toBe(first.platform);
    expect(second.sdk).toEqual(first.sdk);
    expect(second.ua).toBe(first.ua);
    expect(second.locale).toBe('fr_FR');
    expect(second.viewport).toEqual({ w: 1024, h: 768 });
  });

  it('drops the static cache when __resetDeviceContextCache is called', () => {
    platform.OS = 'ios';
    platform.Version = '17.0';
    const first = collectDeviceContext();
    expect(first.platform).toBe('react-native-ios');

    __resetDeviceContextCache();
    platform.OS = 'android';
    platform.Version = 34;
    const second = collectDeviceContext();
    expect(second.platform).toBe('react-native-android');
    expect(second.sdk.platform).toBe('android');
    expect(second.ua).toBe('react-native android 34');
  });
});

describe('viewport robustness', () => {
  it('omits viewport when Dimensions.get returns a non-numeric shape', () => {
    (
      Dimensions as unknown as { get: (d: 'window' | 'screen') => unknown }
    ).get = () => ({ width: undefined, height: undefined });
    expect(collectDeviceContext().viewport).toBeUndefined();
  });

  it('omits viewport when Dimensions.get throws', () => {
    (
      Dimensions as unknown as { get: (d: 'window' | 'screen') => unknown }
    ).get = () => {
      throw new Error('Dimensions unavailable');
    };
    expect(collectDeviceContext().viewport).toBeUndefined();
  });

  it('rounds fractional dimensions so the wire stays integer-shaped', () => {
    (
      Dimensions as unknown as { get: (d: 'window' | 'screen') => unknown }
    ).get = () => ({ width: 390.4, height: 844.6, scale: 3, fontScale: 1 });
    expect(collectDeviceContext().viewport).toEqual({ w: 390, h: 845 });
  });
});

describe('viewport baseline (sanity)', () => {
  it('returns the stub fixture when no test has overridden Dimensions.get', () => {
    expect(baselineDimensions).toEqual({
      width: 390,
      height: 844,
      scale: 3,
      fontScale: 1,
    });
  });
});
