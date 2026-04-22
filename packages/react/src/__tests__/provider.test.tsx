import { render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Brevwick, BrevwickConfig } from '@tatlacas/brevwick-sdk';

const install = vi.fn();
const uninstall = vi.fn();
const submit = vi.fn();
const captureScreenshot = vi.fn();
const createBrevwick = vi.fn<(config: BrevwickConfig) => Brevwick>();

vi.mock('@tatlacas/brevwick-sdk', async () => {
  const actual = await vi.importActual<typeof import('@tatlacas/brevwick-sdk')>(
    '@tatlacas/brevwick-sdk',
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

  it('re-creates the instance when a new config object is passed each render', () => {
    // Documents the memoisation contract: consumers MUST hoist `config` or
    // wrap it in `useMemo`. Passing a fresh object literal each render cycles
    // install/uninstall on every render.
    createBrevwick.mockImplementation(() => makeInstance());
    const { rerender } = render(
      <BrevwickProvider config={{ projectKey: 'pk_test_identity_a' }}>
        <div>child</div>
      </BrevwickProvider>,
    );
    rerender(
      <BrevwickProvider config={{ projectKey: 'pk_test_identity_a' }}>
        <div>child</div>
      </BrevwickProvider>,
    );
    rerender(
      <BrevwickProvider config={{ projectKey: 'pk_test_identity_a' }}>
        <div>child</div>
      </BrevwickProvider>,
    );
    // Every render yielded a fresh instance, so createBrevwick and install
    // fire per render. The exact count may vary if React's dev-mode effect
    // double-invocation is enabled; assert the cycling behaviour rather than
    // a hard number.
    expect(createBrevwick).toHaveBeenCalledTimes(3);
    expect(install.mock.calls.length).toBeGreaterThanOrEqual(3);
    expect(uninstall.mock.calls.length).toBeGreaterThanOrEqual(2);
  });
});
