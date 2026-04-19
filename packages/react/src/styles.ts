/**
 * Styles are injected via a single <style> tag rendered into the tree so the
 * package has zero CSS-loader requirements — consumers can drop the package
 * into any bundler (Next.js, Vite, Webpack) without config. Theming is done
 * through CSS variables and `prefers-color-scheme`.
 */
export const BREVWICK_STYLE_ID = 'brevwick-react-styles';

export const BREVWICK_CSS = `
.brw-root {
  --brw-bg: #ffffff;
  --brw-fg: #0f172a;
  --brw-muted: #64748b;
  --brw-border: #e2e8f0;
  --brw-accent: #0f172a;
  --brw-accent-fg: #ffffff;
  --brw-error: #b91c1c;
  --brw-success: #047857;
  --brw-panel-bg: #ffffff;
  --brw-bubble-assistant-bg: #f1f5f9;
  --brw-bubble-user-bg: #0f172a;
  --brw-bubble-user-fg: #ffffff;
  --brw-chip-bg: #f1f5f9;
  --brw-composer-bg: #ffffff;
  --brw-divider: #e2e8f0;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
  color: var(--brw-fg);
}
@media (prefers-color-scheme: dark) {
  .brw-root {
    --brw-bg: #0f172a;
    --brw-fg: #f8fafc;
    --brw-muted: #94a3b8;
    --brw-border: #1e293b;
    --brw-accent: #f8fafc;
    --brw-accent-fg: #0f172a;
    --brw-panel-bg: #0b1220;
    --brw-bubble-assistant-bg: #1e293b;
    --brw-bubble-user-bg: #f8fafc;
    --brw-bubble-user-fg: #0f172a;
    --brw-chip-bg: #1e293b;
    --brw-composer-bg: #0b1220;
    --brw-divider: #1e293b;
  }
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
  box-shadow: 0 6px 20px rgba(0,0,0,0.18), 0 2px 4px rgba(0,0,0,0.08);
  transition: transform 120ms ease-out, box-shadow 120ms ease-out;
}
.brw-fab:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 10px 24px rgba(0,0,0,0.22), 0 3px 6px rgba(0,0,0,0.1);
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
  box-shadow: 0 20px 48px rgba(0,0,0,0.25), 0 6px 12px rgba(0,0,0,0.12);
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
  color: var(--brw-muted);
  border-radius: 6px;
  cursor: pointer;
  font: inherit;
  line-height: 1;
}
.brw-icon-btn:hover:not(:disabled) { background: var(--brw-chip-bg); color: var(--brw-fg); }
.brw-icon-btn:focus-visible { outline: 2px solid var(--brw-accent); outline-offset: 1px; }
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
  padding: 6px 8px 6px 10px;
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
.brw-chip-size { color: var(--brw-muted); }
.brw-chip-remove {
  width: 20px; height: 20px;
  padding: 0;
  display: inline-flex; align-items: center; justify-content: center;
  border: none;
  background: transparent;
  color: var(--brw-muted);
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
  color: var(--brw-muted);
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
  color: var(--brw-muted);
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
  display: flex;
  align-items: flex-end;
  gap: 6px;
  padding: 8px 10px;
  background: var(--brw-composer-bg);
  border-top: 1px solid var(--brw-divider);
}
.brw-composer-input {
  flex: 1;
  min-height: 34px;
  max-height: 120px;
  box-sizing: border-box;
  padding: 8px 10px;
  font: inherit;
  font-size: 13px;
  color: var(--brw-fg);
  background: var(--brw-panel-bg);
  border: 1px solid var(--brw-border);
  border-radius: 10px;
  resize: none;
  overflow-y: auto;
  line-height: 1.4;
}
.brw-composer-input:focus-visible { outline: 2px solid var(--brw-accent); outline-offset: -1px; }
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
`;
