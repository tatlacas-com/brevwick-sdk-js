/**
 * Shared screenshot failure fallback. Lives in its own ~0.2 kB module so it
 * can sit on the EAGER path: the lazy `import('./screenshot')` wrappers in
 * `core/client.ts` and `index.ts` need a placeholder to honour the
 * "captureScreenshot never throws" contract even when the screenshot chunk
 * itself fails to load (deploy mismatch, offline, flaky CDN) — they cannot
 * pull the placeholder out of the very chunk that just failed to load.
 * `screenshot.ts` imports the same helper so the bytes exist exactly once.
 */

// Base64-encoded 1×1 transparent VP8L WebP. Used when capture fails so
// callers that depend on `.attachments[].blob` still get a valid image type.
const PLACEHOLDER_WEBP_BASE64 =
  'UklGRhoAAABXRUJQVlA4TA0AAAAvAAAAEAcQERGIiP4HAA==';

// Decoded lazily on the first failure (not at module load — this module is
// eager, and SSR module evaluation should do zero work). The bytes are then
// cached: every failure path previously re-ran `atob` + the byte-copy loop.
// The returned Blob must still be fresh per call because consumers may hold
// and revoke URLs from it. Store the underlying ArrayBuffer (not the view)
// so `new Blob([...])` types cleanly under TS `strict` without widening to
// `ArrayBufferLike`.
let placeholderBuffer: ArrayBuffer | undefined;

export function placeholderBlob(): Blob {
  if (!placeholderBuffer) {
    const binary = atob(PLACEHOLDER_WEBP_BASE64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    placeholderBuffer = bytes.buffer;
  }
  return new Blob([placeholderBuffer], { type: 'image/webp' });
}
