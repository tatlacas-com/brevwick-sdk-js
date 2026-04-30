import type { ReactElement, ReactNode } from 'react';
import { BrevwickProvider, FeedbackButton } from '@tatlacas/brevwick-react';
import type { BrevwickConfig } from '@tatlacas/brevwick-sdk';

// Remix uses Vite under the hood, so client-inlined env vars follow Vite's
// `VITE_*` + `import.meta.env` convention. There is no `REMIX_PUBLIC_*`
// convention; Vite only inlines references the build-time `define` /
// `envPrefix` config tells it to inline.
const projectKey = import.meta.env.VITE_BREVWICK_PROJECT_KEY ?? '';

// Mirrors the SDK's `validateConfig` regex so we can short-circuit before the
// provider mounts and `createBrevwick` would throw synchronously.
const PROJECT_KEY_PATTERN = /^pk_(live|test)_[A-Za-z0-9]{16,}$/;
const PLACEHOLDER_KEY = 'pk_test_replace_me';

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
  if (
    !projectKey ||
    projectKey === PLACEHOLDER_KEY ||
    !PROJECT_KEY_PATTERN.test(projectKey)
  ) {
    return <>{children}</>;
  }

  return (
    <BrevwickProvider config={config}>
      {children}
      <FeedbackButton position="bottom-right" />
    </BrevwickProvider>
  );
}
