import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, expect } from 'vitest';
import * as axeMatchers from 'vitest-axe/matchers';

// Register vitest-axe matchers once per test process so individual test
// files can call `expect(results).toHaveNoViolations()` directly. The
// corresponding type augmentation lives in `src/types/vitest-axe.d.ts`.
expect.extend(axeMatchers);

afterEach(() => {
  cleanup();
});
