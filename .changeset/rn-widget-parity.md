---
'@tatlacas/brevwick-react-native': minor
---

Bring `<FeedbackButton>` and `<FeedbackModal>` to behavior + payload parity with the React adapter (#116). Adds chat-thread bubbles, expected-vs-actual disclosure, phase-driven status rows, retry row, discard-confirm flow, AI toggle render-policy matrix, autogrow composer, and `Linking`-backed footer link. The hook surface (`useFeedback`) is unchanged; the modal now subscribes to the SDK's phase bus through the same internal-bridge pattern the React adapter uses. File-attach UI is deferred to a follow-up so v1 doesn't add a new native peer.

Visual parity pass: composer is now a single rounded shell containing the textarea, an inline track-and-thumb AI toggle (replacing RN's native `<Switch>` row above), and an icon-only send button with a constant `accessibilityLabel="Send"` — the lifecycle copy (`Capturing…`/`Sending…`/`Sent ✓`/`Try again`) lives on the FAB itself, while the inline button stays a pure send affordance. Submit-failure retry is funnelled exclusively through the existing `RetryRow` to match the web adapter, removing the duplicate "Try again" Pressable that previously replaced the send button on error.

Icon parity: every panel glyph (paperclip, send, minimize, close, status check) is now an SVG `<Path>` rendered via `react-native-svg`, using the exact same path data as the web adapter. The previous Unicode-glyph fallbacks (`✓`, `–`, `×`, `➤`) are removed because their rendering varied per font and looked off-brand at common pixel sizes. **`react-native-svg` is now a required peer dependency** — Expo ships it out of the box and bare RN apps overwhelmingly already depend on it transitively, but consumers upgrading from earlier `1.0.0-beta.x` may need to `npm install react-native-svg` if they had no transitive pull.

File-attachment parity: the paperclip icon button on the left of the composer opens the platform document picker, picks turn into `<AttachmentChip>` rows above the composer, and selected URIs are converted to `Blob`s and ridesharred on the next submit through the existing `FeedbackInput.attachments` contract. Two new optional peers wire the picker:

- `expo-document-picker` (≥12 <14) — preferred path for Expo apps.
- `react-native-document-picker` (≥9 <11) — fallback for bare RN.

Both are dynamically imported the first time the user taps the paperclip; if neither is installed the modal surfaces an inline note (`File attachments are unavailable. Install …`) so the missing-peer state is visible rather than silent. The cap matches the SDK's `MAX_ATTACHMENT_COUNT` (5 files); excess picks are clipped and the paperclip flips to its `Maximum 5 attachments reached` disabled label.
