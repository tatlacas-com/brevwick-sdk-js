import { render } from '@solidjs/testing-library';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Brevwick, BrevwickConfig } from '@tatlacas/brevwick-sdk';

const install = vi.fn();
const uninstall = vi.fn();
const submit = vi.fn();
const captureScreenshot = vi.fn();
const createBrevwickMock = vi.fn<(config: BrevwickConfig) => Brevwick>();

vi.mock('@tatlacas/brevwick-sdk', async () => {
  const actual = await vi.importActual<typeof import('@tatlacas/brevwick-sdk')>(
    '@tatlacas/brevwick-sdk',
  );
  return {
    ...actual,
    createBrevwick: (config: BrevwickConfig) => createBrevwickMock(config),
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
    createBrevwickMock.mockReturnValueOnce(makeInstance());
    const { unmount } = render(() => (
      <BrevwickProvider config={{ projectKey: 'pk_test_provider' }}>
        <div>child</div>
      </BrevwickProvider>
    ));
    expect(createBrevwickMock).toHaveBeenCalledTimes(1);
    expect(install).toHaveBeenCalledTimes(1);
    expect(uninstall).not.toHaveBeenCalled();

    unmount();
    expect(uninstall).toHaveBeenCalledTimes(1);
  });

  it('renders children', () => {
    createBrevwickMock.mockReturnValueOnce(makeInstance());
    const { getByText } = render(() => (
      <BrevwickProvider config={{ projectKey: 'pk_test_children' }}>
        <span>hello</span>
      </BrevwickProvider>
    ));
    expect(getByText('hello')).toBeInTheDocument();
  });
});
