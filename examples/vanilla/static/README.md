# brevwick-example-vanilla (static)

No-build-tool example. A single `index.html` imports
[`@tatlacas/brevwick-sdk`](../../../packages/sdk) as ESM straight from
[esm.sh](https://esm.sh) and submits a hard-coded issue when a button is
clicked.

> This example does not have a `package.json` — it runs straight from
> `index.html` over any static file server. For a Vite + TypeScript version of
> the same wiring, see [`../vite`](../vite).

## Run locally

Serve the directory with any static file server. The example below uses
Python's built-in:

```bash
cd examples/vanilla/static
python3 -m http.server 8080
```

Then open http://localhost:8080 and click **Send feedback**.

## Configure your project key

Open `index.html` and replace `pk_test_demo` inside the `<script type="module">`
block with your own test key (from brevwick.dev → your project → **Keys**).

By default the SDK posts to the public Brevwick ingest endpoint
(`https://api.brevwick.com`). To override (e.g. point at a self-hosted
deployment), pass `endpoint: '…'` to `createBrevwick({ … })`.
