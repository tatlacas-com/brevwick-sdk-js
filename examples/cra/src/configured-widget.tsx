import { useMemo, type ReactElement } from 'react';
import { BrevwickProvider, FeedbackButton } from '@tatlacas/brevwick-react';
import type { BrevwickConfig } from '@tatlacas/brevwick-sdk';

export interface ConfiguredWidgetProps {
  projectKey: string;
}

export function ConfiguredWidget({
  projectKey,
}: ConfiguredWidgetProps): ReactElement {
  const config = useMemo<BrevwickConfig>(
    () => ({ projectKey, environment: 'dev' }),
    [projectKey],
  );

  return (
    <BrevwickProvider config={config}>
      <FeedbackButton position="bottom-right" />
    </BrevwickProvider>
  );
}
