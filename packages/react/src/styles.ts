/**
 * Styles are injected via a single <style> tag rendered into the tree so the
 * package has zero CSS-loader requirements — consumers can drop the package
 * into any bundler (Next.js, Vite, Webpack) without config.
 *
 * Theming is done through `--brw-*` CSS custom properties. Defaults live on
 * `:where(:root)` so the widget's declarations sit at specificity 0 — any
 * host rule (including a normal `:root { --brw-accent: hotpink }`, a
 * `body { ... }`, or any widget ancestor) wins without `!important`. Dark
 * palette is swapped via `@media (prefers-color-scheme: dark)`; host
 * overrides persist across modes because they're set on a different
 * element / higher specificity.
 */
export const BREVWICK_STYLE_ID = 'brevwick-react-styles';

/**
 * Maximum autogrow height of the composer textarea in pixels.
 *
 * Shared between JS (the autogrow effect sets `style.height` against
 * `scrollHeight` bounded by this) and CSS (`.brw-composer-input` uses
 * the same value as `max-height`). Single source of truth so a designer
 * bumping the ceiling does not drift the two out of sync.
 */
export const COMPOSER_MAX_HEIGHT_PX = 120;

export const BREVWICK_CSS = `
:where(:root) {
  /* Surfaces */
  --brw-panel-bg: #ffffff;
  --brw-bubble-assistant-bg: #f1f5f9;
  --brw-bubble-user-bg: #0f172a;
  --brw-bubble-user-fg: #ffffff;
  --brw-chip-bg: #f1f5f9;
  --brw-composer-bg: #ffffff;
  /* Text */
  --brw-fg: #0f172a;
  --brw-fg-muted: #64748b;
  /* Border / focus */
  --brw-border: #e2e8f0;
  --brw-border-focus: #0f172a;
  --brw-divider: #e2e8f0;
  /* Accent */
  --brw-accent: #0f172a;
  --brw-accent-fg: #ffffff;
  /* Shadow */
  --brw-shadow: 0 20px 48px rgba(15, 23, 42, 0.18), 0 6px 12px rgba(15, 23, 42, 0.08);
  /* Status colour — not exposed in the public token list; widget-internal.
     Carried through dark mode (same hue reads adequately on the dark
     --brw-panel-bg); override in the dark block if design ever wants a
     tuned variant. */
  --brw-error: #b91c1c;
}
@media (prefers-color-scheme: dark) {
  :where(:root) {
    /* Surfaces */
    --brw-panel-bg: #0b1220;
    --brw-bubble-assistant-bg: #1e293b;
    --brw-bubble-user-bg: #f8fafc;
    --brw-bubble-user-fg: #0f172a;
    /* chip bg is one step brighter than --brw-border (#1e293b) so the chip's
       1px border stays visible against the chip body in dark mode. */
    --brw-chip-bg: #253044;
    --brw-composer-bg: #0b1220;
    /* Text */
    --brw-fg: #f8fafc;
    --brw-fg-muted: #94a3b8;
    /* Border / focus */
    --brw-border: #1e293b;
    --brw-border-focus: #f8fafc;
    --brw-divider: #1e293b;
    /* Accent */
    --brw-accent: #f8fafc;
    --brw-accent-fg: #0f172a;
    /* Shadow — deeper alpha so the panel still reads as lifted over a dark host */
    --brw-shadow: 0 20px 48px rgba(0, 0, 0, 0.55), 0 6px 12px rgba(0, 0, 0, 0.35);
  }
}
.brw-root {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
  color: var(--brw-fg);
}
.brw-fab {
  position: fixed;
  z-index: 2147483000;
  bottom: 24px;
  height: 48px;
  min-width: 48px;
  padding: 0 18px;
  border-radius: 999px;
  border: 1px solid var(--brw-border);
  background: var(--brw-accent);
  color: var(--brw-accent-fg);
  font-size: 14px;
  font-weight: 500;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  box-shadow: var(--brw-shadow);
  /* Only transform animates on hover; box-shadow is static so it is
     intentionally excluded from the transition list. */
  transition: transform 120ms ease-out;
}
.brw-fab:hover:not(:disabled) {
  transform: translateY(-1px);
}
.brw-fab:disabled { cursor: not-allowed; opacity: 0.5; }
.brw-fab-br { right: 24px; }
.brw-fab-bl { left: 24px; }
.brw-fab-icon { width: 18px; height: 18px; }
.brw-panel {
  position: fixed;
  z-index: 2147483002;
  bottom: 24px;
  width: min(92vw, 400px);
  height: min(80vh, 640px);
  display: flex;
  flex-direction: column;
  background: var(--brw-panel-bg);
  color: var(--brw-fg);
  border: 1px solid var(--brw-border);
  border-radius: 16px 16px 12px 12px;
  box-shadow: var(--brw-shadow);
  overflow: hidden;
  animation: brw-slide-up 200ms ease-out;
}
.brw-panel-br { right: 24px; }
.brw-panel-bl { left: 24px; }
@keyframes brw-slide-up {
  from { transform: translateY(16px); opacity: 0; }
  to { transform: none; opacity: 1; }
}
@media (prefers-reduced-motion: reduce) {
  .brw-panel { animation: none; }
  .brw-fab { transition: none; }
}
@media (max-width: 480px) {
  .brw-panel {
    width: calc(100vw - 32px);
    left: 16px;
    right: 16px;
  }
}
.brw-panel-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 14px;
  border-bottom: 1px solid var(--brw-divider);
  flex-shrink: 0;
}
.brw-panel-avatar {
  width: 28px; height: 28px;
  border-radius: 999px;
  background: var(--brw-accent);
  color: var(--brw-accent-fg);
  display: inline-flex; align-items: center; justify-content: center;
  font-weight: 600; font-size: 12px;
  flex-shrink: 0;
}
.brw-panel-title {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  flex: 1;
  min-width: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.brw-icon-btn {
  width: 28px; height: 28px;
  padding: 0;
  display: inline-flex; align-items: center; justify-content: center;
  border: 1px solid transparent;
  background: transparent;
  color: var(--brw-fg-muted);
  border-radius: 6px;
  cursor: pointer;
  font: inherit;
  line-height: 1;
}
.brw-icon-btn:hover:not(:disabled) { background: var(--brw-chip-bg); color: var(--brw-fg); }
.brw-icon-btn:focus-visible { outline: 2px solid var(--brw-border-focus); outline-offset: 1px; }
.brw-icon-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.brw-icon-btn svg { width: 16px; height: 16px; }
.brw-thread {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 16px 14px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  background: var(--brw-panel-bg);
}
.brw-bubble {
  max-width: 85%;
  padding: 10px 12px;
  border-radius: 14px;
  font-size: 13px;
  line-height: 1.45;
  word-wrap: break-word;
  white-space: pre-wrap;
}
.brw-bubble--assistant {
  align-self: flex-start;
  background: var(--brw-bubble-assistant-bg);
  color: var(--brw-fg);
  border-bottom-left-radius: 4px;
}
.brw-bubble--user {
  align-self: flex-end;
  background: var(--brw-bubble-user-bg);
  color: var(--brw-bubble-user-fg);
  border-bottom-right-radius: 4px;
}
.brw-bubble--success {
  align-self: center;
  background: var(--brw-chip-bg);
  color: var(--brw-fg);
  text-align: center;
  max-width: 92%;
}
.brw-success-wrap {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 24px 8px;
}
.brw-chip {
  align-self: flex-end;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  background: var(--brw-chip-bg);
  color: var(--brw-fg);
  border: 1px solid var(--brw-border);
  border-radius: 12px;
  font-size: 12px;
  max-width: 85%;
}
.brw-chip img {
  width: 28px; height: 28px;
  object-fit: cover;
  border-radius: 4px;
  flex-shrink: 0;
}
.brw-chip-name { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 180px; }
.brw-chip-size { color: var(--brw-fg-muted); }
.brw-chip-remove {
  width: 20px; height: 20px;
  padding: 0;
  display: inline-flex; align-items: center; justify-content: center;
  border: none;
  background: transparent;
  color: var(--brw-fg-muted);
  border-radius: 999px;
  cursor: pointer;
  font: inherit;
  line-height: 1;
}
.brw-chip-remove:hover { background: var(--brw-border); color: var(--brw-fg); }
.brw-disclosure {
  align-self: flex-start;
  background: transparent;
  border: none;
  padding: 0;
  color: var(--brw-fg-muted);
  font: inherit;
  font-size: 12px;
  cursor: pointer;
  text-decoration: underline;
}
.brw-disclosure:hover { color: var(--brw-fg); }
.brw-disclosure-panel {
  align-self: stretch;
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 8px 10px;
  background: var(--brw-chip-bg);
  border: 1px solid var(--brw-border);
  border-radius: 10px;
}
.brw-disclosure-label {
  font-size: 11px;
  font-weight: 600;
  color: var(--brw-fg-muted);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.brw-disclosure-input {
  width: 100%;
  box-sizing: border-box;
  padding: 6px 8px;
  font: inherit;
  font-size: 12px;
  color: var(--brw-fg);
  background: var(--brw-panel-bg);
  border: 1px solid var(--brw-border);
  border-radius: 6px;
  resize: vertical;
  min-height: 34px;
}
.brw-composer {
  flex-shrink: 0;
  padding: 8px 10px;
  background: var(--brw-composer-bg);
  border-top: 1px solid var(--brw-divider);
}
/* Rounded shell that groups the textarea + icon buttons + send + AI toggle
   into a single visual input affordance. Border colour lifts to
   --brw-border-focus when any descendant takes focus, so the whole shell
   reads as focused without a per-child outline. align-items: flex-end keeps
   the send button pinned to the bottom as the textarea autogrows. */
.brw-composer-shell {
  display: flex;
  align-items: flex-end;
  gap: 4px;
  padding: 6px 8px;
  background: var(--brw-composer-bg);
  border: 1px solid var(--brw-border);
  border-radius: 12px;
  transition: border-color 120ms ease-out;
}
.brw-composer-shell:focus-within {
  border-color: var(--brw-border-focus);
}
@media (prefers-reduced-motion: reduce) {
  .brw-composer-shell { transition: none; }
}
.brw-composer-input {
  flex: 1;
  min-height: 34px;
  max-height: ${COMPOSER_MAX_HEIGHT_PX}px;
  box-sizing: border-box;
  padding: 8px 4px;
  font: inherit;
  font-size: 13px;
  color: var(--brw-fg);
  background: transparent;
  border: none;
  resize: none;
  overflow-y: auto;
  line-height: 1.4;
}
.brw-composer-input:focus-visible { outline: none; }
.brw-send-btn {
  width: 34px; height: 34px;
  padding: 0;
  display: inline-flex; align-items: center; justify-content: center;
  border: 1px solid var(--brw-accent);
  background: var(--brw-accent);
  color: var(--brw-accent-fg);
  border-radius: 10px;
  cursor: pointer;
  flex-shrink: 0;
}
.brw-aitoggle {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 26px;
  padding: 0 10px 0 8px;
  border-radius: 999px;
  border: 1px solid var(--brw-border);
  background: var(--brw-chip-bg);
  color: var(--brw-fg-muted);
  font: inherit;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: background-color 120ms ease-out, color 120ms ease-out, border-color 120ms ease-out;
}
.brw-aitoggle:focus-visible { outline: 2px solid var(--brw-border-focus); outline-offset: 1px; }
.brw-aitoggle:disabled { opacity: 0.5; cursor: not-allowed; }
.brw-aitoggle-dot {
  width: 10px;
  height: 10px;
  border-radius: 999px;
  background: var(--brw-fg-muted);
  transition: background-color 120ms ease-out;
}
.brw-aitoggle--on {
  background: var(--brw-accent);
  color: var(--brw-accent-fg);
  border-color: var(--brw-accent);
}
.brw-aitoggle--on .brw-aitoggle-dot {
  background: var(--brw-accent-fg);
}
@media (prefers-reduced-motion: reduce) {
  .brw-aitoggle, .brw-aitoggle-dot { transition: none; }
}
.brw-send-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.brw-send-btn svg { width: 16px; height: 16px; }
.brw-file-input { display: none; }
.brw-confirm {
  align-self: stretch;
  display: flex;
  gap: 8px;
  align-items: center;
  padding: 8px 10px;
  background: var(--brw-chip-bg);
  border: 1px solid var(--brw-border);
  border-radius: 10px;
  font-size: 12px;
}
.brw-confirm-msg { flex: 1; }
.brw-btn {
  height: 30px;
  padding: 0 12px;
  border-radius: 8px;
  border: 1px solid var(--brw-border);
  background: var(--brw-panel-bg);
  color: var(--brw-fg);
  font: inherit;
  font-size: 12px;
  cursor: pointer;
}
.brw-btn:hover:not(:disabled) { background: var(--brw-chip-bg); }
.brw-btn-primary {
  background: var(--brw-accent);
  color: var(--brw-accent-fg);
  border-color: var(--brw-accent);
}
.brw-error { color: var(--brw-error); font-size: 12px; align-self: stretch; }
.brw-panel-footer {
  flex-shrink: 0;
  padding: 6px 10px 8px;
  text-align: center;
  background: var(--brw-composer-bg);
}
.brw-panel-footer-link {
  font-size: 10px;
  letter-spacing: 0.02em;
  color: var(--brw-fg-muted);
  text-decoration: none;
  opacity: 0.75;
  transition: opacity 120ms ease-out, color 120ms ease-out;
}
.brw-panel-footer-link:hover,
.brw-panel-footer-link:focus-visible {
  opacity: 1;
  color: var(--brw-fg);
  text-decoration: underline;
}
@media (prefers-reduced-motion: reduce) {
  .brw-panel-footer-link { transition: none; }
}
.brw-spinner {
  display: inline-block; width: 14px; height: 14px;
  border: 2px solid currentColor; border-right-color: transparent;
  border-radius: 999px;
  animation: brw-spin 0.7s linear infinite;
}
@keyframes brw-spin { to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: reduce) {
  .brw-spinner { animation-duration: 1.6s; }
}
.brw-region-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.35);
  z-index: 2147483003;
}
.brw-region-layer {
  position: fixed;
  inset: 0;
  z-index: 2147483004;
  cursor: crosshair;
  user-select: none;
  -webkit-user-select: none;
  outline: none;
}
.brw-region-selection {
  position: fixed;
  border: 2px solid var(--brw-border-focus);
  box-shadow: 0 0 0 9999px rgba(0, 0, 0, 0.35);
  pointer-events: none;
}
.brw-region-controls {
  position: fixed;
  bottom: 16px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  gap: 8px;
  padding: 6px;
  background: var(--brw-panel-bg);
  border: 1px solid var(--brw-border);
  border-radius: 10px;
  box-shadow: var(--brw-shadow);
  z-index: 2147483005;
}
.brw-region-btn { font: inherit; }
.brw-region-shake { animation: brw-region-shake 300ms ease-out; }
@keyframes brw-region-shake {
  0%, 100% { transform: translateX(0); }
  25% { transform: translateX(-4px); }
  75% { transform: translateX(4px); }
}
@media (prefers-reduced-motion: reduce) {
  .brw-region-shake { animation: none; }
}
`;
