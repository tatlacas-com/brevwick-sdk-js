/**
 * Styles for the Vue FAB are injected via a single `<style>` tag (mirroring
 * the React package) so consumers don't need a CSS-loader. The Vue widget
 * ships a smaller surface than the React one — just FAB + dialog + composer
 * + screenshot chip — so this stylesheet is intentionally trimmed. It still
 * exposes the same `--brw-*` public custom properties so a host that
 * already themed the React widget gets the same palette here.
 */
export const BREVWICK_STYLE_ID = 'brevwick-vue-styles';

export const BREVWICK_CSS = `
:where(:root) {
  --brw-panel-bg-base: #ffffff;
  --brw-fg-base: #0f172a;
  --brw-fg-muted-base: #64748b;
  --brw-border-base: #e2e8f0;
  --brw-border-focus-base: #0f172a;
  --brw-divider-base: #e2e8f0;
  --brw-accent-base: #0f172a;
  --brw-accent-fg-base: #ffffff;
  --brw-chip-bg-base: #f1f5f9;
  --brw-shadow-base: 0 20px 48px rgba(15, 23, 42, 0.18), 0 6px 12px rgba(15, 23, 42, 0.08);
  --brw-error-base: #b91c1c;
}
@media (prefers-color-scheme: dark) {
  :where(:root) {
    --brw-panel-bg-base: #0b1220;
    --brw-fg-base: #f8fafc;
    --brw-fg-muted-base: #94a3b8;
    --brw-border-base: #1e293b;
    --brw-border-focus-base: #f8fafc;
    --brw-divider-base: #1e293b;
    --brw-accent-base: #f8fafc;
    --brw-accent-fg-base: #0f172a;
    --brw-chip-bg-base: #253044;
    --brw-shadow-base: 0 20px 48px rgba(0, 0, 0, 0.55), 0 6px 12px rgba(0, 0, 0, 0.35);
  }
}
.brw-root {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
  color: var(--brw-fg, var(--brw-fg-base));
}
.brw-fab {
  position: fixed;
  z-index: 2147483000;
  bottom: 24px;
  height: 48px;
  min-width: 48px;
  padding: 0 18px;
  border-radius: 999px;
  border: 1px solid var(--brw-border, var(--brw-border-base));
  background: var(--brw-accent, var(--brw-accent-base));
  color: var(--brw-accent-fg, var(--brw-accent-fg-base));
  font-size: 14px;
  font-weight: 500;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  box-shadow: var(--brw-shadow, var(--brw-shadow-base));
  transition: transform 120ms ease-out;
}
.brw-fab:hover:not(:disabled) { transform: translateY(-1px); }
.brw-fab:disabled { cursor: not-allowed; opacity: 0.5; }
.brw-fab-br { right: 24px; }
.brw-fab-bl { left: 24px; }
.brw-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.35);
  z-index: 2147483001;
}
.brw-panel {
  position: fixed;
  z-index: 2147483002;
  bottom: 24px;
  width: min(92vw, 400px);
  max-height: min(80vh, 640px);
  display: flex;
  flex-direction: column;
  background: var(--brw-panel-bg, var(--brw-panel-bg-base));
  color: var(--brw-fg, var(--brw-fg-base));
  border: 1px solid var(--brw-border, var(--brw-border-base));
  border-radius: 16px;
  box-shadow: var(--brw-shadow, var(--brw-shadow-base));
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
  .brw-panel { width: calc(100vw - 32px); left: 16px; right: 16px; }
}
.brw-panel-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 14px;
  border-bottom: 1px solid var(--brw-divider, var(--brw-divider-base));
}
.brw-panel-title { margin: 0; font-size: 14px; font-weight: 600; flex: 1; }
.brw-icon-btn {
  width: 28px; height: 28px;
  padding: 0;
  display: inline-flex; align-items: center; justify-content: center;
  border: 1px solid transparent;
  background: transparent;
  color: var(--brw-fg-muted, var(--brw-fg-muted-base));
  border-radius: 6px;
  cursor: pointer;
  font: inherit;
}
.brw-icon-btn:hover:not(:disabled) { background: var(--brw-chip-bg, var(--brw-chip-bg-base)); color: var(--brw-fg, var(--brw-fg-base)); }
.brw-icon-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.brw-panel-body { padding: 12px 14px; display: flex; flex-direction: column; gap: 8px; overflow-y: auto; }
.brw-textarea {
  width: 100%;
  box-sizing: border-box;
  min-height: 90px;
  padding: 8px 10px;
  font: inherit;
  font-size: 13px;
  color: var(--brw-fg, var(--brw-fg-base));
  background: var(--brw-panel-bg, var(--brw-panel-bg-base));
  border: 1px solid var(--brw-border, var(--brw-border-base));
  border-radius: 8px;
  resize: vertical;
}
.brw-textarea:focus-visible {
  outline: 2px solid var(--brw-border-focus, var(--brw-border-focus-base));
  outline-offset: 1px;
}
.brw-chip {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  background: var(--brw-chip-bg, var(--brw-chip-bg-base));
  color: var(--brw-fg, var(--brw-fg-base));
  border: 1px solid var(--brw-border, var(--brw-border-base));
  border-radius: 12px;
  font-size: 12px;
  align-self: flex-start;
}
.brw-chip img { width: 28px; height: 28px; object-fit: cover; border-radius: 4px; }
.brw-chip-remove {
  width: 20px; height: 20px;
  padding: 0;
  border: none;
  background: transparent;
  color: var(--brw-fg-muted, var(--brw-fg-muted-base));
  border-radius: 999px;
  cursor: pointer;
  font: inherit;
  line-height: 1;
}
.brw-chip-remove:hover { background: var(--brw-border, var(--brw-border-base)); color: var(--brw-fg, var(--brw-fg-base)); }
.brw-actions { display: flex; align-items: center; gap: 8px; padding: 10px 14px; border-top: 1px solid var(--brw-divider, var(--brw-divider-base)); }
.brw-spacer { flex: 1; }
.brw-btn {
  height: 32px;
  padding: 0 12px;
  border-radius: 8px;
  border: 1px solid var(--brw-border, var(--brw-border-base));
  background: var(--brw-panel-bg, var(--brw-panel-bg-base));
  color: var(--brw-fg, var(--brw-fg-base));
  font: inherit;
  font-size: 13px;
  cursor: pointer;
}
.brw-btn:hover:not(:disabled) { background: var(--brw-chip-bg, var(--brw-chip-bg-base)); }
.brw-btn-primary {
  background: var(--brw-accent, var(--brw-accent-base));
  color: var(--brw-accent-fg, var(--brw-accent-fg-base));
  border-color: var(--brw-accent, var(--brw-accent-base));
}
.brw-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.brw-error { color: var(--brw-error-base); font-size: 12px; }
.brw-success { color: var(--brw-fg, var(--brw-fg-base)); font-size: 13px; }
.brw-footer { padding: 6px 10px 8px; text-align: center; }
.brw-footer-link {
  font-size: 10px;
  color: var(--brw-fg-muted, var(--brw-fg-muted-base));
  text-decoration: none;
  opacity: 0.75;
}
.brw-footer-link:hover { opacity: 1; text-decoration: underline; }
.brw-sr-only {
  position: absolute;
  width: 1px; height: 1px;
  padding: 0; margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}
`;
