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
import { useBrevwick } from '../context';

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
    expect(uninstall).not.toHaveBeenCalled();
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
    expect(createBrevwick).toHaveBeenCalledTimes(3);
    expect(install.mock.calls.length).toBeGreaterThanOrEqual(3);
    expect(uninstall.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it('exposes the installed instance to descendants via useBrevwick()', () => {
    const instance = makeInstance();
    createBrevwick.mockReturnValueOnce(instance);
    let captured: Brevwick | null = null;
    const Probe = (): null => {
      captured = useBrevwick();
      return null;
    };
    render(
      <BrevwickProvider config={{ projectKey: 'pk_test_probe' }}>
        <Probe />
      </BrevwickProvider>,
    );
    expect(captured).toBe(instance);
  });

  it('accepts a navigationRef prop without throwing (slot consumed by #87)', () => {
    createBrevwick.mockReturnValueOnce(makeInstance());
    // Minimal React-Navigation-shaped ref. The route-ring worktree (#87)
    // wires the actual subscription; this test only proves the prop slot
    // exists and the provider does not crash when handed one.
    const navigationRef = {
      current: {
        addListener: vi.fn(() => () => {}),
        getCurrentRoute: () => ({ name: 'Home' }),
      },
    };
    const { unmount } = render(
      <BrevwickProvider
        config={{ projectKey: 'pk_test_nav' }}
        navigationRef={navigationRef}
      >
        <div>child</div>
      </BrevwickProvider>,
    );
    expect(install).toHaveBeenCalledTimes(1);
    unmount();
  });
});
