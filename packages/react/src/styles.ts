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
  --brw-overlay: rgba(15, 23, 42, 0.45);
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
    --brw-overlay: rgba(0, 0, 0, 0.6);
  }
}
.brw-fab {
  position: fixed;
  z-index: 2147483000;
  bottom: 20px;
  height: 44px;
  min-width: 44px;
  padding: 0 16px;
  border-radius: 999px;
  border: 1px solid var(--brw-border);
  background: var(--brw-accent);
  color: var(--brw-accent-fg);
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  box-shadow: 0 2px 8px rgba(0,0,0,0.15);
}
.brw-fab:disabled { cursor: not-allowed; opacity: 0.5; }
.brw-fab-br { right: 20px; }
.brw-fab-bl { left: 20px; }
.brw-overlay {
  position: fixed; inset: 0; z-index: 2147483001;
  background: var(--brw-overlay);
}
.brw-dialog {
  position: fixed; z-index: 2147483002;
  top: 50%; left: 50%; transform: translate(-50%, -50%);
  width: min(92vw, 480px);
  max-height: 90vh; overflow: auto;
  background: var(--brw-bg);
  color: var(--brw-fg);
  border-radius: 12px;
  border: 1px solid var(--brw-border);
  box-shadow: 0 10px 30px rgba(0,0,0,0.25);
  padding: 20px;
}
.brw-title { margin: 0 0 12px; font-size: 16px; font-weight: 600; }
.brw-field { display: block; margin-bottom: 12px; font-size: 13px; }
.brw-label { display: block; margin-bottom: 4px; color: var(--brw-muted); }
.brw-input, .brw-textarea {
  width: 100%; box-sizing: border-box;
  padding: 8px 10px; font: inherit; color: var(--brw-fg);
  background: var(--brw-bg); border: 1px solid var(--brw-border);
  border-radius: 6px;
}
.brw-textarea { min-height: 72px; resize: vertical; }
.brw-row { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.brw-btn {
  height: 34px; padding: 0 12px; border-radius: 6px;
  border: 1px solid var(--brw-border); background: var(--brw-bg); color: var(--brw-fg);
  font: inherit; cursor: pointer;
}
.brw-btn-primary {
  background: var(--brw-accent); color: var(--brw-accent-fg); border-color: var(--brw-accent);
}
.brw-btn:disabled { opacity: 0.6; cursor: not-allowed; }
.brw-thumb {
  margin-top: 6px;
  display: inline-flex; align-items: center; gap: 8px; font-size: 12px; color: var(--brw-muted);
}
.brw-thumb img { max-width: 96px; max-height: 64px; border-radius: 4px; border: 1px solid var(--brw-border); }
.brw-error { color: var(--brw-error); font-size: 13px; margin-top: 8px; }
.brw-success { color: var(--brw-success); font-size: 13px; margin-top: 8px; }
.brw-spinner {
  display: inline-block; width: 14px; height: 14px;
  border: 2px solid currentColor; border-right-color: transparent;
  border-radius: 999px; vertical-align: -2px; margin-right: 6px;
  animation: brw-spin 0.7s linear infinite;
}
@keyframes brw-spin { to { transform: rotate(360deg); } }
.brw-footer { display: flex; gap: 8px; justify-content: flex-end; margin-top: 16px; }
.brw-files { margin-top: 6px; font-size: 12px; color: var(--brw-muted); }
`;
