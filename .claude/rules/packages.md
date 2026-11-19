---
paths:
  - 'packages/**'
  - '.size-limit.js'
  - '.changeset/**'
---

# Package code, bundle budgets and changesets

- Bundle budgets (gzip) are enforced by `.size-limit.js` and `chunk-split.test.ts`; change both together. Core eager `index` plus static chunks < 8 kB; widget open (with `modern-screenshot`) < 25 kB; react and react-native < 25 kB; solid and vue < 13 kB; svelte eager < 5 kB and `FeedbackButton.svelte` < 22 kB; angular FESM2022 < 31 kB.
- The console and network rings load eagerly, because they must capture before the first error or fetch. Everything else heavy (screenshot, submit, config fetch) stays behind `await import()`.
- Any change under `packages/**` needs a changeset. All seven packages are one `fixed` group: `feat` is minor, `fix` and `refactor` are patch, a breaking change is major and is called out in the changeset.
