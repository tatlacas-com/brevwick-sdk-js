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

interface ConfigState {
  readonly projectKey: string;
  readonly endpoint: string;
  readonly error?: 'missing-key' | 'invalid-key' | 'missing-endpoint';
}

function readConfig(): ConfigState {
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
    return (
      <>
        {children}
        <ConfigErrorBanner error={error} />
      </>
    );
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

function ConfigErrorBanner({
  error,
}: {
  error: ConfigState['error'];
}): ReactElement | null {
  if (!error) return null;
  const text =
    error === 'missing-key'
      ? 'Missing VITE_BREVWICK_PROJECT_KEY. Copy .env.example to .env.local, seed a real test key, and reload.'
      : error === 'invalid-key'
        ? 'VITE_BREVWICK_PROJECT_KEY is malformed. Must match pk_(live|test)_[A-Za-z0-9]{16,}.'
        : 'Missing VITE_BREVWICK_ENDPOINT. Point it at your local brevwick-api (e.g. http://localhost:8080).';
  return (
    <div
      role="alert"
      style={{
        position: 'fixed',
        bottom: '1rem',
        left: '50%',
        transform: 'translateX(-50%)',
        maxWidth: '32rem',
        padding: '0.75rem 1rem',
        background: '#fef2f2',
        color: '#b42318',
        border: '1px solid #fecaca',
        borderRadius: '0.5rem',
        fontSize: '0.875rem',
      }}
    >
      {text}
    </div>
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
