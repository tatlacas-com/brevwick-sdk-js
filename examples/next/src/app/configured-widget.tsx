'use client';

import {
  Component,
  useMemo,
  type ErrorInfo,
  type ReactElement,
  type ReactNode,
} from 'react';
import { BrevwickProvider, FeedbackButton } from '@tatlacas/brevwick-react';
import type { BrevwickConfig } from '@tatlacas/brevwick-sdk';

export interface ConfiguredWidgetProps {
  projectKey: string;
  endpoint: string;
}

export function ConfiguredWidget({
  projectKey,
  endpoint,
}: ConfiguredWidgetProps): ReactElement {
  // `page.tsx` has already shape-checked `projectKey` and required `endpoint`,
  // but `createBrevwick` still runs its own synchronous validation inside the
  // Provider. If a future refactor loosens the server guard, the boundary
  // below surfaces the error as a visible banner instead of crashing the
  // React tree.
  const config = useMemo<BrevwickConfig>(
    () => ({ projectKey, endpoint, environment: 'dev' }),
    [projectKey, endpoint],
  );

  return (
    <BrevwickErrorBoundary>
      <BrevwickProvider config={config}>
        <FeedbackButton position="bottom-right" />
      </BrevwickProvider>
    </BrevwickErrorBoundary>
  );
}

// Minimal boundary dedicated to the Provider mount. `createBrevwick` throws
// `BrevwickConfigError` synchronously from inside the Provider on invalid
// config; this is the last line of defence against a blank-white-screen
// render crash.
interface BoundaryState {
  readonly message: string | null;
}

class BrevwickErrorBoundary extends Component<
  { readonly children: ReactNode },
  BoundaryState
> {
  state: BoundaryState = { message: null };

  static getDerivedStateFromError(err: unknown): BoundaryState {
    return { message: err instanceof Error ? err.message : String(err) };
  }

  componentDidCatch(err: unknown, _info: ErrorInfo): void {
    // Intentionally no-op: the banner render below is the user-visible
    // signal. Real integrators will want to forward to their own logging.
    void err;
  }

  render(): ReactNode {
    if (this.state.message !== null) {
      return (
        <p role="alert" style={{ color: '#b42318', marginTop: '1rem' }}>
          Brevwick config error: {this.state.message}
        </p>
      );
    }
    return this.props.children;
  }
}
