<script setup lang="ts">
import { FeedbackButton } from '@tatlacas/brevwick-vue';
import type { ConfigError } from './configured-widget';

defineProps<{ configError: ConfigError }>();
</script>

<template>
  <main
    style="display: grid; place-items: center; min-height: 100vh; padding: 2rem"
  >
    <section
      style="
        max-width: 32rem;
        padding: 2rem;
        border: 1px solid rgba(0, 0, 0, 0.1);
        border-radius: 0.75rem;
        box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
        text-align: center;
      "
    >
      <h1 style="margin-top: 0">Brevwick — Vue example</h1>
      <p>
        The floating <strong>Feedback</strong> button is rendered by
        <code>&lt;FeedbackButton /&gt;</code> from
        <code>@tatlacas/brevwick-vue</code>. Click it, fill the dialog, submit,
        and check your Brevwick dashboard inbox.
      </p>
      <p v-if="configError === 'missing-key'" style="color: #b42318">
        Missing <code>VITE_BREVWICK_PROJECT_KEY</code>. Copy
        <code>.env.example</code> to <code>.env.local</code>, seed a real test
        key, and reload this page.
      </p>
      <p v-else-if="configError === 'invalid-key'" style="color: #b42318">
        <code>VITE_BREVWICK_PROJECT_KEY</code> is malformed. It must match
        <code>pk_(live|test)_[A-Za-z0-9]{16,}</code>.
      </p>
      <p v-else-if="configError === 'missing-endpoint'" style="color: #b42318">
        Missing <code>VITE_BREVWICK_ENDPOINT</code>. Point it at your Brevwick
        ingest host (e.g. <code>http://localhost:8080</code> for a local
        instance) in <code>.env.local</code>.
      </p>
    </section>
    <FeedbackButton v-if="configError === null" position="bottom-right" />
  </main>
</template>
