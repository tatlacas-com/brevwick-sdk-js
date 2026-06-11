import type { ReactElement } from 'react';
import { BrevwickProvider, FeedbackButton } from '@tatlacas/brevwick-react';
import type { BrevwickConfig } from '@tatlacas/brevwick-sdk';

// Mirrors `validateConfig` from `@tatlacas/brevwick-sdk` so we no-op when the
// env file still holds the seeded placeholder. `createBrevwick(...)` would
// throw synchronously inside the provider's `useMemo` otherwise — surfacing
// as a hydration error in the React island.
const PROJECT_KEY_PATTERN = /^pk_(live|test)_[A-Za-z0-9]{16,}$/;
const PLACEHOLDER_KEY = 'pk_test_replace_me';
const projectKey = import.meta.env.PUBLIC_BREVWICK_PROJECT_KEY ?? '';
const keyIsReady =
  projectKey.length > 0 &&
  projectKey !== PLACEHOLDER_KEY &&
  PROJECT_KEY_PATTERN.test(projectKey);

// Hoist outside the component so the provider's `useMemo(() =>
// createBrevwick(config))` keeps a stable identity.
const config: BrevwickConfig = { projectKey, environment: 'dev' };

export function BrevwickIsland(): ReactElement | null {
  if (!keyIsReady) return null;
  return (
    <BrevwickProvider config={config}>
      {/* Right-edge tab by default; pass position="bottom-right" to keep
          the legacy corner bubble. */}
      <FeedbackButton />
    </BrevwickProvider>
  );
}
