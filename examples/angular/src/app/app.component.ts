import { CommonModule } from '@angular/common';
import { Component, Inject, InjectionToken, Optional } from '@angular/core';
import { BwFeedbackButtonComponent } from '@tatlacas/brevwick-angular';

export type BrevwickConfigError =
  | 'missing-key'
  | 'invalid-key'
  | 'missing-endpoint'
  | null;

export const BREVWICK_CONFIG_ERROR = new InjectionToken<BrevwickConfigError>(
  'BREVWICK_CONFIG_ERROR',
);

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, BwFeedbackButtonComponent],
  template: `
    <main class="container">
      <h1>Brevwick — Angular example</h1>
      <p>
        The floating <strong>Feedback</strong> button is rendered by
        <code>&lt;bw-feedback-button /&gt;</code> from
        <code>&#64;tatlacas/brevwick-angular</code>. Configure the project key
        and endpoint in <code>src/environments/environment.ts</code>.
      </p>
      <p *ngIf="error === 'missing-key'" class="error">
        Missing <code>brevwickProjectKey</code> in <code>environment.ts</code>.
        Replace <code>pk_test_replace_me</code> with a real test key and reload.
      </p>
      <p *ngIf="error === 'invalid-key'" class="error">
        <code>brevwickProjectKey</code> is malformed. Must match
        <code>pk_(live|test)_[A-Za-z0-9]{{ '{16,}' }}</code
        >.
      </p>
      <p *ngIf="error === 'missing-endpoint'" class="error">
        Missing <code>brevwickEndpoint</code>. Point it at your local
        <code>brevwick-api</code> (e.g. <code>http://localhost:8080</code>).
      </p>
      <bw-feedback-button *ngIf="error === null" (submit)="onSubmit($event)" />
    </main>
  `,
  styles: [
    `
      .container {
        max-width: 720px;
        margin: 0 auto;
        padding: 48px 24px;
        line-height: 1.5;
        font-family:
          system-ui,
          -apple-system,
          'Segoe UI',
          Roboto,
          sans-serif;
      }
      h1 {
        margin-top: 0;
      }
      code {
        background: #eee;
        padding: 0 4px;
        border-radius: 3px;
      }
      .error {
        color: #b42318;
      }
    `,
  ],
})
export class AppComponent {
  constructor(
    @Optional()
    @Inject(BREVWICK_CONFIG_ERROR)
    public error: BrevwickConfigError = null,
  ) {}

  onSubmit(result: unknown): void {
    console.log('Brevwick submit result', result);
  }
}
