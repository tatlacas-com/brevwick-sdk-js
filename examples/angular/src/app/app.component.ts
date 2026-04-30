import { Component } from '@angular/core';
import { BwFeedbackButtonComponent } from '@tatlacas/brevwick-angular';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [BwFeedbackButtonComponent],
  template: `
    <main class="container">
      <h1>Brevwick Angular example</h1>
      <p>
        Click the <strong>Feedback</strong> button at the bottom of the screen
        to open the widget. The submission goes through Brevwick's public ingest
        endpoint using the project key configured in
        <code>src/environments/environment.ts</code>.
      </p>
      <bw-feedback-button (submit)="onSubmit($event)" />
    </main>
  `,
  styles: [
    `
      .container {
        max-width: 720px;
        margin: 0 auto;
        padding: 48px 24px;
        line-height: 1.5;
      }
      h1 {
        margin-top: 0;
      }
      code {
        background: #eee;
        padding: 0 4px;
        border-radius: 3px;
      }
    `,
  ],
})
export class AppComponent {
  onSubmit(result: unknown): void {
    console.log('Brevwick submit result', result);
  }
}
