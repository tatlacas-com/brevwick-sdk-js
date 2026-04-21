# brevwick-sdk-js Phase 4 Worktrees

3 code worktrees covering 3 open issues, plus 1 admin action (no worktree). This file closes out the JS/React SDK side of Phase 4 — bundle budgets enforced, integration test coverage, and the region-capture screenshot UX polish. The NPM_TOKEN action (#15) is a human step on npmjs.com, not a code PR.

**Key references:**

- `CLAUDE.md` (this repo) — working style, bundle budgets (core ≤ 2.2 kB gzip / on-open ≤ 25 kB gzip), redaction mandate, conventional commits, no Co-Authored-By
- [SDD § 12 Client SDK contracts](https://github.com/tatlacas-com/brevwick-ops/blob/main/docs/brevwick-sdd.md#12-client-sdk-contracts) — canonical web SDK contract
- Phase 4 ship criterion (from [ROADMAP.md](https://github.com/tatlacas-com/brevwick-ops/blob/main/ROADMAP.md)): *"a third-party dev can `npm install` and wire the widget in under 10 minutes"*
- Issues: [#7](https://github.com/tatlacas-com/brevwick-sdk-js/issues/7), [#10](https://github.com/tatlacas-com/brevwick-sdk-js/issues/10), [#15](https://github.com/tatlacas-com/brevwick-sdk-js/issues/15), [#31](https://github.com/tatlacas-com/brevwick-sdk-js/issues/31)

**Conventions (apply to every worktree):**

- pnpm workspace; two packages: `brevwick-sdk` (core, framework-agnostic) and `brevwick-react` (bindings)
- TypeScript strict, tsup builds (ESM + CJS + dts), Vitest + happy-dom for tests
- `sideEffects: false` in both packages; treeshake-friendly public surface
- Dynamic imports for anything heavy (`await import('...')`) so it never lands in the base bundle
- Single quotes, semicolons, trailing commas (prettier); relative paths inside each package
- Conventional commits, subject ≤ 72 chars, **no Co-Authored-By headers**, no Claude attribution
- Never log: project key plaintext, auth headers, bearer tokens, JWT contents, email bodies, raw report descriptions

**Hard bundle budgets — CI enforces via `packages/sdk/src/__tests__/chunk-split.test.ts`:**

- `brevwick-sdk` core initial chunk: **≤ 2.2 kB gzip**
- Screenshot chunk (`modern-screenshot`): **≤ 18 kB gzip**
- `brevwick-react` entry: **≤ 25 kB gzip** (excluding peer deps)

**CI gauntlet (run green locally before every push):**

```bash
pnpm install --frozen-lockfile \
  && pnpm format \
  && pnpm lint \
  && pnpm type-check \
  && pnpm test \
  && pnpm build
```

---

## Grouping rationale (why 3 parallel worktrees + 1 admin action)

**Issue overlap check:**

- **#7 (size-limit)** touches `tsup.config.ts`, `package.json` of both packages, `.size-limit.json`, `.github/workflows/ci.yml`. Pure plumbing.
- **#10 (MSW e2e)** adds a new `__tests__/integration/` directory and fixtures. No overlap with production source.
- **#31 (screenshot region capture)** touches `packages/react/src/feedback-button.tsx` + `packages/react/src/styles.ts`. No infra overlap.
- **#15 (NPM_TOKEN)** is a human action on npmjs.com + GitHub repo settings — no code, no worktree. Covered at the bottom of this file as a checklist.

Zero file overlap among the three code issues → **all three run in parallel at T+0**. `pnpm-lock.yaml` and `package.json` roots are the only common surfaces; #7 touches them (new devDep), #10 touches them (msw devDep), and since both are adding disjoint devDeps, a single rebase at merge time is trivial.

Worktrees live alongside the main repo at `/home/tatlacas/repos/brevwick/brevwick-sdk-js-wt-*`.

---

## Dependency map

```
TIER 0 — Parallel from T+0 (3 parallel worktrees)
  WT-A:  #7   size-limit budgets + CI gate
  WT-B:  #10  MSW + live-API integration coverage
  WT-C:  #31  screenshot button UX + drag-to-select region capture
                      (sequenced after #30 theming which has already merged)

(No TIER 1 — all three are independent.)

Admin action (not a worktree):
  #15  Set NPM_TOKEN repo secret (one-time npmjs.com + GitHub Settings task)
```

---

## TIER 0 — Parallel

---

### Worktree A: size-limit budgets + CI gate (#7)

Enforces the budgets the SDD already documents. Adds `size-limit` + preset, writes `.size-limit.json` entries, tunes `tsup.config.ts` (minify/treeshake/splitting/sideEffects), wires a CI step + PR-comment action. Fresh build proves budgets green; intentional +1 kB PR proves the check fails.

**Scope:** root `package.json` adds `size-limit`, `@size-limit/preset-small-lib`; `.size-limit.json` per package; tsup configs tuned; `.github/workflows/ci.yml` adds `pnpm size-limit`; optional `andresz1/size-limit-action` for PR comments; ensure `sideEffects: false` in both packages.

**Depends on:** nothing.

**Blocks:** nothing.

**Can run in parallel with:** WT-B, WT-C.

```bash
cd /home/tatlacas/repos/brevwick/brevwick-sdk-js
git fetch origin
git worktree add ../brevwick-sdk-js-wt-size-limit -b chore/issue-7-size-limit origin/main
cd ../brevwick-sdk-js-wt-size-limit

claude --dangerously-skip-permissions "
You are enforcing bundle budgets in CI. Task: GitHub issue #7 on tatlacas-com/brevwick-sdk-js.

THIS REPO: \$(pwd)

STEP 1 — Read project context:
- Read CLAUDE.md — bundle budgets (core ≤ 2.2 kB gzip bumped from 2 kB; on-open ≤ 25 kB gzip), redaction mandate, no Co-Authored-By, squash-merge.
- Read phase4-worktree.md conventions section.
- Run: gh api repos/tatlacas-com/brevwick-sdk-js/issues/7 --jq '.body'
- Read: root package.json, pnpm-workspace.yaml, packages/sdk/package.json, packages/sdk/tsup.config.ts, packages/sdk/src/__tests__/chunk-split.test.ts (existing budget check), packages/react/package.json, packages/react/tsup.config.ts, .github/workflows/ci.yml.
- Fetch SDD § 12 'Budgets':
  gh api repos/tatlacas-com/brevwick-ops/contents/docs/brevwick-sdd.md --jq '.content' | base64 -d | sed -n '/^## 12/,/^## 13/p'

STEP 2 — Install size-limit:
- Root package.json devDependencies: add 'size-limit' + '@size-limit/preset-small-lib'. Use the latest stable majors.
- Add a root script: 'size': 'size-limit'.

STEP 3 — .size-limit.json (root):
[
  { \"name\": \"brevwick-sdk (core eager chunk)\", \"path\": \"packages/sdk/dist/index.mjs\", \"limit\": \"2.2 kB\" },
  { \"name\": \"brevwick-sdk (screenshot chunk)\", \"path\": \"packages/sdk/dist/chunks/screenshot-*.mjs\", \"limit\": \"18 kB\" },
  { \"name\": \"brevwick-react\", \"path\": \"packages/react/dist/index.mjs\", \"limit\": \"25 kB\", \"ignore\": [\"react\", \"react-dom\"] }
]
(Adjust paths to match actual tsup output — verify with 'pnpm build' then 'ls packages/*/dist'.)

STEP 4 — tsup tuning (both packages):
- minify: true, treeshake: true, splitting: true, format: ['esm', 'cjs'], sourcemap: true, dts: true.
- Confirm 'sideEffects: false' in both package.json files.

STEP 5 — CI wiring (.github/workflows/ci.yml):
- Add a new job 'size-check' that runs after 'test':
  * checkout, pnpm/action-setup, setup-node, pnpm install --frozen-lockfile, pnpm build, pnpm size
- Make size-check a required check in branch protection — call this out in the PR body so the user can toggle after merge.

STEP 6 — Optional PR-comment action:
- If straightforward, add andresz1/size-limit-action to the job so PRs get a size diff comment. If it requires a token the repo doesn't have, skip and document in the PR body.

STEP 7 — Validate:
- pnpm install && pnpm build && pnpm size → all three budgets green.
- Add a throwaway +1 kB import in a dummy branch (NOT this PR) to confirm the check goes red; revert before pushing.

STEP 8 — CI gauntlet:
pnpm install --frozen-lockfile \\
  && pnpm format \\
  && pnpm lint \\
  && pnpm type-check \\
  && pnpm test \\
  && pnpm build \\
  && pnpm size

STEP 9 — Commit and PR:
git add -A
git commit -m 'chore(bundle): size-limit budgets + CI gate (#7)'
git push -u origin chore/issue-7-size-limit
gh pr create --title 'chore(bundle): size-limit budgets + CI gate' --body \"\$(cat <<'PREOF'
Closes #7

Implements [SDD § 12 budgets](https://github.com/tatlacas-com/brevwick-ops/blob/main/docs/brevwick-sdd.md#12-client-sdk-contracts).

## Summary
- \`size-limit\` + \`@size-limit/preset-small-lib\` at workspace root
- \`.size-limit.json\` — core ≤ 2.2 kB, screenshot chunk ≤ 18 kB, react ≤ 25 kB (excluding peers)
- tsup tuned (minify + treeshake + splitting + dts); \`sideEffects: false\` verified on both packages
- New CI job \`size-check\` — runs after test; fails PRs that exceed budgets
- Optional size-limit-action for PR comments if the repo permits

## Post-merge follow-up (call out to user)
- Add \`size-check\` as a required check in branch protection for main

## Test plan
- [ ] Fresh \`pnpm build && pnpm size\` shows all three budgets green
- [ ] CI size-check job green on this PR
PREOF
)\"
"
```

---

### Worktree B: MSW + live-API integration coverage (#10)

Adds integration-level Vitest suites covering the full SDK flow against a mocked API (MSW), plus an optional live-API smoke job against a running brevwick-api via docker-compose.

**Scope:** `packages/sdk/src/__tests__/integration/` (new) with MSW handlers + golden payload fixtures; `packages/react/src/__tests__/integration/` (new) rendering app with provider + FAB → simulate user typing + submit; redaction matrix assertions (auth header, bearer, JWT triplet, email, base64 blob); optional CI job `sdk-e2e-live` spinning up brevwick-api.

**Depends on:** nothing.

**Blocks:** nothing.

**Can run in parallel with:** WT-A, WT-C.

```bash
cd /home/tatlacas/repos/brevwick/brevwick-sdk-js
git fetch origin
git worktree add ../brevwick-sdk-js-wt-msw -b test/issue-10-msw-integration origin/main
cd ../brevwick-sdk-js-wt-msw

claude --dangerously-skip-permissions "
You are adding MSW + live-API integration coverage. Task: GitHub issue #10 on tatlacas-com/brevwick-sdk-js.

THIS REPO: \$(pwd)

STEP 1 — Read project context:
- Read CLAUDE.md + phase4-worktree.md.
- Run: gh api repos/tatlacas-com/brevwick-sdk-js/issues/10 --jq '.body'
- Read: packages/sdk/src/submit.ts (composePayload), packages/sdk/src/redact.ts, packages/sdk/src/core/client.ts, packages/sdk/src/__tests__/ (existing unit tests — mirror style), packages/react/src/provider.tsx, packages/react/src/feedback-button.tsx, vitest.config.ts, pnpm-workspace.yaml.
- Fetch SDD § 7 ingest endpoints + § 12 SDK contracts for the wire shape being asserted.

STEP 2 — Install MSW:
- Workspace root devDep: msw (latest stable). Generate a tiny mock service worker bundle or use the node-side intercept — pick whichever matches the repo's existing happy-dom setup.

STEP 3 — SDK integration tests (packages/sdk/src/__tests__/integration/):
- setup.ts: MSW server with handlers for:
  * POST /v1/ingest/presign → returns { upload_url, key, required_headers }
  * PUT to upload_url (mocked R2) → 200
  * POST /v1/ingest/reports → captures body, returns { report_id }
- full-flow.test.ts: install → fire a synthetic console error → fire a 500 fetch → call submit → assert the captured POST body contains:
  * rings.console[0].message matches the synthetic error
  * rings.network[0].status === 500
  * attachments[0].key matches the presign key
- redaction-matrix.test.ts: parameterised cases — 'Authorization: Bearer xyz', raw bearer token, JWT triplet 'aaa.bbb.ccc', email 'foo@bar.com', long base64 blob. For each, inject into FeedbackInput.description and assert the redacted value in captured POST body.
- screenshot-lazy.test.ts: assert 'modern-screenshot' does NOT appear in the eager bundle graph — use a static analysis approach (parse packages/sdk/dist/index.mjs after build and assert no 'modern-screenshot' substring), OR instrument the import() and assert dynamic path triggered.

STEP 4 — React integration tests (packages/react/src/__tests__/integration/):
- render-submit.test.tsx: render <BrevwickProvider><FeedbackButton/></BrevwickProvider>; user clicks FAB → types title → clicks submit; assert MSW saw one POST /v1/ingest/reports with expected payload.
- Fixtures under __fixtures__/ — golden composed payload shape (a JSON file; tests deep-equal against it after stripping ts + reportId).

STEP 5 — Coverage gate:
- pnpm test should produce coverage.lcov. Assert ≥ 85% lines on packages/sdk, ≥ 75% on packages/react. If under, extend tests to cover uncovered branches (especially error paths in submit).

STEP 6 — Live-API smoke (optional CI job):
- New job 'sdk-e2e-live' in ci.yml:
  * docker-compose -f ../brevwick-api/docker-compose.dev.yml up -d (adjust path — ideally the brevwick-api repo provides a hosted-image approach; if not, document as 'future' and leave job commented with instructions).
  * Seed a project+key via bwctl.
  * Run a small node script under examples/vanilla that submits a report with the seeded key.
  * Assert via brevwick-api admin API (curl) that the report row exists.
- If cross-repo checkout is too brittle for CI, leave the job defined but workflow_dispatch-only (manual trigger). Document this choice in the PR body.

STEP 7 — Perf check:
- pnpm test must complete in < 15 s on CI. If tests are slow, isolate the MSW server per-suite and warm vitest.

STEP 8 — CI gauntlet:
pnpm install --frozen-lockfile \\
  && pnpm format \\
  && pnpm lint \\
  && pnpm type-check \\
  && pnpm test \\
  && pnpm build

STEP 9 — Commit and PR:
git add -A
git commit -m 'test(integration): MSW + live-API e2e coverage (#10)'
git push -u origin test/issue-10-msw-integration
gh pr create --title 'test(integration): MSW + live-API e2e coverage' --body \"\$(cat <<'PREOF'
Closes #10

## Summary
- MSW-based integration suite in \`packages/sdk/src/__tests__/integration/\` — full install → rings → submit flow against a mocked ingest API
- Redaction matrix: auth header, bearer, JWT triplet, email, base64 blob — each asserted in captured POST body
- Screenshot lazy-load verification — \`modern-screenshot\` never in the eager bundle
- React integration tests under \`packages/react/src/__tests__/integration/\` render Provider + FAB and assert submit payload
- Golden payload fixture under \`__fixtures__/\`
- Coverage ≥ 85% on \`packages/sdk\`, ≥ 75% on \`packages/react\`
- Optional \`sdk-e2e-live\` CI job (workflow_dispatch) spins up brevwick-api and submits against a seeded key

## Test plan
- [ ] \`pnpm test\` green with coverage thresholds enforced
- [ ] Total suite < 15 s on CI
- [ ] Live-API job green on manual trigger (or documented as follow-up)
PREOF
)\"
"
```

---

### Worktree C: screenshot button UX + drag-to-select region capture (#31)

Two UX problems on the React composer's screenshot affordance: (1) the camera icon reads as "take a photo", and (2) no way to capture a specific region. This worktree swaps the icon, updates aria-labels, and adds a drag-to-select overlay that crops the captured blob via canvas.

**Scope:** `packages/react/src/feedback-button.tsx` (icon swap, overlay render, drag state, canvas crop), `packages/react/src/styles.ts` (overlay + rectangle + handle classes), vitest coverage for overlay interactions + canvas crop math + a11y. No SDK-core API change.

**Depends on:** nothing — PR #30 (theming + composer polish) has already merged.

**Blocks:** nothing.

**Can run in parallel with:** WT-A, WT-B.

**Priority note:** This is a UX polish. It's NOT a ship-criterion blocker for Phase 4 (the existing full-page capture works). Landing it alongside Phase 4 is fine; deferring to post-Phase-4 is also acceptable if higher-priority work emerges.

```bash
cd /home/tatlacas/repos/brevwick/brevwick-sdk-js
git fetch origin
git worktree add ../brevwick-sdk-js-wt-screenshot-region -b feat/issue-31-screenshot-region origin/main
cd ../brevwick-sdk-js-wt-screenshot-region

claude --dangerously-skip-permissions "
You are adding a clearer screenshot button + drag-to-select region capture. Task: GitHub issue #31 on tatlacas-com/brevwick-sdk-js.

THIS REPO: \$(pwd)

STEP 1 — Read project context:
- Read CLAUDE.md — bundle budget (react ≤ 25 kB gzip), redaction mandate.
- Read phase4-worktree.md conventions.
- Run: gh api repos/tatlacas-com/brevwick-sdk-js/issues/31 --jq '.body'
- Read: packages/react/src/feedback-button.tsx (current CameraIcon around L966-981, composer layout from #25/#30), packages/react/src/styles.ts (existing brw-* classes, composer + chip classes), packages/sdk/src/screenshot.ts (captureScreenshot returning full-page Blob), packages/react/src/__tests__/feedback-button.test.tsx.
- Fetch SDD § 12 captureScreenshot contract.

STEP 2 — Icon + aria-label swap:
- Replace the CameraIcon in feedback-button.tsx with an inline SVG: rounded rectangle (screen) + dashed inner rectangle (selection). Same px size as sibling icons. Use stroke:currentColor so it inherits theme.
- Button aria-label: 'Capture screenshot of this page' (was 'Attach screenshot').
- Keep paperclip icon (file upload) adjacent and visually distinct so the two affordances don't read as duplicates.

STEP 3 — Region capture overlay:
- On screenshot-button click, do NOT capture immediately. Instead render a Radix Dialog portalled to document.body with data-brevwick-skip attribute at the root:
  * Dimmed backdrop (slight darken — not fully opaque, user needs to see the page).
  * Crosshair cursor; single selection rectangle drawn during pointerdown → pointermove → pointerup.
  * Visible outline + 4 corner handles on the rectangle.
  * Escape aborts (overlay closes, no screenshot taken).
  * Enter confirms.
  * Secondary button 'Capture full page' for users who want existing behaviour.
- A11y: role='dialog', aria-modal='true', aria-label='Select screenshot region'. Focus trap via Radix. Respect prefers-reduced-motion (no fade).

STEP 4 — Canvas crop pipeline:
- On confirm of a region: unmount the overlay BEFORE calling captureScreenshot() so the overlay itself isn't in the image. (Alternative: overlay root has data-brevwick-skip, which the existing screenshot capture path respects — test which approach avoids flicker best.)
- Call existing captureScreenshot() → full-page Blob.
- Load into an Image, draw into a canvas with drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh) using the selection rectangle coordinates (device-pixel-ratio aware — multiply by window.devicePixelRatio).
- canvas.toBlob('image/png') → cropped Blob.
- Return cropped Blob to the composer via the existing screenshot slot. 'Capture full page' bypasses the crop and returns the original Blob.

STEP 5 — No SDK-core API change:
- packages/sdk/src/screenshot.ts signature stays the same. The region crop is React-side only.
- If a { region } option later proves useful for vanilla consumers, file a follow-up — NOT in this PR.

STEP 6 — Tests (packages/react/src/__tests__/feedback-button.test.tsx — extend):
- New icon renders (query by aria-label 'Capture screenshot of this page').
- Click button → overlay appears (query by role='dialog' aria-label 'Select screenshot region').
- pointerdown → pointermove → pointerup produces a selection rectangle in state (exposed via a data-testid).
- Escape dismisses without capturing (assert Brevwick.captureScreenshot NOT called — mock it).
- Enter with a region → captureScreenshot called → canvas crop called → Blob of expected dimensions lands in composer.
- 'Capture full page' button → captureScreenshot called → un-cropped Blob lands.
- vitest-axe clean on overlay in idle + mid-drag states.

STEP 7 — Bundle budget:
- After build: assert react entry ≤ 25 kB gzip. The added logic (canvas crop ~300 B, overlay JSX ~1 kB) is well inside budget, but still check via chunk-split.test.ts / size-limit.

STEP 8 — CI gauntlet:
pnpm install --frozen-lockfile \\
  && pnpm format \\
  && pnpm lint \\
  && pnpm type-check \\
  && pnpm test \\
  && pnpm build

STEP 9 — Manual smoke:
- pnpm dev:examples → examples/next → click new screenshot icon → drag a region → verify:
  * Overlay NOT in the captured image
  * Cropped Blob's dimensions match the selection
  * 'Capture full page' returns uncropped
  * Focus returns to the screenshot button on close

STEP 10 — Commit and PR:
git add -A
git commit -m 'feat(react): clearer screenshot button + drag-to-select region capture (#31)'
git push -u origin feat/issue-31-screenshot-region
gh pr create --title 'feat(react): clearer screenshot button + drag-to-select region capture' --body \"\$(cat <<'PREOF'
Closes #31

Implements [SDD § 12 captureScreenshot contract](https://github.com/tatlacas-com/brevwick-ops/blob/main/docs/brevwick-sdd.md#12-client-sdk-contracts) — React-side crop only; SDK-core signature unchanged.

## Summary
- New inline-SVG icon (monitor + dashed selection rectangle) replaces the camera icon
- aria-label 'Capture screenshot of this page'
- Click → Radix Dialog overlay with crosshair + pointer-drag selection rectangle (visible handles, Escape aborts, Enter confirms)
- Canvas crop pipeline (devicePixelRatio-aware) returns a cropped PNG Blob to the composer
- Secondary 'Capture full page' button preserves existing behaviour
- Overlay itself excluded from captured image (unmount-before-capture)
- a11y: focus trap, prefers-reduced-motion respected
- Bundle: react entry stays ≤ 25 kB gzip; SDK core untouched

## Test plan
- [ ] Icon + aria-label verified
- [ ] Overlay renders on click; drag produces rectangle in state
- [ ] Escape cancels; Enter / 'Capture' confirms; 'Capture full page' bypasses crop
- [ ] Overlay NOT in captured image
- [ ] Focus returns to screenshot button on close
- [ ] vitest-axe clean on idle + mid-drag
- [ ] react bundle ≤ 25 kB gzip
PREOF
)\"
"
```

---

## Admin action: NPM_TOKEN repo secret (#15)

**Not a worktree — this is a one-time human task on npmjs.com + GitHub repo settings.** It unblocks the `release` workflow from #8 (already merged) so the existing Version Packages PR (#18) can publish once approved.

**Steps (do this once, before the first 0.1.0 promotion):**

1. On [npmjs.com](https://www.npmjs.com/) sign in as the publishing account/org that owns `brevwick-sdk` + `brevwick-react`.
2. **Account → Access Tokens → Generate New Token → Automation.** Scope it so it can publish both packages. Copy the token.
3. On GitHub: `tatlacas-com/brevwick-sdk-js → Settings → Secrets and variables → Actions → New repository secret`. Name: `NPM_TOKEN`. Paste the token value.
4. Verify: merge an existing Version Packages PR (or create a trivial changeset → merge → Version Packages auto-PR → merge). The `release` workflow should run `pnpm release` and publish under the `beta` dist-tag with provenance attestation.

**Failure mode without this secret:** the release workflow opens the Version Packages PR fine, but the publish step fails with `ENEEDAUTH`.

**`id-token: write` is already granted on the workflow** and `publishConfig.provenance: true` is set on both packages — once the secret is present, provenance works automatically.

Close issue #15 with a comment linking to the Actions run that first published successfully.

---

## Parallel execution cheat sheet

**At T+0 (all three code worktrees parallel):**

- WT-A (#7 size-limit)
- WT-B (#10 MSW integration)
- WT-C (#31 screenshot region capture)

**In parallel (human action, no worktree):**

- #15 NPM_TOKEN — do once, before the first `0.1.0` promotion to `latest` dist-tag

**Phase 4 ship gate for this repo:**

- WT-A + WT-B + `/docs/web` page (brevwick-web#69) all merged, PLUS NPM_TOKEN configured, PLUS the existing Version Packages PR (#18) merged to cut `0.1.0-beta.x`.
- WT-C (#31) is polish, not a ship blocker — can merge after the beta cut.
