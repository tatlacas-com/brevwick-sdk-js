import { Router } from '@solidjs/router';
import { FileRoutes } from '@solidjs/start/router';
import { Suspense } from 'solid-js';
import { ConfiguredWidget } from './configured-widget';

export default function App() {
  return (
    <Router
      root={(props) => (
        <>
          <Suspense>{props.children}</Suspense>
          <ConfiguredWidget />
        </>
      )}
    >
      <FileRoutes />
    </Router>
  );
}
