/**
 * React Native device-context collector.
 *
 * Wire shape mirrors `brevwick-sdk-js/packages/sdk/src/submit.ts`
 * `readDeviceContext()` + `composePayload()` — and through it, the Flutter
 * SDK's `lib/src/device.dart` `DeviceContext.toJson()`. The fields are:
 *
 *   { ua, locale?, viewport?: {w, h}, platform, sdk: {name, version, platform} }
 *
 * Only `device_context.platform` deliberately diverges from Flutter — the RN
 * adapter emits `'react-native-ios'` / `'react-native-android'` so triage
 * dashboards can split the cohort without branching on `sdk.name`. Every
 * other field shape is identical, modulo two implementation details that
 * fall out of the host runtime rather than a contract divergence:
 *   - `ua` is always populated (`'react-native ${OS} ${Version}'`) because
 *     `Platform.OS` / `Platform.Version` are always defined under RN.
 *     Flutter's `ua` is `String?` because `device_info_plus` may return
 *     nothing on some platforms — same wire key, different population odds.
 *   - `locale` is omitted (`undefined`) when neither
 *     `NativeModules.SettingsManager.settings.AppleLocale` nor
 *     `NativeModules.I18nManager.localeIdentifier` surfaces a non-empty
 *     string. `JSON.stringify` drops `undefined` keys, matching Flutter's
 *     `if (locale != null) 'locale': locale` builder.
 *
 * `viewport` is similarly omitted when `Dimensions.get('window')` throws or
 * returns a non-numeric shape (Hermes / JSC test harnesses without an
 * attached UIManager). Real RN apps always have a window, so this only
 * fires in unit tests.
 */
import { Dimensions, NativeModules, Platform } from 'react-native';

import { BREVWICK_REACT_NATIVE_VERSION } from './version';

const SDK_NAME = 'brevwick-react-native';

interface Viewport {
  w: number;
  h: number;
}

interface SdkInfo {
  name: string;
  version: string;
  platform: string;
}

/**
 * Wire-ready device-context object. Pass directly under `device_context` in
 * the submit payload (or merge into a `BrevwickConfig.deviceContext` hook
 * when one exists in the core).
 */
export interface DeviceContext {
  ua?: string;
  locale?: string;
  viewport?: Viewport;
  platform: string;
  sdk: SdkInfo;
}

/**
 * iOS `SettingsManager` shape used for locale lookup. The native module is
 * unavailable on non-iOS platforms and on Expo Go in some configurations,
 * so every nested field is optional and the lookup falls through to the
 * Android path or the `'en-US'` constant.
 */
interface SettingsManagerLike {
  settings?: {
    AppleLocale?: string;
    AppleLanguages?: readonly string[];
  };
}

interface I18nManagerLike {
  localeIdentifier?: string;
}

/**
 * Static fields are computed once and reused. `platform`, `sdk`, and the
 * composed `ua` string never change for the lifetime of the process — the
 * package version is baked at build time, `Platform.OS` is fixed, and
 * `Platform.Version` is fixed for the OS install. Locale and viewport are
 * re-read on every call so a runtime locale switch or orientation change is
 * reflected on the next captured issue (matches Flutter's
 * `DeviceContextCollector.collect()` semantics).
 */
let cachedStatic: Pick<DeviceContext, 'platform' | 'sdk' | 'ua'> | undefined;

function readStatic(): Pick<DeviceContext, 'platform' | 'sdk' | 'ua'> {
  if (cachedStatic) return cachedStatic;
  const os = Platform.OS;
  const version = String(Platform.Version);
  cachedStatic = {
    platform: `react-native-${os}`,
    // `ua` carries the OS version so triagers see it without us inventing a
    // non-Flutter `os_version` field. Flutter composes the same shape from
    // `device_info_plus` (`'${model} / iOS ${systemVersion}'`); the RN
    // package omits model because `react-native-device-info` is intentionally
    // out of scope (#85 acceptance criteria).
    ua: `react-native ${os} ${version}`,
    sdk: {
      name: SDK_NAME,
      version: BREVWICK_REACT_NATIVE_VERSION,
      platform: os,
    },
  };
  return cachedStatic;
}

/**
 * iOS surfaces locale via `NativeModules.SettingsManager.settings.AppleLocale`
 * (e.g. `'en_US'`). Android surfaces it via `NativeModules.I18nManager
 * .localeIdentifier` (same `en_US` / `de_DE` shape). Returns `undefined` when
 * neither path produces a non-empty string — the caller drops the key from
 * the wire payload (`JSON.stringify` omits `undefined`). Strict parity with
 * Flutter's `if (locale != null) 'locale': locale` semantics: the wire is a
 * lower bound; a constant `'en-US'` fallback would be a second deliberate
 * divergence beyond the documented `platform` string.
 */
function readLocale(): string | undefined {
  const settingsManager = (
    NativeModules as unknown as {
      SettingsManager?: SettingsManagerLike;
    }
  ).SettingsManager;
  const appleLocale = settingsManager?.settings?.AppleLocale;
  if (typeof appleLocale === 'string' && appleLocale.length > 0) {
    return appleLocale;
  }
  const appleLanguages = settingsManager?.settings?.AppleLanguages;
  if (Array.isArray(appleLanguages) && appleLanguages.length > 0) {
    const first = appleLanguages[0];
    if (typeof first === 'string' && first.length > 0) {
      return first;
    }
  }
  const i18nManager = (
    NativeModules as unknown as {
      I18nManager?: I18nManagerLike;
    }
  ).I18nManager;
  const androidLocale = i18nManager?.localeIdentifier;
  if (typeof androidLocale === 'string' && androidLocale.length > 0) {
    return androidLocale;
  }
  return undefined;
}

function readViewport(): Viewport | undefined {
  try {
    const dim = Dimensions.get('window');
    if (
      !dim ||
      typeof dim.width !== 'number' ||
      typeof dim.height !== 'number'
    ) {
      return undefined;
    }
    return { w: Math.round(dim.width), h: Math.round(dim.height) };
  } catch {
    return undefined;
  }
}

/**
 * Collect the device context for the current submit. Static fields are
 * cached on first call; `locale` and `viewport` are re-read every call so
 * runtime locale switches and orientation changes ride on the next captured
 * issue.
 *
 * The returned shape is wire-ready — the caller passes it straight under
 * `device_context` in the submit payload.
 */
export function collectDeviceContext(): DeviceContext {
  const stat = readStatic();
  return {
    ua: stat.ua,
    locale: readLocale(),
    viewport: readViewport(),
    platform: stat.platform,
    sdk: stat.sdk,
  };
}

/**
 * Test-only hook: drop the static cache so a `Platform.OS` flip in a test
 * is reflected on the next `collectDeviceContext()` call. Production
 * callers never need this — `Platform.OS` cannot change at runtime.
 */
export function __resetDeviceContextCache(): void {
  cachedStatic = undefined;
}
