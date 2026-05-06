---
'@tatlacas/brevwick-react-native': minor
---

Bring `<FeedbackButton>` and `<FeedbackModal>` to behavior + payload parity with the React adapter (#116). Adds chat-thread bubbles, expected-vs-actual disclosure, phase-driven status rows, retry row, discard-confirm flow, AI toggle render-policy matrix, autogrow composer, and `Linking`-backed footer link. The hook surface (`useFeedback`) is unchanged; the modal now subscribes to the SDK's phase bus through the same internal-bridge pattern the React adapter uses. File-attach UI is deferred to a follow-up so v1 doesn't add a new native peer.

Visual parity pass: composer is now a single rounded shell containing the textarea, an inline track-and-thumb AI toggle (replacing RN's native `<Switch>` row above), and an icon-only send button (Unicode arrow) with a constant `accessibilityLabel="Send"` — the lifecycle copy (`Capturing…`/`Sending…`/`Sent ✓`/`Try again`) lives on the FAB itself, while the inline button stays a pure send affordance. Submit-failure retry is funnelled exclusively through the existing `RetryRow` to match the web adapter, removing the duplicate "Try again" Pressable that previously replaced the send button on error.
