/**
 * Styles are injected via a single <style> tag rendered into the tree so the
 * package has zero CSS-loader requirements — consumers can drop the package
 * into any bundler (Vite, webpack, Nuxt) without config.
 *
 * The CSS payload mirrors `@tatlacas/brevwick-react`'s `BREVWICK_CSS` byte-for-
 * byte (minus the React-specific `BREVWICK_STYLE_ID` constant) so any consumer
 * that themed the React widget gets the same palette and surfaces here. Each
 * adapter ships its own copy for now — sharing CSS into a separate package is
 * tracked as a follow-up.
 *
 * Theming uses a **dual-variable pattern** so the forced-theme prop can swap
 * palettes without stepping on host-level overrides:
 *
 * - `--brw-*-base` holds the shipped defaults (light + `prefers-color-scheme`
 *   dark + `<FeedbackButton theme="light|dark">` forced palettes). Set only
 *   by this stylesheet; consumers should **not** target these.
 * - `--brw-*` is the public override name. Widget rules consume
 *   `var(--brw-X, var(--brw-X-base))` — the consumer's `--brw-X` value is
 *   preferred, and we fall back to the base-palette default when nothing
 *   is set.
 *
 * So a consumer who writes `:root { --brw-accent: hotpink }` keeps their
 * accent under every palette — including `theme="dark"` — because the
 * widget asks for `--brw-accent` first. The forced-theme blocks only set
 * `--brw-*-base`, not `--brw-*`, so they never shadow a consumer override.
 */
export const BREVWICK_STYLE_ID = 'brevwick-vue-styles';

/**
 * Maximum autogrow height of the composer textarea in pixels.
 *
 * Shared between JS (the autogrow effect sets `style.height` against
 * `scrollHeight` bounded by this) and CSS (`.brw-composer-input` uses
 * the same value as `max-height`). Single source of truth so a designer
 * bumping the ceiling does not drift the two out of sync.
 */
export const COMPOSER_MAX_HEIGHT_PX = 120;

