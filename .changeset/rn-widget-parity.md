---
'@tatlacas/brevwick-react-native': minor
---

Bring `<FeedbackButton>` and `<FeedbackModal>` to behavior + payload parity with the React adapter (#116). Adds chat-thread bubbles, expected-vs-actual disclosure, phase-driven status rows, retry row, discard-confirm flow, AI toggle render-policy matrix, autogrow composer, and `Linking`-backed footer link. The hook surface (`useFeedback`) is unchanged; the modal now subscribes to the SDK's phase bus through the same internal-bridge pattern the React adapter uses. File-attach UI is deferred to a follow-up so v1 doesn't add a new native peer.
