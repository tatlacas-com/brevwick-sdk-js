# brevwick-sdk-js Checksum + Widget UX Worktrees

3 issues across 3 worktrees. Same conventions as `worktree.md` / `ai-worktree.md`; this file only covers the checksum-fix + widget-UX initiative (#29, #30, #31).

**Key references:**

- `CLAUDE.md` (this repo) — working style, bundle budgets (≤ 2.2 kB core / ≤ 25 kB React), redaction mandate, conventional commits, no Co-Authored-By
- [SDD § 7 ingest endpoints](https://github.com/tatlacas-com/brevwick-ops/blob/main/docs/brevwick-sdd.md#7-ingest-endpoints) — presign + upload + issue shape (WT-A is cross-repo with a paired ops PR here)
- [SDD § 12](https://github.com/tatlacas-com/brevwick-ops/blob/main/docs/brevwick-sdd.md#12-client-sdk-contracts) — canonical Client SDK contracts
- Issues: [#29](https://github.com/tatlacas-com/brevwick-sdk-js/issues/29), [#30](https://github.com/tatlacas-com/brevwick-sdk-js/issues/30), [#31](https://github.com/tatlacas-com/brevwick-sdk-js/issues/31)

**Conventions (apply to every worktree):**

- pnpm workspace; two packages: `brevwick-sdk` (core, framework-agnostic) and `brevwick-react` (bindings)
- TypeScript strict, tsup for builds (ESM + CJS + dts), Vitest + happy-dom for tests
- `sideEffects: false` in both packages; treeshake-friendly public surface
- Dynamic imports for anything heavy (`await import('modern-screenshot')`) so it never lands in the base bundle
- Single quotes, semicolons, trailing commas (prettier); relative paths inside each package
- Conventional commits, subject ≤ 72 chars, **no Co-Authored-By headers**, no Claude attribution
- Never log: project key plaintext, auth headers, bearer tokens, JWT contents, email bodies, raw issue descriptions
- `main` is protected — every change goes through a PR. Branch from `origin/main`, not local `main`. Do NOT `git worktree remove` — the user manages worktree lifecycle.

**Hard bundle budgets — CI enforces via `packages/sdk/src/__tests__/chunk-split.test.ts`:**

- `brevwick-sdk` core initial chunk: **≤ 2.2 kB gzip**
- Screenshot chunk (`modern-screenshot`): **≤ 18 kB gzip**
- `brevwick-react` entry: **≤ 25 kB gzip** (excluding peer deps)

**Redaction rules (apply to every worktree that touches payloads):**

- Every string that leaves the device runs through `packages/sdk/src/core/internal/redact.ts` first
- Adding a new captured field? Add a redaction golden test for it in the same PR
- `sha256` is a non-sensitive digest — DO NOT pass it through `redact()`; it rides the wire unchanged (same as other booleans / fixed-shape fields)

---

## Grouping rationale (why 3 worktrees, why this sequencing)

**Why 3 separate PRs, not one bundled:** the checksum fix (#29) is a SDK-core bug living entirely in `packages/sdk/src/submit.ts` with a paired cross-repo SDD update. Theming (#30) is a React stylesheet expansion. Screenshot UX (#31) is a React widget feature with a new overlay + canvas crop. Bundling them would inflate the diff, cross package boundaries, and slow review — and #29 is a production-blocking bug that should ship on its own without waiting for UX review.

**Why WT-A can run parallel with WT-B:** #29 touches `packages/sdk/src/submit.ts` + `packages/sdk/src/__tests__/submit.test.ts` + `packages/sdk/src/__tests__/chunk-split.test.ts`. #30 touches `packages/react/src/styles.ts` + `packages/react/src/feedback-button.tsx` + `packages/react/src/__tests__/feedback-button.test.tsx`. Zero file overlap, zero API overlap.

**Why WT-C waits on WT-B:** #30 and #31 both edit `packages/react/src/feedback-button.tsx` (the composer component, icon component, new classes) and `packages/react/src/styles.ts` (new `brw-*` rules). Running in parallel guarantees merge conflicts on both files, and #31's new screenshot icon + overlay lands more cleanly on top of the themed composer shell introduced by #30 (the overlay reuses `--brw-*` tokens).

---

## Dependency map

```
TIER 0 — Can start at T+0 (2 in parallel)
  WT-A: #29  fix(submit): x-amz-checksum-sha256 on upload  [cross-repo: brevwick-ops SDD § 7]
  WT-B: #30  feat(react): theming + composer polish        [no dep]

TIER 1 — After WT-B merges
  WT-C: #31  feat(react): clearer screenshot button + drag-to-select region
```

Worktrees live alongside the main repo at `/home/tatlacas/repos/brevwick/brevwick-sdk-js-wt-*`.

---

## TIER 0

---

### Worktree A: fix(submit): attachment PUT missing `x-amz-checksum-sha256`, ingest 409 (#29)

Submits with attachments fail ingest `409 CONFLICT` because the SDK never computes or sends the blob SHA-256. Fix: compute SHA-256 client-side, send in presign body and in the final issue payload. Paired SDD § 7 update in `brevwick-ops`.

**Scope:** `packages/sdk/src/submit.ts` adds a `sha256Base64(blob)` helper, threads `sha256` into the presign request body and into each `attachments[*]` entry on the issue; new tests in `packages/sdk/src/__tests__/submit.test.ts` asserting presign body / PUT header / issue payload carry matching checksums; no change to `putAttachment` (header merge already forwards `x-amz-checksum-sha256` from `presign.headers`); cross-repo PR on `brevwick-ops` updates SDD § 7 presign-request example.

**Blocks:** none.

**Depends on:** none.

**Can run in parallel with:** WT-B (no file overlap — SDK core vs. React package).

```bash
cd /home/tatlacas/repos/brevwick/brevwick-sdk-js
git fetch origin
git worktree add ../brevwick-sdk-js-wt-checksum -b fix/issue-29-checksum-sha256 origin/main
cd ../brevwick-sdk-js-wt-checksum

claude --dangerously-skip-permissions "
You are fixing the ingest 409 caused by the SDK never sending a SHA-256 checksum on attachment uploads. Your task is GitHub issue #29 on tatlacas-com/brevwick-sdk-js.

THIS REPO: \$(pwd)

STEP 1 — Read project context:
- Read CLAUDE.md fully — bundle budget (≤ 2.2 kB core), redaction mandate, no Co-Authored-By, cross-repo SDD update rule.
- Run: gh api repos/tatlacas-com/brevwick-sdk-js/issues/29 --jq '.body'
- Read: packages/sdk/src/submit.ts (especially presignOne, putAttachment, uploadAttachments, composePayload), packages/sdk/src/types.ts (FeedbackAttachment, the on-wire attachment shape), packages/sdk/src/__tests__/submit.test.ts (golden fixtures + msw handlers), packages/sdk/src/__tests__/chunk-split.test.ts (bundle budget assertion), packages/sdk/src/core/internal/redact.ts (confirm sha256 is NOT redacted).
- Fetch SDD § 7 ingest:
  gh api repos/tatlacas-com/brevwick-ops/contents/docs/brevwick-sdd.md --jq '.content' | base64 -d | sed -n '/^### POST \`\/v1\/ingest\/presign\`/,/^### /p'

STEP 2 — SHA-256 helper:
- Add a small helper (inline in submit.ts — do NOT create a new module; the helper is single-caller and belongs with the upload path):
  * async function sha256Base64(blob: Blob): Promise<string>
  * Implementation: const buf = await blob.arrayBuffer(); const digest = await crypto.subtle.digest('SHA-256', buf); return base64 of the Uint8Array.
  * Base64 encoding via btoa(String.fromCharCode(...new Uint8Array(digest))) — the standard AWS convention for x-amz-checksum-sha256 is base64, NOT hex.
- Guard cross-runtime: crypto.subtle is on globalThis.crypto in browsers, Workers, Node ≥ 15; monorepo targets Node ≥ 20. If typeof crypto === 'undefined' || !crypto.subtle → throw an Error('crypto.subtle unavailable'). The upload path is already gated behind user gesture, so this will never fire on the SSR path.

STEP 3 — Thread sha256 into presign request body:
- In presignOne (currently body: JSON.stringify({ mime, size_bytes })) add sha256:
  * Compute the digest BEFORE the fetch call so the presign endpoint receives it.
  * body: JSON.stringify({ mime, size_bytes, sha256 })
  * Return both the presign response AND the computed sha256 from presignOne (or compute once in uploadAttachments and pass down to both presignOne and the issue-composition step — pick the shape that keeps the happy path readable; ONE digest call per blob, not two).

STEP 4 — Thread sha256 into the final issue payload:
- Update the ResolvedAttachment interface to include sha256: string.
- In uploadAttachments, record the sha256 alongside object_key / mime / size_bytes for each resolved attachment.
- In composePayload, the attachments array rides to the wire as-is — confirm sha256 lands on every attachments[*] in the JSON.stringify'd body.
- DO NOT pass sha256 through redact() — it is a non-sensitive digest and the wire shape requires the exact value.

STEP 5 — putAttachment stays as-is:
- The existing header merge { 'Content-Type': blob.type, ...(presign.headers ?? {}) } already forwards x-amz-checksum-sha256 when the server returns it in presign.headers. No change needed.
- If you find the server is NOT echoing the header back, STOP and escalate — that would be a server-side contract change beyond the scope of this PR.

STEP 6 — Tests (packages/sdk/src/__tests__/submit.test.ts):
- Update the existing happy-path golden: assert the msw-received presign body contains sha256 (a non-empty base64 string).
- Update the PUT handler: capture the x-amz-checksum-sha256 header, assert it matches the sha256 sent in the presign body.
- Update the issue-POST handler: assert request body attachments[0].sha256 equals the same value.
- Add a cross-check test: submit two different blobs in one issue; assert the two presigns receive two different checksums and the issue's attachments array carries both in order.
- Confirm the ring-re-redaction invariant test still passes (sha256 must survive JSON.stringify unchanged — no double-masking).
- Confirm all existing attachment-validation tests still pass (count > 5, size > 10 MB, MIME whitelist) — these reject BEFORE any digest is computed, so sha256Base64 must not run on invalid input.

STEP 7 — Bundle budget (critical):
- Run: pnpm --filter brevwick-sdk build
- Confirm: gzip -kc packages/sdk/dist/index.js | wc -c is ≤ 2252 (2.2 kB).
- The sha256Base64 helper + the two new field plumbing points should add < 100 B gzipped. If you see a regression, look for: duplicated const strings, String.fromCharCode spread for large inputs (use a chunked loop for blobs > 64 kB to avoid stack overflow AND keep bundle size tight), inline JSDoc that isn't hoisting into @dts.
- chunk-split.test.ts must stay green.

STEP 8 — CI gauntlet:
pnpm install \\\\
  && pnpm format \\\\
  && pnpm lint \\\\
  && pnpm type-check \\\\
  && pnpm test \\\\
  && pnpm build
All green before push.

STEP 9 — Cross-repo SDD § 7 update (REQUIRED):
- Open the ops repo:
  cd /tmp && rm -rf brevwick-ops && gh repo clone tatlacas-com/brevwick-ops && cd brevwick-ops
  git fetch origin && git checkout -b docs/sdd-presign-sha256 origin/main
- Edit docs/brevwick-sdd.md § 7 presign-request example to include sha256:
  { \"mime\": \"image/png\", \"size_bytes\": 84211, \"sha256\": \"<base64-sha256>\" }
- Also add a bullet under 'Validation' documenting: 'sha256 is base64-encoded SHA-256 of the blob bytes; the server signs the R2 PUT URL with this exact checksum and echoes it in the response headers.'
- Commit: docs(sdd): add sha256 to presign request (§ 7)
- Push + PR:
  git push -u origin docs/sdd-presign-sha256
  gh pr create --repo tatlacas-com/brevwick-ops --title 'docs(sdd): add sha256 to presign request (§ 7)' --body 'Paired with tatlacas-com/brevwick-sdk-js#29. Without this, the SDK change looks undocumented against the canonical contract.'
- Record the ops PR number for the SDK PR body.

STEP 10 — Manual smoke (before PR):
- pnpm dev:examples → Next.js example with a staging pk_live_* → open the widget → capture screenshot → submit.
- Verify in browser devtools:
  * presign request body contains sha256
  * PUT request headers contain x-amz-checksum-sha256 matching presign sha256
  * issue POST body attachments[0].sha256 matches
  * final response is 200 { issue_id } — NO 409

STEP 11 — Commit and PR:
cd \$(pwd)  # back to the SDK worktree
git add -A
git commit -m 'fix(submit): send sha256 on presign + issue so R2 PUT carries checksum (#29)'
git push -u origin fix/issue-29-checksum-sha256
gh pr create --title 'fix(submit): send sha256 on presign + issue so R2 PUT carries checksum' --body \"\$(cat <<'PREOF'
Closes #29

Paired SDD update: tatlacas-com/brevwick-ops#<OPS_PR_NUMBER>

Implements [SDD § 7 ingest](https://github.com/tatlacas-com/brevwick-ops/blob/main/docs/brevwick-sdd.md#7-ingest-endpoints).

## Summary
- Compute base64-encoded SHA-256 of every attachment blob client-side via \`crypto.subtle.digest\`
- Send the digest as \`sha256\` in the presign request body so the server can sign the R2 URL with \`x-amz-checksum-sha256\`
- Include \`sha256\` on each \`attachments[*]\` entry in the final \`/v1/ingest/issues\` payload
- \`putAttachment\` header merge unchanged — it already forwards \`x-amz-checksum-sha256\` from \`presign.headers\`
- Fixes the \`409 CONFLICT attachment conflict: missing sha256 on p/...\` observed on every screenshot submit

## Bundle size
- Eager core chunk: <ISSUE_SIZE> B gzipped — under the 2.2 kB (2252 B) budget
- \`chunk-split.test.ts\` green

## Test plan
- [ ] msw asserts presign body contains base64 \`sha256\`
- [ ] msw asserts PUT header \`x-amz-checksum-sha256\` matches presign body \`sha256\`
- [ ] msw asserts issue \`attachments[*].sha256\` matches the value sent at presign time
- [ ] Two-attachment cross-check: distinct checksums, ordered correctly in the issue payload
- [ ] Existing attachment-validation tests still pass (reject before digest is computed)
- [ ] Ring-re-redaction invariant still passes (sha256 is NOT redacted)
- [ ] Manual smoke: Next.js example → screenshot submit → 200, no 409
PREOF
)\"
"
```

---

### Worktree B: feat(react): light/dark theming + host-app awareness + composer polish (#30)

Introduce a `--brw-*` custom-property token set so the widget honours light/dark preferences and lets the host app override accents. Polish the composer into a single rounded input shell that reads as one affordance.

**Scope:** extend `packages/react/src/styles.ts` with a token set (`--brw-panel-bg`, `--brw-bubble-assistant-bg`, `--brw-bubble-user-bg`, `--brw-chip-bg`, `--brw-composer-bg`, `--brw-fg`, `--brw-fg-muted`, `--brw-border`, `--brw-border-focus`, `--brw-accent`, `--brw-accent-fg`, `--brw-shadow`); replace hardcoded colours in every `brw-*` class rule with `var(--brw-token)` consumers; light defaults + `@media (prefers-color-scheme: dark)` variants; wrap the composer (textarea + icon buttons + AI toggle + send) in a rounded shell that lights `--brw-border-focus` on `:focus-within`; JSDoc on `FeedbackButton` listing the public token set; tests for both themes; no new dependencies.

**Blocks:** WT-C (#31 — the screenshot icon swap + region overlay lands on top of the themed composer).

**Depends on:** none.

**Can run in parallel with:** WT-A (disjoint files — SDK core vs. React package).

```bash
cd /home/tatlacas/repos/brevwick/brevwick-sdk-js
git fetch origin
git worktree add ../brevwick-sdk-js-wt-theming -b feat/issue-30-theming origin/main
cd ../brevwick-sdk-js-wt-theming

claude --dangerously-skip-permissions "
You are introducing light/dark theming + composer polish on the React widget. Your task is GitHub issue #30 on tatlacas-com/brevwick-sdk-js.

THIS REPO: \$(pwd)

STEP 1 — Read project context:
- Read CLAUDE.md fully — bundle budget (React ≤ 25 kB gzip), no new deps unless strictly needed, no Co-Authored-By.
- Run: gh api repos/tatlacas-com/brevwick-sdk-js/issues/30 --jq '.body'
- Read: packages/react/src/styles.ts (current CSS-in-string, BREVWICK_CSS export, BREVWICK_STYLE_ID, COMPOSER_MAX_HEIGHT_PX), packages/react/src/feedback-button.tsx (panel, thread, composer, chip, icon buttons, AI toggle), packages/react/src/__tests__/feedback-button.test.tsx (assertion patterns), packages/react/tsup.config.ts.
- Fetch SDD § 12 widget UX contract for any colour / contrast constraints:
  gh api repos/tatlacas-com/brevwick-ops/contents/docs/brevwick-sdd.md --jq '.content' | base64 -d | sed -n '/^## 12/,/^## 13/p'

STEP 2 — Token set (packages/react/src/styles.ts):
- Define the token set at \`:root\` (or at \`.brw-root\` to keep globals off \`:root\` — pick whichever applies cleanly when the widget mounts inside a host that already sets variables of the same name; prefer \`.brw-root\` to avoid leaking into the host). Tokens:
  * Surfaces: --brw-panel-bg, --brw-bubble-assistant-bg, --brw-bubble-user-bg, --brw-chip-bg, --brw-composer-bg
  * Text: --brw-fg, --brw-fg-muted
  * Border/focus: --brw-border, --brw-border-focus
  * Accent: --brw-accent, --brw-accent-fg
  * Shadow: --brw-shadow
- Light defaults for all tokens; override block inside @media (prefers-color-scheme: dark) swapping every surface / text / border to the current dark values.
- Consumer rules: replace every hardcoded color / background / box-shadow in existing \`brw-*\` rules with \`var(--brw-token, <fallback-matching-current-value>)\`. NEVER use \`!important\` — host override depends on spec-level cascade.
- Host override: verify by setting --brw-accent: hotpink on :root in the Next.js example and reloading; the send button should re-colour immediately.

STEP 3 — Composer shell (packages/react/src/feedback-button.tsx + styles.ts):
- Wrap the existing composer children (screenshot button, paperclip, textarea, AIToggle, send button) in a single div with class brw-composer-shell (new).
- .brw-composer-shell: flex, align-items: flex-end (so send stays at the bottom when the textarea grows to ~5 rows), border: 1px solid var(--brw-border), border-radius: 12px, background: var(--brw-composer-bg), padding: 6px 8px, gap: 4px. On :focus-within, border-color: var(--brw-border-focus).
- .brw-composer-input: line-height: 1.4, padding: 8px 4px, no border (the shell carries the border now), min-height: 1 row, max-height: COMPOSER_MAX_HEIGHT_PX (unchanged).
- .brw-bubble-*, .brw-chip, .brw-icon-btn, .brw-send-btn: read surfaces from tokens; nudge paddings to feel consistent across themes (don't redesign, just balance).
- Autogrow logic already lives in Composer useEffect (packages/react/src/feedback-button.tsx lines around 778-783) — leave it alone. Verify the growing textarea behaves with flex-end alignment.

STEP 4 — Public contract documentation:
- Add a JSDoc block above the FeedbackButton export listing the --brw-* tokens, their defaults, and the override pattern: 'Set these as CSS custom properties on any ancestor (e.g. :root or your app shell) to re-theme the widget without a rebuild.'
- Keep the list sorted the same as styles.ts for cross-reference.

STEP 5 — Tests (packages/react/src/__tests__/feedback-button.test.tsx):
- Existing tests: update any hardcoded-colour assertions (there should be few or none — class-name based assertions should survive).
- New cases:
  * getComputedStyle on the send button reads the accent colour from --brw-accent (set --brw-accent: rgb(255, 0, 0) on a wrapper, assert the button's computed background-color matches).
  * @media (prefers-color-scheme: dark) path: stub matchMedia → matches=true for '(prefers-color-scheme: dark)', re-render, assert the panel's computed background differs from the light default (use a token like --brw-panel-bg sentinel — set CSS custom property values to rgb(1,2,3) in light and rgb(4,5,6) in dark via a test-only stylesheet, confirm both).
  * Composer shell: focus the textarea, assert :focus-within changed the shell's border-color to --brw-border-focus (use getComputedStyle).
  * Multiline autogrow still works: dispatch input events that grow the textarea, assert scrollHeight-capped height applied.
  * vitest-axe clean in BOTH light and dark matchMedia stubs.

STEP 6 — Bundle budget:
- pnpm --filter brevwick-react build && pnpm --filter brevwick-react test
- Confirm react entry gzipped size stays ≤ 25 kB. The extra CSS string adds ~500 B raw / ~200 B gzipped — well inside budget.
- Verify packages/sdk/src/__tests__/chunk-split.test.ts still passes — this PR does NOT touch the SDK, so the SDK core budget must be identical (no change).

STEP 7 — CI gauntlet:
pnpm install \\\\
  && pnpm format \\\\
  && pnpm lint \\\\
  && pnpm type-check \\\\
  && pnpm test \\\\
  && pnpm build

STEP 8 — Manual smoke:
- pnpm dev:examples → Next.js example.
- Flip OS to light mode → widget panel is light; bubbles/chips/composer read as a coherent light surface.
- Flip OS to dark mode → widget re-themes to dark without reload.
- Set \`body { --brw-accent: hotpink; }\` in the example global CSS → send button + AI toggle active dot switch to hotpink on next mount (or immediately if the widget is already open).
- Open the widget, type a multi-line message (Shift+Enter x4), verify the shell grows, send button stays at bottom.

STEP 9 — Commit and PR:
git add -A
git commit -m 'feat(react): light/dark theming + composer shell polish (#30)'
git push -u origin feat/issue-30-theming
gh pr create --title 'feat(react): light/dark theming + composer shell polish' --body \"\$(cat <<'PREOF'
Closes #30

Implements [SDD § 12 Client SDK contracts](https://github.com/tatlacas-com/brevwick-ops/blob/main/docs/brevwick-sdd.md#12-client-sdk-contracts).

## Summary
- Introduce \`--brw-*\` CSS custom-property token set (surfaces, text, border, accent, shadow)
- Light defaults; \`@media (prefers-color-scheme: dark)\` override swaps the palette
- Host override: any ancestor setting \`--brw-accent\` (etc.) re-themes the widget with no rebuild
- Composer children wrapped in a rounded shell with \`:focus-within\` ring — reads as a single input affordance
- Multiline textarea retains 1–5 row autogrow; send button bottom-aligned when rows > 1
- No new dependencies; no public API change (props / hooks / payload unchanged)

## Bundle size
- React entry gzipped: <ISSUE_SIZE> B — under the 25 kB budget
- SDK core chunk unchanged

## Test plan
- [ ] Send button colour follows \`--brw-accent\` via getComputedStyle
- [ ] Dark-mode matchMedia stub swaps panel background token value
- [ ] Composer \`:focus-within\` lights \`--brw-border-focus\`
- [ ] Multiline autogrow preserved
- [ ] vitest-axe clean in both light + dark
- [ ] Manual: OS-theme flip re-themes without reload; \`--brw-accent: hotpink\` on host swaps accents
PREOF
)\"
"
```

---

## TIER 1 — After WT-B merges

---

### Worktree C: feat(react): clearer screenshot button + drag-to-select region capture (#31)

Replace the ambiguous camera icon, relabel the button, and add an overlay that lets the user drag a selection rectangle. On confirm, capture the full page via the existing `modern-screenshot` dynamic import, then crop client-side to the selection via canvas.

**Scope:** replace `CameraIcon` in `packages/react/src/feedback-button.tsx` with a monitor-plus-selection glyph; relabel `aria-label` to "Capture screenshot of this page"; new `<RegionCaptureOverlay />` component built on Radix Dialog (focus trap + escape handling + portal); pointer-event drag handlers (mouse + touch) producing a `{x, y, w, h}` selection in viewport coords; on confirm call `captureScreenshot()` and crop the Blob via `<canvas>` + `toBlob('image/png')`; fall-back "Capture full page" button on the overlay; new `brw-region-*` classes in `styles.ts` consuming existing `--brw-*` tokens from WT-B; tests mock `modern-screenshot` and assert crop math.

**Depends on:**

- **WT-B (#30)** merged — this worktree reuses the `--brw-*` tokens and composer shell introduced there. Starting in parallel would guarantee merge conflicts on `feedback-button.tsx` + `styles.ts`.

**Blocks:** none.

**Can run in parallel with:** nothing else in this initiative (WT-A is probably already merged; if not, still fine — disjoint files).

```bash
# Verify prerequisite.
gh pr list --repo tatlacas-com/brevwick-sdk-js --state merged --search 'composer shell polish' --limit 5
# Do not start until #30 is merged.

cd /home/tatlacas/repos/brevwick/brevwick-sdk-js
git fetch origin
git worktree add ../brevwick-sdk-js-wt-screenshot-ux -b feat/issue-31-screenshot-ux origin/main
cd ../brevwick-sdk-js-wt-screenshot-ux

claude --dangerously-skip-permissions "
You are adding a clearer screenshot button + drag-to-select region overlay. Your task is GitHub issue #31 on tatlacas-com/brevwick-sdk-js.

THIS REPO: \$(pwd)

STEP 1 — Read project context:
- Read CLAUDE.md — React bundle budget (≤ 25 kB gzip), no new runtime deps, no Co-Authored-By, reduced-motion support.
- Run: gh api repos/tatlacas-com/brevwick-sdk-js/issues/31 --jq '.body'
- Read: packages/react/src/feedback-button.tsx (CameraIcon around line 966, Composer around line 756, the screenshot button around 800-810, handleCaptureScreenshot around 267, screenshot state / setScreenshot around line 162), packages/react/src/styles.ts (the --brw-* tokens + brw-composer-shell rule from #30), packages/sdk/src/core/client.ts (captureScreenshot eager wrapper), packages/sdk/src/screenshot.ts (dynamic-imported Blob returner), packages/sdk/src/types.ts (CaptureScreenshotOptions).
- Fetch SDD § 12 captureScreenshot contract:
  gh api repos/tatlacas-com/brevwick-ops/contents/docs/brevwick-sdd.md --jq '.content' | base64 -d | sed -n '/captureScreenshot/,/^##/p' | head -80

STEP 2 — Icon + aria swap (packages/react/src/feedback-button.tsx):
- Replace CameraIcon with ScreenshotIcon (same inline SVG component pattern as the other icons in this file):
  * Outer rounded rect (the monitor): <rect x='3' y='5' width='18' height='12' rx='2' />
  * Inner dashed selection rect: <rect x='7' y='8' width='10' height='6' rx='1' stroke-dasharray='2 2' />
  * Keep stroke='currentColor' fill='none' strokeWidth='2' strokeLinecap='round' — matches siblings.
- Update the button aria-label from 'Attach screenshot' to 'Capture screenshot of this page'.
- Keep the button's wrapper class and placement identical (first child of brw-composer-shell); no layout change.

STEP 3 — Region capture overlay component (packages/react/src/feedback-button.tsx, keep it local — do NOT create a new file unless feedback-button.tsx exceeds ~1200 lines after this work):
- <RegionCaptureOverlay open onClose onConfirmRegion onConfirmFull />:
  * Radix Dialog.Root controlling overlay-open; Dialog.Portal to document.body; Dialog.Content as the full-viewport surface with data-brevwick-skip=\"\" so the existing screenshot path excludes it from capture.
  * Dimmed backdrop via a separate Dialog.Overlay (fixed inset 0, rgba(0,0,0,0.35)), also data-brevwick-skip.
  * A transparent capture layer that owns the pointer handlers.
- Pointer handlers (onPointerDown, onPointerMove, onPointerUp):
  * Use pointer events for mouse + touch unification.
  * Track selection as { startX, startY, x, y, w, h } in viewport coords.
  * Render a div with position: fixed + left/top/width/height matching the current rectangle, class brw-region-selection (visible outline using --brw-border-focus).
  * Escape: abort (call onClose).
  * Enter on focused overlay or click 'Capture': call onConfirmRegion({ x, y, w, h }) IF the rectangle is non-degenerate (w > 2 && h > 2); otherwise visual shake.
  * 'Capture full page' button: call onConfirmFull().

STEP 4 — Confirm + crop pipeline (in handleCaptureScreenshot replacement):
- On screenshot-button click: open the overlay (setRegionOpen(true)), do NOT capture immediately.
- onConfirmRegion(region):
  1. setRegionOpen(false) — unmount overlay BEFORE capture so it is not in the rendered DOM. (data-brevwick-skip is belt-and-braces, but unmounting is cleaner.)
  2. Call captureScreenshot() (the existing SDK method) — returns a full-page Blob.
  3. Load the Blob into an Image via URL.createObjectURL, await its 'load' event.
  4. Create an OffscreenCanvas (or regular <canvas> if OffscreenCanvas is absent — feature-detect) sized region.w × region.h.
  5. ctx.drawImage(img, region.x * dpr, region.y * dpr, region.w * dpr, region.h * dpr, 0, 0, region.w, region.h) — account for devicePixelRatio; the captured Blob is in device pixels.
  6. canvas.toBlob('image/png') → hand the cropped Blob to setScreenshot({ blob, url }) exactly as the current handleCaptureScreenshot does.
  7. URL.revokeObjectURL on the intermediate URL.
- onConfirmFull(): identical to the current handleCaptureScreenshot (no cropping).
- All try/catch branches keep the existing 'setSubmitError(message)' fallback.

STEP 5 — Styles (packages/react/src/styles.ts):
- Add classes:
  * .brw-region-backdrop { position: fixed; inset: 0; background: rgba(0,0,0,0.35); }
  * .brw-region-layer { position: fixed; inset: 0; cursor: crosshair; user-select: none; }
  * .brw-region-selection { position: fixed; border: 2px solid var(--brw-border-focus); box-shadow: 0 0 0 9999px rgba(0,0,0,0.35); pointer-events: none; }
  * .brw-region-controls { position: fixed; bottom: 16px; left: 50%; transform: translateX(-50%); display: flex; gap: 8px; }
  * .brw-region-btn — reuse .brw-btn tokens for styling.
- @media (prefers-reduced-motion: reduce): no transitions / animations on any brw-region-* rule.

STEP 6 — SDK surface:
- captureScreenshot() contract unchanged — the crop is pure React-side work on top. DO NOT add a { region } option to the SDK in this PR; if a vanilla consumer asks for it, that's a follow-up. Keep the surface tight.

STEP 7 — Tests (packages/react/src/__tests__/feedback-button.test.tsx):
- New cases:
  * Button click opens the overlay (assert data-brevwick-region-open='true' or equivalent marker on the portal).
  * Escape dismisses the overlay (focus returns to the screenshot button).
  * Pointer-down → move → pointer-up produces a visible selection rectangle (assert getBoundingClientRect on .brw-region-selection matches the drag distances within ±1 px).
  * Confirm region → mocked captureScreenshot returns a 200×100 canvas-backed Blob; the cropped Blob setScreenshot receives has the expected w × h (use a canvas mock that round-trips drawImage parameters).
  * 'Capture full page' button yields the uncropped Blob.
  * Overlay is NOT present in the rendered DOM at the moment captureScreenshot is awaited (assert by asserting a marker node is removed before the mocked fetch resolves).
  * vitest-axe clean on (a) idle overlay, (b) mid-drag, (c) closed-back-to-composer states.
  * Degenerate selection (w ≤ 2 || h ≤ 2) on Enter → overlay stays open, no capture.

STEP 8 — Bundle budget:
- pnpm --filter brevwick-react build && pnpm --filter brevwick-react test
- React entry ≤ 25 kB gzip. The new overlay JSX + ~30 lines of pointer logic + crop helper should add < 2 kB gzipped. If over, audit for accidental inline SVG duplication.
- packages/sdk/src/__tests__/chunk-split.test.ts unchanged — this PR does NOT touch the SDK.

STEP 9 — CI gauntlet:
pnpm install \\\\
  && pnpm format \\\\
  && pnpm lint \\\\
  && pnpm type-check \\\\
  && pnpm test \\\\
  && pnpm build

STEP 10 — Manual smoke (desktop + mobile):
- pnpm dev:examples → Next.js example.
- Desktop: click screenshot button → overlay opens with crosshair cursor → drag a rectangle → 'Capture' → thumbnail in the composer matches the selection → submit → network tab shows a cropped image uploaded.
- Mobile (DevTools emulation touch): tap-drag produces a selection; 'Capture' works.
- Reduced-motion: set prefers-reduced-motion in DevTools rendering, verify no animation on overlay mount.
- 'Capture full page' button still yields a full-page screenshot unchanged from the pre-#31 behaviour.

STEP 11 — Commit and PR:
git add -A
git commit -m 'feat(react): screenshot icon + drag-to-select region capture (#31)'
git push -u origin feat/issue-31-screenshot-ux
gh pr create --title 'feat(react): screenshot icon + drag-to-select region capture' --body \"\$(cat <<'PREOF'
Closes #31

Depends on: #30 (composer shell + --brw-* tokens this PR reuses).

Implements [SDD § 12 captureScreenshot](https://github.com/tatlacas-com/brevwick-ops/blob/main/docs/brevwick-sdd.md#12-client-sdk-contracts).

## Summary
- CameraIcon swapped for a monitor-plus-selection glyph; aria-label now 'Capture screenshot of this page'
- Clicking the screenshot button opens a full-viewport overlay instead of immediate capture
- User drags a rectangle (pointer events — mouse + touch); Escape aborts; Enter or 'Capture' confirms
- Confirm → existing captureScreenshot() runs (overlay unmounted + data-brevwick-skip), cropped client-side via canvas to the selection rectangle, handed to the composer through the existing screenshot slot
- 'Capture full page' button preserves the pre-#31 behaviour
- Reduced-motion respected; focus trap via Radix Dialog; focus restored on close
- No SDK surface change; no new runtime dependency

## Bundle size
- React entry gzipped: <ISSUE_SIZE> B — under the 25 kB budget
- SDK core chunk untouched

## Test plan
- [ ] Overlay opens on click; Escape dismisses
- [ ] Drag produces visible selection rectangle; crop math matches drag coords
- [ ] Confirm region → cropped Blob of expected dimensions lands in composer (mocked captureScreenshot)
- [ ] Capture full page → uncropped Blob unchanged from prior behaviour
- [ ] Overlay DOM is absent during captureScreenshot await (mock timing assertion)
- [ ] Degenerate selection rejected (no capture)
- [ ] vitest-axe clean across idle / mid-drag / post-capture
- [ ] Manual: desktop + mobile + prefers-reduced-motion
PREOF
)\"
"
```

---

## Parallel execution cheat sheet

- **At T+0:** WT-A (#29) and WT-B (#30) start in parallel. Disjoint files; independent reviews.
- **When WT-B merges:** WT-C (#31) branches from `origin/main` and starts. Reuses the themed composer + tokens.
- **WT-A cadence is independent** — the SDK fix can ship any time, blocking nothing in this repo (users on older SDK versions keep hitting the 409, so land it first if review bandwidth is scarce).
- **Cross-repo:** WT-A opens a paired `brevwick-ops` PR updating SDD § 7 presign-request example. Neither side merges until both are green.