// Launcher (`.brw-fab`) notes — kept OUTSIDE the template literal because
// CSS comments inside `BREVWICK_CSS` ship in the bundle and the Vue package
// budget (< 10 kB gzip) has no room for prose. The React adapter carries the
// same notes inline; the rules below are byte-identical to its stylesheet.
//
// - `.brw-fab` is the variant-independent chrome; pill geometry lives under
//   `.brw-fab--bubble` (legacy corner pill, safe-area-inset corners, compact
//   48px circle). Only transform animates; box-shadow intentionally static.
// - `.brw-fab--tab` (NEW DEFAULT): `writing-mode: vertical-rl` flips the
//   inline axis vertical — the flex row (icon, label) stacks top→bottom and
//   the label glyphs read top→bottom, rotated 90° cw. The left tab adds
//   `rotate: 180deg` (the standalone property, NOT transform, so it composes
//   with the hover translateX) — flat edge stays against the viewport edge,
//   radii mirror automatically, and the label reads bottom→top,
//   Userback-style. Rounded on the page-facing side, flat against the edge
//   (right-tab orientation; the left tab's rotate mirrors it); `border-right:
//   none` removes the hairline on the flat edge (for `.brw-fab-l` the
//   pre-rotation right edge IS the viewport edge).
// - Tab hover pulls the tab 2px out of the edge (`translateY(-50%)` must be
//   restated — transform is overwritten, not merged). For `.brw-fab-l` the
//   180° rotate flips -2px into +2px visually: also away from its edge.
// - Compact tab: square-ish icon-only edge chip.
// - `--brw-fab-tab-offset` is set inline by the adapter only when
//   `offset !== 0`; it is a positioning input, not part of the public
//   `--brw-*` theming contract (no `-base` twin).
export const BREVWICK_CSS =
  `
:where(:root) {
  /* Surfaces */
  --brw-panel-bg-base: #ffffff;
  --brw-bubble-assistant-bg-base: #f1f5f9;
  --brw-bubble-user-bg-base: #0f172a;
  --brw-bubble-user-fg-base: #ffffff;
  --brw-chip-bg-base: #f1f5f9;
  --brw-composer-bg-base: #ffffff;
  /* Text */
  --brw-fg-base: #0f172a;
  --brw-fg-muted-base: #64748b;
  /* Border / focus */
  --brw-border-base: #e2e8f0;
  --brw-border-focus-base: #0f172a;
  --brw-divider-base: #e2e8f0;
  /* Accent */
  --brw-accent-base: #0f172a;
  --brw-accent-fg-base: #ffffff;
  /* Shadow */
  --brw-shadow-base: 0 20px 48px rgba(15, 23, 42, 0.18), 0 6px 12px rgba(15, 23, 42, 0.08);
  /* Status colour — widget-internal, not part of the public override
     contract. No public alias; widget rules consume --brw-error-base
     directly. Carried through dark mode (same hue reads adequately on
     the dark --brw-panel-bg); override in the dark block if design ever
     wants a tuned variant. */
  --brw-error-base: #b91c1c;
  /* Success / check colour for the staged-status checklist. Matches the
     emerald used in the marketing AnimatedDemo so the in-widget checklist
     reads as the same affordance the docs preview. Widget-internal: no
     public --brw-success alias by design — host overrides flow through
     --brw-accent for chrome and don't need a knob for the green tick. */
  --brw-success-base: #10b981;
}
@media (prefers-color-scheme: dark) {
  :where(:root) {
    /* Surfaces */
    --brw-panel-bg-base: #0b1220;
    --brw-bubble-assistant-bg-base: #1e293b;
    --brw-bubble-user-bg-base: #f8fafc;
    --brw-bubble-user-fg-base: #0f172a;
    /* chip bg is one step brighter than --brw-border (#1e293b) so the chip's
       1px border stays visible against the chip body in dark mode. */
    --brw-chip-bg-base: #253044;
    --brw-composer-bg-base: #0b1220;
    /* Text */
    --brw-fg-base: #f8fafc;
    --brw-fg-muted-base: #94a3b8;
    /* Border / focus */
    --brw-border-base: #1e293b;
    --brw-border-focus-base: #f8fafc;
    --brw-divider-base: #1e293b;
    /* Accent */
    --brw-accent-base: #f8fafc;
    --brw-accent-fg-base: #0f172a;
    /* Shadow — deeper alpha so the panel still reads as lifted over a dark host */
    --brw-shadow-base: 0 20px 48px rgba(0, 0, 0, 0.55), 0 6px 12px rgba(0, 0, 0, 0.35);
    /* Brighter emerald (500→400) keeps the tick legible on dark panels. */
    --brw-success-base: #34d399;
  }
}
` +
  // Forced palettes via <FeedbackButton theme="light|dark">. These rewrite
  // --brw-*-base on .brw-root, so they replace the OS-driven defaults for
  // the widget subtree without ever writing to the public --brw-* names.
  // That preserves host-level :root overrides (the widget consumer path
  // always asks for --brw-X first, with --brw-X-base only as fallback —
  // see the BREVWICK_STYLE_ID jsdoc above). theme="system" deliberately
  // has no rule; the :where(:root) defaults plus the media query already
  // do the right thing. Values duplicated rather than extracted because
  // the stylesheet ships as a literal template string with zero build
  // tooling. (TS comment, not a CSS comment, so it does not ship in the
  // bundle — see the budget note above BREVWICK_CSS.)
  `.brw-root[data-brw-theme='light'] {
  --brw-panel-bg-base: #ffffff;
  --brw-bubble-assistant-bg-base: #f1f5f9;
  --brw-bubble-user-bg-base: #0f172a;
  --brw-bubble-user-fg-base: #ffffff;
  --brw-chip-bg-base: #f1f5f9;
  --brw-composer-bg-base: #ffffff;
  --brw-fg-base: #0f172a;
  --brw-fg-muted-base: #64748b;
  --brw-border-base: #e2e8f0;
  --brw-border-focus-base: #0f172a;
  --brw-divider-base: #e2e8f0;
  --brw-accent-base: #0f172a;
  --brw-accent-fg-base: #ffffff;
  --brw-shadow-base: 0 20px 48px rgba(15, 23, 42, 0.18), 0 6px 12px rgba(15, 23, 42, 0.08);
  --brw-success-base: #10b981;
}
.brw-root[data-brw-theme='dark'] {
  --brw-panel-bg-base: #0b1220;
  --brw-bubble-assistant-bg-base: #1e293b;
  --brw-bubble-user-bg-base: #f8fafc;
  --brw-bubble-user-fg-base: #0f172a;
  --brw-chip-bg-base: #253044;
  --brw-composer-bg-base: #0b1220;
  --brw-fg-base: #f8fafc;
  --brw-fg-muted-base: #94a3b8;
  --brw-border-base: #1e293b;
  --brw-border-focus-base: #f8fafc;
  --brw-divider-base: #1e293b;
  --brw-accent-base: #f8fafc;
  --brw-accent-fg-base: #0f172a;
  --brw-shadow-base: 0 20px 48px rgba(0, 0, 0, 0.55), 0 6px 12px rgba(0, 0, 0, 0.35);
  --brw-success-base: #34d399;
}
.brw-root {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
  color: var(--brw-fg, var(--brw-fg-base));
}
.brw-fab {
  position: fixed;
  z-index: 2147483000;
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
.brw-fab:disabled { cursor: not-allowed; opacity: 0.5; }
.brw-fab:focus-visible {
  outline: 2px solid var(--brw-border-focus, var(--brw-border-focus-base));
  outline-offset: 2px;
}
.brw-fab-icon { width: 18px; height: 18px; flex-shrink: 0; }
.brw-fab--bubble {
  bottom: calc(24px + env(safe-area-inset-bottom, 0px));
  height: 48px;
  min-width: 48px;
  padding: 0 18px;
  border-radius: 999px;
}
.brw-fab--bubble:hover:not(:disabled) { transform: translateY(-1px); }
.brw-fab-br { right: calc(24px + env(safe-area-inset-right, 0px)); }
.brw-fab-bl { left: calc(24px + env(safe-area-inset-left, 0px)); }
.brw-fab--bubble.brw-fab--compact {
  width: 48px;
  min-width: 48px;
  padding: 0;
  justify-content: center;
}
.brw-fab--tab {
  top: calc(50% + var(--brw-fab-tab-offset, 0px));
  transform: translateY(-50%);
  writing-mode: vertical-rl;
  min-height: 48px;
  width: 40px;
  padding: 16px 0;
  justify-content: center;
  border-radius: 10px 0 0 10px;
}
.brw-fab-r {
  right: env(safe-area-inset-right, 0px);
  border-right: none;
}
.brw-fab-l {
  left: env(safe-area-inset-left, 0px);
  border-right: none;
  rotate: 180deg;
}
.brw-fab--tab:hover:not(:disabled) {
  transform: translateY(-50%) translateX(-2px);
}
.brw-fab-label { letter-spacing: 0.02em; }
.brw-fab--tab.brw-fab--compact {
  width: 44px;
  min-height: 44px;
  padding: 0;
}
.brw-panel {
  position: fixed;
  z-index: 2147483002;
  bottom: 24px;
  width: min(92vw, 400px);
  height: min(80vh, 640px);
  display: flex;
  flex-direction: column;
  background: var(--brw-panel-bg, var(--brw-panel-bg-base));
  color: var(--brw-fg, var(--brw-fg-base));
  border: 1px solid var(--brw-border, var(--brw-border-base));
  border-radius: 16px 16px 12px 12px;
  box-shadow: var(--brw-shadow, var(--brw-shadow-base));
  overflow: hidden;
  animation: brw-slide-up 200ms ease-out;
}
.brw-panel-br { right: 24px; }
.brw-panel-bl { left: 24px; }
.brw-panel-hidden { visibility: hidden; pointer-events: none; }
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
  border-bottom: 1px solid var(--brw-divider, var(--brw-divider-base));
  flex-shrink: 0;
}
.brw-panel-avatar {
  width: 28px; height: 28px;
  border-radius: 999px;
  background: var(--brw-accent, var(--brw-accent-base));
  color: var(--brw-accent-fg, var(--brw-accent-fg-base));
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
  color: var(--brw-fg-muted, var(--brw-fg-muted-base));
  border-radius: 6px;
  cursor: pointer;
  font: inherit;
  line-height: 1;
}
.brw-icon-btn:hover:not(:disabled) { background: var(--brw-chip-bg, var(--brw-chip-bg-base)); color: var(--brw-fg, var(--brw-fg-base)); }
.brw-icon-btn:focus-visible { outline: 2px solid var(--brw-border-focus, var(--brw-border-focus-base)); outline-offset: 1px; }
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
  background: var(--brw-panel-bg, var(--brw-panel-bg-base));
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
  background: var(--brw-bubble-assistant-bg, var(--brw-bubble-assistant-bg-base));
  color: var(--brw-fg, var(--brw-fg-base));
  border-bottom-left-radius: 4px;
}
.brw-bubble--user {
  align-self: flex-end;
  background: var(--brw-bubble-user-bg, var(--brw-bubble-user-bg-base));
  color: var(--brw-bubble-user-fg, var(--brw-bubble-user-fg-base));
  border-bottom-right-radius: 4px;
}
.brw-bubble--receipt {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-top: 6px;
  font-size: 11px;
  color: var(--brw-fg-muted, var(--brw-fg-muted-base));
}
.brw-bubble--receipt svg { flex-shrink: 0; }
/* Dev-only "copy raw payload" button (config.debug). Sits under the bubble
   text, muted, so it never competes with real widget chrome. */
.brw-copy-raw {
  display: block;
  margin-top: 6px;
  padding: 2px 6px;
  font: inherit;
  font-size: 11px;
  line-height: 1.4;
  background: transparent;
  border: 1px solid var(--brw-bubble-user-fg, var(--brw-bubble-user-fg-base));
  border-radius: 6px;
  color: var(--brw-bubble-user-fg, var(--brw-bubble-user-fg-base));
  opacity: 0.7;
  cursor: pointer;
}
.brw-copy-raw:hover { opacity: 1; }
.brw-chip {
  align-self: flex-end;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  background: var(--brw-chip-bg, var(--brw-chip-bg-base));
  color: var(--brw-fg, var(--brw-fg-base));
  border: 1px solid var(--brw-border, var(--brw-border-base));
  border-radius: 12px;
  font-size: 12px;
  max-width: 85%;
}
.brw-chip img {
  width: 28px; height: 28px;
  object-fit: cover;
  border-radius: 4px;
  flex-shrink: 0;
  display: block;
}
.brw-chip-preview-btn {
  padding: 0;
  border: none;
  background: transparent;
  cursor: pointer;
  display: inline-flex;
  border-radius: 4px;
  flex-shrink: 0;
}
.brw-chip-preview-btn:focus-visible {
  outline: 2px solid var(--brw-border-focus, var(--brw-border-focus-base));
  outline-offset: 2px;
}
.brw-chip-name { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 180px; }
.brw-chip-size { color: var(--brw-fg-muted, var(--brw-fg-muted-base)); }
.brw-chip-remove {
  width: 20px; height: 20px;
  padding: 0;
  display: inline-flex; align-items: center; justify-content: center;
  border: none;
  background: transparent;
  color: var(--brw-fg-muted, var(--brw-fg-muted-base));
  border-radius: 999px;
  cursor: pointer;
  font: inherit;
  line-height: 1;
}
.brw-chip-remove:hover { background: var(--brw-border, var(--brw-border-base)); color: var(--brw-fg, var(--brw-fg-base)); }
.brw-disclosure {
  align-self: flex-start;
  background: transparent;
  border: none;
  padding: 0;
  color: var(--brw-fg-muted, var(--brw-fg-muted-base));
  font: inherit;
  font-size: 12px;
  cursor: pointer;
  text-decoration: underline;
}
.brw-disclosure:hover { color: var(--brw-fg, var(--brw-fg-base)); }
.brw-disclosure-panel {
  align-self: stretch;
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 8px 10px;
  background: var(--brw-chip-bg, var(--brw-chip-bg-base));
  border: 1px solid var(--brw-border, var(--brw-border-base));
  border-radius: 10px;
}
.brw-disclosure-label {
  font-size: 11px;
  font-weight: 600;
  color: var(--brw-fg-muted, var(--brw-fg-muted-base));
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.brw-disclosure-input {
  width: 100%;
  box-sizing: border-box;
  padding: 6px 8px;
  font: inherit;
  font-size: 12px;
  color: var(--brw-fg, var(--brw-fg-base));
  background: var(--brw-panel-bg, var(--brw-panel-bg-base));
  border: 1px solid var(--brw-border, var(--brw-border-base));
  border-radius: 6px;
  resize: vertical;
  min-height: 34px;
}
.brw-composer {
  flex-shrink: 0;
  padding: 8px 10px;
  background: var(--brw-composer-bg, var(--brw-composer-bg-base));
  border-top: 1px solid var(--brw-divider, var(--brw-divider-base));
}
.brw-composer-shell {
  display: flex;
  align-items: flex-end;
  gap: 4px;
  padding: 6px 8px;
  background: var(--brw-composer-bg, var(--brw-composer-bg-base));
  border: 1px solid var(--brw-border, var(--brw-border-base));
  border-radius: 12px;
  transition: border-color 120ms ease-out;
}
.brw-composer-shell:focus-within {
  border-color: var(--brw-border-focus, var(--brw-border-focus-base));
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
  color: var(--brw-fg, var(--brw-fg-base));
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
  border: 1px solid var(--brw-accent, var(--brw-accent-base));
  background: var(--brw-accent, var(--brw-accent-base));
  color: var(--brw-accent-fg, var(--brw-accent-fg-base));
  border-radius: 10px;
  cursor: pointer;
  flex-shrink: 0;
}
.brw-aitoggle-wrap {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 34px;
  padding: 0 4px;
}
.brw-aitoggle-text {
  font-size: 12px;
  font-weight: 500;
  color: var(--brw-fg-muted, var(--brw-fg-muted-base));
  line-height: 1;
  user-select: none;
  transition: color 120ms ease-out;
}
.brw-aitoggle-wrap:has(.brw-aitoggle--on) .brw-aitoggle-text {
  color: var(--brw-fg, var(--brw-fg-base));
}
.brw-aitoggle {
  position: relative;
  flex-shrink: 0;
  width: 30px;
  height: 18px;
  padding: 0;
  border-radius: 999px;
  border: 1px solid var(--brw-border, var(--brw-border-base));
  background: var(--brw-chip-bg, var(--brw-chip-bg-base));
  cursor: pointer;
  transition: background-color 120ms ease-out, border-color 120ms ease-out;
}
.brw-aitoggle:focus-visible { outline: 2px solid var(--brw-border-focus, var(--brw-border-focus-base)); outline-offset: 2px; }
.brw-aitoggle:disabled { opacity: 0.5; cursor: not-allowed; }
.brw-aitoggle-thumb {
  position: absolute;
  top: 50%;
  left: 2px;
  width: 12px;
  height: 12px;
  border-radius: 999px;
  background: var(--brw-fg-muted, var(--brw-fg-muted-base));
  transform: translateY(-50%);
  transition: left 140ms ease-out, background-color 120ms ease-out;
}
.brw-aitoggle--on {
  background: var(--brw-accent, var(--brw-accent-base));
  border-color: var(--brw-accent, var(--brw-accent-base));
}
.brw-aitoggle--on .brw-aitoggle-thumb {
  left: calc(100% - 14px);
  background: var(--brw-accent-fg, var(--brw-accent-fg-base));
}
@media (prefers-reduced-motion: reduce) {
  .brw-aitoggle, .brw-aitoggle-thumb, .brw-aitoggle-text { transition: none; }
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
  background: var(--brw-chip-bg, var(--brw-chip-bg-base));
  border: 1px solid var(--brw-border, var(--brw-border-base));
  border-radius: 10px;
  font-size: 12px;
}
.brw-confirm-msg { flex: 1; }
.brw-btn {
  height: 30px;
  padding: 0 12px;
  border-radius: 8px;
  border: 1px solid var(--brw-border, var(--brw-border-base));
  background: var(--brw-panel-bg, var(--brw-panel-bg-base));
  color: var(--brw-fg, var(--brw-fg-base));
  font: inherit;
  font-size: 12px;
  cursor: pointer;
}
.brw-btn:hover:not(:disabled) { background: var(--brw-chip-bg, var(--brw-chip-bg-base)); }
.brw-btn-primary {
  background: var(--brw-accent, var(--brw-accent-base));
  color: var(--brw-accent-fg, var(--brw-accent-fg-base));
  border-color: var(--brw-accent, var(--brw-accent-base));
}
.brw-error { color: var(--brw-error-base); font-size: 12px; align-self: stretch; }
` +
  // Staged-status rows: progress indicators, not conversation bubbles.
  // They sit under a dashed top divider as a compact stacked checklist,
  // mirroring the marketing AnimatedDemo widget mock — and intentionally
  // stay outside the .brw-bubble class family so message-count queries
  // ignore them. .brw-status-rows is the grouping container that owns the
  // divider + stacking; .brw-status-row is one ticked line. The
  // animation-delay is set inline per row so the three rows fade in
  // sequentially under the shared @keyframes entrance even when the
  // underlying SDK phase events fire microseconds apart. The
  // reduced-motion media query collapses the entrance to an instant fade,
  // pairing with the inline 0ms delay the adapter passes when the user
  // has prefers-reduced-motion: reduce. (TS comment, not a CSS comment, so
  // it does not ship in the bundle — see the budget note above BREVWICK_CSS.)
  `.brw-status-rows {
  align-self: stretch;
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-top: 2px;
  padding-top: 8px;
  border-top: 1px dashed var(--brw-divider, var(--brw-divider-base));
}
.brw-status-row {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  line-height: 1.4;
  color: var(--brw-fg-muted, var(--brw-fg-muted-base));
  animation: brw-status-row-in 220ms ease-out both;
}
.brw-status-row-check {
  display: inline-flex;
  width: 12px;
  height: 12px;
  align-items: center;
  justify-content: center;
  color: var(--brw-success-base);
  flex-shrink: 0;
}
.brw-status-row-check svg {
  width: 12px;
  height: 12px;
}
/* The shared .brw-spinner ships at 14px so it reads at full size in the
   composer; inside the staged-status checklist it has to match the 12px
   tick so the third row's indicator sits on the same baseline as the
   first two. */
.brw-status-row .brw-spinner {
  width: 12px;
  height: 12px;
}
.brw-status-row-label { flex: 1; }
/* The retry row is a standalone alert that sits outside the checklist
   container, so it carries its own chrome — padding, radius, border —
   instead of inheriting the checklist's tick-line minimalism. The
   background stays transparent so the red border + red label read as
   an alert overlay rather than a filled bubble surface. */
.brw-status-row--error {
  align-self: stretch;
  padding: 10px 12px;
  border-radius: 10px;
  background: transparent;
  color: var(--brw-error-base);
  border: 1px solid var(--brw-error-base);
  font-size: 13px;
  line-height: 1.45;
}
.brw-status-row-retry {
  margin-left: auto;
  padding: 4px 10px;
  font-size: 12px;
}
@keyframes brw-status-row-in {
  from { opacity: 0; transform: translateY(4px); }
  to { opacity: 1; transform: none; }
}
@media (prefers-reduced-motion: reduce) {
  .brw-status-row { animation: none; }
}
.brw-panel-footer {
  flex-shrink: 0;
  padding: 6px 10px 8px;
  text-align: center;
  background: var(--brw-composer-bg, var(--brw-composer-bg-base));
}
.brw-panel-footer-link {
  font-size: 10px;
  letter-spacing: 0.02em;
  color: var(--brw-fg-muted, var(--brw-fg-muted-base));
  text-decoration: none;
  opacity: 0.75;
  transition: opacity 120ms ease-out, color 120ms ease-out;
}
.brw-panel-footer-link:hover,
.brw-panel-footer-link:focus-visible {
  opacity: 1;
  color: var(--brw-fg, var(--brw-fg-base));
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
.brw-sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}
.brw-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.35);
  z-index: 2147483001;
}
`;
