import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createBrevwick } from '../core/client';
import { __resetBrevwickRegistry, __setRingsForTesting } from '../testing';
import type { BrevwickInternal } from '../core/internal';

const KEY = 'pk_test_aaaaaaaaaaaaaaaa01';

function getInternal(instance: unknown): BrevwickInternal {
  return (instance as { _internal: BrevwickInternal })._internal;
}

beforeEach(() => {
  __resetBrevwickRegistry();
  __setRingsForTesting();
  vi.resetModules();
});

afterEach(() => {
  __resetBrevwickRegistry();
  __setRingsForTesting();
  vi.doUnmock('modern-screenshot');
});

describe('captureScreenshot', () => {
  it('resolves to an image/* Blob on success', async () => {
    vi.doMock('modern-screenshot', () => ({
      domToBlob: vi
        .fn()
        .mockResolvedValue(
          new Blob([new Uint8Array([1, 2, 3])], { type: 'image/webp' }),
        ),
    }));
    const { captureScreenshot } = await import('../screenshot');
    const blob = await captureScreenshot();
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type).toMatch(/^image\//);
  });

  it('hides [data-brevwick-skip] during capture and restores after', async () => {
    const skip = document.createElement('div');
    skip.setAttribute('data-brevwick-skip', '');
    document.body.appendChild(skip);
    // Pre-capture: no inline visibility set.
    expect(skip.style.visibility).toBe('');

    let observedDuringCapture = '';
    vi.doMock('modern-screenshot', () => ({
      domToBlob: vi.fn().mockImplementation(async () => {
        observedDuringCapture = skip.style.visibility;
        return new Blob([new Uint8Array([1])], { type: 'image/webp' });
      }),
    }));

    const { captureScreenshot } = await import('../screenshot');
    await captureScreenshot();

    expect(observedDuringCapture).toBe('hidden');
    // Post-capture: original ('') restored.
    expect(skip.style.visibility).toBe('');
    skip.remove();
  });

  it('restores [data-brevwick-skip] visibility even when capture throws', async () => {
    const skip = document.createElement('div');
    skip.setAttribute('data-brevwick-skip', '');
    skip.style.visibility = 'visible';
    document.body.appendChild(skip);

    vi.doMock('modern-screenshot', () => ({
      domToBlob: vi.fn().mockRejectedValue(new Error('boom')),
    }));
    const { captureScreenshot } = await import('../screenshot');
    const blob = await captureScreenshot();
    expect(blob).toBeInstanceOf(Blob);
    // Original 'visible' is restored after the rejection.
    expect(skip.style.visibility).toBe('visible');
    skip.remove();
  });

  it('returns a transparent placeholder Blob + warns via console.warn when capture rejects', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.doMock('modern-screenshot', () => ({
      domToBlob: vi.fn().mockRejectedValue(new Error('nope')),
    }));
    const { captureScreenshot } = await import('../screenshot');
    const blob = await captureScreenshot();
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type).toBe('image/webp');
    expect(blob.size).toBeGreaterThan(0);
    expect(warn).toHaveBeenCalled();
    const msg = String(warn.mock.calls[0]?.[0] ?? '');
    expect(msg).toMatch(/brevwick: screenshot capture failed/);
    warn.mockRestore();
  });

  it('returns a placeholder Blob when domToBlob yields null', async () => {
    vi.doMock('modern-screenshot', () => ({
      domToBlob: vi.fn().mockResolvedValue(null),
    }));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { captureScreenshot } = await import('../screenshot');
    const blob = await captureScreenshot();
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type).toBe('image/webp');
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('pushes a warn ConsoleEntry into the owning Brevwick instance on failure', async () => {
    vi.doMock('modern-screenshot', () => ({
      domToBlob: vi.fn().mockRejectedValue(new Error('boom')),
    }));
    const instance = createBrevwick({ projectKey: KEY });
    const blob = await instance.captureScreenshot();
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type).toBe('image/webp');

    const entries = getInternal(instance).buffers.console.snapshot();
    expect(entries).toHaveLength(1);
    expect(entries[0]?.level).toBe('warn');
    expect(entries[0]?.message).toMatch(/brevwick: screenshot capture failed/);
  });

  it('passes quality + image/webp type to modern-screenshot', async () => {
    const spy = vi
      .fn()
      .mockResolvedValue(
        new Blob([new Uint8Array([1])], { type: 'image/webp' }),
      );
    vi.doMock('modern-screenshot', () => ({ domToBlob: spy }));
    const { captureScreenshot } = await import('../screenshot');
    await captureScreenshot({ quality: 0.5 });
    expect(spy).toHaveBeenCalledWith(
      document.body,
      expect.objectContaining({ quality: 0.5, type: 'image/webp' }),
    );
  });

  it('defaults the capture target to document.body so calls match modern-screenshot README usage', async () => {
    // Asserts the public contract. The body-default fixes the symptom
    // reported in tatlacas-com/brevwick-web#254 (a ~2 KiB blank image
    // when called with no args).
    //
    // hypothesis (unverified, do NOT rely on this in test naming):
    // `<html>` inside an SVG `<foreignObject>` is not flow content and
    // rasterizes blank in some Chromium builds. The hypothesis has not
    // been pinned to a Chromium issue and is not what this test asserts;
    // this test asserts only the observable contract (default = body).
    //
    // NOTE: `modern-screenshot` is mocked in this suite, so this test
    // proves the SDK *passes* `document.body` to `domToBlob` — it does
    // NOT prove rendering improves. Real-DOM coverage of the rasterized
    // output is out of scope for jsdom; track follow-up Playwright
    // coverage if regression recurs.
    const spy = vi
      .fn()
      .mockResolvedValue(
        new Blob([new Uint8Array([1])], { type: 'image/webp' }),
      );
    vi.doMock('modern-screenshot', () => ({ domToBlob: spy }));
    const { captureScreenshot } = await import('../screenshot');
    await captureScreenshot();
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0]?.[0]).toBe(document.body);
    expect(spy.mock.calls[0]?.[0]).not.toBe(document.documentElement);
  });

  it('restores [data-brevwick-skip] visibility after concurrent captures that overlap', async () => {
    // Two captures fire against the same skip node without awaiting between
    // them. Prior to the ref-counted stash this stashed the already-mutated
    // `'hidden'` on the second scrub and left the node permanently hidden.
    const skip = document.createElement('div');
    skip.setAttribute('data-brevwick-skip', '');
    skip.style.visibility = 'visible';
    document.body.appendChild(skip);

    // The first capture resolves immediately; the second is gated on a
    // deferred promise so we can observe the mid-flight state while the
    // second call still holds its ref on the skip node.
    let callNum = 0;
    let releaseSecond!: () => void;
    const secondGate = new Promise<void>((r) => {
      releaseSecond = r;
    });
    vi.doMock('modern-screenshot', () => ({
      domToBlob: vi.fn(async () => {
        callNum += 1;
        if (callNum === 2) await secondGate;
        return new Blob([new Uint8Array([1])], { type: 'image/webp' });
      }),
    }));

    const { captureScreenshot } = await import('../screenshot');
    // Fire both captures; the second must not await the first.
    const a = captureScreenshot();
    const b = captureScreenshot();
    // Synchronous scrubs have run — both captures hold a ref.
    expect(skip.style.visibility).toBe('hidden');
    await a;
    // The second capture is still waiting on the gate — the node must stay
    // hidden because the second scrub has not released its ref yet.
    expect(skip.style.visibility).toBe('hidden');

    releaseSecond();
    await b;
    // Only after the last concurrent capture releases its ref does the
    // ORIGINAL 'visible' value come back. Prior to the ref-counted stash,
    // the second capture had stashed the first's mutated `'hidden'` and
    // left the node permanently hidden here.
    expect(skip.style.visibility).toBe('visible');
    skip.remove();
  });

  it('still resolves with a placeholder when a bus entry listener throws', async () => {
    vi.doMock('modern-screenshot', () => ({
      domToBlob: vi.fn().mockRejectedValue(new Error('boom')),
    }));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const instance = createBrevwick({ projectKey: KEY });
    getInternal(instance).bus.on('entry', () => {
      throw new Error('listener explode');
    });

    // Must not reject; the throwing listener must not escape capture().
    const blob = await instance.captureScreenshot();
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type).toBe('image/webp');
    expect(blob.size).toBeGreaterThan(0);
    // Fallback path took over: console.warn is invoked with the failure msg.
    expect(warn).toHaveBeenCalled();
    const msg = String(warn.mock.calls[0]?.[0] ?? '');
    expect(msg).toMatch(/brevwick: screenshot capture failed/);
    warn.mockRestore();
  });

  it('defaults quality to 0.85', async () => {
    // Note: this test references `document.body` only because `body` is
    // the default capture target (asserted by the dedicated body-default
    // test above). Do NOT collapse this test into that one — they cover
    // separate contracts (quality default vs target default) and the
    // body reference here is incidental.
    const spy = vi
      .fn()
      .mockResolvedValue(
        new Blob([new Uint8Array([1])], { type: 'image/webp' }),
      );
    vi.doMock('modern-screenshot', () => ({ domToBlob: spy }));
    const { captureScreenshot } = await import('../screenshot');
    await captureScreenshot();
    expect(spy).toHaveBeenCalledWith(
      document.body,
      expect.objectContaining({ quality: 0.85, type: 'image/webp' }),
    );
  });

  it('returns a placeholder without invoking modern-screenshot when document.body is null', async () => {
    // Defends the `document.body ?? null` fallback: capture invoked before
    // body parsing finishes (or against a stub document with no body) must
    // yield the placeholder rather than throwing.
    const domToBlob = vi.fn();
    vi.doMock('modern-screenshot', () => ({ domToBlob }));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const originalBody = document.body;
    Object.defineProperty(document, 'body', {
      configurable: true,
      get: () => null,
    });
    try {
      const { captureScreenshot } = await import('../screenshot');
      const blob = await captureScreenshot();
      expect(blob).toBeInstanceOf(Blob);
      expect(blob.type).toBe('image/webp');
      expect(domToBlob).not.toHaveBeenCalled();
      expect(warn).toHaveBeenCalled();
      const msg = String(warn.mock.calls[0]?.[0] ?? '');
      expect(msg).toMatch(/document\.body is not available/);
    } finally {
      Object.defineProperty(document, 'body', {
        configurable: true,
        value: originalBody,
        writable: true,
      });
      warn.mockRestore();
    }
  });

  it('returns a placeholder without invoking modern-screenshot when document is undefined (SSR)', async () => {
    const domToBlob = vi.fn();
    vi.doMock('modern-screenshot', () => ({ domToBlob }));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.stubGlobal('document', undefined);
    try {
      const { captureScreenshot } = await import('../screenshot');
      const blob = await captureScreenshot();
      expect(blob).toBeInstanceOf(Blob);
      expect(blob.type).toBe('image/webp');
      expect(domToBlob).not.toHaveBeenCalled();
      expect(warn).toHaveBeenCalled();
      const msg = String(warn.mock.calls[0]?.[0] ?? '');
      expect(msg).toMatch(/document is not available/);
    } finally {
      vi.unstubAllGlobals();
      warn.mockRestore();
    }
  });

  it('preserves :root CSS custom properties on body subtree at capture time', async () => {
    // Regression guard for the CSS-variable inheritance concern raised
    // in PR #103 review: brevwick-web defines `--brw-*` design tokens on
    // `:root` (i.e. `<html>`). When the capture root is `document.body`
    // (the new default), a body descendant must STILL be able to resolve
    // those tokens via `getComputedStyle` at the moment `domToBlob` is
    // invoked — otherwise the rasterized subtree would render with
    // unresolved `var()` colours.
    //
    // jsdom does not actually rasterize, so this test cannot assert
    // pixel output. What it CAN assert is the consumer-side invariant
    // that `modern-screenshot` relies on: the live element passed to
    // `domToBlob` already resolves :root tokens via `getComputedStyle`,
    // which is what `modern-screenshot` inlines into its cloned tree
    // before reparenting under `<foreignObject>`. If this invariant
    // ever broke (e.g. because we started passing a detached clone
    // instead of the live body) the rasterized output would lose the
    // tokens.
    const styleEl = document.createElement('style');
    styleEl.textContent = `
      :root {
        --brw-test-token: rgb(7, 13, 29);
      }
      .brw-uses-token {
        color: var(--brw-test-token);
      }
    `;
    document.head.appendChild(styleEl);
    const sample = document.createElement('div');
    sample.className = 'brw-uses-token';
    document.body.appendChild(sample);

    let observedColor = '';
    let receivedTarget: unknown;
    vi.doMock('modern-screenshot', () => ({
      domToBlob: vi.fn().mockImplementation(async (target: HTMLElement) => {
        receivedTarget = target;
        // At capture time, the body descendant must resolve the
        // :root-scoped token. If this returns the empty string or the
        // literal `var(--brw-test-token)`, modern-screenshot would
        // inline a broken style.
        observedColor = window.getComputedStyle(sample).color;
        return new Blob([new Uint8Array([1])], { type: 'image/webp' });
      }),
    }));

    const { captureScreenshot } = await import('../screenshot');
    await captureScreenshot();

    expect(receivedTarget).toBe(document.body);
    // jsdom's CSS engine resolves the var; assert the computed value
    // matches the :root declaration.
    expect(observedColor).toBe('rgb(7, 13, 29)');

    sample.remove();
    styleEl.remove();
  });

  it('does not hide the root element itself when the root carries data-brevwick-skip', async () => {
    // Per the JSDoc contract, the root is never scrubbed — hiding the capture
    // target would produce an empty image. Only descendants are hidden.
    const root = document.createElement('section');
    root.setAttribute('data-brevwick-skip', '');
    root.style.visibility = 'visible';
    const child = document.createElement('div');
    child.setAttribute('data-brevwick-skip', '');
    root.appendChild(child);
    document.body.appendChild(root);

    let rootDuring = '';
    let childDuring = '';
    vi.doMock('modern-screenshot', () => ({
      domToBlob: vi.fn().mockImplementation(async () => {
        rootDuring = root.style.visibility;
        childDuring = child.style.visibility;
        return new Blob([new Uint8Array([1])], { type: 'image/webp' });
      }),
    }));

    const { captureScreenshot } = await import('../screenshot');
    await captureScreenshot({ element: root });

    expect(rootDuring).toBe('visible');
    expect(childDuring).toBe('hidden');
    // Post-capture restore: child returns to its original empty value.
    expect(child.style.visibility).toBe('');
    expect(root.style.visibility).toBe('visible');
    root.remove();
  });
});
