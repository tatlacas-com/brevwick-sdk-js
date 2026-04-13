import { createBrevwick } from 'brevwick-sdk';

const projectKey = import.meta.env.VITE_BREVWICK_KEY;
const endpoint = import.meta.env.VITE_API_BASE;

const result = document.getElementById('result') as HTMLDivElement;
const button = document.getElementById('send') as HTMLButtonElement;

if (!projectKey) {
  result.textContent =
    'Missing VITE_BREVWICK_KEY — copy .env.example to .env and set your pk_test_… key.';
  result.className = 'err';
  button.disabled = true;
} else {
  const brevwick = createBrevwick({
    projectKey,
    endpoint,
    environment: 'dev',
  });
  brevwick.install();

  button.addEventListener('click', async () => {
    button.disabled = true;
    result.className = '';
    result.textContent = 'Sending…';
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
    button.disabled = false;
  });
}
