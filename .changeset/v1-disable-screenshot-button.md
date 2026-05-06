---
'@tatlacas/brevwick-react': minor
'@tatlacas/brevwick-solid': minor
'@tatlacas/brevwick-vue': minor
'@tatlacas/brevwick-svelte': minor
'@tatlacas/brevwick-angular': minor
'@tatlacas/brevwick-react-native': minor
---

chore: disable v1 screenshot button across every adapter widget

Removes the screenshot button UI, region-overlay flow, and dead capture
state/handlers from the React, Solid, Vue, Svelte, Angular, and React
Native `FeedbackButton` components. The SDK-level `captureScreenshot()`
export and the `useFeedback().captureScreenshot` hook surface are
unchanged — only the in-widget UI affordance is gone, so consumers who
trigger captures programmatically (or via the Playwright real-browser
regression at `e2e/screenshot.spec.ts`) keep working.

Re-enable by reverting the disable commits and flipping the `.skip`
test blocks back; rationale and plan live in
`~/.claude/plans/i-just-tested-examples-generic-honey.md`.

Behavioural notes for adopters:

- Users no longer see a "Take screenshot" / region-capture button on
  the panel. Submitting feedback no longer attaches a screenshot
  unless the host app calls `captureScreenshot()` itself.
- Bundle budgets for every adapter shrink (e.g. React 22 kB → 9.97 kB
  gzip, Solid 5 kB → 3.26 kB, Vue 5 kB → 3.28 kB) — verified by
  `pnpm size`.
- React Native adapter additionally normalizes its submit payload to
  match the web adapters; consumers reading the raw `meta` envelope
  may see field-shape parity changes.
- Per the changesets `linked` config, this minor bump lockstep-bumps
  every package in the workspace, including `@tatlacas/brevwick-sdk`,
  even though the core package itself is not modified by this change.
