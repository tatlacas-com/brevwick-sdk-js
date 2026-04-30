import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/package').Config} */
export default {
  // Allow `<script lang="ts">` SFCs without dragging in heavier preprocessor
  // chains. svelte-package emits the components with TypeScript stripped and
  // generates `.d.ts` siblings via svelte2tsx.
  preprocess: vitePreprocess(),
};
