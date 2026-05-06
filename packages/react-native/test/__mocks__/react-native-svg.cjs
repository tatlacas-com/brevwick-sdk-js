// Minimal `react-native-svg` stub for unit tests running under happy-dom.
// The real package's CJS entry tries to destructure `Touchable.Mixin` from
// our `react-native` mock at import time, which our intentionally narrow
// stub does not expose. Routing the specifier here keeps the icon module
// importable without expanding the RN stub's surface area.
//
// Class components mirror the production primitives the icons file uses
// (`Svg`, `Path`) so `react-test-renderer` can locate them by constructor
// reference if a future test wants to assert on icon presence.

const { Component } = require('react');

class Svg extends Component {
  render() {
    return this.props.children ?? null;
  }
}
class Path extends Component {
  render() {
    return null;
  }
}
class G extends Component {
  render() {
    return this.props.children ?? null;
  }
}
class Circle extends Component {
  render() {
    return null;
  }
}
class Rect extends Component {
  render() {
    return null;
  }
}

module.exports = {
  __esModule: true,
  default: Svg,
  Svg,
  Path,
  G,
  Circle,
  Rect,
};
