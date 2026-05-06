import { bootstrapApplication } from '@angular/platform-browser';
import { provideBrevwick } from '@tatlacas/brevwick-angular';
import { AppComponent, BREVWICK_CONFIG_ERROR } from './app/app.component';
import { environment } from './environments/environment';

const PROJECT_KEY_PATTERN = /^pk_(live|test)_[A-Za-z0-9]{16,}$/;
const PLACEHOLDER_KEY = 'pk_test_replace_me';

type ConfigErrorKind = 'missing-key' | 'invalid-key' | 'missing-endpoint';

function classifyConfig(): ConfigErrorKind | null {
  const key = environment.brevwickProjectKey;
  const endpoint = environment.brevwickEndpoint;
  if (!key || key === PLACEHOLDER_KEY) return 'missing-key';
  if (!PROJECT_KEY_PATTERN.test(key)) return 'invalid-key';
  if (!endpoint) return 'missing-endpoint';
  return null;
}

const error = classifyConfig();

const providers = error
  ? [{ provide: BREVWICK_CONFIG_ERROR, useValue: error }]
  : [
      { provide: BREVWICK_CONFIG_ERROR, useValue: null },
      provideBrevwick({
        projectKey: environment.brevwickProjectKey,
        endpoint: environment.brevwickEndpoint,
        environment: environment.production ? 'prod' : 'dev',
      }),
    ];

bootstrapApplication(AppComponent, { providers }).catch((err) => {
  console.error('[brevwick-example-angular] bootstrap failed', err);
});
