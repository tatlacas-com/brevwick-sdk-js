# brevwick-sdk-js launch-readiness Worktrees

4 shippable issues across 1 worktree. Bundled into one PR because all four touch `packages/{sdk,react}/README.md` (shared README files) and add sibling `examples/*` directories that share a common workspace package list — splitting them per-framework would conflict on README sections and on the workspace `pnpm-workspace.yaml`.

Tracking-only issues #64 (Vue), #65 (Svelte), #66 (Solid), #67 (Angular) are NOT scripted in this file. They exist so the framework registry in `brevwick-web` (LR-W-3) has stable targets for `coming-soon` tiles. Each becomes its own initiative when the user spins it up.

**Key references:**

- `CLAUDE.md` (this repo) — pnpm workspace publishing two npm packages (`@tatlacas/brevwick-sdk` core, `@tatlacas/brevwick-react` adapter); bundle budget DO NOT EXCEED (core ≤ 2.2 kB gzip, on-open ≤ 25 kB gzip); redaction mandatory; lockstep versioning; squash-merge only; no Co-Authored-By
- [SDD § 12 SDK contracts](https://github.com/tatlacas-com/brevwick-ops/blob/main/docs/brevwick-sdd.md#12-sdk-contracts) — public API contract every adapter must satisfy
- Plan document: `/home/tatlacas/.claude/plans/integrations-are-now-landing-velvet-barto.md`
- Shippable issues: [#60](https://github.com/tatlacas-com/brevwick-sdk-js/issues/60) Vite-React + CRA, [#61](https://github.com/tatlacas-com/brevwick-sdk-js/issues/61) Remix, [#62](https://github.com/tatlacas-com/brevwick-sdk-js/issues/62) Astro, [#63](https://github.com/tatlacas-com/brevwick-sdk-js/issues/63) Vanilla JS elevation
- Tracking-only issues (NOT in this worktree): [#64](https://github.com/tatlacas-com/brevwick-sdk-js/issues/64) Vue, [#65](https://github.com/tatlacas-com/brevwick-sdk-js/issues/65) Svelte, [#66](https://github.com/tatlacas-com/brevwick-sdk-js/issues/66) Solid, [#67](https://github.com/tatlacas-com/brevwick-sdk-js/issues/67) Angular
- Existing example apps to mirror: `examples/next/`, `examples/vanilla/`

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

## Grouping rationale (why 1 worktree)

LR-J-1 (Vite-React + CRA), LR-J-2 (Remix), LR-J-3 (Astro), LR-J-4 (Vanilla JS elevation) all do two things: edit one of the package READMEs (`packages/sdk/README.md` or `packages/react/README.md`) AND add an `examples/<framework>/` directory. Splitting per-framework would mean:

- Two of the four edit `packages/react/README.md` (LR-J-1, LR-J-2, LR-J-3) — concurrent PRs would conflict on the same README sections.
- All four add an `examples/*` directory and update `pnpm-workspace.yaml` if it doesn't already glob `examples/*` — concurrent PRs could conflict on the workspace file.
- Reviewers reading them in order get the full "what frameworks does the SDK officially support now" picture in one diff.

**One worktree, one PR titled `docs(sdk): launch-readiness — Vite-React/CRA + Remix + Astro guides + vanilla-JS elevation`.** Internal commits stay split per-framework so the squash-merge captures the full breakdown in the commit message footer.

---

## Dependency map

```
TIER 0 — Solo
  WT-sdk-docs-launch:  #60 + #61 + #62 + #63 bundled (single PR)
                       - depends on: nothing (all four are README + examples-only)
                       - blocks: nothing in this repo. brevwick-web LR-W-3 (#176)
                                 cites the SDK READMEs as the canonical source
                                 of truth — but LR-W-3 ships independently with
                                 the registry as the authority; this PR
                                 promotes the canonical wording into the SDK
                                 repo.
```

Worktree lives at `/home/tatlacas/repos/brevwick/brevwick-sdk-js-wt-launch-readiness`.

Tracking-only issues (#64, #65, #66, #67) are NOT in this dependency map. They are referenced from `brevwick-web`'s framework registry as `coming-soon` tiles; they do NOT block any launch-readiness work.

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

## Parallel execution cheat sheet

- **At T+0:** WT-sdk-docs-launch only. Runs in parallel with every brevwick-web and brevwick-ops launch-readiness worktree.
- **No tier dependencies.** This worktree is independent.
- **Cross-repo:** brevwick-web LR-W-3 (framework registry, issue #176) cites these SDK READMEs as the canonical source of truth, but does NOT block on this PR landing — the registry's snippets are independently maintained.
- **Tracking issues** (#64, #65, #66, #67) are NOT in this initiative; they exist for the framework registry's `coming-soon` flags. The user owns scheduling those adapter implementations as separate initiatives.
