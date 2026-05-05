import {
  Component,
  useMemo,
  type ErrorInfo,
  type ReactElement,
  type ReactNode,
} from 'react';
import { BrevwickProvider, FeedbackButton } from '@tatlacas/brevwick-react';
import type { BrevwickConfig } from '@tatlacas/brevwick-sdk';

// Remix uses Vite under the hood, so client-inlined env vars follow Vite's
// `VITE_*` + `import.meta.env` convention. There is no `REMIX_PUBLIC_*`
// convention; Vite only inlines references the build-time `define` /
// `envPrefix` config tells it to inline.
const PROJECT_KEY_PATTERN = /^pk_(live|test)_[A-Za-z0-9]{16,}$/;
const PLACEHOLDER_KEY = 'pk_test_replace_me';

export type ConfigErrorKind =
  | 'missing-key'
  | 'invalid-key'
  | 'missing-endpoint';

export interface ConfigState {
  readonly projectKey: string;
  readonly endpoint: string;
  readonly error?: ConfigErrorKind;
}

export function readConfig(): ConfigState {
  const rawKey = import.meta.env.VITE_BREVWICK_PROJECT_KEY ?? '';
  const rawEndpoint = import.meta.env.VITE_BREVWICK_ENDPOINT ?? '';

  if (!rawKey || rawKey === PLACEHOLDER_KEY) {
    return { projectKey: '', endpoint: rawEndpoint, error: 'missing-key' };
  }
  if (!PROJECT_KEY_PATTERN.test(rawKey)) {
    return { projectKey: '', endpoint: rawEndpoint, error: 'invalid-key' };
  }
  if (!rawEndpoint) {
    return { projectKey: rawKey, endpoint: '', error: 'missing-endpoint' };
  }
  return { projectKey: rawKey, endpoint: rawEndpoint };
}

interface Props {
  children: ReactNode;
}

export function ConfiguredWidget({ children }: Props): ReactElement {
  const { projectKey, endpoint, error } = readConfig();

  if (error || !projectKey || !endpoint) {
    return <>{children}</>;
  }

  return (
    <BrevwickErrorBoundary>
      <ConfiguredProvider projectKey={projectKey} endpoint={endpoint}>
        {children}
      </ConfiguredProvider>
    </BrevwickErrorBoundary>
  );
}

function ConfiguredProvider({
  projectKey,
  endpoint,
  children,
}: {
  projectKey: string;
  endpoint: string;
  children: ReactNode;
}): ReactElement {
  const config = useMemo<BrevwickConfig>(
    () => ({ projectKey, endpoint, environment: 'dev' }),
    [projectKey, endpoint],
  );
  return (
    <BrevwickProvider config={config}>
      {children}
      <FeedbackButton position="bottom-right" />
    </BrevwickProvider>
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
        <p role="alert" style={{ color: '#b42318', margin: '1rem' }}>
          Brevwick config error: {this.state.message}
        </p>
      );
    }
    return this.props.children;
  }
}
