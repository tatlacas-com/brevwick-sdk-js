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
