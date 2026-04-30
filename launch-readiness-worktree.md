# brevwick-sdk-js launch-readiness Worktrees

8 issues across 5 worktrees in 1 tier. WT-sdk-docs-launch bundles the 4 docs/examples issues (#60 + #61 + #62 + #63) into one PR because they share README slots. Each of the 4 adapter packages (#64 Vue, #65 Svelte, #66 Solid, #67 Angular) is its own worktree because each is a meaningful new package with distinct API surface, build pipeline, and review surface — bundling all 4 into one PR would be 3000+ lines of largely independent code.

All 5 worktrees can run in parallel from T+0; conflicts on shared workspace-level files (`pnpm-workspace.yaml`, `.size-limit.js`, root `README.md`, possibly the CI matrix) are append-only and merge cleanly with rebase.

**Key references:**

- `CLAUDE.md` (this repo) — pnpm workspace publishing two npm packages (`@tatlacas/brevwick-sdk` core, `@tatlacas/brevwick-react` adapter); bundle budget DO NOT EXCEED (core ≤ 2.2 kB gzip, on-open ≤ 25 kB gzip); redaction mandatory; lockstep versioning; squash-merge only; no Co-Authored-By
- [SDD § 12 SDK contracts](https://github.com/tatlacas-com/brevwick-ops/blob/main/docs/brevwick-sdd.md#12-sdk-contracts) — public API contract every adapter must satisfy
- Plan document: `/home/tatlacas/.claude/plans/integrations-are-now-landing-velvet-barto.md`
- Docs / examples issues: [#60](https://github.com/tatlacas-com/brevwick-sdk-js/issues/60) Vite-React + CRA, [#61](https://github.com/tatlacas-com/brevwick-sdk-js/issues/61) Remix, [#62](https://github.com/tatlacas-com/brevwick-sdk-js/issues/62) Astro, [#63](https://github.com/tatlacas-com/brevwick-sdk-js/issues/63) Vanilla JS elevation
- Adapter package issues: [#64](https://github.com/tatlacas-com/brevwick-sdk-js/issues/64) Vue, [#65](https://github.com/tatlacas-com/brevwick-sdk-js/issues/65) Svelte, [#66](https://github.com/tatlacas-com/brevwick-sdk-js/issues/66) Solid, [#67](https://github.com/tatlacas-com/brevwick-sdk-js/issues/67) Angular
- Existing reference packages to mirror: `packages/react/` (most direct template for Vue/Svelte/Solid), `packages/sdk/` (core)
- Existing example apps to mirror: `examples/next/`, `examples/vanilla/`
- Companion follow-up after each adapter merges: small brevwick-web PR flipping `src/features/sdk-guides/registry.ts` entry from `coming-soon` to `shipped`

**Conventions (apply to every worktree):**

- pnpm workspace; tsup builds; vitest tests; size-limit enforces bundle budget
- Bundle budget DO NOT EXCEED — every change runs `__tests__/chunk-split.test.ts` + size-limit
- `sideEffects: false` in both packages
- Hand-written mocks (function-field style); no mocking frameworks
- Redaction mandatory — every payload through `redact()` before leaving device; new context fields ship with redaction tests
- Conventional commits, subject ≤ 72 chars; `docs:` prefix for these issues
- **No Co-Authored-By headers** anywhere
- CI gauntlet green locally before push: `pnpm install --frozen-lockfile && pnpm lint && pnpm type-check && pnpm test && pnpm build`
- Squash-merge into `main` only
- **Do not remove worktrees** — the user cleans them up

---

## Grouping rationale (why 5 worktrees)

**Bundle the 4 docs/examples issues into 1 worktree (WT-sdk-docs-launch)** because:

- LR-J-1 / LR-J-2 / LR-J-3 all edit `packages/react/README.md` — concurrent PRs would conflict on the same README sections.
- LR-J-4 edits `packages/sdk/README.md` — disjoint from above, but shares the example-app workspace pattern.
- All 4 add an `examples/<framework>/` directory; concurrent PRs could conflict on the workspace globs.
- Reviewers reading them in order get the full "what frameworks does the SDK officially support now" picture in one diff.

**Split each adapter into its own worktree (4 separate worktrees)** because:

- Each adapter is a meaningful new npm-publishable package with distinct API surface (`BrevwickPlugin` for Vue vs `setBrevwickContext` for Svelte vs `<BrevwickProvider>` for Solid vs `provideBrevwick` + `BrevwickService` for Angular).
- Each has its own bundle budget, redaction tests, SSR-safe component code — none copy-paste from another.
- Angular uses `ng-packagr` (Angular Package Format compliance) — a fundamentally different build pipeline from the other three's `tsup`.
- Bundling all 4 into one PR would be 3000+ lines of largely independent code; reviewers would lose detail. Per-adapter PRs let reviewers assess each on its merits.

**Shared-file conflict surface across all 5 worktrees** (`pnpm-workspace.yaml`, `.size-limit.js`, root `README.md`, possibly `.github/workflows/ci.yml`): conflicts are append-only (each worktree adds entries); merge cleanly with rebase. Whichever PR lands first sets the precedent; subsequent PRs rebase and append. No structural conflicts expected.

Internal commits in WT-sdk-docs-launch stay split per-framework so the squash-merge captures the full breakdown in the commit message footer.

---

## Dependency map

```
TIER 0 — Parallel from T+0 (5 parallel)
  WT-sdk-docs-launch:        #60 + #61 + #62 + #63 bundled (single PR)
                              - shared-file conflict surface: packages/{sdk,react}/README.md,
                                pnpm-workspace.yaml, root README.md
  WT-sdk-vue-adapter:        #64  full @tatlacas/brevwick-vue package (tsup)
                              - shared-file conflicts: pnpm-workspace.yaml, .size-limit.js,
                                root README.md
  WT-sdk-svelte-adapter:     #65  full @tatlacas/brevwick-svelte package (svelte-package)
                              - same shared-file conflicts
  WT-sdk-solid-adapter:      #66  full @tatlacas/brevwick-solid package (tsup + Solid JSX preset)
                              - same shared-file conflicts
  WT-sdk-angular-adapter:    #67  full @tatlacas/brevwick-angular package (ng-packagr)
                              - same shared-file conflicts + root package.json build script
                                may need adjustment for ng-packagr invocation
```

Worktrees live at `/home/tatlacas/repos/brevwick/brevwick-sdk-js-wt-launch-readiness-{docs,vue,svelte,solid,angular}`.

Each adapter PR concludes with a one-line companion PR in `brevwick-web` that flips the registry entry from `coming-soon` to `shipped`. Companion PRs are small enough to be follow-up commits, NOT separate worktrees.

---

## TIER 0

---

### Worktree sdk-docs-launch: Vite-React + CRA + Remix + Astro guides + Vanilla JS elevation (#60 + #61 + #62 + #63)

Lands the four shippable docs/examples PRs as one bundle. Each issue's scope is documented in its issue body — this prompt drives the integration of all four into a single PR.

**Scope:**

- `packages/react/README.md` — new sections "Plain React (Vite + CRA)", "Remix", "Astro (React island)"; each section follows the template established by the existing Next.js section (install command, provider wiring, env-var convention, SSR-safety note, verify-in-dashboard final step)
- `packages/sdk/README.md` — promote vanilla JS / `<script>` tag include to top of "Getting started"; add CDN snippet (esm.sh / unpkg / jsdelivr); add no-build-tool ESM snippet; canonical `<button>`-driven submit example
- New `examples/vite-react/` — minimal Vite + React 19 app (mirror `examples/next/` shape)
- New `examples/cra/` — minimal CRA scaffold; README notes "CRA is in maintenance mode" honestly
- New `examples/remix/` — minimal Remix app with provider in `root.tsx` + client-only mounting
- New `examples/astro/` — minimal Astro app with `<BrevwickIsland client:load />` in base layout
- Refresh `examples/vanilla/` — split into `examples/vanilla/vite/` (existing) + `examples/vanilla/static/` (new no-bundler `<script>` tag-only example)
- Update `pnpm-workspace.yaml` if `examples/*` isn't already globbed

**Depends on:** none.
**Blocks:** none.
**Can run in parallel with:** every other launch-readiness worktree across all repos.

```bash
cd /home/tatlacas/repos/brevwick/brevwick-sdk-js
git fetch origin
git worktree add ../brevwick-sdk-js-wt-launch-readiness -b docs/launch-readiness-bundle origin/main
cd ../brevwick-sdk-js-wt-launch-readiness

claude --dangerously-skip-permissions "
You are landing the launch-readiness SDK docs + examples bundle for brevwick-sdk-js. The bundle covers four shippable GitHub issues (#60, #61, #62, #63) in one PR.

THIS REPO: \$(pwd)

STEP 1 — Read project context:
- Read CLAUDE.md fully — bundle budget DO NOT EXCEED, redaction mandatory, lockstep versioning, no Co-Authored-By.
- Run: gh api repos/tatlacas-com/brevwick-sdk-js/issues/60 --jq '.body' (Vite-React + CRA)
- Run: gh api repos/tatlacas-com/brevwick-sdk-js/issues/61 --jq '.body' (Remix)
- Run: gh api repos/tatlacas-com/brevwick-sdk-js/issues/62 --jq '.body' (Astro)
- Run: gh api repos/tatlacas-com/brevwick-sdk-js/issues/63 --jq '.body' (Vanilla JS elevation)
- Read the plan: /home/tatlacas/.claude/plans/integrations-are-now-landing-velvet-barto.md
- Read existing READMEs: packages/sdk/README.md and packages/react/README.md fully — match tone, section depth, snippet style.
- Read existing examples: examples/next/ and examples/vanilla/ end-to-end. The new examples mirror their shape (package.json layout, configured-widget.tsx pattern, README structure, .env.example, .gitignore).
- Read packages/sdk/src/index.ts and packages/react/src/index.ts to confirm the public API surface you're documenting actually exists at HEAD.
- Read pnpm-workspace.yaml to confirm whether examples/* is already globbed.

STEP 2 — Plain React + CRA (#60):
- Add 'Plain React (Vite + CRA)' section to packages/react/README.md (after the Next.js section, before any 'API' or 'Theming' sections — pick the natural slot). Cover:
  - Install command (pnpm add @tatlacas/brevwick-react @tatlacas/brevwick-sdk modern-screenshot)
  - Vite env-var convention: VITE_BREVWICK_PROJECT_KEY (read via import.meta.env.VITE_*)
  - CRA env-var convention: REACT_APP_BREVWICK_PROJECT_KEY (read via process.env.REACT_APP_*)
  - Provider wiring snippet (app root)
  - <FeedbackButton/> placement
  - SSR-safety note (irrelevant for SPA but noted for completeness)
- New examples/vite-react/ — minimal Vite + React 19 app:
  - package.json with @tatlacas/brevwick-react + @tatlacas/brevwick-sdk + modern-screenshot from workspace
  - vite.config.ts with @vitejs/plugin-react
  - src/main.tsx, src/App.tsx, src/configured-widget.tsx (mirror examples/next/src/app/configured-widget.tsx pattern)
  - README.md showing 'pnpm install && pnpm dev' instructions
  - .env.example with VITE_BREVWICK_PROJECT_KEY=pk_test_demo
  - .gitignore
- New examples/cra/ — minimal CRA scaffold:
  - package.json with react-scripts (latest), @tatlacas/brevwick-react, etc.
  - src/index.tsx, src/App.tsx, src/configured-widget.tsx
  - README.md explicitly noting 'CRA is in maintenance mode; new projects should prefer Vite. This example is provided for compatibility.'
  - .env.example with REACT_APP_BREVWICK_PROJECT_KEY=pk_test_demo
- Verify both build: pnpm --filter examples/vite-react build && pnpm --filter examples/cra build (CRA won't have a pnpm filter unless you list it explicitly in the workspace; sanity-check).

Commit: 'docs(react): add Vite-React + CRA install guide + examples (#60)'

STEP 3 — Remix (#61):
- Add 'Remix' section to packages/react/README.md after the Plain React section. Cover:
  - Install command
  - Provider wiring in app/root.tsx (must be inside <html>/<body> tree; see Remix docs for how)
  - Client-only mounting note: the FAB needs window — use Remix's client-only patterns or guard with useEffect
  - Env-var convention (Remix's process.env.* on server / window.__remixContext on client; or whichever pattern the latest Remix recommends — verify)
- New examples/remix/ — minimal Remix app:
  - package.json with @tatlacas/brevwick-react etc.
  - app/root.tsx with provider (client-only or guarded)
  - app/entry.client.tsx
  - app/routes/_index.tsx with a button that triggers a manual submit (demonstrates useFeedback)
  - README.md
  - .env.example
- Verify build.

Commit: 'docs(react): add Remix install guide + examples/remix app (#61)'

STEP 4 — Astro (#62):
- Add 'Astro (React island)' section to packages/react/README.md after the Remix section. Cover:
  - Install command
  - Astro islands architecture explainer (one paragraph)
  - <BrevwickIsland client:load /> mounting pattern in the base Astro layout
  - Env-var convention: PUBLIC_BREVWICK_PROJECT_KEY (Astro's PUBLIC_* prefix for client-exposed)
  - Note: the FAB renders only on client-hydrated routes; static-only routes won't show it
- New examples/astro/ — minimal Astro app:
  - package.json with @astrojs/react integration
  - astro.config.mjs with React integration enabled
  - src/layouts/Layout.astro with <BrevwickIsland client:load />
  - src/components/BrevwickIsland.tsx — wraps BrevwickProvider + FeedbackButton
  - src/pages/index.astro
  - README.md
  - .env.example
- Verify build.

Commit: 'docs(react): add Astro install guide + examples/astro app (#62)'

STEP 5 — Vanilla JS elevation (#63):
- Refresh packages/sdk/README.md:
  - Promote vanilla JS / <script> tag include to top of 'Getting started' (above any framework-specific snippets).
  - Add CDN snippet using whichever public CDN distributes the package — verify by checking npm view @tatlacas/brevwick-sdk dist or trying esm.sh/unpkg/jsdelivr URLs. Use the one that resolves cleanly at PR time.
  - Add no-build-tool ESM snippet using esm.sh:
    <script type='module'>
      import { createBrevwick } from 'https://esm.sh/@tatlacas/brevwick-sdk';
      const bw = createBrevwick({ projectKey: 'pk_test_...' });
      bw.install();
      // optional: button-driven submit
      document.getElementById('feedback-btn').addEventListener('click', () => bw.submit({...}));
    </script>
  - Add canonical <button>-driven submit example for sites without a feedback FAB.
- Refresh examples/vanilla/:
  - Bring up to current core SDK API (verify against packages/sdk/src/index.ts).
  - Split into examples/vanilla/vite/ (existing Vite version preserved) + examples/vanilla/static/ (new no-bundler example with index.html + script tag include).
  - Both have their own README.md.
- Verify static example serves over python -m http.server 8080 with the FAB working (manually).

Commit: 'docs(sdk): elevate vanilla-JS install — README + examples/vanilla refresh + script CDN (#63)'

STEP 6 — Run the full CI gauntlet:
pnpm install --frozen-lockfile
pnpm lint
pnpm type-check
pnpm test
pnpm build
- All examples build cleanly.
- size-limit + __tests__/chunk-split.test.ts unchanged (this PR adds zero runtime code; budget unchanged).
- If any step fails, fix root cause and re-run from clean.

STEP 7 — Push + open PR:
git push -u origin docs/launch-readiness-bundle
gh pr create --title 'docs(sdk): launch-readiness — Vite-React/CRA + Remix + Astro + vanilla-JS' --body \"\$(cat <<'PREOF'
Closes #60
Closes #61
Closes #62
Closes #63

Bundles four launch-readiness docs/examples issues into one PR. README sections in packages/{sdk,react}/README.md are touched concurrently; splitting per-framework would conflict on README slots and on the workspace package list. See issue bodies for per-framework scope and acceptance criteria.

Implements the launch-readiness initiative scope captured in /home/tatlacas/.claude/plans/integrations-are-now-landing-velvet-barto.md.

## Summary
- packages/react/README.md: new sections for Plain React (Vite + CRA), Remix, Astro
- packages/sdk/README.md: vanilla-JS elevated to top of Getting started; CDN + ESM snippets; <button>-driven submit
- New examples: examples/vite-react, examples/cra, examples/remix, examples/astro, examples/vanilla/static (split out from existing examples/vanilla)
- Bundle budget unchanged — this PR adds zero runtime code

## Out of scope (intentional — see plan doc)
- Vue/Svelte/Solid/Angular adapter packages — tracked separately as #64-#67; the brevwick-web framework registry surfaces them as 'coming-soon' tiles
- Any change to public API surface in packages/{sdk,react}/src/

## Test plan
- [ ] CI gauntlet green: pnpm install --frozen-lockfile && pnpm lint && pnpm type-check && pnpm test && pnpm build
- [ ] Bundle budgets unchanged (size-limit + chunk-split test)
- [ ] Each example app builds cleanly + runs locally with the FAB on first paint
- [ ] No mention of Claude in commits, PR title, PR body, or code comments
- [ ] CDN snippet in packages/sdk/README.md resolves against the published version
PREOF
)\"
"
```

---

### Worktree sdk-vue-adapter: `@tatlacas/brevwick-vue` adapter package (#64)

Lands the full Vue 3 adapter package — `BrevwickPlugin` (Vue plugin via `app.use`), `<FeedbackButton>` SFC, `useFeedback` composable. SSR-safe. Bundle budget parallel to React adapter. Mirrors the structure of `packages/react/`.

**Scope:** new `packages/vue/` (package.json, src/index.ts, src/plugin.ts, src/composables/use-feedback.ts, src/components/feedback-button.vue, src/types.ts, src/internal/version.ts, tsup.config.ts with vue-plugin, README.md, tests for plugin/composable/component/redaction/chunk-split); new `examples/vue/` (Vue 3 + Vite minimal app); update `.size-limit.js` (eager ≤ 5 kB; bundled-import budget after first measurement); update root README; verify `pnpm-workspace.yaml` globs.

**Depends on:** none.
**Blocks:** none.
**Can run in parallel with:** all other launch-readiness worktrees.

```bash
cd /home/tatlacas/repos/brevwick/brevwick-sdk-js
git fetch origin
git worktree add ../brevwick-sdk-js-wt-launch-readiness-vue -b feat/issue-64-brevwick-vue origin/main
cd ../brevwick-sdk-js-wt-launch-readiness-vue

claude --dangerously-skip-permissions "
You are landing the @tatlacas/brevwick-vue adapter package. Your task is GitHub issue #64 on tatlacas-com/brevwick-sdk-js.

THIS REPO: \$(pwd)

STEP 1 — Read project context:
- Read CLAUDE.md fully — bundle budget DO NOT EXCEED, redaction mandatory, lockstep versioning, no Co-Authored-By.
- Run: gh api repos/tatlacas-com/brevwick-sdk-js/issues/64 --jq '.body'
- Read the plan: /home/tatlacas/.claude/plans/integrations-are-now-landing-velvet-barto.md.
- Read packages/react/ entirely — package.json, tsup.config.ts, src/index.ts, src/provider.tsx, src/components/feedback-button.tsx, src/use-feedback.ts, src/internal/version.ts, README.md, all __tests__/*. This is your most direct template; mirror structure + naming.
- Read packages/sdk/src/index.ts — confirm exports (createBrevwick + types) you'll re-export.
- Read examples/next/ for the example-app shape.

STEP 2 — Scaffold packages/vue/:
- mkdir -p packages/vue/src/{components,composables,internal,__tests__}
- packages/vue/package.json: name '@tatlacas/brevwick-vue'; version match packages/react/package.json; description; type 'module'; main 'dist/index.cjs'; module 'dist/index.js'; types 'dist/index.d.ts'; exports map ('.' default, './types' if needed); peerDependencies: '@tatlacas/brevwick-sdk' workspace:*, vue '>=3.4 <4', modern-screenshot optional; devDependencies: vue, @vitejs/plugin-vue, @vue/test-utils, jsdom, vitest, tsup, unplugin-vue or @rollup/plugin-vue (whichever is currently used); scripts: build, dev, test, lint; sideEffects false.
- packages/vue/tsup.config.ts: ESM + CJS + dts outputs; external: vue, @tatlacas/brevwick-sdk, modern-screenshot; use unplugin-vue (or rollup plugin) for SFC compilation. Mirror packages/react/tsup.config.ts.

STEP 3 — Implement public API:
- packages/vue/src/internal/version.ts: export const BREVWICK_VUE_VERSION = '__VERSION__'; (build-time replaced by tsup define).
- packages/vue/src/types.ts: re-export BrevwickConfig, FeedbackInput, SubmitResult, etc. from @tatlacas/brevwick-sdk; export type BrevwickPluginOptions extends BrevwickConfig.
- packages/vue/src/plugin.ts:
  import { App } from 'vue';
  import { createBrevwick, Brevwick } from '@tatlacas/brevwick-sdk';
  export const BREVWICK_INJECTION_KEY: InjectionKey<Brevwick> = Symbol('brevwick');
  export const BrevwickPlugin = {
    install(app: App, options: BrevwickPluginOptions) {
      if (typeof window !== 'undefined') {
        const sdk = createBrevwick(options);
        app.provide(BREVWICK_INJECTION_KEY, sdk);
      } else {
        // SSR no-op; client hydration re-installs
      }
    }
  };
- packages/vue/src/composables/use-feedback.ts:
  import { inject } from 'vue';
  import { BREVWICK_INJECTION_KEY } from '../plugin';
  export function useFeedback() {
    const sdk = inject(BREVWICK_INJECTION_KEY);
    if (!sdk) throw new Error('useFeedback() called outside BrevwickPlugin. Did you forget app.use(BrevwickPlugin, config)?');
    // return shape matching packages/react/use-feedback.ts: submit, status, etc.
  }
- packages/vue/src/components/feedback-button.vue: <script setup> using inject + onMounted to mount the FAB; lazy-import modern-screenshot on first click. Mirror the React adapter's component closely.
- packages/vue/src/index.ts: export plugin, composable, component, version, types.

STEP 4 — Tests:
- packages/vue/src/__tests__/plugin.test.ts: createApp + app.use(BrevwickPlugin, config) provides SDK; useFeedback returns expected shape; useFeedback throws outside plugin.
- packages/vue/src/__tests__/feedback-button.test.ts: @vue/test-utils mounts; click triggers screenshot dynamic-import; submit fires through SDK.
- packages/vue/src/__tests__/redaction.test.ts: every submit() payload runs through redact() — mock SDK, capture call args, assert no plain string fields bypass redaction.
- packages/vue/src/__tests__/chunk-split.test.ts: eager bundle ≤ 5 kB; modern-screenshot stays dynamic-imported.

STEP 5 — Bundle budget:
- Edit .size-limit.js: append entries for @tatlacas/brevwick-vue eager + bundled-import. Initial guess 5 kB eager / 25 kB bundled — adjust after first measurement.
- Run pnpm size-limit to confirm budget; if exceeded, investigate dynamic-import boundaries before raising.

STEP 6 — Example app:
- mkdir examples/vue
- examples/vue/package.json: dependencies @tatlacas/brevwick-vue workspace, @tatlacas/brevwick-sdk workspace, modern-screenshot, vue, @vitejs/plugin-vue; scripts dev/build/preview.
- examples/vue/vite.config.ts: vue plugin enabled.
- examples/vue/index.html, src/main.ts (createApp + app.use(BrevwickPlugin, config) + app.mount), src/App.vue (FeedbackButton + a button calling useFeedback), src/configured-widget.ts (env-var plumbing using import.meta.env.VITE_BREVWICK_PROJECT_KEY).
- examples/vue/README.md, .env.example, .gitignore.

STEP 7 — Workspace + CI:
- Verify pnpm-workspace.yaml has globs that catch packages/vue and examples/vue. If 'packages/*' and 'examples/*' globs exist, no edit needed.
- Update root README.md: add @tatlacas/brevwick-vue to the Packages list.
- Verify .github/workflows/ci.yml runs against the new package via pnpm -r.

STEP 8 — README:
- packages/vue/README.md: mirror packages/react/README.md structure section-for-section. Document plugin install, composable usage, FeedbackButton placement, theming via CSS custom properties (if applicable), SSR safety, Nuxt placement note.

STEP 9 — Verify:
pnpm install --frozen-lockfile
pnpm lint
pnpm type-check
pnpm test
pnpm build
pnpm size-limit
- All green. If any step fails, fix and re-run.

STEP 10 — Manual smoke:
- cd examples/vue && pnpm dev. Open localhost. Verify FAB renders. Click + submit. Confirm submission against the public Brevwick endpoint.

STEP 11 — Commit + PR:
git add -A
git commit -m 'feat(vue): @tatlacas/brevwick-vue adapter — plugin + FeedbackButton + useFeedback (#64)'
git push -u origin feat/issue-64-brevwick-vue
gh pr create --title 'feat(vue): @tatlacas/brevwick-vue adapter package' --body \"\$(cat <<'PREOF'
Closes #64

Implements the @tatlacas/brevwick-vue adapter package mirroring the @tatlacas/brevwick-react shape but using Vue 3 composition API + provide/inject. SSR-safe; bundle budget within envelope; redaction tests; example app builds + runs.

Implements [SDD § 12 SDK contracts](https://github.com/tatlacas-com/brevwick-ops/blob/main/docs/brevwick-sdd.md#12-sdk-contracts).

## Summary
- New packages/vue/ with BrevwickPlugin (app.use), useFeedback composable, FeedbackButton SFC, lockstep version
- SSR-safe via window guards in plugin install + onMounted in component
- Bundle budget: <eager-budget-actual> kB gzip eager / <bundled-budget-actual> kB gzip bundled-import (size-limit entries added)
- Redaction test asserts every submit() runs through redact()
- New examples/vue/ — Vue 3 + Vite minimal app
- Root README + workspace + CI all integrated

## Companion follow-up (after this merges)
Open a one-line PR in tatlacas-com/brevwick-web flipping src/features/sdk-guides/registry.ts Vue entry from status: 'coming-soon' to status: 'shipped' and removing the trackingIssueUrl field. Use this PR's README install snippets as the source for the registry's snippetTemplates.

## Test plan
- [ ] CI gauntlet green
- [ ] pnpm size-limit green
- [ ] examples/vue runs locally with FAB on first paint and submit round-trips
- [ ] useFeedback throws helpful error outside plugin context
- [ ] Redaction test passes
- [ ] No new dependencies in core or react packages
- [ ] No Co-Authored-By
PREOF
)\"
"
```

---

### Worktree sdk-svelte-adapter: `@tatlacas/brevwick-svelte` adapter package (#65)

Lands the Svelte adapter — `setBrevwickContext` (root-layout setter), `<FeedbackButton>` Svelte component, `getFeedback()` getter using Svelte context API. Build pipeline uses `svelte-package` (NOT tsup). SSR-safe. Bundle budget parallel to Vue adapter.

**Scope:** new `packages/svelte/` (package.json with svelte-package build, src/index.ts, src/context.ts, src/components/FeedbackButton.svelte, svelte.config.js, README.md, tests); new `examples/svelte/` (SvelteKit minimal app); `.size-limit.js` entries; root README; workspace + CI.

**Depends on:** none.
**Blocks:** none.
**Can run in parallel with:** all other launch-readiness worktrees.

```bash
cd /home/tatlacas/repos/brevwick/brevwick-sdk-js
git fetch origin
git worktree add ../brevwick-sdk-js-wt-launch-readiness-svelte -b feat/issue-65-brevwick-svelte origin/main
cd ../brevwick-sdk-js-wt-launch-readiness-svelte

claude --dangerously-skip-permissions "
You are landing the @tatlacas/brevwick-svelte adapter package. Your task is GitHub issue #65 on tatlacas-com/brevwick-sdk-js.

THIS REPO: \$(pwd)

STEP 1 — Read project context:
- Read CLAUDE.md fully.
- Run: gh api repos/tatlacas-com/brevwick-sdk-js/issues/65 --jq '.body'
- Read the plan: /home/tatlacas/.claude/plans/integrations-are-now-landing-velvet-barto.md.
- Read packages/react/ entirely as the API-shape reference.
- Read Svelte's official 'svelte-package' docs (svelte.dev/docs/kit/packaging) for the build pipeline.
- Decide on Svelte version range: target Svelte 5 (with runes) but support Svelte 4 if no API conflict; if conflict, peer dep '>=5'.

STEP 2 — Scaffold packages/svelte/:
- mkdir -p packages/svelte/src/{components,__tests__}
- packages/svelte/package.json: name '@tatlacas/brevwick-svelte'; lockstep version; type 'module'; svelte field pointing at dist/index.js; main, module, types as svelte-package emits; exports map per Svelte's package convention; peerDependencies @tatlacas/brevwick-sdk workspace:*, svelte '>=4 <6' (or '>=5' if Svelte 4 is incompatible); devDependencies @sveltejs/package, svelte, @testing-library/svelte, jsdom, vitest; scripts: build (svelte-package), test, lint.
- packages/svelte/svelte.config.js: configure preprocessors if needed; default for SFC-only output.

STEP 3 — Implement public API:
- packages/svelte/src/context.ts:
  import { setContext, getContext } from 'svelte';
  import { createBrevwick, type Brevwick, type BrevwickConfig } from '@tatlacas/brevwick-sdk';
  const BREVWICK_KEY = Symbol('brevwick');
  export function setBrevwickContext(config: BrevwickConfig): Brevwick | null {
    if (typeof window === 'undefined') return null; // SSR no-op
    const sdk = createBrevwick(config);
    setContext(BREVWICK_KEY, sdk);
    return sdk;
  }
  export function getFeedback() {
    const sdk = getContext<Brevwick>(BREVWICK_KEY);
    if (!sdk) throw new Error('getFeedback() called outside setBrevwickContext. Did you forget setBrevwickContext(config) in your root +layout.svelte?');
    // return shape matching React adapter: submit, status, etc.
  }
- packages/svelte/src/components/FeedbackButton.svelte:
  <script lang='ts'>
    import { onMount } from 'svelte';
    import { getFeedback } from '../context';
    let mounted = false;
    let sdk: ReturnType<typeof getFeedback> | null = null;
    onMount(() => {
      sdk = getFeedback();
      mounted = true;
    });
    async function onClick() {
      // lazy-import modern-screenshot
      // submit via sdk
    }
  </script>
  {#if mounted}<button on:click={onClick}>...</button>{/if}
- packages/svelte/src/index.ts: re-export setBrevwickContext, getFeedback, FeedbackButton, version, types.
- packages/svelte/src/internal/version.ts: BREVWICK_SVELTE_VERSION constant.

STEP 4 — Tests:
- packages/svelte/src/__tests__/context.test.ts: setBrevwickContext + getFeedback round-trip via component context; getFeedback throws outside context.
- packages/svelte/src/__tests__/feedback-button.test.ts: @testing-library/svelte renders, click triggers screenshot lazy-import, submits.
- packages/svelte/src/__tests__/redaction.test.ts: payload redaction.
- packages/svelte/src/__tests__/chunk-split.test.ts: eager budget; modern-screenshot stays dynamic.

STEP 5 — Bundle budget:
- .size-limit.js: append entries (eager ≤ 5 kB; bundled measured).

STEP 6 — Example app:
- mkdir examples/svelte
- examples/svelte: SvelteKit minimal app via 'pnpm create svelte@latest' equivalent (manually scaffold to keep it lean: package.json, svelte.config.js with adapter-static or adapter-auto, src/routes/+layout.svelte calling setBrevwickContext, src/routes/+page.svelte showing FeedbackButton, src/lib/configured-widget.ts).
- README.md, .env.example (PUBLIC_BREVWICK_PROJECT_KEY for SvelteKit's PUBLIC_ prefix on client-exposed vars).

STEP 7 — Workspace + CI:
- pnpm-workspace.yaml globs check.
- Root README append @tatlacas/brevwick-svelte.
- CI confirm.

STEP 8 — README:
- packages/svelte/README.md mirroring packages/react/README.md structure.

STEP 9 — Verify:
pnpm install --frozen-lockfile && pnpm lint && pnpm type-check && pnpm test && pnpm build && pnpm size-limit

STEP 10 — Manual smoke:
- cd examples/svelte && pnpm dev. Verify FAB renders. Click + submit.

STEP 11 — Commit + PR:
git add -A
git commit -m 'feat(svelte): @tatlacas/brevwick-svelte adapter — context + FeedbackButton + getFeedback (#65)'
git push -u origin feat/issue-65-brevwick-svelte
gh pr create --title 'feat(svelte): @tatlacas/brevwick-svelte adapter package' --body \"\$(cat <<'PREOF'
Closes #65

Implements the @tatlacas/brevwick-svelte adapter package using Svelte's context API. SSR-safe; bundle budget within envelope; redaction tests; SvelteKit example app builds + runs.

Implements [SDD § 12 SDK contracts](https://github.com/tatlacas-com/brevwick-ops/blob/main/docs/brevwick-sdd.md#12-sdk-contracts).

## Summary
- New packages/svelte/ with setBrevwickContext (root-layout setter), getFeedback (composable-style getter), FeedbackButton SFC
- Build via svelte-package (NOT tsup)
- SSR-safe via window guard in setBrevwickContext + onMount in FeedbackButton
- Bundle budget: <eager> kB eager / <bundled> kB bundled-import
- Redaction test passes
- New examples/svelte/ — SvelteKit minimal app

## Companion follow-up (after this merges)
Open a one-line PR in tatlacas-com/brevwick-web flipping src/features/sdk-guides/registry.ts Svelte entry from coming-soon to shipped.

## Test plan
- [ ] CI gauntlet green
- [ ] pnpm size-limit green
- [ ] examples/svelte renders FAB on first paint and submit round-trips
- [ ] getFeedback throws helpful error outside setBrevwickContext
- [ ] No Co-Authored-By
PREOF
)\"
"
```

---

### Worktree sdk-solid-adapter: `@tatlacas/brevwick-solid` adapter package (#66)

Lands the SolidJS adapter — `<BrevwickProvider>` Context provider, `<FeedbackButton>` Solid component, `useFeedback` hook. Mirrors React adapter's mental model since Solid's API is intentionally React-like, but compile-time reactivity changes the rendering boundary. SSR-safe via `Show when={isClient()}`.

**Scope:** new `packages/solid/` (package.json with Solid's exports convention, src/index.ts, src/provider.tsx, src/use-feedback.ts, src/components/feedback-button.tsx, tsup.config.ts with babel-preset-solid, README.md, tests); new `examples/solid/` (SolidStart minimal app); `.size-limit.js` entries; root README; workspace + CI.

**Depends on:** none.
**Blocks:** none.
**Can run in parallel with:** all other launch-readiness worktrees.

```bash
cd /home/tatlacas/repos/brevwick/brevwick-sdk-js
git fetch origin
git worktree add ../brevwick-sdk-js-wt-launch-readiness-solid -b feat/issue-66-brevwick-solid origin/main
cd ../brevwick-sdk-js-wt-launch-readiness-solid

claude --dangerously-skip-permissions "
You are landing the @tatlacas/brevwick-solid adapter package. Your task is GitHub issue #66 on tatlacas-com/brevwick-sdk-js.

THIS REPO: \$(pwd)

STEP 1 — Read project context:
- Read CLAUDE.md fully.
- Run: gh api repos/tatlacas-com/brevwick-sdk-js/issues/66 --jq '.body'
- Read the plan.
- Read packages/react/ as the API-shape reference (Solid mirrors React's mental model closely).
- Reference: solidjs.com docs for createContext, useContext, Show, lazy().
- Note: Solid packages need a 'solid' export-condition pointing at JSX-source for compile-time JSX transformation by consumers' bundlers. Mirror what other solid packages do (see solid-js/store package.json for reference).

STEP 2 — Scaffold packages/solid/:
- mkdir -p packages/solid/src/{components,__tests__}
- packages/solid/package.json: name '@tatlacas/brevwick-solid'; lockstep version; type 'module'; main 'dist/index.cjs'; module 'dist/index.js'; types 'dist/index.d.ts'; exports map with 'solid' condition pointing at unbuilt source for compile-time JSX transformation; peerDependencies @tatlacas/brevwick-sdk workspace:*, solid-js '>=1.8'; devDependencies @solidjs/testing-library, solid-js, jsdom, vitest, tsup, babel-preset-solid; scripts: build, test, lint.
- packages/solid/tsup.config.ts: esbuild + babel-preset-solid for JSX; ESM + CJS; dts; external solid-js, @tatlacas/brevwick-sdk, modern-screenshot.

STEP 3 — Implement public API:
- packages/solid/src/provider.tsx:
  import { createContext, useContext, ParentComponent, Show, createSignal, onMount } from 'solid-js';
  import { createBrevwick, type Brevwick, type BrevwickConfig } from '@tatlacas/brevwick-sdk';
  const BrevwickContext = createContext<Brevwick | null>(null);
  export const BrevwickProvider: ParentComponent<{ config: BrevwickConfig }> = (props) => {
    const [sdk, setSdk] = createSignal<Brevwick | null>(null);
    onMount(() => {
      if (typeof window !== 'undefined') {
        setSdk(createBrevwick(props.config));
      }
    });
    return <BrevwickContext.Provider value={sdk()}>{props.children}</BrevwickContext.Provider>;
  };
  export { BrevwickContext };
- packages/solid/src/use-feedback.ts:
  import { useContext } from 'solid-js';
  import { BrevwickContext } from './provider';
  export function useFeedback() {
    const sdk = useContext(BrevwickContext);
    if (!sdk) throw new Error('useFeedback() called outside BrevwickProvider...');
    // return shape matching React adapter
  }
- packages/solid/src/components/feedback-button.tsx:
  Component using useFeedback + lazy(() => import('modern-screenshot')) for the screenshot module.
- packages/solid/src/index.ts: re-export.
- packages/solid/src/internal/version.ts.

STEP 4 — Tests:
- packages/solid/src/__tests__/provider.test.tsx: @solidjs/testing-library; render BrevwickProvider; useFeedback returns SDK; throws outside provider.
- packages/solid/src/__tests__/feedback-button.test.tsx: renders, click triggers lazy-import, submits.
- packages/solid/src/__tests__/redaction.test.ts: redaction.
- packages/solid/src/__tests__/chunk-split.test.ts: eager budget.

STEP 5 — Bundle budget:
- .size-limit.js: append (eager ≤ 5 kB; bundled measured).

STEP 6 — Example app:
- mkdir examples/solid
- SolidStart minimal app (manually scaffolded; package.json with @solidjs/start, solid-js, @tatlacas/brevwick-solid workspace).
- src/app.tsx with <BrevwickProvider>; src/routes/index.tsx with <FeedbackButton>; src/configured-widget.ts.
- README.md, .env.example (Solid uses VITE_BREVWICK_PROJECT_KEY since SolidStart uses Vite).

STEP 7 — Workspace + CI: same checks.

STEP 8 — README mirroring react/.

STEP 9 — Verify CI gauntlet.

STEP 10 — Manual smoke: examples/solid pnpm dev.

STEP 11 — Commit + PR:
git add -A
git commit -m 'feat(solid): @tatlacas/brevwick-solid adapter — provider + FeedbackButton + useFeedback (#66)'
git push -u origin feat/issue-66-brevwick-solid
gh pr create --title 'feat(solid): @tatlacas/brevwick-solid adapter package' --body \"\$(cat <<'PREOF'
Closes #66

Implements the @tatlacas/brevwick-solid adapter package using Solid's createContext + signals. SSR-safe via Show + onMount. SolidStart example app builds + runs.

Implements [SDD § 12 SDK contracts](https://github.com/tatlacas-com/brevwick-ops/blob/main/docs/brevwick-sdd.md#12-sdk-contracts).

## Summary
- New packages/solid/ with BrevwickProvider, useFeedback, FeedbackButton
- 'solid' export condition for compile-time JSX transformation by consumers
- SSR-safe via createSignal + onMount window guard
- Bundle budget: <eager> / <bundled>
- Redaction test passes
- New examples/solid/ — SolidStart minimal app

## Companion follow-up (after this merges)
One-line PR in brevwick-web flipping registry Solid entry to shipped.

## Test plan
- [ ] CI gauntlet green
- [ ] pnpm size-limit green
- [ ] examples/solid renders FAB and submits round-trips
- [ ] useFeedback throws helpful error outside provider
- [ ] No Co-Authored-By
PREOF
)\"
"
```

---

### Worktree sdk-angular-adapter: `@tatlacas/brevwick-angular` adapter package (#67)

Lands the Angular 17+ standalone adapter — `provideBrevwick(config)` factory, `BrevwickService` (`@Injectable`), `<bw-feedback-button>` standalone component. **Build pipeline uses `ng-packagr` (Angular Package Format) — NOT tsup.** SSR-safe via `isPlatformBrowser`. Bundle budget meaningfully larger than other adapters (≤ 8 kB gzip eager vs ≤ 5 kB for tsup-based adapters) due to Angular's runtime overhead.

**Scope:** new `packages/angular/` (package.json + ng-package.json + tsconfig.lib.json + src/public-api.ts + lib/ with service, provider factory, standalone component, tests); new `examples/angular/` (Angular 17 standalone app); `.size-limit.js` entries; root README; workspace + CI; possibly root package.json build script adjustment for ng-packagr invocation.

**Depends on:** none.
**Blocks:** none.
**Can run in parallel with:** all other launch-readiness worktrees.

```bash
cd /home/tatlacas/repos/brevwick/brevwick-sdk-js
git fetch origin
git worktree add ../brevwick-sdk-js-wt-launch-readiness-angular -b feat/issue-67-brevwick-angular origin/main
cd ../brevwick-sdk-js-wt-launch-readiness-angular

claude --dangerously-skip-permissions "
You are landing the @tatlacas/brevwick-angular adapter package. Your task is GitHub issue #67 on tatlacas-com/brevwick-sdk-js. This is meaningfully different from the other adapters because Angular has its own packaging tool (ng-packagr) and DI patterns.

THIS REPO: \$(pwd)

STEP 1 — Read project context:
- Read CLAUDE.md fully.
- Run: gh api repos/tatlacas-com/brevwick-sdk-js/issues/67 --jq '.body'
- Read the plan.
- Read packages/react/ for the API-shape parallels (provider pattern → provideBrevwick; useFeedback → BrevwickService; FeedbackButton → bw-feedback-button standalone).
- Reference Angular Package Format: angular.dev/tools/libraries/angular-package-format. Read ng-packagr docs.
- Decide Angular floor: 17+ (Signals + standalone-only).

STEP 2 — Scaffold packages/angular/:
- mkdir -p packages/angular/src/lib/{components,internal,__tests__}
- packages/angular/package.json: name '@tatlacas/brevwick-angular'; lockstep version; sideEffects false; main, module, typings as ng-packagr emits to dist/; peerDependencies @tatlacas/brevwick-sdk workspace:*, @angular/core '>=17', @angular/common '>=17'; devDependencies @angular/core, @angular/common, @angular/compiler, @angular/compiler-cli, @angular/platform-browser, @angular/platform-browser-dynamic, ng-packagr, typescript (Angular-compatible), zone.js, jest or @angular/cli for test infra (or use TestBed with vitest if practical), tslib; scripts: build (ng-packagr -p ng-package.json), test, lint.
- packages/angular/ng-package.json:
  {
    \"\$schema\": \"./node_modules/ng-packagr/ng-package.schema.json\",
    \"dest\": \"dist\",
    \"lib\": { \"entryFile\": \"src/public-api.ts\" }
  }
- packages/angular/tsconfig.lib.json + tsconfig.lib.prod.json: standard Angular library tsconfigs.

STEP 3 — Implement public API:
- packages/angular/src/lib/internal/version.ts: BREVWICK_ANGULAR_VERSION constant.
- packages/angular/src/lib/brevwick.tokens.ts:
  import { InjectionToken } from '@angular/core';
  import type { BrevwickConfig } from '@tatlacas/brevwick-sdk';
  export const BREVWICK_CONFIG = new InjectionToken<BrevwickConfig>('BREVWICK_CONFIG');
- packages/angular/src/lib/brevwick.service.ts:
  import { Injectable, inject, PLATFORM_ID, signal } from '@angular/core';
  import { isPlatformBrowser } from '@angular/common';
  import { createBrevwick, type Brevwick } from '@tatlacas/brevwick-sdk';
  import { BREVWICK_CONFIG } from './brevwick.tokens';
  @Injectable({ providedIn: 'root' })
  export class BrevwickService {
    private platformId = inject(PLATFORM_ID);
    private config = inject(BREVWICK_CONFIG);
    private sdk: Brevwick | null = null;
    public status = signal<'idle' | 'submitting' | 'submitted' | 'error'>('idle');
    constructor() {
      if (isPlatformBrowser(this.platformId)) {
        this.sdk = createBrevwick(this.config);
      }
    }
    async submit(input: FeedbackInput) {
      if (!this.sdk) return; // SSR no-op
      this.status.set('submitting');
      const result = await this.sdk.submit(input);
      this.status.set(result.kind === 'ok' ? 'submitted' : 'error');
      return result;
    }
  }
- packages/angular/src/lib/provide-brevwick.ts:
  import { EnvironmentProviders, makeEnvironmentProviders } from '@angular/core';
  import type { BrevwickConfig } from '@tatlacas/brevwick-sdk';
  import { BREVWICK_CONFIG } from './brevwick.tokens';
  export function provideBrevwick(config: BrevwickConfig): EnvironmentProviders {
    return makeEnvironmentProviders([
      { provide: BREVWICK_CONFIG, useValue: config },
    ]);
  }
- packages/angular/src/lib/components/feedback-button.component.ts:
  Standalone component, selector 'bw-feedback-button', injects BrevwickService, lazy-loads modern-screenshot via dynamic import on click.
- packages/angular/src/public-api.ts: export { BrevwickService, provideBrevwick, BwFeedbackButtonComponent, BREVWICK_ANGULAR_VERSION, ...types };

STEP 4 — Tests:
- Use TestBed (Angular's test harness). vitest support is workable; alternatively jest + jest-preset-angular.
- packages/angular/src/lib/__tests__/brevwick.service.spec.ts: TestBed.configureTestingModule with provideBrevwick(config); inject(BrevwickService); call submit; assert status signal updates; SSR test by overriding PLATFORM_ID with 'server' — service is no-op.
- packages/angular/src/lib/__tests__/provide-brevwick.spec.ts: provider returns EnvironmentProviders that bootstrap correctly.
- packages/angular/src/lib/__tests__/feedback-button.component.spec.ts: TestBed renders standalone component; click triggers lazy-import; calls service.submit.
- redaction + chunk-split tests as before.

STEP 5 — Bundle budget:
- .size-limit.js: append (eager ≤ 8 kB — larger envelope per Angular's runtime overhead; bundled-import budget after first measurement).
- If actual measured size exceeds 8 kB, document the actual value in PR body and update README's bundle-size section honestly. Do NOT silently raise the budget.

STEP 6 — Example app:
- mkdir examples/angular
- Manually scaffold an Angular 17+ standalone app:
  - package.json with @angular/* peers, @tatlacas/brevwick-angular workspace, modern-screenshot
  - angular.json minimal config
  - tsconfig.json, tsconfig.app.json
  - src/main.ts with bootstrapApplication(AppComponent, { providers: [provideBrevwick({...})] })
  - src/app/app.component.ts standalone with imports: [BwFeedbackButtonComponent], template <bw-feedback-button />
  - src/environments/environment.ts + environment.prod.ts with PROJECT_KEY placeholder
- README.md.

STEP 7 — Workspace + CI:
- pnpm-workspace.yaml globs check.
- Root README append.
- Root package.json: verify build script runs each package's own build (e.g., 'pnpm -r --parallel build'). If the current root build script assumes tsup-only, adjust so each package's 'build' script is invoked. ng-packagr is invoked via the package's own 'build' script.
- .github/workflows/ci.yml: ensure 'pnpm -r build' covers Angular; if matrix-based, add Angular entry.

STEP 8 — README:
- packages/angular/README.md mirroring react/README.md but with provideBrevwick + BrevwickService + standalone component examples.

STEP 9 — Verify:
pnpm install --frozen-lockfile && pnpm lint && pnpm type-check && pnpm test && pnpm build && pnpm size-limit
- pnpm --filter @tatlacas/brevwick-angular build runs ng-packagr cleanly; produces fesm2022 + types.

STEP 10 — Manual smoke:
- cd examples/angular && pnpm start (or 'ng serve' if installed). Verify FAB renders. Click + submit.

STEP 11 — Commit + PR:
git add -A
git commit -m 'feat(angular): @tatlacas/brevwick-angular adapter — provideBrevwick + service + bw-feedback-button (#67)'
git push -u origin feat/issue-67-brevwick-angular
gh pr create --title 'feat(angular): @tatlacas/brevwick-angular adapter package' --body \"\$(cat <<'PREOF'
Closes #67

Implements the @tatlacas/brevwick-angular adapter package targeting Angular 17+ standalone-only with Signals reactivity. Build pipeline uses ng-packagr (Angular Package Format compliance) — divergent from the other adapters' tsup. SSR-safe via isPlatformBrowser. Angular 17 standalone example app builds + runs.

Implements [SDD § 12 SDK contracts](https://github.com/tatlacas-com/brevwick-ops/blob/main/docs/brevwick-sdd.md#12-sdk-contracts).

## Summary
- New packages/angular/ with provideBrevwick (EnvironmentProviders factory), BrevwickService (@Injectable providedIn root), BwFeedbackButtonComponent (standalone, selector bw-feedback-button)
- ng-packagr build pipeline producing fesm2022 + types per Angular Package Format
- SSR-safe via inject(PLATFORM_ID) + isPlatformBrowser
- Bundle budget eager: <actual> kB gzip (envelope was 8 kB; <if exceeded: justification + README update>)
- Redaction test passes
- New examples/angular/ — Angular 17 standalone app

## Build pipeline divergence
Angular adapter uses ng-packagr, not tsup. Root pnpm build script runs each package's own 'build' script so ng-packagr is invoked via packages/angular/package.json's build entry. No change needed to other packages' build flow.

## Companion follow-up (after this merges)
One-line PR in brevwick-web flipping registry Angular entry to shipped. Snippet templates from this PR's README (showing provideBrevwick + standalone-component imports + service injection).

## Test plan
- [ ] CI gauntlet green
- [ ] pnpm size-limit green (or actual size honestly documented if eager exceeds 8 kB)
- [ ] examples/angular renders FAB on first paint and submit round-trips
- [ ] BrevwickService no-ops when isPlatformBrowser is false (SSR test)
- [ ] No Co-Authored-By
PREOF
)\"
"
```

---

## Parallel execution cheat sheet

- **At T+0 (5 parallel):** WT-sdk-docs-launch + WT-sdk-vue-adapter + WT-sdk-svelte-adapter + WT-sdk-solid-adapter + WT-sdk-angular-adapter — all independent at the source-code level.
- **Shared-file conflicts** (`.size-limit.js`, root `README.md`, `pnpm-workspace.yaml` if globs need adjustment, possibly `.github/workflows/ci.yml`): append-only edits; whichever PR lands first sets precedent; subsequent PRs rebase + append. No structural conflicts expected. Reviewers should sanity-check the final state of `.size-limit.js` after all 5 land.
- **Cross-repo:** brevwick-web LR-W-3 (#176) ships the framework registry with snippet templates for ALL 10 frameworks. The four adapter entries default to `status: 'coming-soon'` with `trackingIssueUrl` pointing at #64-#67. Each adapter's PR concludes with a small follow-up PR in brevwick-web flipping its registry entry from `coming-soon` to `shipped` and removing the `trackingIssueUrl`. The follow-up PRs are NOT separate worktrees — open them as quick PRs after the adapter merges.
- **Lockstep versioning:** all packages move together (per CLAUDE.md). After the launch-readiness initiative ships, run a single Version Packages PR bumping every package to the launch version.
