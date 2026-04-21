# brevwick-sdk-js MVP Worktrees

10 issues across 10 worktrees. Each worktree is one issue; tiers define execution order and what can run in parallel.

**Key references:**

- `CLAUDE.md` (this repo) — working style, bundle budgets, redaction mandate, conventional commits, no Co-Authored-By
- [SDD § 12](https://github.com/tatlacas-com/brevwick-ops/blob/main/docs/brevwick-sdd.md#12-client-sdk-contracts) — canonical Client SDK contracts. Every PR links the SDD section it implements
- Issues: https://github.com/tatlacas-com/brevwick-sdk-js/issues

**Conventions (apply to every worktree):**

- pnpm workspace; two packages: `brevwick-sdk` (core, framework-agnostic) and `brevwick-react` (bindings)
- TypeScript strict, tsup for builds (ESM + CJS + dts), Vitest + happy-dom for tests
- `sideEffects: false` in both packages; treeshake-friendly public surface
- Dynamic imports for anything heavy (`await import('modern-screenshot')`) so it never lands in the base bundle
- Single quotes, semicolons, trailing commas (prettier); `@/` aliasing is NOT used — relative paths inside each package
- Conventional commits, subject ≤ 72 chars, **no Co-Authored-By headers**, no Claude attribution anywhere
- Never log: project key plaintext, auth headers, bearer tokens, JWT contents, email bodies, raw issue descriptions

**Hard bundle budgets — CI enforces once WT-07 lands:**

- `brevwick-sdk` core initial chunk: **≤ 2.0 kB gzip**
- `brevwick-sdk` screenshot chunk (`modern-screenshot`): **≤ 18 kB gzip**
- `brevwick-react` entry: **≤ 25 kB gzip** (excluding peer deps)

**Redaction rules (apply to every worktree that touches payloads):**

- Every string that leaves the device runs through `packages/sdk/src/redact.ts` first
- Adding a new captured field? Add a redaction golden test for it in the same PR
- Server-side sanitiser is defence-in-depth, not a substitute
- Header sanitation: always strip `Authorization`, `Cookie`, `Set-Cookie`, `X-CSRF*`; keep `Content-Type`, `X-Request-Id`
- URL redaction: strip query params matching `token|auth|key|session|sig`

**SDD section links:** § 7 ingest endpoints, § 12 client SDK contracts, § 13 widget UX.

---

## Dependency map

```
TIER 0 — Foundation (2 parallel)
  WT-01: #1  createBrevwick() factory + install/uninstall + ring buffers
  WT-08: #8  Changesets + npm beta publishing workflow        [pure CI, independent]

TIER 1 — Rings & screenshot (3 parallel, after TIER 0)
  WT-02: #2  console error ring                               [needs #1]
  WT-03: #3  network ring (fetch + XHR)                       [needs #1]
  WT-05: #5  captureScreenshot() via dynamic import           [needs #1]

TIER 2 — Submit (after TIER 1)
  WT-04: #4  submit() with auto-context + redaction + presign [needs #1, #2, #3]

TIER 3 — React bindings (after TIER 2)
  WT-06: #6  BrevwickProvider + useFeedback + FeedbackButton  [needs #1, #4, #5]

TIER 4 — Hardening (2 parallel, after TIER 3)
  WT-07: #7  size-limit budgets in CI                         [needs #1, #5, #6]
  WT-09: #9  vanilla + Next.js example apps                   [needs #4, #6]

TIER 5 — Ship criterion (after TIER 4)
  WT-10: #10 MSW + live-API integration coverage              [needs all prior]
```

Worktrees live alongside the main repo at `/home/tatlacas/repos/brevwick/brevwick-sdk-js-wt-*`.

---

## TIER 0 — Foundation

---

### Worktree 01: createBrevwick() factory + install/uninstall + ring buffers (#1)

The core that every ring, submit, and the React bindings hang off. Defines the public API surface, lifecycle, and bounded ring buffers.

**Scope:** `createBrevwick()` factory, config validation, idempotent `install()`/`uninstall()`, tiny typed event bus, ring buffer caps (console ≤ 50, network ≤ 50, routes ≤ 20), SSR/worker no-op guard, frozen public exports.

**Blocks:** WT-02, WT-03, WT-04, WT-05, WT-06, WT-07, WT-09, WT-10.

**Can run in parallel with:** WT-08.

```bash
cd /home/tatlacas/repos/brevwick/brevwick-sdk-js
git fetch origin
git worktree add ../brevwick-sdk-js-wt-core -b feat/issue-1-create-brevwick origin/main
cd ../brevwick-sdk-js-wt-core

claude --dangerously-skip-permissions "
You are establishing the core factory for brevwick-sdk: createBrevwick(), install/uninstall lifecycle, and the ring buffers every downstream ring writes into. Your task is GitHub issue #1 on tatlacas-com/brevwick-sdk-js.

THIS REPO: \$(pwd)

STEP 1 — Read project context:
- Read CLAUDE.md fully — note bundle budget (< 2 kB core), redaction mandate, no Co-Authored-By.
- Run: gh api repos/tatlacas-com/brevwick-sdk-js/issues/1 --jq '.body'
- Read package.json, pnpm-workspace.yaml, tsconfig.base.json, packages/sdk/src/index.ts, packages/sdk/src/types.ts, packages/sdk/src/rings/ (if any), packages/sdk/tsup.config.ts.
- Fetch SDD § 12 Client SDK contracts:
  gh api repos/tatlacas-com/brevwick-ops/contents/docs/brevwick-sdd.md --jq '.content' | base64 -d | sed -n '/^## 12/,/^## 13/p'

STEP 2 — Public API surface (packages/sdk/src/):
- Create core/client.ts exporting createBrevwick(config: BrevwickConfig): Brevwick.
- Extend existing types.ts — DO NOT duplicate; add: BrevwickConfig, Brevwick, FeedbackInput, SubmitResult, FeedbackAttachment, RingEntry unions (ConsoleEntry, NetworkEntry, RouteEntry).
- Freeze packages/sdk/src/index.ts exports to exactly: createBrevwick, BrevwickConfig, Brevwick, FeedbackInput, SubmitResult, FeedbackAttachment. No wildcard re-exports.

STEP 3 — Config validation:
- Hand-rolled runtime check (no Zod — keeps core < 2 kB). Validate: projectKey required and matches /^pk_(live|test)_[A-Za-z0-9]{16,}$/, endpoint is a valid https URL (default 'https://api.brevwick.com'), environment/release strings optional, rings flags default true, fingerprintOptOut boolean.
- Throw synchronous Error with code BREVWICK_INVALID_CONFIG on bad input — never silently degrade.

STEP 4 — Lifecycle:
- Singleton keyed on projectKey + endpoint — second createBrevwick with same pair returns the same instance (log a warn via original console).
- install(): idempotent. Guard: if typeof window === 'undefined' return no-op instance (SSR / workers). Attach rings in declared order (console → network → route) via a small internal register; only rings flagged in config install. Capture originals for uninstall.
- uninstall(): restores every patched global in reverse order, drains buffers, flips state to 'uninstalled'. Second uninstall is a no-op.

STEP 5 — Event bus + buffers:
- Create core/bus.ts — tiny typed emitter ({ on, emit, off }). Generic over event map; <50 LOC; no deps.
- Create core/buffer.ts — createRingBuffer<T>(cap: number) with { push, snapshot, clear }. FIFO drop at cap. snapshot() returns a frozen copy.
- Core instance owns three buffers: console (50), network (50), route (20). Downstream rings call instance._internal.push('console', entry) or similar narrow API — but keep the surface private (TS private + runtime Object.defineProperty non-enumerable).

STEP 6 — SSR / worker guard:
- install() early-returns when window is absent. Tests exercise both branches via vi.stubGlobal.

STEP 7 — Tests (packages/sdk/src/core/__tests__/):
- Vitest + happy-dom.
- createBrevwick: valid config returns instance; each invalid field throws with BREVWICK_INVALID_CONFIG.
- install/uninstall: double install is safe; uninstall restores globals (snapshot window.console, window.fetch, window.onerror before/after — assert structural equality).
- Buffer cap: push 60 entries → snapshot length 50, first entry is the 11th pushed.
- SSR guard: with window stubbed undefined, install() is a no-op and returns the instance.
- Singleton: two createBrevwick calls with the same projectKey+endpoint return the same reference; different endpoint returns a new instance.

STEP 8 — Verify:
- pnpm install && pnpm type-check && pnpm lint && pnpm test && pnpm build — all green.
- pnpm --filter brevwick-sdk build emits dist/index.js (ESM) + dist/index.cjs + dist/index.d.ts.
- Manually inspect dist/index.js — must NOT reference 'modern-screenshot' (that lands in WT-05's chunk).

STEP 9 — Commit and PR (no Co-Authored-By):
git add -A
git commit -m 'feat(core): createBrevwick factory + install/uninstall + ring buffers (#1)'
git push -u origin feat/issue-1-create-brevwick
gh pr create --title 'feat(core): createBrevwick factory + install/uninstall + ring buffers' --body \"\$(cat <<'PREOF'
Closes #1

Implements [SDD § 12](https://github.com/tatlacas-com/brevwick-ops/blob/main/docs/brevwick-sdd.md#12-client-sdk-contracts) client SDK contracts — lifecycle and ring buffer primitives.

## Summary
- createBrevwick(config) factory with hand-rolled config validation (no Zod — preserves < 2 kB budget)
- Idempotent install() / uninstall(); SSR + worker no-op guard
- Tiny typed event bus + bounded FIFO ring buffers (console 50, network 50, routes 20)
- Frozen public exports: createBrevwick, Brevwick, BrevwickConfig, FeedbackInput, SubmitResult, FeedbackAttachment

## Test plan
- [ ] pnpm type-check, lint, test, build all green
- [ ] Double install and double uninstall both safe
- [ ] Snapshot assertion: uninstall leaves window.console / window.fetch structurally identical to pre-install
- [ ] dist/index.js contains no reference to modern-screenshot
PREOF
)\"
"
```

---

### Worktree 08: Changesets + npm beta publishing workflow (#8)

Automated release pipeline. Pre-release `0.1.0-beta.x` during MVP, stabilising to `0.1.0` on tradekit cutover. Pure CI/tooling — independent of every other worktree.

**Scope:** `@changesets/cli` + linked config, PR check for missing changeset, release workflow publishing to npm under the `beta` dist-tag, provenance enabled, GitHub Releases with changelog.

**Blocks:** none.

**Can run in parallel with:** WT-01.

```bash
cd /home/tatlacas/repos/brevwick/brevwick-sdk-js
git fetch origin
git worktree add ../brevwick-sdk-js-wt-release -b chore/issue-8-changesets origin/main
cd ../brevwick-sdk-js-wt-release

claude --dangerously-skip-permissions "
You are wiring Changesets + npm beta publishing for brevwick-sdk-js. Your task is GitHub issue #8 on tatlacas-com/brevwick-sdk-js.

THIS REPO: \$(pwd)

STEP 1 — Read project context:
- Read CLAUDE.md — note versioning rules (lockstep pre-1.0, linked packages).
- Run: gh api repos/tatlacas-com/brevwick-sdk-js/issues/8 --jq '.body'
- Read .github/workflows/ (existing CI), both packages' package.json, pnpm-workspace.yaml.

STEP 2 — Install deps:
- pnpm add -DW @changesets/cli @changesets/changelog-github
- pnpm changeset init

STEP 3 — Configure .changeset/config.json:
- 'linked': [['brevwick-sdk', 'brevwick-react']] — version in lockstep until Phase 4 cutover.
- 'changelog': ['@changesets/changelog-github', { repo: 'tatlacas-com/brevwick-sdk-js' }]
- 'access': 'public', 'baseBranch': 'main'
- 'privatePackages': { version: false, tag: false }

STEP 4 — Package metadata:
- Both packages' package.json: set 'publishConfig': { 'access': 'public', 'provenance': true }.
- Ensure 'files' whitelist covers dist/ + README.md + LICENSE only.

STEP 5 — Missing-changeset check workflow (.github/workflows/changeset-check.yml):
- On pull_request to main, filter paths: packages/**.
- Uses changesets/action@v1 with publish unset; fails if any changed package has no changeset.
- Skips Draft PRs and PRs labelled 'release'.

STEP 6 — Release workflow (.github/workflows/release.yml):
- Trigger: push to main.
- Setup Node 22 + pnpm (match existing CI).
- Run pnpm install --frozen-lockfile && pnpm build.
- Use changesets/action@v1 with: publish: 'pnpm release', version: 'pnpm version-packages', createGithubReleases: true.
- Env: GITHUB_TOKEN + NPM_TOKEN. When changesets opens a 'Version Packages' PR, merging it triggers the publish path.
- Publish path uses --tag beta so 'npm add brevwick-sdk' resolves to the last stable; 'npm add brevwick-sdk@beta' is the bleeding edge.

STEP 7 — Root package.json scripts:
- 'changeset': 'changeset'
- 'version-packages': 'changeset version && pnpm install --lockfile-only'
- 'release': 'pnpm build && changeset publish --tag beta'

STEP 8 — Docs:
- README.md: add 'Releasing' section documenting the flow, NPM_TOKEN secret, and that squash-merging the Version Packages PR is what publishes.
- If NPM_TOKEN secret is not yet set, open a follow-up issue and note it in the PR body — do NOT publish dummy tokens or mock values.

STEP 9 — Verify:
- pnpm install && pnpm type-check && pnpm lint && pnpm test && pnpm build — green.
- pnpm changeset publish --dry-run succeeds (no auth required for dry-run).
- Create a throwaway .changeset/test.md with a patch bump on brevwick-sdk, run pnpm version-packages locally — both packages bump together (linked). Revert before committing.

STEP 10 — Commit and PR:
git add -A
git commit -m 'chore(release): Changesets + npm beta publishing (#8)'
git push -u origin chore/issue-8-changesets
gh pr create --title 'chore(release): Changesets + npm beta publishing' --body \"\$(cat <<'PREOF'
Closes #8

## Summary
- @changesets/cli with linked versioning for brevwick-sdk + brevwick-react
- Missing-changeset CI check on PRs touching packages/**
- Release workflow publishes to npm under the 'beta' dist-tag with provenance
- GitHub Releases auto-generated via @changesets/changelog-github

## Test plan
- [ ] pnpm changeset publish --dry-run succeeds
- [ ] Missing-changeset check fails a test PR with no changeset file
- [ ] Linked bump: a patch changeset on one package bumps both together
- [ ] NPM_TOKEN secret documented in repo settings
PREOF
)\"
"
```

---

## TIER 1 — Rings & screenshot

---

### Worktree 02: console error ring (#2)

Capture `console.error`/`warn`, `window.onerror`, and `unhandledrejection` into the console ring buffer. First of the three rings that become evidence in every issue.

**Scope:** `packages/sdk/src/rings/console.ts`, patch with preserved originals, redaction, stack trimming (top 20 frames), 500 ms dedupe window, `uninstall()` restores originals.

**Depends on:** WT-01 (factory + buffer + event bus).

**Can run in parallel with:** WT-03, WT-05.

```bash
cd /home/tatlacas/repos/brevwick/brevwick-sdk-js
git fetch origin
git worktree add ../brevwick-sdk-js-wt-ring-console -b feat/issue-2-console-ring origin/main
cd ../brevwick-sdk-js-wt-ring-console

claude --dangerously-skip-permissions "
You are implementing the console error ring for brevwick-sdk. Your task is GitHub issue #2 on tatlacas-com/brevwick-sdk-js.

THIS REPO: \$(pwd)

STEP 1 — Read project context:
- Read CLAUDE.md — redaction mandate, never-log list.
- Run: gh api repos/tatlacas-com/brevwick-sdk-js/issues/2 --jq '.body'
- Read packages/sdk/src/core/ (WT-01 output), packages/sdk/src/redact.ts, packages/sdk/src/types.ts.
- Fetch SDD § 12 Rings:
  gh api repos/tatlacas-com/brevwick-ops/contents/docs/brevwick-sdd.md --jq '.content' | base64 -d | sed -n '/^## 12/,/^## 13/p'

STEP 2 — Ring module (packages/sdk/src/rings/console.ts):
- installConsoleRing(instance): attaches and returns an uninstall function that the core calls from uninstall().
- Patch console.error + console.warn: preserve original reference; call through after pushing to buffer so the user's DevTools output is unchanged.
- Add window.addEventListener('error', handler) and 'unhandledrejection' handler — match ErrorEvent vs PromiseRejectionEvent shapes explicitly.
- Entry shape: `{ kind: 'console', level: 'error' | 'warn', message: string, stack?: string, timestamp: number, count: number }`. (Ratified post-WT-01: `timestamp` is the canonical name across every `RingEntry` variant shipped in `packages/sdk/src/types.ts`; aligning ConsoleEntry on `ts` alone would break type consistency. `count` is required — the ring always writes `count: 1` on first push and increments in place.)

STEP 3 — Redaction + trimming:
- Every string field (message, stack) runs through redact() before push.
- Stack trimmed to top 20 frames; preserve the leading 'Error:' line.
- Message coerced from any args via a small safeStringify helper (no JSON.stringify on Errors — use err.message + err.stack).

STEP 4 — Deduplication:
- Keyed on hash(message + first stack frame). If an identical key fires within 500 ms of the last push (boundary inclusive — exactly 500 ms still dedupes), increment count on the existing entry instead of pushing a new one.
- Use a tiny internal Map<string, { index, ts }> cleared on uninstall.

STEP 5 — Uninstall hygiene:
- Restore console.error / console.warn originals (capture at install time, reassign on uninstall).
- Remove both window listeners via removeEventListener with the exact handler reference.
- Second install cycle after uninstall must not double-patch (assert no original-of-original).

STEP 6 — Tests (packages/sdk/src/rings/__tests__/console.test.ts):
- Vitest + happy-dom.
- Patched console captures; originals still called (spy the original reference).
- Redaction: `console.error('Bearer eyJabc.def.ghi')` → buffer entry message must not contain the raw token. Canonical redaction marker is `Bearer [redacted]` — this is what `packages/sdk/src/core/internal/redact.ts` emits and is the governing contract for every string that leaves the device (ratified post-WT-01). The earlier `«redacted:bearer»` placeholder in this worktree was illustrative only.
- Dedupe: two identical errors inside 500 ms → one entry with count 2; at exactly 500 ms → still one entry with count 2 (boundary inclusive); strictly outside 500 ms → two entries.
- Global error event with synthetic ErrorEvent → captured with stack.
- unhandledrejection with Error reason → captured; with non-Error reason (string) → captured with safe coercion.
- Leak guard: install → uninstall → install → log → exactly one buffer entry; window.console.error identity unchanged between cycles.

STEP 7 — Verify:
- pnpm install && pnpm type-check && pnpm lint && pnpm test && pnpm build — green.
- pnpm size-limit if WT-07 has landed; otherwise note current gzipped size in the PR body.

STEP 8 — Commit and PR:
git add -A
git commit -m 'feat(rings): console error ring with redaction + dedupe (#2)'
git push -u origin feat/issue-2-console-ring
gh pr create --title 'feat(rings): console error ring with redaction + dedupe' --body \"\$(cat <<'PREOF'
Closes #2

Implements [SDD § 12 Rings → console](https://github.com/tatlacas-com/brevwick-ops/blob/main/docs/brevwick-sdd.md#12-client-sdk-contracts).

## Summary
- Patches console.error / console.warn preserving originals (DevTools still works)
- Listens for window 'error' and 'unhandledrejection'; coerces non-Error reasons safely
- Redacts every message + stack; trims stacks to 20 frames
- 500 ms dedupe window: identical message+frame increments count
- uninstall() restores every patched global; re-install after uninstall is clean

## Test plan
- [ ] Bearer/JWT/email in a logged message appears redacted in the buffer
- [ ] Dedupe verified with fake timers (within vs outside 500 ms window)
- [ ] Install → uninstall → install → log yields exactly one buffer entry
PREOF
)\"
"
```

---

### Worktree 03: network ring (#3)

Patch `fetch` and `XMLHttpRequest` to capture `status ≥ 400` or thrown responses. Feedback-loop guard skips requests to the SDK's own endpoint. Bodies capped and redacted.

**Scope:** `packages/sdk/src/rings/network.ts`, fetch + XHR patching, header sanitation, URL query redaction, body caps (req 2 kB, resp 4 kB), loop guard, uninstall restores prototype methods.

**Depends on:** WT-01.

**Can run in parallel with:** WT-02, WT-05.

```bash
cd /home/tatlacas/repos/brevwick/brevwick-sdk-js
git fetch origin
git worktree add ../brevwick-sdk-js-wt-ring-network -b feat/issue-3-network-ring origin/main
cd ../brevwick-sdk-js-wt-ring-network

claude --dangerously-skip-permissions "
You are implementing the network ring for brevwick-sdk. Your task is GitHub issue #3 on tatlacas-com/brevwick-sdk-js.

THIS REPO: \$(pwd)

STEP 1 — Read project context:
- Read CLAUDE.md — redaction, header sanitation, URL redaction rules.
- Run: gh api repos/tatlacas-com/brevwick-sdk-js/issues/3 --jq '.body'
- Read packages/sdk/src/core/, packages/sdk/src/redact.ts, packages/sdk/src/rings/console.ts (for style parity if merged).
- Fetch SDD § 12 Rings → network as above.

STEP 2 — Ring module (packages/sdk/src/rings/network.ts):
- installNetworkRing(instance) returns an uninstall function.
- Wrap window.fetch: capture only when response.status >= 400 OR fetch threw. Entry shape: { kind: 'network', method, url, status, duration_ms, ts, request_body?, response_body?, request_headers, response_headers }.
- Patch XMLHttpRequest.prototype.open + send: track method/url/startTs on open; on readyState 4 + status >= 400 (or onerror) push entry. Preserve prototype chain — use .call(this, ...) so consumer code that reads xhr.responseType etc. still works.

STEP 3 — Feedback-loop guard:
- Skip when the resolved URL starts with instance.config.endpoint. Resolve relative URLs via new URL(url, location.origin) before comparing.
- Also skip when the request carries an X-Brevwick-SDK header (set by submit in #4) — defence-in-depth.

STEP 4 — Redaction + sanitation:
- Headers: strip Authorization, Cookie, Set-Cookie, any header name matching /^x-csrf/i; keep Content-Type, X-Request-Id. Sanitise request_headers and response_headers alike.
- URLs: parse, strip query params matching /^(token|auth|key|session|sig).*/i, rebuild.
- Bodies: request cap 2048 bytes, response cap 4096 bytes. Truncation marker appended as '… [truncated N bytes]'. Run redact() on the (possibly truncated) string.
- Binary bodies (ArrayBuffer, Blob) recorded as '[binary N bytes]' — do not attempt to decode.

STEP 5 — Uninstall:
- Restore window.fetch to the captured original.
- Restore XMLHttpRequest.prototype.open + send to their captured originals (reassign the prototype properties; verify with === in tests).
- Double-uninstall is a no-op.

STEP 6 — Tests (packages/sdk/src/rings/__tests__/network.test.ts):
- Vitest + happy-dom + msw (peer only for tests, do NOT add to runtime deps).
- 404 fetch captured; 200 fetch ignored; thrown fetch (network error) captured with status 0.
- XHR 500 captured; XHR 200 ignored.
- Loop guard: fetch to instance.config.endpoint is NOT captured even on 500.
- Header sanitation: request with Authorization: Bearer xxx → stored entry has no Authorization header; Content-Type kept.
- URL redaction: fetch('/search?token=abc&q=hello') → entry URL is '/search?q=hello'.
- Body cap + redaction: POST with a 10 kB JSON body containing an email → stored request_body is ≤ 2048 bytes + truncation marker + email is redacted.
- Disabled ring: config.rings.network = false → originals never patched (assert window.fetch === capturedOriginal).
- Uninstall restores both fetch and XHR prototype methods by identity (=== original).

STEP 7 — Verify:
- pnpm install && pnpm type-check && pnpm lint && pnpm test && pnpm build — green.

STEP 8 — Commit and PR:
git add -A
git commit -m 'feat(rings): network ring (fetch + XHR, 4xx/thrown) (#3)'
git push -u origin feat/issue-3-network-ring
gh pr create --title 'feat(rings): network ring (fetch + XHR, 4xx/thrown)' --body \"\$(cat <<'PREOF'
Closes #3

Implements [SDD § 12 Rings → network](https://github.com/tatlacas-com/brevwick-ops/blob/main/docs/brevwick-sdd.md#12-client-sdk-contracts).

## Summary
- window.fetch + XMLHttpRequest.prototype wrapped; captures only status ≥ 400 or thrown
- Feedback-loop guard: requests to the SDK endpoint (or carrying X-Brevwick-SDK) are skipped
- Header sanitation, URL query redaction, body caps (req 2 kB, resp 4 kB)
- uninstall() restores both fetch and XHR prototype methods by identity

## Test plan
- [ ] Golden redaction: Authorization header stripped, email in body redacted
- [ ] Loop guard verified for URL match + header match
- [ ] Disabled ring leaves window.fetch untouched
- [ ] XHR prototype identity preserved across install/uninstall/install cycle
PREOF
)\"
"
```

---

### Worktree 05: captureScreenshot() via dynamic import (#5)

Screenshot helper that the React FAB calls. Must live in its own chunk so the base bundle stays < 2 kB.

**Scope:** `packages/sdk/src/screenshot.ts`, dynamic `await import('modern-screenshot')`, `[data-brevwick-skip]` scrubbing + restoration, graceful 1×1 fallback on failure, `modern-screenshot` as `optionalPeerDependency`.

**Depends on:** WT-01.

**Can run in parallel with:** WT-02, WT-03.

```bash
cd /home/tatlacas/repos/brevwick/brevwick-sdk-js
git fetch origin
git worktree add ../brevwick-sdk-js-wt-screenshot -b feat/issue-5-screenshot origin/main
cd ../brevwick-sdk-js-wt-screenshot

claude --dangerously-skip-permissions "
You are implementing captureScreenshot() for brevwick-sdk. Your task is GitHub issue #5 on tatlacas-com/brevwick-sdk-js.

THIS REPO: \$(pwd)

STEP 1 — Read project context:
- Read CLAUDE.md — bundle budget rules; screenshot must live in its own chunk.
- Run: gh api repos/tatlacas-com/brevwick-sdk-js/issues/5 --jq '.body'
- Read packages/sdk/src/core/, packages/sdk/src/index.ts (to wire the re-export), packages/sdk/tsup.config.ts.

STEP 2 — Module (packages/sdk/src/screenshot.ts):
- captureScreenshot(opts?: { element?: HTMLElement; quality?: number }): Promise<Blob>.
- Default element: document.documentElement. Default quality: 0.85. Default MIME: 'image/webp'.
- Dynamically import: const { domToBlob } = await import('modern-screenshot'). Never import at module top — keep it tsup-splittable.
- Before capture: query all [data-brevwick-skip] nodes, stash each node's current style.visibility, set it to 'hidden'. Run capture. Restore originals in a finally block (even on throw).
- Pass { quality, type: 'image/webp' } to domToBlob. If the library rejects or returns null/invalid, fall back to a synthetic 1×1 transparent WebP blob AND push an entry to the console ring via instance.bus.emit('console', { level: 'warn', message: 'brevwick: screenshot capture failed, using placeholder', ts: Date.now() }). captureScreenshot must NEVER throw.

STEP 3 — Peer dep declaration (packages/sdk/package.json):
- Add 'modern-screenshot' to peerDependencies.
- Also add peerDependenciesMeta: { 'modern-screenshot': { optional: true } } so consumers that don't call captureScreenshot aren't nagged.
- Do NOT add to dependencies — that would pull it into the base chunk via tsup.

STEP 4 — tsup config (packages/sdk/tsup.config.ts):
- Ensure splitting: true, format: ['esm', 'cjs'], treeshake: true, minify: true, sourcemap: true, dts: true.
- Confirm 'modern-screenshot' is external (tsup treats peerDeps as external by default — verify by inspecting dist/index.js).

STEP 5 — Index wiring (packages/sdk/src/index.ts):
- Re-export captureScreenshot lazily: export const captureScreenshot = (...args) => import('./screenshot').then(m => m.captureScreenshot(...args));
- This keeps the screenshot module out of the base chunk even if callers do 'import { captureScreenshot } from \"brevwick-sdk\"'.
- Alternative: export a { screenshot } sub-path via package.json 'exports' — pick whichever yields the smallest base chunk; document the choice in the PR body.

STEP 6 — Tests (packages/sdk/src/__tests__/screenshot.test.ts):
- Vitest + happy-dom. Mock 'modern-screenshot' via vi.mock to return a small canvas blob.
- captureScreenshot() resolves to a Blob with type starting 'image/'.
- Element visibility: pre-capture, a [data-brevwick-skip] node has visibility ''; during capture (observed via mock spy), it is 'hidden'; after capture, it is '' again.
- Failure path: mock domToBlob to reject → captureScreenshot still resolves to a Blob (1×1 transparent) AND a warn entry landed in the console ring.
- Chunk split: after pnpm --filter brevwick-sdk build, the base dist/index.js must not contain the string 'modern-screenshot' (read file, assert). The screenshot chunk (dist/screenshot-*.js or similar) must contain it.

STEP 7 — Verify:
- pnpm install && pnpm type-check && pnpm lint && pnpm test && pnpm --filter brevwick-sdk build — green.
- gzip -c packages/sdk/dist/index.js | wc -c — document the byte count in the PR (WT-07 will enforce).

STEP 8 — Commit and PR:
git add -A
git commit -m 'feat(screenshot): captureScreenshot via dynamic import (#5)'
git push -u origin feat/issue-5-screenshot
gh pr create --title 'feat(screenshot): captureScreenshot via dynamic import' --body \"\$(cat <<'PREOF'
Closes #5

Implements [SDD § 12 Screenshot](https://github.com/tatlacas-com/brevwick-ops/blob/main/docs/brevwick-sdd.md#12-client-sdk-contracts).

## Summary
- captureScreenshot() dynamically imports modern-screenshot → separate chunk
- [data-brevwick-skip] scrubbed before capture, restored after (even on throw)
- Graceful fallback: failure yields a 1×1 transparent WebP + warn in console ring; never throws
- modern-screenshot declared as optional peerDependency so consumers that don't open the widget skip the install

## Test plan
- [ ] dist/index.js does not reference 'modern-screenshot'
- [ ] [data-brevwick-skip] visibility restored after both success and failure paths
- [ ] Failure path resolves with a Blob and logs a warn entry
- [ ] Current base chunk gzip size recorded in PR body
PREOF
)\"
"
```

---

## TIER 2 — Submit

---

### Worktree 04: submit() with auto-context + redaction + presign (#4)

Orchestrates the full ingest flow: presign → PUT attachments → `POST /v1/ingest/issues`. Auto-attaches ring snapshots + device context.

**Scope:** `packages/sdk/src/submit.ts`, payload composition, per-field redaction, presign loop, retry on network error, 30 s budget, never throws.

**Depends on:** WT-01, WT-02, WT-03 (ring snapshots flow through the payload).

**Can run in parallel with:** nothing — blocks WT-06 and WT-09.

```bash
cd /home/tatlacas/repos/brevwick/brevwick-sdk-js
git fetch origin
git worktree add ../brevwick-sdk-js-wt-submit -b feat/issue-4-submit origin/main
cd ../brevwick-sdk-js-wt-submit

claude --dangerously-skip-permissions "
You are implementing submit() for brevwick-sdk. Your task is GitHub issue #4 on tatlacas-com/brevwick-sdk-js.

THIS REPO: \$(pwd)

STEP 1 — Read project context:
- Read CLAUDE.md — redaction is mandatory, every new field needs a redaction test.
- Run: gh api repos/tatlacas-com/brevwick-sdk-js/issues/4 --jq '.body'
- Read packages/sdk/src/core/, rings/console.ts, rings/network.ts, redact.ts, types.ts.
- Fetch SDD § 7 ingest + § 12 submit contract:
  gh api repos/tatlacas-com/brevwick-ops/contents/docs/brevwick-sdd.md --jq '.content' | base64 -d | sed -n '/^## 7/,/^## 8/p'
  gh api repos/tatlacas-com/brevwick-ops/contents/docs/brevwick-sdd.md --jq '.content' | base64 -d | sed -n '/^## 12/,/^## 13/p'

STEP 2 — Module (packages/sdk/src/submit.ts):
- submit(input: FeedbackInput): Promise<SubmitResult>.
- Instance-bound: exposed as instance.submit on the Brevwick returned from createBrevwick.
- Composes payload:
  - input.title / description / expected / actual (redacted)
  - rings: { console: consoleBuffer.snapshot(), network: networkBuffer.snapshot(), route: routeBuffer.snapshot() }
  - context: { user_agent: navigator.userAgent, locale: navigator.language, viewport: { w: innerWidth, h: innerHeight }, route_path: location.pathname, release: config.release, environment: config.environment, sdk: { name: 'brevwick-sdk', version: __BREVWICK_VERSION__, platform: 'web' } }
  - user: config.user ? redactUser(config.user) : undefined
  - attachments: resolved attachment descriptors (see step 3).

STEP 3 — Presign loop:
- For each attachment in input.attachments (Blob or File):
  1. POST {endpoint}/v1/ingest/presign with { mime, size_bytes } + X-Brevwick-Project-Key header + X-Brevwick-SDK: 'brevwick-sdk/<version>' → { url, attachment_id, object_key, fields? }.
  2. PUT to url with body = blob, Content-Type = blob.type. Respect returned fields for S3-style form POST if presign shape demands it.
  3. Collect { attachment_id, object_key, mime: blob.type, size_bytes: blob.size }.
- On any presign or PUT failure: abort the loop, return { ok: false, error: { code: 'ATTACHMENT_UPLOAD_FAILED', message } }.

STEP 4 — Final ingest call:
- POST {endpoint}/v1/ingest/issues with JSON body. Same X-Brevwick-* headers.
- Retry on network error (fetch throws) OR status === 0: up to 2 retries with 250 ms / 1000 ms backoff. DO NOT retry on 4xx. DO retry on 5xx once (third attempt total).
- Total wall-clock budget 30 s via AbortController + setTimeout.

STEP 5 — Redaction:
- input.title/description/expected/actual all run through redact().
- User object redacted: email → masked shape a***@d***.com; id kept verbatim; display_name redacted.
- Rings snapshots go through already-redacted data from the rings themselves — do NOT double-redact (rings are authoritative), but DO re-run redact() defensively on free-form strings added in this step (title, description, etc.).
- Add a redaction golden fixture covering: email, Bearer token, JWT triplet, South African ID number, long base64 blob. The fixture is the canonical payload both WT-04 and WT-10 assert against.

STEP 6 — Error shape:
- Never throw. Always resolve with { ok: true, issue_id: string } | { ok: false, error: { code: string, message: string } }.
- Error codes: ATTACHMENT_UPLOAD_FAILED, INGEST_REJECTED (4xx with body), INGEST_RETRY_EXHAUSTED (repeated 5xx / network), INGEST_TIMEOUT (30 s), INGEST_INVALID_RESPONSE (non-JSON 200).

STEP 7 — Tests (packages/sdk/src/__tests__/submit.test.ts):
- Vitest + msw.
- Happy path: one attachment → presign → PUT → issues POST → { ok: true, issue_id: 'rep_...' }.
- Presign 500 → { ok: false, error.code: 'ATTACHMENT_UPLOAD_FAILED' }; no issues POST fired.
- PUT 403 → same.
- Ingest 422 → { ok: false, error.code: 'INGEST_REJECTED' }; not retried.
- Ingest 503 then 200 → { ok: true } after exactly one retry (use msw handler counter).
- Ingest timeout (msw delay > 30 s via vi.useFakeTimers) → { ok: false, error.code: 'INGEST_TIMEOUT' }.
- Redaction: input.description contains 'Bearer eyJ…' and 'user@example.com' → the msw-received body has '«redacted:bearer»' and '«redacted:email»' and does NOT contain the raw strings.
- X-Brevwick-SDK header present on every outgoing request (used by network ring for loop guard).

STEP 8 — Verify:
- pnpm install && pnpm type-check && pnpm lint && pnpm test && pnpm build — green.
- Bundle sanity: packages/sdk/dist/index.js still under 2 kB gzip. If over, pull submit.ts into its own export path (exports['./submit']) rather than inlining.

STEP 9 — Commit and PR:
git add -A
git commit -m 'feat(submit): submit() with auto-context + redaction + presign (#4)'
git push -u origin feat/issue-4-submit
gh pr create --title 'feat(submit): submit() with auto-context + redaction + presign' --body \"\$(cat <<'PREOF'
Closes #4

Implements [SDD § 7 ingest](https://github.com/tatlacas-com/brevwick-ops/blob/main/docs/brevwick-sdd.md#7-ingest-endpoints) and [§ 12 submit contract](https://github.com/tatlacas-com/brevwick-ops/blob/main/docs/brevwick-sdd.md#12-client-sdk-contracts).

## Summary
- submit() orchestrates presign → PUT → POST /v1/ingest/issues
- Auto-attaches ring snapshots + device/context; every free-form field redacted
- Up to 2 retries on network error or 5xx; never retries 4xx; 30 s total budget
- Never throws — always resolves to tagged SubmitResult

## Test plan
- [ ] Happy path + each failure branch covered by msw tests
- [ ] Redaction golden fixture asserts bearer / JWT / email / SA-ID / base64 all masked in the received body
- [ ] X-Brevwick-SDK header on every request (network ring loop guard)
- [ ] Bundle size delta recorded in PR body
PREOF
)\"
"
```

---

## TIER 3 — React bindings

---

### Worktree 06: BrevwickProvider + useFeedback + FeedbackButton (#6)

The `brevwick-react` package: provider, hook, and a drop-in FAB with a Radix Dialog form. SSR-safe, themed via `prefers-color-scheme`, ships under 25 kB gzip.

**Scope:** `provider.tsx`, `use-feedback.ts`, `feedback-button.tsx` (Radix Dialog + CSS modules with CSS vars), SSR guard, strict peer deps (`react >= 18`).

**Depends on:** WT-01, WT-04, WT-05.

**Can run in parallel with:** nothing — blocks WT-07, WT-09.

```bash
cd /home/tatlacas/repos/brevwick/brevwick-sdk-js
git fetch origin
git worktree add ../brevwick-sdk-js-wt-react -b feat/issue-6-react-bindings origin/main
cd ../brevwick-sdk-js-wt-react

claude --dangerously-skip-permissions "
You are building the brevwick-react package: provider + hook + drop-in FAB. Your task is GitHub issue #6 on tatlacas-com/brevwick-sdk-js.

THIS REPO: \$(pwd)

STEP 1 — Read project context:
- Read CLAUDE.md — bundle budget for brevwick-react is 25 kB gzip; React FAB uses Radix Dialog primitive, no full shadcn.
- Run: gh api repos/tatlacas-com/brevwick-sdk-js/issues/6 --jq '.body'
- Read packages/react/src/ (existing), packages/react/package.json, packages/sdk/src/index.ts (confirm createBrevwick + submit + captureScreenshot exports match WT-01/04/05).
- Fetch SDD § 12 React bindings + § 13 widget UX:
  gh api repos/tatlacas-com/brevwick-ops/contents/docs/brevwick-sdd.md --jq '.content' | base64 -d | sed -n '/^## 12/,/^## 13/p'
  gh api repos/tatlacas-com/brevwick-ops/contents/docs/brevwick-sdd.md --jq '.content' | base64 -d | sed -n '/^## 13/,/^## 14/p'

STEP 2 — Deps:
- pnpm --filter brevwick-react add @radix-ui/react-dialog
- Peer deps (packages/react/package.json): react >= 18, react-dom >= 18, brevwick-sdk workspace:*.
- peerDependenciesMeta: none are optional.
- Do NOT pull in any other UI lib (shadcn, framer-motion, etc.) — every extra dep eats the 25 kB budget.

STEP 3 — Provider (packages/react/src/provider.tsx):
- 'use client' directive.
- <BrevwickProvider config>: calls createBrevwick(config) in a useMemo; useEffect installs on mount, uninstalls on unmount.
- SSR safety: createBrevwick is SSR-safe (WT-01); install() internally no-ops on server. No DOM access in render.
- Context value: { brevwick: Brevwick | null }. Exposes useBrevwickInternal() for downstream (internal, not exported from index.ts).

STEP 4 — Hook (packages/react/src/use-feedback.ts):
- useFeedback() returns { submit, captureScreenshot, status, reset }.
- status: 'idle' | 'submitting' | 'success' | 'error'. Stored in a useState.
- submit: wraps instance.submit, manages status transitions, returns the SubmitResult directly.
- captureScreenshot: thin passthrough to the SDK's lazy export — first call triggers the dynamic chunk fetch.
- reset: sets status back to 'idle'.
- Throws if called outside a BrevwickProvider (clear error message).

STEP 5 — FeedbackButton (packages/react/src/feedback-button.tsx):
- 'use client'.
- Props: { position?: 'bottom-right' | 'bottom-left'; disabled?: boolean; hidden?: boolean; className?: string; onSubmit?: (result: SubmitResult) => void }.
- Renders a fixed-position button with data-brevwick-skip on the root so it never appears in its own screenshots.
- Click → open Radix Dialog. Form fields: title (required), description, expected, actual, 'Attach screenshot' button (calls captureScreenshot, shows thumbnail + size), 'Attach file' <input type=file multiple>.
- Submit → useFeedback().submit(input). While status='submitting' disable submit button + show spinner (CSS only, no icon lib — <svg> inline).
- On success: show toast-like confirmation inline inside the dialog ('Thanks — issue sent'), wait 1.5 s, close. Call props.onSubmit(result).
- On error: inline error text with error.message. Do NOT close.
- Theme: CSS module with :root variables (—brw-bg, —brw-fg, —brw-accent) and a @media (prefers-color-scheme: dark) override. Consumer can override via className or by setting the CSS vars on an ancestor.

STEP 6 — Exports (packages/react/src/index.ts):
- export { BrevwickProvider } from './provider'
- export { useFeedback } from './use-feedback'
- export { FeedbackButton } from './feedback-button'
- export type { BrevwickConfig, SubmitResult, FeedbackInput, FeedbackAttachment } from 'brevwick-sdk'

STEP 7 — Tests (packages/react/src/__tests__/):
- Vitest + @testing-library/react + happy-dom.
- provider.test.tsx: mount, unmount — createBrevwick + install called once, uninstall called on unmount.
- use-feedback.test.tsx: submit transitions idle → submitting → success with a mocked sdk instance; reset returns to idle.
- feedback-button.test.tsx:
  - Opens dialog on click; title required (form-level error surfaced).
  - Attach screenshot click calls sdk.captureScreenshot; thumbnail rendered.
  - Submit with stubbed submit resolving { ok: true, issue_id }: onSubmit invoked with the result; dialog closes after 1.5 s (fake timers).
  - Submit with stubbed { ok: false }: inline error shown; dialog stays open.
  - data-brevwick-skip attribute present on root button and dialog content.

STEP 8 — Next.js compatibility smoke:
- Create examples/next-smoke/ (NOT the full example site — that's WT-09). Minimal Next.js 14 and Next.js 16 app that imports <BrevwickProvider> + <FeedbackButton>. Verify both next build succeed under this worktree's package lockfile. Remove the smoke folder before committing (it was a verification step only).

STEP 9 — Verify:
- pnpm install && pnpm type-check && pnpm lint && pnpm test && pnpm --filter brevwick-react build — green.
- gzip -c packages/react/dist/index.js | wc -c — record in PR body. Must be < 25 kB.

STEP 10 — Commit and PR:
git add -A
git commit -m 'feat(react): BrevwickProvider + useFeedback + FeedbackButton (#6)'
git push -u origin feat/issue-6-react-bindings
gh pr create --title 'feat(react): BrevwickProvider + useFeedback + FeedbackButton' --body \"\$(cat <<'PREOF'
Closes #6

Implements [SDD § 12 React bindings](https://github.com/tatlacas-com/brevwick-ops/blob/main/docs/brevwick-sdd.md#12-client-sdk-contracts) and [§ 13 widget UX](https://github.com/tatlacas-com/brevwick-ops/blob/main/docs/brevwick-sdd.md#13-widget-ux).

## Summary
- <BrevwickProvider> SSR-safe; installs on mount, uninstalls on unmount
- useFeedback() hook with idle/submitting/success/error state machine
- <FeedbackButton> drop-in FAB with Radix Dialog form; light + dark via prefers-color-scheme
- data-brevwick-skip applied to the FAB + dialog so they never appear in their own screenshots
- React 18 + 19 peer compatibility verified via smoke build against Next.js 14 and 16

## Test plan
- [ ] pnpm typecheck, lint, test, build green
- [ ] brevwick-react gzip < 25 kB (recorded in PR body)
- [ ] Smoke build against Next.js 14 and Next.js 16 both succeed
- [ ] @testing-library asserts open → fill → submit → success → close flow
PREOF
)\"
"
```

---

## TIER 4 — Hardening

---

### Worktree 07: size-limit budgets in CI (#7)

Enforce bundle budgets so we don't silently bloat the consumer's app. This worktree is the one that turns the budgets in CLAUDE.md from aspirations into CI gates.

**Scope:** `size-limit` + `@size-limit/preset-small-lib` at workspace root, `.size-limit.json` per package, tsup tuning, `sideEffects: false`, CI check + PR comment.

**Depends on:** WT-01, WT-05, WT-06 (all three build outputs must exist so the budgets are measurable).

**Can run in parallel with:** WT-09.

```bash
cd /home/tatlacas/repos/brevwick/brevwick-sdk-js
git fetch origin
git worktree add ../brevwick-sdk-js-wt-size-limit -b chore/issue-7-size-limit origin/main
cd ../brevwick-sdk-js-wt-size-limit

claude --dangerously-skip-permissions "
You are wiring size-limit budgets into CI for brevwick-sdk-js. Your task is GitHub issue #7 on tatlacas-com/brevwick-sdk-js.

THIS REPO: \$(pwd)

STEP 1 — Read project context:
- Read CLAUDE.md — hard budgets: core ≤ 2 kB, screenshot chunk ≤ 18 kB, react ≤ 25 kB.
- Run: gh api repos/tatlacas-com/brevwick-sdk-js/issues/7 --jq '.body'
- Read packages/sdk/tsup.config.ts, packages/react/tsup.config.ts, .github/workflows/ (the existing check workflow).

STEP 2 — Install size-limit:
- pnpm add -DW size-limit @size-limit/preset-small-lib @size-limit/file

STEP 3 — Per-package .size-limit.json:
- packages/sdk/.size-limit.json:
  [
    { 'name': 'core (gzip)', 'path': 'dist/index.js', 'limit': '2 kB', 'brotli': false, 'gzip': true, 'ignore': ['modern-screenshot'] },
    { 'name': 'screenshot chunk (gzip)', 'path': 'dist/screenshot*.js', 'limit': '18 kB', 'gzip': true }
  ]
- packages/react/.size-limit.json:
  [
    { 'name': 'react entry (gzip)', 'path': 'dist/index.js', 'limit': '25 kB', 'gzip': true, 'ignore': ['react', 'react-dom', 'brevwick-sdk'] }
  ]

STEP 4 — tsup tuning (packages/sdk/tsup.config.ts and packages/react/tsup.config.ts):
- minify: true, treeshake: true, splitting: true, format: ['esm', 'cjs'], sourcemap: true, dts: true.
- external: consumers' peer deps (react, react-dom) for the react package.

STEP 5 — package.json hygiene:
- Both packages: 'sideEffects': false.
- Both packages: verify 'exports' field fans out cleanly (main/module/types trio, plus ./screenshot for the sdk if WT-05 took the sub-path approach).

STEP 6 — Root scripts:
- 'size': 'pnpm -r --filter './packages/*' exec size-limit'
- 'size:why': 'pnpm -r --filter './packages/*' exec size-limit --why'

STEP 7 — CI workflow (.github/workflows/size.yml or add a step to the existing check workflow):
- Trigger: pull_request + push to main.
- Setup Node + pnpm; pnpm install --frozen-lockfile; pnpm build; pnpm size.
- Use andresz1/size-limit-action@v1 for the PR comment (or an equivalent action). Budget delta posted as a sticky comment.
- If CI currently lists 'check' as a required status, add 'size-limit' to the required checks list in a follow-up PR or via repo settings — note in PR body if it needs manual toggling.

STEP 8 — Regression proof:
- In this same PR, open a draft companion PR (or just a branch locally) that adds a 1 kB dummy import to packages/sdk/src/index.ts. Run pnpm size — confirm it fails. Revert the dummy import before merging this PR. Screenshot the failure into the PR body.

STEP 9 — Verify:
- pnpm install && pnpm type-check && pnpm lint && pnpm test && pnpm build && pnpm size — all green.

STEP 10 — Commit and PR:
git add -A
git commit -m 'chore(bundle): size-limit budgets in CI (#7)'
git push -u origin chore/issue-7-size-limit
gh pr create --title 'chore(bundle): size-limit budgets in CI' --body \"\$(cat <<'PREOF'
Closes #7

Implements [SDD § 12 Budgets](https://github.com/tatlacas-com/brevwick-ops/blob/main/docs/brevwick-sdd.md#12-client-sdk-contracts).

## Summary
- size-limit enforces: core ≤ 2 kB, screenshot chunk ≤ 18 kB, react ≤ 25 kB (all gzip)
- tsup minify + treeshake + splitting confirmed; both packages marked sideEffects: false
- CI step fails PR on budget overrun; sticky PR comment shows delta
- Regression proof: dummy +1 kB import fails the check (screenshot in PR body)

## Test plan
- [ ] Fresh build: all three budgets green (current bytes in PR comment)
- [ ] Intentional +1 kB import fails CI (screenshot)
- [ ] 'sideEffects: false' on both packages
PREOF
)\"
"
```

---

### Worktree 09: vanilla + Next.js example apps (#9)

Runnable example apps so integrators can copy-paste and see the widget working in < 2 minutes. Excluded from published packages.

**Scope:** `examples/vanilla/` (Vite + plain HTML), `examples/next/` (Next.js 16 + React bindings), workspace deps, root `dev:examples` script, `files` whitelist guards.

**Depends on:** WT-04 (submit), WT-06 (React bindings).

**Can run in parallel with:** WT-07.

```bash
cd /home/tatlacas/repos/brevwick/brevwick-sdk-js
git fetch origin
git worktree add ../brevwick-sdk-js-wt-examples -b docs/issue-9-examples origin/main
cd ../brevwick-sdk-js-wt-examples

claude --dangerously-skip-permissions "
You are building the vanilla + Next.js example apps for brevwick-sdk-js. Your task is GitHub issue #9 on tatlacas-com/brevwick-sdk-js.

THIS REPO: \$(pwd)

STEP 1 — Read project context:
- Read CLAUDE.md — examples must not ship in published packages.
- Run: gh api repos/tatlacas-com/brevwick-sdk-js/issues/9 --jq '.body'
- Read packages/sdk/src/index.ts, packages/react/src/index.ts, pnpm-workspace.yaml.
- Read brevwick-api docker-compose.dev.yml path (../brevwick-api/docker-compose.dev.yml) so the examples connect to a local API.

STEP 2 — pnpm-workspace.yaml:
- Add 'examples/*' to the packages glob if not already present.

STEP 3 — examples/vanilla/:
- Vite + TypeScript template (pnpm create vite -- --template vanilla-ts).
- package.json: name 'brevwick-example-vanilla', private: true, dependency brevwick-sdk: 'workspace:*'.
- index.html with a 'Send feedback' button; src/main.ts wires createBrevwick({ projectKey: import.meta.env.VITE_BREVWICK_KEY, endpoint: import.meta.env.VITE_API_BASE }).install(), then on click calls instance.submit({ title: 'Hello from vanilla example', description: 'Test issue' }).
- Result rendered in the page: 'Issue sent: <issue_id>' or error message.
- .env.example with VITE_BREVWICK_KEY=pk_test_… and VITE_API_BASE=http://localhost:8080.
- README.md with a 'Works locally' checklist: 1) bring up brevwick-api (docker-compose -f ../../brevwick-api/docker-compose.dev.yml up -d), 2) seed project key via bwctl, 3) pnpm dev, 4) click button, 5) confirm issue in brevwick-web inbox.

STEP 4 — examples/next/:
- Next.js 16 app (pnpm create next-app --typescript --app --no-tailwind --import-alias '@/*').
- Dependency brevwick-react: 'workspace:*'.
- src/app/layout.tsx wraps children in <BrevwickProvider config={{ projectKey: process.env.NEXT_PUBLIC_BREVWICK_KEY!, endpoint: process.env.NEXT_PUBLIC_API_BASE }}>.
- src/app/page.tsx renders a landing card + <FeedbackButton position='bottom-right' />.
- .env.example with NEXT_PUBLIC_BREVWICK_KEY + NEXT_PUBLIC_API_BASE.
- README.md mirrors the vanilla checklist.

STEP 5 — Root scripts (package.json):
- 'dev:examples': 'pnpm --parallel --filter \"./examples/*\" dev'
- 'build:examples': 'pnpm --filter \"./examples/*\" build'

STEP 6 — Publish-safety:
- Both packages' package.json 'files' whitelist already covers dist/README/LICENSE (from WT-08). Verify neither examples/* directory is picked up by npm pack — run 'npm pack --dry-run' inside each package and confirm no examples/ in the listing.
- Add 'examples' to .npmignore at repo root as belt-and-braces.

STEP 7 — Tests:
- Examples are end-to-end assets — no Vitest. Instead add a CI job (.github/workflows/examples.yml): pnpm install, pnpm build:examples. Purely a build smoke.

STEP 8 — Verify:
- pnpm install && pnpm build:examples — both examples build.
- Manual: bring up brevwick-api locally, run pnpm dev:examples, click the button in each, confirm a issue lands in brevwick-web /app/inbox. Paste the resulting issue_ids into the PR body.

STEP 9 — Commit and PR:
git add -A
git commit -m 'docs(examples): vanilla + Next.js example apps (#9)'
git push -u origin docs/issue-9-examples
gh pr create --title 'docs(examples): vanilla + Next.js example apps' --body \"\$(cat <<'PREOF'
Closes #9

## Summary
- examples/vanilla — plain HTML + Vite; imports brevwick-sdk via workspace:*
- examples/next — Next.js 16 + <BrevwickProvider> + <FeedbackButton>; workspace:* brevwick-react
- Root scripts dev:examples and build:examples
- CI smoke: both examples build
- Both excluded from published tarballs (npm pack --dry-run confirmed)

## Test plan
- [ ] pnpm build:examples green
- [ ] Manual: each example submits a real issue to a local brevwick-api (issue_ids attached in PR body)
- [ ] npm pack --dry-run shows no examples/ in either package
PREOF
)\"
"
```

---

## TIER 5 — Ship criterion

---

### Worktree 10: MSW + live-API integration coverage (#10)

Ship criterion. Integration-level Vitest suites covering the full SDK flow end-to-end against a mocked API, plus an optional smoke run against a real `brevwick-api`.

**Scope:** MSW integration suites for both packages, redaction coverage matrix, lazy-chunk assertion, golden fixtures, optional `sdk-e2e-live` CI job spinning up `brevwick-api`.

**Depends on:** all prior worktrees (WT-01 … WT-09).

```bash
cd /home/tatlacas/repos/brevwick/brevwick-sdk-js
git fetch origin
git worktree add ../brevwick-sdk-js-wt-integration -b test/issue-10-integration origin/main
cd ../brevwick-sdk-js-wt-integration

claude --dangerously-skip-permissions "
You are wiring the MSW + live-API integration coverage for brevwick-sdk-js. Your task is GitHub issue #10 on tatlacas-com/brevwick-sdk-js.

THIS REPO: \$(pwd)

STEP 1 — Read project context:
- Read CLAUDE.md — redaction is mandatory, coverage target ≥ 85% lines sdk / ≥ 75% react.
- Run: gh api repos/tatlacas-com/brevwick-sdk-js/issues/10 --jq '.body'
- Read everything shipped by WT-01..WT-09 to know actual surface and selectors.
- Read brevwick-api docker-compose.dev.yml (../brevwick-api/docker-compose.dev.yml) and its seed script.

STEP 2 — Install deps:
- pnpm --filter brevwick-sdk add -D msw
- pnpm --filter brevwick-react add -D msw @testing-library/react @testing-library/user-event

STEP 3 — Fixtures (packages/sdk/src/__tests__/__fixtures__/):
- composed-payload.json — canonical redacted payload shape the integration tests diff against.
- redaction-matrix.json — input strings × expected redacted outputs covering: Authorization header, Bearer token, JWT triplet, email, South African ID number, long base64 blob, phone numbers.

STEP 4 — SDK integration suite (packages/sdk/src/__tests__/integration/):
- full-flow.test.ts: createBrevwick({ projectKey, endpoint }).install() → console.error('Bearer …') → fetch /api/fail → 500 → instance.submit({ title, description }) → assert msw-received POST /v1/ingest/issues body deep-equals composed-payload.json (after stripping volatile fields: ts, issue_id, user_agent version).
- redaction-matrix.test.ts: iterate the matrix, submit each input, assert msw-received body contains the expected redacted output AND does NOT contain the raw input.
- lazy-screenshot.test.ts: import { captureScreenshot } from 'brevwick-sdk' then inspect which chunks Vite/Vitest fetched — assert modern-screenshot loaded only after captureScreenshot() was invoked. Use vi.dynamicImportSettled() or an instrumented import map.

STEP 5 — React integration suite (packages/react/src/__tests__/integration/):
- provider-fab-submit.test.tsx: render <BrevwickProvider> + <FeedbackButton>, user-event opens dialog, types title + description, clicks submit, asserts the msw-received body matches the React-specific golden fixture (shape identical to sdk but with sdk.platform='web' and a react-bindings-version field).

STEP 6 — Live-API smoke (optional CI job .github/workflows/sdk-e2e-live.yml):
- Trigger: push to main (optional, allowed to fail on main).
- services: postgres + redis + minio inline; checkout tatlacas-com/brevwick-api via actions/checkout with path: brevwick-api.
- Bring up brevwick-api via its docker-compose.dev.yml; run its migrations + seed a test project key.
- cd examples/vanilla; pnpm build; node dist/server.js to submit one issue (or curl the built bundle).
- Query the admin API with the seeded ServerKey: GET /admin/issues?project_id=… — assert exactly one issue exists with the expected title.

STEP 7 — Coverage config (vitest.config.ts per package):
- coverage.provider: 'v8', reporter: ['text', 'lcov', 'html'], thresholds.lines: sdk=85, react=75, branches: 75.
- CI 'check' workflow runs pnpm test --coverage and uploads to codecov (codecov/patch + codecov/project are the required checks per CLAUDE.md).

STEP 8 — Speed budget:
- pnpm test should complete in < 15 s on CI. If the integration suite pushes past 10 s locally, split into test:integration (still gated) but keep total wall-clock under 15 s. Record final run time in PR body.

STEP 9 — Verify:
- pnpm install && pnpm type-check && pnpm lint && pnpm test --coverage && pnpm build — green.
- Coverage ≥ 85 lines (sdk) and ≥ 75 lines (react); paste the codecov issue summary into the PR body.
- Live-API smoke: run it locally once end-to-end; PR body lists the issue_id it produced.

STEP 10 — Commit and PR:
git add -A
git commit -m 'test(integration): MSW + live-API e2e coverage (#10)'
git push -u origin test/issue-10-integration
gh pr create --title 'test(integration): MSW + live-API e2e coverage' --body \"\$(cat <<'PREOF'
Closes #10

Implements [SDD § 12](https://github.com/tatlacas-com/brevwick-ops/blob/main/docs/brevwick-sdd.md#12-client-sdk-contracts) ship criterion.

## Summary
- MSW integration suites cover install → ring capture → submit → payload shape for both packages
- Redaction matrix: Authorization, Bearer, JWT, email, SA-ID, base64, phone — each asserted present-redacted and absent-raw
- Lazy-load assertion: modern-screenshot chunk only fetched after captureScreenshot() invoked
- Golden payload fixtures under __fixtures__/
- Optional sdk-e2e-live CI job spinning up brevwick-api via docker-compose — asserts a real issue lands in the admin API

## Test plan
- [ ] pnpm test --coverage green; lines ≥ 85% (sdk), ≥ 75% (react)
- [ ] Total test wall-clock under 15 s on CI
- [ ] Live-API smoke produces a real issue_id (paste in PR body)
- [ ] codecov/patch + codecov/project both green
PREOF
)\"
"
```

---

## Parallel execution cheat sheet

At any moment, the following worktree sets can be running concurrently:

- **At T+0** (right after issues land): WT-01, WT-08
- **After WT-01 merges**: WT-02, WT-03, WT-05 (three in parallel)
- **After WT-02 + WT-03 merge**: WT-04
- **After WT-04 + WT-05 merge**: WT-06
- **After WT-06 merges**: WT-07, WT-09 (two in parallel)
- **After WT-07 + WT-09 merge**: WT-10

WT-08 is fully independent and can be taken up at any point — its only constraint is that it lands before the first intentional publish.
