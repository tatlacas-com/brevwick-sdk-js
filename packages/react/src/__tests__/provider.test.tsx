import { render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Brevwick, BrevwickConfig } from 'brevwick-sdk';

const install = vi.fn();
const uninstall = vi.fn();
const submit = vi.fn();
const captureScreenshot = vi.fn();
const createBrevwick = vi.fn<(config: BrevwickConfig) => Brevwick>();

vi.mock('brevwick-sdk', async () => {
  const actual = await vi.importActual<typeof import('brevwick-sdk')>(
    'brevwick-sdk',
  );
  return {
    ...actual,
    createBrevwick: (config: BrevwickConfig) => createBrevwick(config),
  };
});

import { BrevwickProvider } from '../provider';

const makeInstance = (): Brevwick =>
  ({
    install,
    uninstall,
    submit,
    captureScreenshot,
  }) as unknown as Brevwick;

afterEach(() => {
  vi.clearAllMocks();
});

describe('BrevwickProvider', () => {
  it('calls createBrevwick + install on mount, uninstall on unmount', () => {
    createBrevwick.mockReturnValueOnce(makeInstance());
    const { unmount } = render(
      <BrevwickProvider config={{ projectKey: 'pk_test_provider' }}>
        <div>child</div>
      </BrevwickProvider>,
    );
    expect(createBrevwick).toHaveBeenCalledTimes(1);
    expect(install).toHaveBeenCalledTimes(1);
    expect(uninstall).not.toHaveBeenCalled();

    unmount();
    expect(uninstall).toHaveBeenCalledTimes(1);
  });

  it('reuses the same instance while config identity is stable', () => {
    createBrevwick.mockReturnValue(makeInstance());
    const config: BrevwickConfig = { projectKey: 'pk_test_stable' };
    const { rerender } = render(
      <BrevwickProvider config={config}>
        <div>child</div>
      </BrevwickProvider>,
    );
    rerender(
      <BrevwickProvider config={config}>
        <div>child</div>
      </BrevwickProvider>,
    );
    expect(createBrevwick).toHaveBeenCalledTimes(1);
    expect(install).toHaveBeenCalledTimes(1);
  });
});
