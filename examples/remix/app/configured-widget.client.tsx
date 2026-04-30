import type { ReactElement, ReactNode } from 'react';
import { BrevwickProvider, FeedbackButton } from '@tatlacas/brevwick-react';
import type { BrevwickConfig } from '@tatlacas/brevwick-sdk';

const projectKey =
  typeof process !== 'undefined'
    ? (process.env.REMIX_PUBLIC_BREVWICK_PROJECT_KEY ?? '')
    : '';

// Module-scoped so the provider's `useMemo(() => createBrevwick(config))`
// stays referentially stable across renders.
const config: BrevwickConfig = { projectKey, environment: 'dev' };

interface Props {
  children: ReactNode;
}

export function ConfiguredWidget({ children }: Props): ReactElement {
  // The provider is SSR-safe: `createBrevwick` runs in `useMemo`, and ring
  // installation is gated on `useEffect` so it only fires client-side. No
  // `useEffect`-based mount gate is needed here.
  if (!projectKey) return <>{children}</>;

  return (
    <BrevwickProvider config={config}>
      {children}
      <FeedbackButton position="bottom-right" />
    </BrevwickProvider>
  );
}
