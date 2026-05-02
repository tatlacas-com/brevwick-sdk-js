import { useMemo, type ReactElement } from 'react';
import {
  NavigationContainer,
  useNavigationContainerRef,
} from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import {
  BrevwickProvider,
  type BrevwickConfig,
  type BrevwickNavigationRef,
} from '@tatlacas/brevwick-react-native';
import { Home } from './screens/Home';
import { Details } from './screens/Details';
import { FeedbackFab } from './FeedbackFab';
import { RouteRingBridge } from './RouteRingBridge';

export type RootStackParamList = {
  Home: undefined;
  Details: { from?: string } | undefined;
};

const Stack = createStackNavigator<RootStackParamList>();

// Mirrors `validateConfig` from `@tatlacas/brevwick-sdk` so the example
// renders without crashing the React tree when `.env` still holds the
// seeded placeholder. `createBrevwick(...)` would throw synchronously
// inside the provider's `useMemo` otherwise.
const PROJECT_KEY_PATTERN = /^pk_(live|test)_[A-Za-z0-9]{16,}$/;
const PLACEHOLDER_KEY = 'pk_test_replace_me';
const PROJECT_KEY = process.env.EXPO_PUBLIC_BREVWICK_PROJECT_KEY ?? '';
const ENDPOINT = process.env.EXPO_PUBLIC_BREVWICK_ENDPOINT;
const KEY_IS_READY =
  PROJECT_KEY.length > 0 &&
  PROJECT_KEY !== PLACEHOLDER_KEY &&
  PROJECT_KEY_PATTERN.test(PROJECT_KEY);

export default function App(): ReactElement {
  const navigationRef = useNavigationContainerRef<RootStackParamList>();

  // Hoisted via `useMemo` so the provider doesn't cycle install/uninstall
  // on every render — it keys its SDK instance on config identity.
  const config = useMemo<BrevwickConfig>(
    () => ({
      projectKey: KEY_IS_READY ? PROJECT_KEY : 'pk_test_placeholder0000000',
      endpoint: ENDPOINT,
      environment: 'stg',
      enabled: KEY_IS_READY,
    }),
    [],
  );

  return (
    // React Navigation's `addListener<T extends keyof EventMap>` is more
    // strictly typed than `BrevwickNavigationRef`'s structural slot
    // (which accepts any string event name), so we cast to the loose
    // shape the provider expects. Both surfaces agree at runtime — the
    // route ring only ever subscribes to `'state'`.
    <BrevwickProvider
      config={config}
      navigationRef={navigationRef as unknown as BrevwickNavigationRef}
    >
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
