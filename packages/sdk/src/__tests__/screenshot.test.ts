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
    // Asserts the public contract. The body-default partially mitigated
    // the symptom reported in early integrations (a ~2 KiB blank image
    // when called with no args); the actual root cause is
    // documented in the `compensateInnerScrolls` JSDoc in screenshot.ts.
    //
    // NOTE: `modern-screenshot` is mocked in this suite, so this test
    // proves the SDK *passes* `document.body` to `domToBlob` — it does
    // NOT prove rendering improves. Real-DOM coverage of the rasterized
    // output is out of scope for happy-dom; tracked in #104.
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
    // in PR #103 review: the consumer that reproduced the bug defines
    // `--brw-*` design tokens on `:root` (i.e. `<html>`). When the
    // capture root is `document.body` (the new default), a body
    // descendant must STILL be able to resolve
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

describe('captureScreenshot — inner-scroll compensation', () => {
  // Happy-dom does not lay out content, so `scrollWidth`/`scrollHeight`/
  // `clientWidth`/`clientHeight` are all 0 by default and `scrollTop`
  // assignments only stick when the container is actually scrollable.
  // We override those properties with `Object.defineProperty` so the
  // SDK's `isScrollableContainer` heuristic sees a "real" scrollable
  // box. The shape mirrors the live-page console snapshot from the
  // original reproduction (a Tailwind `<main class="overflow-y-auto">`
  // with `clientHeight: 693`, `scrollHeight: 2144`, `scrollTop: 193.5`).
  function makeScrollable(opts: {
    overflow?: string;
    scrollTop?: number;
    scrollLeft?: number;
    clientWidth?: number;
    clientHeight?: number;
    scrollWidth?: number;
    scrollHeight?: number;
  }): HTMLElement {
    const el = document.createElement('div');
    el.style.overflow = opts.overflow ?? 'auto';
    Object.defineProperty(el, 'scrollTop', {
      configurable: true,
      writable: true,
      value: opts.scrollTop ?? 0,
    });
    Object.defineProperty(el, 'scrollLeft', {
      configurable: true,
      writable: true,
      value: opts.scrollLeft ?? 0,
    });
    Object.defineProperty(el, 'clientWidth', {
      configurable: true,
      value: opts.clientWidth ?? 100,
    });
    Object.defineProperty(el, 'clientHeight', {
      configurable: true,
      value: opts.clientHeight ?? 100,
    });
    Object.defineProperty(el, 'scrollWidth', {
      configurable: true,
      value: opts.scrollWidth ?? 100,
    });
    Object.defineProperty(el, 'scrollHeight', {
      configurable: true,
      value: opts.scrollHeight ?? 100,
    });
    return el;
  }

  it('translates direct children of inner overflow:auto containers by -scrollLeft/-scrollTop during capture', async () => {
    // Mirrors the original repro: a Tailwind <main overflow-y-auto>
    // scrolled mid-way down. Without this pass, modern-screenshot would
    // rasterize the TOP of the container's scroll extent.
    const main = makeScrollable({
      overflow: 'auto',
      scrollTop: 193.5,
      scrollLeft: 0,
      clientHeight: 693,
      scrollHeight: 2144,
    });
    const child = document.createElement('div');
    child.textContent = 'visible content';
    main.appendChild(child);
    document.body.appendChild(main);

    let observedTransform = '';
    let observedOrigin = '';
    vi.doMock('modern-screenshot', () => ({
      domToBlob: vi.fn().mockImplementation(async () => {
        observedTransform = child.style.transform;
        observedOrigin = child.style.transformOrigin;
        return new Blob([new Uint8Array([1])], { type: 'image/webp' });
      }),
    }));

    const { captureScreenshot } = await import('../screenshot');
    await captureScreenshot();

    // At capture-time the child is translated to compensate for the
    // container's live scrollTop. The translate goes from (0, -193.5)
    // because dx = -scrollLeft, dy = -scrollTop.
    expect(observedTransform).toBe('translate(0px, -193.5px)');
    expect(observedOrigin).toBe('0 0');
    // Post-capture: original empty values restored.
    expect(child.style.transform).toBe('');
    expect(child.style.transformOrigin).toBe('');

    main.remove();
  });

  it('also compensates horizontal scroll (scrollLeft)', async () => {
    const horiz = makeScrollable({
      overflow: 'auto',
      scrollLeft: 50,
      scrollTop: 0,
      clientWidth: 200,
      scrollWidth: 800,
    });
    const child = document.createElement('div');
    horiz.appendChild(child);
    document.body.appendChild(horiz);

    let observedTransform = '';
    vi.doMock('modern-screenshot', () => ({
      domToBlob: vi.fn().mockImplementation(async () => {
        observedTransform = child.style.transform;
        return new Blob([new Uint8Array([1])], { type: 'image/webp' });
      }),
    }));

    const { captureScreenshot } = await import('../screenshot');
    await captureScreenshot();

    expect(observedTransform).toBe('translate(-50px, 0px)');
    expect(child.style.transform).toBe('');

    horiz.remove();
  });

  it('does not touch containers with overflow:visible even if scrollTop is non-zero', async () => {
    // Defensive: an element can have a scrollTop value set programmatically
    // without overflow:auto/scroll. Such an element is not actually a
    // scroll container in the live tree (browsers ignore scrollTop on
    // overflow:visible) and must not be translated.
    const visible = makeScrollable({
      overflow: 'visible',
      scrollTop: 100,
      clientHeight: 100,
      scrollHeight: 1000,
    });
    const child = document.createElement('div');
    visible.appendChild(child);
    document.body.appendChild(visible);

    let observedTransform = '';
    vi.doMock('modern-screenshot', () => ({
      domToBlob: vi.fn().mockImplementation(async () => {
        observedTransform = child.style.transform;
        return new Blob([new Uint8Array([1])], { type: 'image/webp' });
      }),
    }));

    const { captureScreenshot } = await import('../screenshot');
    await captureScreenshot();

    expect(observedTransform).toBe('');

    visible.remove();
  });

  it('does not touch containers whose scrollWidth/scrollHeight do not exceed clientWidth/clientHeight', async () => {
    // Defensive: an overflow:auto element with no actual overflow is not
    // a scroll container. scrollTop > 0 on such an element is a stale
    // value and should not trigger compensation.
    const noOverflow = makeScrollable({
      overflow: 'auto',
      scrollTop: 50,
      clientHeight: 1000,
      scrollHeight: 1000,
    });
    const child = document.createElement('div');
    noOverflow.appendChild(child);
    document.body.appendChild(noOverflow);

    let observedTransform = '';
    vi.doMock('modern-screenshot', () => ({
      domToBlob: vi.fn().mockImplementation(async () => {
        observedTransform = child.style.transform;
        return new Blob([new Uint8Array([1])], { type: 'image/webp' });
      }),
    }));

    const { captureScreenshot } = await import('../screenshot');
    await captureScreenshot();

    expect(observedTransform).toBe('');

    noOverflow.remove();
  });

  it('composes with an existing inline transform by prepending the translate', async () => {
    const main = makeScrollable({
      overflow: 'auto',
      scrollTop: 100,
      clientHeight: 200,
      scrollHeight: 1000,
    });
    const child = document.createElement('div');
    // Pre-existing transform (e.g. a CSS animation handle, a UI lib's
    // hover-scale). Compensation must preserve it.
    child.style.transform = 'rotate(45deg)';
    child.style.transformOrigin = 'center center';
    main.appendChild(child);
    document.body.appendChild(main);

    let observedTransform = '';
    let observedOrigin = '';
    vi.doMock('modern-screenshot', () => ({
      domToBlob: vi.fn().mockImplementation(async () => {
        observedTransform = child.style.transform;
        observedOrigin = child.style.transformOrigin;
        return new Blob([new Uint8Array([1])], { type: 'image/webp' });
      }),
    }));

    const { captureScreenshot } = await import('../screenshot');
    await captureScreenshot();

    // Translate prepended (so it's applied in the parent's frame),
    // existing rotate preserved.
    expect(observedTransform).toBe('translate(0px, -100px) rotate(45deg)');
    // transform-origin overridden to 0 0 during capture.
    expect(observedOrigin).toBe('0 0');
    // Original values restored verbatim post-capture.
    expect(child.style.transform).toBe('rotate(45deg)');
    expect(child.style.transformOrigin).toBe('center center');

    main.remove();
  });

  it('restores the original transform even when capture rejects', async () => {
    const main = makeScrollable({
      overflow: 'auto',
      scrollTop: 100,
      clientHeight: 200,
      scrollHeight: 1000,
    });
    const child = document.createElement('div');
    child.style.transform = 'scale(2)';
    child.style.transformOrigin = '10px 20px';
    main.appendChild(child);
    document.body.appendChild(main);

    vi.doMock('modern-screenshot', () => ({
      domToBlob: vi.fn().mockRejectedValue(new Error('boom')),
    }));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    const { captureScreenshot } = await import('../screenshot');
    const blob = await captureScreenshot();
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type).toBe('image/webp');

    // Original values restored after the rejection — no leaked
    // translate, no leaked transform-origin: 0 0.
    expect(child.style.transform).toBe('scale(2)');
    expect(child.style.transformOrigin).toBe('10px 20px');

    warn.mockRestore();
    main.remove();
  });

  it('translates every direct element child, not just the first', async () => {
    // The SDK's compensation pass walks all direct children, not just
    // firstElementChild. A Tailwind <main> typically holds a header,
    // a content area, and a footer as siblings — all need the same
    // translate to render at their visible offsets.
    const main = makeScrollable({
      overflow: 'auto',
      scrollTop: 50,
      clientHeight: 200,
      scrollHeight: 1000,
    });
    const a = document.createElement('header');
    const b = document.createElement('section');
    const c = document.createElement('footer');
    main.append(a, b, c);
    document.body.appendChild(main);

    let observed: string[] = [];
    vi.doMock('modern-screenshot', () => ({
      domToBlob: vi.fn().mockImplementation(async () => {
        observed = [a.style.transform, b.style.transform, c.style.transform];
        return new Blob([new Uint8Array([1])], { type: 'image/webp' });
      }),
    }));

    const { captureScreenshot } = await import('../screenshot');
    await captureScreenshot();

    expect(observed).toEqual([
      'translate(0px, -50px)',
      'translate(0px, -50px)',
      'translate(0px, -50px)',
    ]);
    expect(a.style.transform).toBe('');
    expect(b.style.transform).toBe('');
    expect(c.style.transform).toBe('');

    main.remove();
  });

  it('keeps original transforms restored after concurrent captures release their refs', async () => {
    // Mirrors the skip-scrub concurrency test: two overlapping captures
    // against the same scrollable container must not leak transforms.
    // Without ref-counting, the second capture's stash would record the
    // already-mutated `translate(...)` string and the original transform
    // would never come back.
    const main = makeScrollable({
      overflow: 'auto',
      scrollTop: 200,
      clientHeight: 200,
      scrollHeight: 1000,
    });
    const child = document.createElement('div');
    child.style.transform = 'rotate(10deg)';
    main.appendChild(child);
    document.body.appendChild(main);

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
    const a = captureScreenshot();
    const b = captureScreenshot();
    // Synchronous compensation pass ran for both — transform composed.
    expect(child.style.transform).toBe('translate(0px, -200px) rotate(10deg)');
    await a;
    // Second capture still holds its ref → the transform stays composed.
    expect(child.style.transform).toBe('translate(0px, -200px) rotate(10deg)');

    releaseSecond();
    await b;
    // Last ref released → original restored, not the already-mutated
    // composed string.
    expect(child.style.transform).toBe('rotate(10deg)');

    main.remove();
  });

  it('skips non-element children (text nodes, comments) without breaking iteration', async () => {
    const main = makeScrollable({
      overflow: 'auto',
      scrollTop: 50,
      clientHeight: 200,
      scrollHeight: 1000,
    });
    // Mix element and non-element children. firstElementChild iteration
    // should naturally skip non-elements; this test pins that behaviour.
    main.appendChild(document.createTextNode('lead text'));
    const child = document.createElement('div');
    main.appendChild(child);
    main.appendChild(document.createComment('a comment'));
    document.body.appendChild(main);

    let observed = '';
    vi.doMock('modern-screenshot', () => ({
      domToBlob: vi.fn().mockImplementation(async () => {
        observed = child.style.transform;
        return new Blob([new Uint8Array([1])], { type: 'image/webp' });
      }),
    }));

    const { captureScreenshot } = await import('../screenshot');
    await captureScreenshot();

    expect(observed).toBe('translate(0px, -50px)');
    expect(child.style.transform).toBe('');

    main.remove();
  });

  it('does NOT translate position:sticky direct children', async () => {
    // Sticky-header dashboards (the exact class of app this PR is
    // meant to fix) would regress without this skip: translating a
    // `top:0`-stuck header by `-scrollTop` rasterizes it off the top
    // of the captured frame entirely. The compensation pass must
    // leave sticky direct children alone.
    const main = makeScrollable({
      overflow: 'auto',
      scrollTop: 193.5,
      clientHeight: 693,
      scrollHeight: 2144,
    });
    const stickyHeader = document.createElement('header');
    stickyHeader.style.position = 'sticky';
    stickyHeader.style.top = '0px';
    const content = document.createElement('section');
    main.append(stickyHeader, content);
    document.body.appendChild(main);

    let stickyDuring = '';
    let stickyOriginDuring = '';
    let contentDuring = '';
    vi.doMock('modern-screenshot', () => ({
      domToBlob: vi.fn().mockImplementation(async () => {
        stickyDuring = stickyHeader.style.transform;
        stickyOriginDuring = stickyHeader.style.transformOrigin;
        contentDuring = content.style.transform;
        return new Blob([new Uint8Array([1])], { type: 'image/webp' });
      }),
    }));

    const { captureScreenshot } = await import('../screenshot');
    await captureScreenshot();

    // Sticky child untouched — no translate, no transform-origin override.
    expect(stickyDuring).toBe('');
    expect(stickyOriginDuring).toBe('');
    // Sibling non-sticky content child still gets compensated.
    expect(contentDuring).toBe('translate(0px, -193.5px)');
    // Post-capture: still untouched (nothing to restore).
    expect(stickyHeader.style.transform).toBe('');
    expect(content.style.transform).toBe('');

    main.remove();
  });

  it('does NOT translate position:fixed direct children', async () => {
    // A `position: fixed` child of a scrollable container is anchored
    // to the viewport, not the container. Translating it by
    // `-scrollTop` would shift the captured frame's pinned UI off
    // the top of the rasterized output.
    const main = makeScrollable({
      overflow: 'auto',
      scrollTop: 100,
      clientHeight: 200,
      scrollHeight: 1000,
    });
    const fixedBar = document.createElement('div');
    fixedBar.style.position = 'fixed';
    fixedBar.style.top = '0px';
    const content = document.createElement('section');
    main.append(fixedBar, content);
    document.body.appendChild(main);

    let fixedDuring = '';
    let contentDuring = '';
    vi.doMock('modern-screenshot', () => ({
      domToBlob: vi.fn().mockImplementation(async () => {
        fixedDuring = fixedBar.style.transform;
        contentDuring = content.style.transform;
        return new Blob([new Uint8Array([1])], { type: 'image/webp' });
      }),
    }));

    const { captureScreenshot } = await import('../screenshot');
    await captureScreenshot();

    expect(fixedDuring).toBe('');
    expect(contentDuring).toBe('translate(0px, -100px)');
    expect(fixedBar.style.transform).toBe('');

    main.remove();
  });

  it('composes nested scroll containers without double-applying the outer translate', async () => {
    // Two overflow:auto ancestors, each with non-zero scrollTop. The
    // outer's first child is the inner; the inner's first child is
    // some content. The algorithm walks descendants and translates
    // direct children of each scroller independently, so:
    //  - the inner container itself receives the OUTER's translate
    //    (because it's a direct child of the outer);
    //  - the inner's content child receives the INNER's translate.
    // The inner content child must NOT receive the outer's translate
    // composed on top — only its immediate parent's compensation.
    const outer = makeScrollable({
      overflow: 'auto',
      scrollTop: 50,
      clientHeight: 200,
      scrollHeight: 1000,
    });
    const inner = makeScrollable({
      overflow: 'auto',
      scrollTop: 80,
      clientHeight: 100,
      scrollHeight: 800,
    });
    const content = document.createElement('div');
    inner.appendChild(content);
    outer.appendChild(inner);
    document.body.appendChild(outer);

    let innerDuring = '';
    let contentDuring = '';
    vi.doMock('modern-screenshot', () => ({
      domToBlob: vi.fn().mockImplementation(async () => {
        innerDuring = inner.style.transform;
        contentDuring = content.style.transform;
        return new Blob([new Uint8Array([1])], { type: 'image/webp' });
      }),
    }));

    const { captureScreenshot } = await import('../screenshot');
    await captureScreenshot();

    // Inner is the outer's direct child → compensated for outer's
    // scrollTop (50px).
    expect(innerDuring).toBe('translate(0px, -50px)');
    // Content is the inner's direct child → compensated for inner's
    // scrollTop (80px) only. No double-application.
    expect(contentDuring).toBe('translate(0px, -80px)');
    // Both restored after capture.
    expect(inner.style.transform).toBe('');
    expect(content.style.transform).toBe('');

    outer.remove();
  });

  it('does NOT translate the capture root itself when the root is a scrollable container', async () => {
    // Documented limitation: the root is the camera frame and the
    // walk uses `querySelectorAll('*')` which returns descendants
    // only. Passing a scrollable element as `opts.element` leaves
    // its own scroll uncompensated; the root must not be mutated by
    // the compensation pass under any circumstances.
    const root = makeScrollable({
      overflow: 'auto',
      scrollTop: 120,
      clientHeight: 200,
      scrollHeight: 1000,
    });
    const child = document.createElement('div');
    root.appendChild(child);
    document.body.appendChild(root);

    let rootDuring = '';
    let childDuring = '';
    vi.doMock('modern-screenshot', () => ({
      domToBlob: vi.fn().mockImplementation(async () => {
        rootDuring = root.style.transform;
        childDuring = child.style.transform;
        return new Blob([new Uint8Array([1])], { type: 'image/webp' });
      }),
    }));

    const { captureScreenshot } = await import('../screenshot');
    await captureScreenshot({ element: root });

    // Root is never translated — it's the camera frame.
    expect(rootDuring).toBe('');
    // The child is also not translated, because the root is not in
    // the descendant walk: `root.querySelectorAll('*')` returns
    // nodes nested inside `root`, but the scrollable container we
    // are checking against is the root itself. The child stays at
    // the top of the scroll extent — this is the documented
    // foot-gun. Pin the behaviour here.
    expect(childDuring).toBe('');
    expect(root.style.transform).toBe('');

    root.remove();
  });

  it('coexists with [data-brevwick-skip]: a scrolled container with a skip child gets both passes applied and both restored', async () => {
    // A direct child of a scrollable container that ALSO carries
    // [data-brevwick-skip] must end up:
    //  - hidden by the scrub pass (visibility: hidden);
    //  - translated by the compensation pass (transform: translate(...));
    // and after the capture both must be restored to their original
    // values. Restore order is LIFO: comp first, then skip.
    const main = makeScrollable({
      overflow: 'auto',
      scrollTop: 75,
      clientHeight: 200,
      scrollHeight: 1000,
    });
    const skipChild = document.createElement('div');
    skipChild.setAttribute('data-brevwick-skip', '');
    skipChild.style.visibility = 'visible';
    skipChild.style.transform = 'rotate(5deg)';
    main.appendChild(skipChild);
    document.body.appendChild(main);

    let visibilityDuring = '';
    let transformDuring = '';
    vi.doMock('modern-screenshot', () => ({
      domToBlob: vi.fn().mockImplementation(async () => {
        visibilityDuring = skipChild.style.visibility;
        transformDuring = skipChild.style.transform;
        return new Blob([new Uint8Array([1])], { type: 'image/webp' });
      }),
    }));

    const { captureScreenshot } = await import('../screenshot');
    await captureScreenshot();

    // BOTH mutations applied during capture.
    expect(visibilityDuring).toBe('hidden');
    expect(transformDuring).toBe('translate(0px, -75px) rotate(5deg)');
    // BOTH restored after capture.
    expect(skipChild.style.visibility).toBe('visible');
    expect(skipChild.style.transform).toBe('rotate(5deg)');

    main.remove();
  });
});
