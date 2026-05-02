# brevwick-example-react-native

Minimal Expo SDK 51 + TypeScript app wired up with `BrevwickProvider` from
[`@tatlacas/brevwick-react-native`](../../packages/react-native), a Stack
navigator (`Home` + `Details`), and demo buttons for each of the four
context streams the SDK attaches to every submission (console, network,
route, screenshot).

## Run locally

1. From the repo root, install:

   ```bash
   pnpm install
   ```

2. Copy `.env.example` to `.env` and replace the placeholder key with a
   real `pk_test_…` from your project at <https://brevwick.dev>:

   ```bash
   cp examples/react-native/.env.example examples/react-native/.env
   # edit EXPO_PUBLIC_BREVWICK_PROJECT_KEY=pk_test_…
   ```

3. Start the Expo dev server:

   ```bash
   pnpm --filter brevwick-example-react-native start
   ```

4. Scan the QR with Expo Go or open in a custom dev client (see below for
   when each is appropriate).

## Expo Go vs. dev client

| Concern                 | Expo Go (default)                                  | Custom dev client                               |
| ----------------------- | -------------------------------------------------- | ----------------------------------------------- |
| Provider + hooks        | ✅ work                                            | ✅ work                                         |
| Console / network rings | ✅ captured                                        | ✅ captured                                     |
| Route ring              | ✅ captured                                        | ✅ captured                                     |
| Screenshot capture      | ⚠️ falls back to a 1×1 transparent PNG placeholder | ✅ real screenshot via `react-native-view-shot` |

`react-native-view-shot` ships native code, so a custom dev client is
required to actually rasterise the view tree. In Expo Go the
`@tatlacas/brevwick-react-native` package falls through to the placeholder
PNG (the never-throws contract from SDD § 12). For a quick sanity check
of the wiring, Expo Go is fine; for screenshot QA, build a dev client per
<https://docs.expo.dev/develop/development-builds/introduction/>.

## Environment

Expo only inlines env vars whose names start with `EXPO_PUBLIC_`. Anything
else stays server-side and is `undefined` at runtime.

| Variable                           | Required | Purpose                                                                                                     |
| ---------------------------------- | -------- | ----------------------------------------------------------------------------------------------------------- |
| `EXPO_PUBLIC_BREVWICK_PROJECT_KEY` | yes      | Public ingest key (`pk_test_…` or `pk_live_…`).                                                             |
| `EXPO_PUBLIC_BREVWICK_ENDPOINT`    | no       | Override ingest endpoint. Defaults to `staging-api.brevwick.com` in `.env.example`; omit to hit production. |

## What the demo does

- `Home` screen has four buttons — three populate context rings (console,
  network, route via stack push), the fourth opens the feedback FAB.
- `Details` is a trivial second screen that exists so the route ring
  records `Home → Details → Home` transitions.
- The floating <kbd>Feedback</kbd> button at the bottom-right opens a
  modal, calls `useFeedback().submit({ description })`, and surfaces the
  staged success / error states inline.

## Verifying the submission

After submitting from the example, check your project dashboard at
<https://brevwick.dev> for an issue with:

- `device_context.platform = 'react-native-ios'` or `'react-native-android'`
- `console_log`, `network_log`, and `route_trail` populated with the
  entries triggered by the demo buttons
- a screenshot attachment (or the 1×1 placeholder if running in Expo Go)
