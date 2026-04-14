import { createBrevwick } from 'brevwick-sdk';

const PLACEHOLDER_KEY = 'pk_test_replace_me';

const projectKey = import.meta.env.VITE_BREVWICK_KEY;
const endpoint = import.meta.env.VITE_API_BASE;

// Safe DOM lookups — an example meant for copy-paste should model the
// null-checked pattern instead of unchecked `as HTMLElement` casts.
const result = document.querySelector<HTMLDivElement>('#result');
const button = document.querySelector<HTMLButtonElement>('#send');
if (!result || !button) {
  throw new Error(
    'Brevwick example: missing #result / #send elements in index.html',
  );
}

function fail(message: string): void {
  if (!result || !button) return;
  result.textContent = message;
  result.className = 'err';
  button.disabled = true;
}

// Fail closed on missing / placeholder config. This example is explicitly
// scoped to a local `brevwick-api`, so we refuse to fall through to the SDK's
// production default (`https://api.brevwick.com`) when the endpoint env var
// is unset — silently hitting prod from a local-dev example is a footgun.
if (!projectKey || projectKey === PLACEHOLDER_KEY) {
  fail(
    'Missing VITE_BREVWICK_KEY — copy .env.example to .env and set your pk_test_… key.',
  );
} else if (!endpoint) {
  fail(
    'Missing VITE_API_BASE — copy .env.example to .env and point it at your local brevwick-api (e.g. http://localhost:8080).',
  );
} else {
  // This demo scopes itself to a one-shot `submit()`; the error/network/route
  // rings wired by `brevwick.install()` are not needed here. See the Next.js
  // example for a fuller wire-up via `BrevwickProvider` + `FeedbackButton`.
  //
  // `createBrevwick` validates config synchronously and throws
  // `BrevwickConfigError` on malformed input (bad endpoint, malformed key,
  // etc.). Surface the error in-page instead of letting the module crash
  // silently — integrators debugging their first setup should see the
  // actual reason, not a blank page.
  try {
    const brevwick = createBrevwick({
      projectKey,
      endpoint,
      environment: 'dev',
    });

    button.addEventListener('click', () => {
      void (async () => {
        button.disabled = true;
        result.className = '';
        result.textContent = 'Sending…';
        try {
          const res = await brevwick.submit({
            title: 'Hello from vanilla example',
            description: 'Test report',
          });
          if (res.ok) {
            result.className = 'ok';
            result.textContent = `Report sent: ${res.report_id}`;
          } else {
            result.className = 'err';
            result.textContent = `Error [${res.error.code}]: ${res.error.message}`;
          }
        } catch (err) {
          // `submit()` is contractually tagged-result and should never throw,
          // but integrators will extend this handler with code that can —
          // model defensive handling here.
          result.className = 'err';
          result.textContent = `Unexpected error: ${String(err)}`;
        } finally {
          button.disabled = false;
        }
      })();
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    fail(`Brevwick config error: ${message}`);
  }
}
