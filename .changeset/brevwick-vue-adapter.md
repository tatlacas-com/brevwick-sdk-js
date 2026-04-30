---
'@tatlacas/brevwick-sdk': minor
'@tatlacas/brevwick-react': minor
'@tatlacas/brevwick-vue': minor
---

Add `@tatlacas/brevwick-vue` adapter package: Vue 3 plugin (`app.use(BrevwickPlugin, config)`), `<FeedbackButton>` component, and `useFeedback()` composable. Mirrors the React adapter's mental model on Vue 3 composition API + provide/inject. SSR-safe (window-guarded plugin install + onMounted DOM access in the FAB). Eager bundle ≤ 5 kB gzip; the screenshot encoder stays dynamic-imported via the core SDK. Closes #64.
