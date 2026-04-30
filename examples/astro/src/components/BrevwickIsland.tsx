import type { ReactElement } from 'react';
import { BrevwickProvider, FeedbackButton } from '@tatlacas/brevwick-react';
import type { BrevwickConfig } from '@tatlacas/brevwick-sdk';

const projectKey = import.meta.env.PUBLIC_BREVWICK_PROJECT_KEY ?? '';

// Hoist outside the component so the provider's `useMemo(() =>
// createBrevwick(config))` keeps a stable identity.
const config: BrevwickConfig = { projectKey, environment: 'dev' };

export function BrevwickIsland(): ReactElement | null {
  if (!projectKey) return null;
  return (
    <BrevwickProvider config={config}>
      <FeedbackButton position="bottom-right" />
    </BrevwickProvider>
  );
}
