import { createApp } from 'vue';
import { BrevwickPlugin } from '@tatlacas/brevwick-vue';
import App from './App.vue';
import { readConfig } from './configured-widget';

const config = readConfig();
const app = createApp(App, { configError: config.error });

if (!config.error) {
  app.use(BrevwickPlugin, {
    projectKey: config.projectKey,
    endpoint: config.endpoint,
    environment: 'dev',
  });
}

app.mount('#app');
