import { vi } from 'vitest';
import { createRequire } from 'node:module';

// Vite's `resolve.alias` swaps `react-native` for the local stub when the
// import is rewritten by Vite's transformer. But `@testing-library/react-
// native@13`'s published CJS bundle keeps a literal `require('react-
// native')` that Node's native loader resolves directly — bypassing the
// alias and crashing on real `react-native`'s Flow-annotated source with
// `SyntaxError: Unexpected token 'typeof'`.
//
// Patch Node's CJS loader so any require for the bare `react-native`
// specifier returns the stub. Targeted to the exact specifier so other
// `react-native-*` packages (e.g. `react-native-view-shot`) still resolve
// normally.
//
// This sits in `setupFiles`, which Vitest runs before the test file's
// imports execute, ensuring the patch is in place before
// `@testing-library/react-native` is loaded.
const require = createRequire(import.meta.url);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const Module: any = require('node:module');
const reactNativeStub = require('./__mocks__/react-native.ts');
const originalResolve = Module._resolveFilename;
Module._resolveFilename = function patchedResolve(
  this: unknown,
  request: string,
  parent: unknown,
  isMain: boolean,
  options: unknown,
): string {
  if (request === 'react-native') {
    return '__brevwick_react_native_stub__';
  }
  return originalResolve.call(this, request, parent, isMain, options);
};
const originalLoad = Module._load;
Module._load = function patchedLoad(
  this: unknown,
  request: string,
  parent: unknown,
  isMain: boolean,
): unknown {
  if (
    request === 'react-native' ||
    request === '__brevwick_react_native_stub__'
  ) {
    return reactNativeStub;
  }
  return originalLoad.call(this, request, parent, isMain);
};

// Belt-and-braces: also register a vi.mock for code paths that go through
// vite-node's module loader (e.g. our own `src/` files imported via the
// alias). The factory mirrors `__mocks__/react-native.ts`.
vi.mock('react-native', () => reactNativeStub);

// `react-test-renderer@19` logs a deprecation warning on every render
// (React Team plans to remove it in a future major). The hook + provider
// tests render dozens of trees per file, drowning the test output. Silence
// only the deprecation banner so genuine `console.error` calls (e.g. an
// unhandled async setState after unmount) still surface.
const originalConsoleError = console.error;
console.error = function patchedConsoleError(
  ...args: readonly unknown[]
): void {
  if (
    typeof args[0] === 'string' &&
    args[0].includes('react-test-renderer is deprecated')
  ) {
    return;
  }
  originalConsoleError.apply(console, args as unknown[]);
};
