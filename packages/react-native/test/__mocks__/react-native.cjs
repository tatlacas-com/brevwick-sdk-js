// Minimal `react-native` stub for unit tests running under happy-dom.
// Feature worktrees extend this surface as new RN APIs are touched; the goal
// here is only to keep import-time evaluation safe when modules pull in
// `react-native` for `Platform.OS`, dimensions, locale lookups,
// `StyleSheet.flatten` (the latter reached via
// `@testing-library/react-native`'s `helpers/map-props`), or `View` (used by
// the screenshot path's hide / restore via `setNativeProps`).
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

const { Component } = require('react');

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
// reference matters: tests that mutate one path (e.g.
// `I18nManager.localeIdentifier = 'de_DE'`) should see the change reflected
// on the other, and `device.ts` reads from the `NativeModules` path per #85.
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

// Minimal `<View>` shim. Real RN `View` is a host component backed by a
// native module; under happy-dom we only need a class identifier that:
//   1. is callable as a React component (so `<View>{children}</View>` does
//      not crash at render time — most tests in this package do not render
//      it; `skip-render.test.tsx` is the exception, via react-test-renderer),
//   2. carries a `setNativeProps` instance method so the screenshot path's
//      hide / restore can dispatch via the ref.
// Tests that need to assert `setNativeProps` calls construct fake `View`
// instances directly rather than going through React rendering.
class View extends Component {
  setNativeProps(_props) {
    // Default no-op; individual tests override on the instance to capture
    // calls. Production code reaches the real RN setNativeProps via the
    // host bridge — this stub exists only for vitest/happy-dom.
  }

  render() {
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
  // Real RN's `StyleSheet.create` interns styles into a numeric registry; the
  // FeedbackButton + FeedbackModal evaluate a `create({...})` call at module
  // load time, so even hook-only tests (which don't render the components)
  // would crash if this stub omitted it. The simplest faithful behaviour is
  // to pass the input through — call sites use the resulting object's keys
  // for `style={styles.foo}` props, and the equality semantics React applies
  // for style props are unchanged by interning.
  create(styles) {
    return styles;
  },
  hairlineWidth: 1,
  absoluteFillObject: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
};

// Lightweight shims for the host components the feedback widget renders. Each
// is a class component (mirroring `View`) so `react-test-renderer` can locate
// them by constructor reference and `findAllByProps` traversals from tests
// remain stable even when the production code refactors children.
class Text extends Component {
  render() {
    return this.props.children ?? null;
  }
}
class TextInput extends Component {
  render() {
    return this.props.children ?? null;
  }
}
class Image extends Component {
  render() {
    return null;
  }
}
class ActivityIndicator extends Component {
  render() {
    return null;
  }
}
class Switch extends Component {
  render() {
    return null;
  }
}
class ScrollView extends Component {
  render() {
    return this.props.children ?? null;
  }
}
class Modal extends Component {
  render() {
    // Match real RN: when `visible={false}` the children are not mounted.
    if (this.props.visible === false) return null;
    return this.props.children ?? null;
  }
}
class Pressable extends Component {
  render() {
    const { children } = this.props;
    if (typeof children === 'function') {
      // Real RN passes `{ pressed }` (and more in newer versions); tests
      // never assert on the pressed state from the render-prop path.
      return children({ pressed: false });
    }
    return children ?? null;
  }
}

// Hook + module surfaces consumed by the widget. `useColorScheme` returns
// `'light'` so the default theme resolution lands on the light palette
// without needing a per-test mock; tests that need to exercise the dark
// branch override `<FeedbackButton theme="dark" />` directly.
const useColorScheme = () => 'light';
const Appearance = {
  getColorScheme: () => 'light',
  addChangeListener: () => ({ remove: () => {} }),
};

// `Linking.openURL` is consumed by the modal footer's brevwick.dev link.
// The stub returns a resolved promise so the production code path's
// `void Linking.openURL(...).catch(...)` is safe even when no platform
// handler is installed; tests that need to assert the URL spy on this.
const Linking = {
  openURL(_url) {
    return Promise.resolve();
  },
  canOpenURL(_url) {
    return Promise.resolve(true);
  },
};

// `AccessibilityInfo.isReduceMotionEnabled` powers the modal's reduced
// motion gate. The stub resolves to `false` so the default test render
// follows the un-staggered code path; tests that need to exercise the
// staggered branch override the resolved value via `vi.spyOn`.
const AccessibilityInfo = {
  isReduceMotionEnabled() {
    return Promise.resolve(false);
  },
  addEventListener(_event, _handler) {
    return { remove() {} };
  },
};

module.exports = {
  Platform,
  Dimensions,
  I18nManager,
  NativeModules,
  View,
  Text,
  TextInput,
  Image,
  ActivityIndicator,
  Switch,
  ScrollView,
  Modal,
  Pressable,
  StyleSheet,
  useColorScheme,
  Appearance,
  Linking,
  AccessibilityInfo,
};
