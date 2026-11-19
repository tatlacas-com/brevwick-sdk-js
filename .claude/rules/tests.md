---
paths:
  - '**/*.test.ts'
  - '**/*.test.tsx'
  - '**/*.spec.ts'
  - 'e2e/**'
---

# Tests

- Unit tests are hermetic: no network, no real credentials, no real services where a fake (msw, happy-dom) will do, and no sleeps (use fake timers).
- A test must fail without the change it covers. Assert on behaviour a host app sees, not on implementation details.
