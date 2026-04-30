// Order matters: zone.js must be imported before any Angular runtime so
// `NgZone` patches DOM tasks before the testing harness latches on. The
// `@angular/compiler` import installs the JIT pathway TestBed relies on
// to compile the standalone component templates we don't precompile via
// ng-packagr in the test pass.
import 'zone.js';
import 'zone.js/testing';
import '@angular/compiler';

import { TestBed } from '@angular/core/testing';
import {
  BrowserDynamicTestingModule,
  platformBrowserDynamicTesting,
} from '@angular/platform-browser-dynamic/testing';
import { afterEach } from 'vitest';

TestBed.initTestEnvironment(
  BrowserDynamicTestingModule,
  platformBrowserDynamicTesting(),
  { teardown: { destroyAfterEach: true } },
);

// Angular's TestBed registers its destroy hook via Jest's global afterEach by
// default. Vitest's hook surface is per-file, not via Jest globals — so we
// register explicitly here so each `it()` resets the module before the next
// `configureTestingModule` call. Without this, every test after the first
// one in a file fails with "Cannot configure the test module when the test
// module has already been instantiated".
afterEach(() => {
  TestBed.resetTestingModule();
});
