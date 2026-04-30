import { bootstrapApplication } from '@angular/platform-browser';
import { provideBrevwick } from '@tatlacas/brevwick-angular';
import { AppComponent } from './app/app.component';
import { environment } from './environments/environment';

bootstrapApplication(AppComponent, {
  providers: [
    provideBrevwick({
      projectKey: environment.brevwickProjectKey,
      environment: environment.production ? 'prod' : 'dev',
    }),
  ],
}).catch((err) => {
  console.error(err);
});
