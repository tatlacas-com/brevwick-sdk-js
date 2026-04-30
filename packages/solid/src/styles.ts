/**
 * Single-source CSS for the Solid FAB. Injected via a `<style>` tag on first
 * mount of any `<FeedbackButton>` so consumers don't need a CSS-loader plugin
 * — the package drops into Vite, Webpack, or SolidStart with zero config.
 *
 * Mirrors the React adapter's variable conventions (`--brw-*-base` defaults
 * with `--brw-*` consumer overrides) so an app that already styles the React
 * widget keeps its theme when migrating to the Solid package. The Solid V1
 * surface ships a strict subset of the React widget's UI (composer + send +
 * screenshot button) so the stylesheet is correspondingly trimmed.
 */
export const BREVWICK_STYLE_ID = 'brevwick-solid-styles';

export const BREVWICK_CSS = `
:where(:root) {
  --brw-panel-bg-base: #ffffff;
  --brw-fg-base: #0f172a;
  --brw-fg-muted-base: #64748b;
  --brw-border-base: #e2e8f0;
  --brw-accent-base: #0f172a;
  --brw-accent-fg-base: #ffffff;
  --brw-shadow-base: 0 20px 48px rgba(15, 23, 42, 0.18), 0 6px 12px rgba(15, 23, 42, 0.08);
  --brw-error-base: #b91c1c;
}
@media (prefers-color-scheme: dark) {
  :where(:root) {
    --brw-panel-bg-base: #0b1220;
    --brw-fg-base: #f8fafc;
    --brw-fg-muted-base: #94a3b8;
    --brw-border-base: #1e293b;
    --brw-accent-base: #f8fafc;
    --brw-accent-fg-base: #0f172a;
    --brw-shadow-base: 0 20px 48px rgba(0, 0, 0, 0.55), 0 6px 12px rgba(0, 0, 0, 0.35);
  }
}
.brw-root {
  font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
  color: var(--brw-fg, var(--brw-fg-base));
}
.brw-fab {
  position: fixed;
  bottom: 24px;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 10px 16px;
  border-radius: 999px;
  border: 1px solid var(--brw-border, var(--brw-border-base));
  background: var(--brw-accent, var(--brw-accent-base));
  color: var(--brw-accent-fg, var(--brw-accent-fg-base));
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  box-shadow: var(--brw-shadow, var(--brw-shadow-base));
  z-index: 2147483646;
}
.brw-fab[disabled] { opacity: 0.5; cursor: not-allowed; }
.brw-fab-br { right: 24px; }
.brw-fab-bl { left: 24px; }
.brw-panel {
  position: fixed;
  bottom: 88px;
  width: min(360px, calc(100vw - 32px));
  max-height: min(560px, calc(100vh - 120px));
  display: flex;
  flex-direction: column;
  background: var(--brw-panel-bg, var(--brw-panel-bg-base));
  border: 1px solid var(--brw-border, var(--brw-border-base));
  border-radius: 16px;
  box-shadow: var(--brw-shadow, var(--brw-shadow-base));
  z-index: 2147483647;
  overflow: hidden;
}
.brw-panel-br { right: 24px; }
.brw-panel-bl { left: 24px; }
.brw-panel-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 16px;
  border-bottom: 1px solid var(--brw-border, var(--brw-border-base));
  font-weight: 600;
  font-size: 14px;
}
.brw-panel-title { flex: 1; margin: 0; font-size: 14px; font-weight: 600; }
.brw-icon-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: none;
  background: transparent;
  color: var(--brw-fg, var(--brw-fg-base));
  cursor: pointer;
  border-radius: 6px;
}
.brw-icon-btn:hover { background: color-mix(in srgb, var(--brw-fg, var(--brw-fg-base)) 8%, transparent); }
.brw-icon-btn[disabled] { opacity: 0.5; cursor: not-allowed; }
.brw-body {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px 16px;
  flex: 1;
  min-height: 0;
}
.brw-attachments {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.brw-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 8px;
  border: 1px solid var(--brw-border, var(--brw-border-base));
  border-radius: 999px;
  font-size: 12px;
}
.brw-chip-remove {
  border: none;
  background: transparent;
  color: var(--brw-fg-muted, var(--brw-fg-muted-base));
  cursor: pointer;
  font-size: 14px;
  line-height: 1;
}
.brw-textarea {
  width: 100%;
  box-sizing: border-box;
  resize: vertical;
  min-height: 96px;
  max-height: 200px;
  padding: 10px;
  border: 1px solid var(--brw-border, var(--brw-border-base));
  border-radius: 8px;
  background: var(--brw-panel-bg, var(--brw-panel-bg-base));
  color: var(--brw-fg, var(--brw-fg-base));
  font: inherit;
  font-size: 14px;
}
.brw-error { color: var(--brw-error, var(--brw-error-base)); font-size: 13px; }
.brw-success { color: var(--brw-fg-muted, var(--brw-fg-muted-base)); font-size: 13px; }
.brw-actions {
  display: flex;
  gap: 8px;
  padding: 12px 16px;
  border-top: 1px solid var(--brw-border, var(--brw-border-base));
}
.brw-btn {
  flex: 1;
  padding: 8px 12px;
  border-radius: 8px;
  border: 1px solid var(--brw-border, var(--brw-border-base));
  background: var(--brw-panel-bg, var(--brw-panel-bg-base));
  color: var(--brw-fg, var(--brw-fg-base));
  font: inherit;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
}
.brw-btn-primary {
  background: var(--brw-accent, var(--brw-accent-base));
  color: var(--brw-accent-fg, var(--brw-accent-fg-base));
  border-color: transparent;
}
.brw-btn[disabled] { opacity: 0.5; cursor: not-allowed; }
.brw-footer {
  padding: 8px 16px;
  border-top: 1px solid var(--brw-border, var(--brw-border-base));
  font-size: 11px;
  color: var(--brw-fg-muted, var(--brw-fg-muted-base));
  text-align: center;
}
.brw-footer a { color: inherit; text-decoration: none; }
.brw-footer a:hover { text-decoration: underline; }
`;
