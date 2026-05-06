// `react-native-gesture-handler` MUST be imported as the very first
// statement of the entry module — `@react-navigation/stack` registers
// gesture handlers at import time.
import 'react-native-gesture-handler';
import { registerRootComponent } from 'expo';

import App from './App';

// Replaces the default `node_modules/expo/AppEntry.js` entry. Under pnpm
// that file lives in the `.pnpm/` content-addressed store, and the
// `import App from '../../App'` it does resolves into the store rather
// than this project's root — Metro fails with "Unable to resolve
// '../../App'". Pointing `package.json#main` at this file and registering
// the root component ourselves bypasses the brittle relative path.
registerRootComponent(App);
