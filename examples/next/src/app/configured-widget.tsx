'use client';

import { useMemo, type ReactElement } from 'react';
import { BrevwickProvider, FeedbackButton } from 'brevwick-react';
import type { BrevwickConfig } from 'brevwick-sdk';

export interface ConfiguredWidgetProps {
  projectKey: string;
  endpoint?: string;
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
    <BrevwickProvider config={config}>
      <FeedbackButton position="bottom-right" />
    </BrevwickProvider>
  );
}
