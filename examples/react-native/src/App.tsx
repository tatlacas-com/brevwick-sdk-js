import { useMemo, type ReactElement } from 'react';
import {
  NavigationContainer,
  useNavigationContainerRef,
} from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import {
  BrevwickProvider,
  type BrevwickConfig,
} from '@tatlacas/brevwick-react-native';
import { PROJECT_KEY_PATTERN } from '@tatlacas/brevwick-sdk';
import { Home } from './screens/Home';
import { Details } from './screens/Details';
import { FeedbackFab } from './FeedbackFab';
import { RouteRingBridge } from './RouteRingBridge';

export type RootStackParamList = {
  Home: undefined;
  Details: { from?: string } | undefined;
};

const Stack = createStackNavigator<RootStackParamList>();

// Defer to the SDK's public `PROJECT_KEY_PATTERN` rather than re-
// implementing the regex — single source of truth with `validateConfig`.
// When the env var still holds the seeded placeholder, render with
// `enabled: false` so the provider memoises a no-op SDK instance instead
// of crashing inside `useMemo` on `createBrevwick(...)`.
const PLACEHOLDER_KEY = 'pk_test_replace_me';
const PROJECT_KEY = process.env.EXPO_PUBLIC_BREVWICK_PROJECT_KEY ?? '';
const ENDPOINT = process.env.EXPO_PUBLIC_BREVWICK_ENDPOINT;
const KEY_IS_READY =
  PROJECT_KEY.length > 0 &&
  PROJECT_KEY !== PLACEHOLDER_KEY &&
  PROJECT_KEY_PATTERN.test(PROJECT_KEY);
// Keep this in lockstep with the SDK's `PROJECT_KEY_PATTERN`
// (`/^pk_(live|test)_[A-Za-z0-9]{16,}$/`) — 24 alphanumeric chars after the
// prefix, well above the 16-char floor. Re-exported from the SDK so a
// future tightening flows here automatically.
const FALLBACK_PROJECT_KEY = 'pk_test_placeholder0000000';

export default function App(): ReactElement {
  const navigationRef = useNavigationContainerRef<RootStackParamList>();

  // Hoisted via `useMemo` so the provider doesn't cycle install/uninstall
  // on every render — it keys its SDK instance on config identity.
  const config = useMemo<BrevwickConfig>(
    () => ({
      projectKey: KEY_IS_READY ? PROJECT_KEY : FALLBACK_PROJECT_KEY,
      endpoint: ENDPOINT,
      environment: 'stg',
      enabled: KEY_IS_READY,
    }),
    [],
  );

  return (
    <BrevwickProvider config={config} navigationRef={navigationRef}>
      <NavigationContainer ref={navigationRef}>
        <Stack.Navigator>
          <Stack.Screen
            name="Home"
            component={Home}
            options={{ title: 'Brevwick RN Example' }}
          />
          <Stack.Screen name="Details" component={Details} />
        </Stack.Navigator>
      </NavigationContainer>
      <RouteRingBridge />
      <FeedbackFab keyReady={KEY_IS_READY} />
    </BrevwickProvider>
  );
}
