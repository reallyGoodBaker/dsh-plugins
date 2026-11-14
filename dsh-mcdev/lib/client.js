window.__ModuleLoader__.load({
  id: '@local/dsh-mcdev',
  factory(require) {
    const React = require('react');
    const h = React.createElement;

    /**
     * MCDEV console: a draggable floating window in the frame-wide `shell.overlay` slot.
     *
     * `shell.overlay` is a root-scope list slot (`id`/`order` registration options, no
     * `sessionId` among its standard props) whose layer is click-through; this entry opts back
     * into pointer events and positions itself with `position:fixed`. The session comes from the
     * documented `useSessions` selector hook: ui-workspace's own `mainSessionId` rule selects the
     * Session retained by the main view (`session.retainedBy.mainView > 0`).
     *
     * Game state is read through `props.remote.commands.execute(sessionId, '/mcdev ... --json', [])`;
     * every command also appends a command-run event to the conversation, so snapshots are cached
     * per session and no poller exists: the first mount reads `/mcdev status` once, every later
     * read is a user action (expand, button, tab open, search) or an explicit Refresh.
     */
    const NS = 'mcdev';
    const SLOT = 'shell.overlay';
    const ENTRY_ID = 'dsh-mcdev';
    /** Incremented on every client re-apply; a new value resets the panel to icon mode. */
    let BOOT_SEQ = 0;
    const ENTRY_ORDER = 20;
    const LOG_LIMIT = 120;
    const LOG_MAX = 200;
    const DOC_LIMIT = 12;
    const TEXT_LIMIT = 20000;
    const START_TIMEOUT_SECONDS = 180;
    /** Panel geometry: viewport inset, capsule height, and the allowed card size. */
    const STORAGE_KEY = 'dsh.mcdev.panel.v4';
    const EDGE_MARGIN = 8;
    const DEFAULT_MARGIN = 24;
    const FAB_SIZE = 56;
    const PANEL_MIN_WIDTH = 320;
    const PANEL_MAX_WIDTH = 520;
    const PANEL_MIN_HEIGHT = 260;
    const PANEL_DEFAULT_WIDTH = 420;
    const PANEL_DEFAULT_HEIGHT = 440;
    const KEYBOARD_STEP = 8;
    const KEYBOARD_STEP_LARGE = 32;

    /**
     * Panel styles: host appearance through `--dsw-alias-*` / radius / focus tokens, with
     * self-contained dual-theme fallbacks that only apply when a token is unavailable.
     * No external package, no DOM outside this component.
     */
    const PANEL_CSS = `
.mcd-root{
  /* Material 3 baseline color roles generated from a green seed (light scheme). */
  --mcd-primary:#3f6b34;
  --mcd-on-primary:#ffffff;
  --mcd-primary-container:#c0f0a8;
  --mcd-on-primary-container:#062100;
  --mcd-secondary:#52634c;
  --mcd-on-secondary:#ffffff;
  --mcd-secondary-container:#d5e8cc;
  --mcd-on-secondary-container:#101f0b;
  --mcd-tertiary:#38656a;
  --mcd-on-tertiary:#ffffff;
  --mcd-tertiary-container:#bcecf1;
  --mcd-on-tertiary-container:#002023;
  --mcd-surface:var(--dsw-alias-bg-layer-1,#fcfdf6);
  --mcd-surface-container-lowest:#ffffff;
  --mcd-surface-container-low:#f6f8f1;
  --mcd-surface-container:#f0f3ea;
  --mcd-surface-container-high:#eaede4;
  --mcd-surface-container-highest:#e4e9dd;
  --mcd-on-surface:var(--dsw-alias-label-primary,#1a1c18);
  --mcd-surface-variant:#dfe4d8;
  --mcd-on-surface-variant:var(--dsw-alias-label-secondary,#43483f);
  --mcd-outline:var(--dsw-alias-border-l3,#74796e);
  --mcd-outline-variant:var(--dsw-alias-border-l2,#c3c8bc);
  --mcd-inverse-surface:#2f312c;
  --mcd-inverse-on-surface:#f1f1eb;
  --mcd-error:#ba1a1a;
  --mcd-error-container:#ffdad6;
  --mcd-on-error-container:#410002;
  --mcd-success:#3f6b34;
  --mcd-warn:#7d5700;
  --mcd-hover:rgba(26,28,24,.08);
  --mcd-pressed:rgba(26,28,24,.12);
  --mcd-focus:var(--dsw-focus-ring-color,#3f6b34);
  --mcd-radius-xl:28px;
  --mcd-radius-lg:16px;
  --mcd-radius-md:12px;
  --mcd-radius-full:999px;
  --mcd-shadow-1:0 1px 2px rgba(0,0,0,.3),0 1px 3px 1px rgba(0,0,0,.15);
  --mcd-shadow-2:0 1px 2px rgba(0,0,0,.3),0 2px 6px 2px rgba(0,0,0,.15);
  --mcd-shadow-3:0 4px 8px 3px rgba(0,0,0,.15),0 1px 3px rgba(0,0,0,.3);
  --mcd-font:var(--dsw-font-family,"Segoe UI",system-ui,-apple-system,"PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif);
  --mcd-mono:var(--dsw-font-markdown-code-font-family,ui-monospace,SFMono-Regular,Menlo,Consolas,"Liberation Mono",monospace);
  position:fixed;z-index:50;box-sizing:border-box;min-width:0;padding:0;border:0;
  border-radius:var(--mcd-radius-xl);background:var(--mcd-surface-container);color:var(--mcd-on-surface);
  font-family:var(--mcd-font);font-size:14px;line-height:20px;text-align:start;pointer-events:auto;overflow:hidden;
  box-shadow:var(--mcd-shadow-3);user-select:none;
  /* Layout/style/paint isolation: dragging, resizing and hot log updates only
     invalidate this subtree instead of the whole Harness view. */
  contain:content;
}
.mcd-root *{box-sizing:border-box}
.mcd-root :focus-visible{outline:2px solid var(--mcd-focus);outline-offset:2px}
.mcd-root[data-dragging=true]{cursor:grabbing}
body[data-ds-dark-theme] .mcd-root{
  --mcd-on-primary:#113800;
  --mcd-primary:#a6d38d;
  --mcd-primary-container:#275011;
  --mcd-on-primary-container:#c0f0a8;
  --mcd-secondary:#b9ccb1;
  --mcd-on-secondary:#243422;
  --mcd-secondary-container:#3a4b36;
  --mcd-on-secondary-container:#d5e8cc;
  --mcd-tertiary:#a0cfd5;
  --mcd-on-tertiary:#00363b;
  --mcd-tertiary-container:#1f4d52;
  --mcd-on-tertiary-container:#bcecf1;
  --mcd-surface:#11140f;
  --mcd-surface-container-lowest:#0c0f0a;
  --mcd-surface-container-low:#1a1c18;
  --mcd-surface-container:#1e211b;
  --mcd-surface-container-high:#282b25;
  --mcd-surface-container-highest:#33362f;
  --mcd-on-surface:#e1e4da;
  --mcd-surface-variant:#43483f;
  --mcd-on-surface-variant:#c3c8bc;
  --mcd-outline:#8d9286;
  --mcd-outline-variant:#43483f;
  --mcd-inverse-surface:#e1e4da;
  --mcd-inverse-on-surface:#2f312c;
  --mcd-error:#ffb4ab;
  --mcd-error-container:#93000a;
  --mcd-on-error-container:#ffdad6;
  --mcd-success:#a6d38d;
  --mcd-warn:#fdd663;
  --mcd-hover:rgba(225,228,218,.08);
  --mcd-pressed:rgba(225,228,218,.12);
  --mcd-focus:var(--dsw-focus-ring-color,#a6d38d);
  --mcd-shadow-1:0 1px 2px rgba(0,0,0,.5),0 1px 3px 1px rgba(0,0,0,.35);
  --mcd-shadow-2:0 1px 2px rgba(0,0,0,.5),0 2px 6px 2px rgba(0,0,0,.35);
  --mcd-shadow-3:0 4px 8px 3px rgba(0,0,0,.4),0 1px 3px rgba(0,0,0,.6);
}
.mcd-root[data-mode=icon]{border-radius:var(--mcd-radius-lg);box-shadow:var(--mcd-shadow-2);overflow:visible}
.mcd-root[data-mode=icon]:hover{box-shadow:var(--mcd-shadow-3)}
.mcd-fab{display:grid;place-items:center;width:100%;height:100%;padding:0;border:0;border-radius:var(--mcd-radius-lg);background:var(--mcd-primary-container);color:var(--mcd-on-primary-container);cursor:pointer;transition:background .15s ease,box-shadow .15s ease}
.mcd-fab:hover{background:color-mix(in srgb,var(--mcd-primary) 26%,transparent)}
.mcd-fab:active{background:color-mix(in srgb,var(--mcd-primary) 34%,transparent)}
.mcd-fab svg{width:30px;height:30px;fill:currentColor;pointer-events:none}
.mcd-fab-badge{position:absolute;right:9px;bottom:9px;width:10px;height:10px;border-radius:50%;background:var(--mcd-on-surface-variant);box-shadow:0 0 0 2px var(--mcd-surface-container)}
.mcd-fab-badge[data-phase=ready]{background:var(--mcd-success)}
.mcd-fab-badge[data-phase=launching]{background:var(--mcd-warn);animation:mcd-pulse 1.2s ease-in-out infinite}
.mcd-fab-badge[data-phase=failed]{background:var(--mcd-error)}
@keyframes mcd-pulse{0%,100%{opacity:1}50%{opacity:.35}}
@media (prefers-reduced-motion:reduce){.mcd-fab-badge[data-phase=launching]{animation:none}}
.mcd-compact{display:flex;flex-direction:column;gap:2px;width:100%;height:auto;padding:4px 8px 6px;border-radius:var(--mcd-radius-xl);background:var(--mcd-surface-container)}
.mcd-compact .mcd-head{padding:2px 0;gap:6px;cursor:grab}
.mcd-compact .mcd-logo{width:28px;height:28px}
.mcd-compact .mcd-logo svg{width:18px;height:18px}
.mcd-compact .mcd-title{font-size:13px}
.mcd-compact .mcd-subtitle{font-size:10px}
.mcd-compact .mcd-actions-row{padding:0;gap:4px}
.mcd-compact .mcd-icon-btn{width:36px;height:36px}
.mcd-compact .mcd-icon-btn svg{width:20px;height:20px}
.mcd-compact .mcd-icon-btn[data-variant=filled]{width:40px;height:40px}
.mcd-logo-btn{padding:0;border:0;font:inherit;cursor:pointer;transition:background .15s ease}
.mcd-logo-btn:hover{background:color-mix(in srgb,var(--mcd-primary) 26%,transparent)}
.mcd-sheet{display:flex;flex-direction:column;width:100%;height:100%;min-height:0;overflow:hidden;border-radius:var(--mcd-radius-xl)}
.mcd-drag-handle{flex:0 0 auto;width:32px;height:4px;margin:8px auto 0;border-radius:2px;background:var(--mcd-outline-variant)}
.mcd-head{display:flex;align-items:center;gap:8px;flex:0 0 auto;min-width:0;padding:6px 8px 6px 12px;cursor:grab;touch-action:none}
.mcd-head[data-dragging=true]{cursor:grabbing}
.mcd-logo{display:grid;place-items:center;flex:0 0 auto;width:32px;height:32px;border-radius:var(--mcd-radius-full);background:var(--mcd-primary-container);color:var(--mcd-on-primary-container)}
.mcd-logo svg{width:20px;height:20px;fill:currentColor}
.mcd-head-text{display:flex;flex-direction:column;min-width:0;gap:1px}
.mcd-title{font-size:14px;font-weight:500;letter-spacing:.1px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.mcd-subtitle{display:flex;align-items:center;gap:5px;font-size:11px;font-weight:500;letter-spacing:.3px;color:var(--mcd-on-surface-variant);white-space:nowrap}
.mcd-status-dot{width:8px;height:8px;border-radius:50%;background:var(--mcd-on-surface-variant);flex:none}
.mcd-status-dot[data-phase=ready]{background:var(--mcd-success)}
.mcd-status-dot[data-phase=launching]{background:var(--mcd-warn)}
.mcd-status-dot[data-phase=failed]{background:var(--mcd-error)}
.mcd-actions{display:flex;align-items:center;gap:2px;margin-left:auto;flex:0 0 auto}
.mcd-icon-btn{display:inline-grid;place-items:center;flex:none;width:40px;height:40px;padding:0;border:0;border-radius:var(--mcd-radius-full);background:transparent;color:var(--mcd-on-surface-variant);cursor:pointer;transition:background .15s ease,color .15s ease;font-family:inherit}
.mcd-icon-btn svg{width:22px;height:22px;fill:currentColor;pointer-events:none}
.mcd-icon-btn:disabled{opacity:.38;cursor:not-allowed}
@media (hover:hover){.mcd-icon-btn:not(:disabled):hover{background:var(--mcd-hover)}}
.mcd-icon-btn:not(:disabled):active{background:var(--mcd-pressed)}
.mcd-icon-btn[data-variant=filled]{background:var(--mcd-primary);color:var(--mcd-on-primary)}
@media (hover:hover){.mcd-icon-btn[data-variant=filled]:not(:disabled):hover{background:color-mix(in srgb,var(--mcd-primary) 88%,#000)}}
.mcd-icon-btn[data-variant=tonal]{background:var(--mcd-primary-container);color:var(--mcd-on-primary-container)}
@media (hover:hover){.mcd-icon-btn[data-variant=tonal]:not(:disabled):hover{background:color-mix(in srgb,var(--mcd-primary) 26%,transparent)}}
.mcd-icon-btn[data-variant=text]{width:36px;height:36px}
.mcd-icon-btn[data-variant=text][aria-pressed=true],.mcd-icon-btn[data-variant=text][data-on=true]{background:var(--mcd-primary-container);color:var(--mcd-on-primary-container)}
.mcd-icon-btn.mcd-busy svg{animation:mcd-spin .9s linear infinite}
@keyframes mcd-spin{to{transform:rotate(360deg)}}
@media (prefers-reduced-motion:reduce){.mcd-icon-btn.mcd-busy svg{animation:none}}
.mcd-body{flex:1 1 auto;display:flex;flex-direction:column;gap:10px;min-height:0;padding:2px 12px 12px;overflow:hidden;user-select:text}
.mcd-actions-row{display:flex;align-items:center;gap:6px;flex:none;flex-wrap:wrap}
.mcd-actions-row .mcd-spacer{flex:1 1 auto}
.mcd-tabs{display:flex;flex:none;gap:4px;padding:4px;border-radius:var(--mcd-radius-full);background:var(--mcd-surface-container-high)}
.mcd-tab{flex:1 1 0;display:flex;align-items:center;justify-content:center;gap:4px;height:34px;border:0;border-radius:var(--mcd-radius-full);background:transparent;color:var(--mcd-on-surface-variant);font-family:inherit;font-size:12px;font-weight:500;cursor:pointer;transition:background .15s ease,color .15s ease}
.mcd-tab svg{width:20px;height:20px;fill:currentColor;pointer-events:none}
@media (hover:hover){.mcd-tab:not([data-on=true]):hover{background:var(--mcd-hover)}}
.mcd-tab[data-on=true]{background:var(--mcd-primary-container);color:var(--mcd-on-primary-container)}
.mcd-panel{display:flex;flex-direction:column;gap:8px;min-width:0;min-height:0;flex:1 1 auto;overflow:hidden}
.mcd-row{display:flex;align-items:center;gap:6px;flex-wrap:wrap;min-width:0}
.mcd-row .mcd-meta{margin-left:auto}
.mcd-seg{display:inline-flex;flex:none;gap:2px;padding:2px;border-radius:var(--mcd-radius-full);background:var(--mcd-surface-container-high)}
.mcd-seg-btn{display:inline-grid;place-items:center;flex:none;width:32px;height:30px;padding:0;border:0;border-radius:var(--mcd-radius-full);background:transparent;color:var(--mcd-on-surface-variant);cursor:pointer;transition:background .15s ease,color .15s ease}
.mcd-seg-btn svg{width:18px;height:18px;fill:currentColor;pointer-events:none}
@media (hover:hover){.mcd-seg-btn:not(:disabled):not([data-on=true]):hover{background:var(--mcd-hover)}}
.mcd-seg-btn[data-on=true]{background:var(--mcd-primary-container);color:var(--mcd-on-primary-container)}
.mcd-seg-btn:disabled{opacity:.38;cursor:not-allowed}
.mcd-input{width:100%;padding:9px 12px;border:1px solid var(--mcd-outline);border-radius:var(--mcd-radius-md);background:transparent;color:var(--mcd-on-surface);font-family:inherit;font-size:13px;line-height:1.4}
.mcd-input:hover{border-color:var(--mcd-on-surface)}
.mcd-input:focus{outline:2px solid var(--mcd-primary);outline-offset:-1px;border-color:transparent}
.mcd-input::placeholder{color:var(--mcd-on-surface-variant)}
.mcd-search{flex:1 1 170px;min-width:0}
.mcd-code{min-height:84px;resize:vertical;font-family:var(--mcd-mono);font-size:12px;line-height:1.5;background:var(--mcd-surface-container-high);border-color:transparent;border-radius:var(--mcd-radius-md)}
.mcd-code:focus{outline:2px solid var(--mcd-primary);background:var(--mcd-surface-container-high)}
.mcd-pre{margin:0;padding:8px 10px;border-radius:var(--mcd-radius-md);background:var(--mcd-surface-container-high);color:var(--mcd-on-surface);font-family:var(--mcd-mono);font-size:11px;line-height:1.55;white-space:pre-wrap;overflow-wrap:anywhere;flex:1 1 auto;min-height:0;overflow:auto}
.mcd-lines{flex:1 1 auto;min-height:0}
.mcd-line{white-space:pre-wrap;overflow-wrap:anywhere}
.mcd-line[data-error=true]{color:var(--mcd-error)}
.mcd-line-seq{color:var(--mcd-on-surface-variant)}
.mcd-hits{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:2px;flex:1 1 0;min-height:72px;overflow:auto}
.mcd-hit{display:flex;flex-direction:column;gap:2px;width:100%;padding:8px 10px;border:0;border-radius:var(--mcd-radius-md);background:transparent;color:var(--mcd-on-surface);font-family:inherit;text-align:start;cursor:pointer}
@media (hover:hover){.mcd-hit:hover{background:var(--mcd-surface-container-high)}}
.mcd-hit[data-on=true]{background:var(--mcd-primary-container);color:var(--mcd-on-primary-container)}
.mcd-hit-title{font-size:12px;font-weight:500;overflow-wrap:anywhere}
.mcd-hit-path{font-family:var(--mcd-mono);font-size:11px;color:var(--mcd-on-surface-variant);overflow-wrap:anywhere}
.mcd-hit-snippet{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;font-size:11px;color:var(--mcd-on-surface-variant);overflow-wrap:anywhere}
.mcd-doc{display:flex;flex-direction:column;gap:6px;min-width:0;flex:2 1 0;min-height:0;padding-top:8px;border-top:1px solid var(--mcd-outline-variant)}
.mcd-doc-path{flex:1 1 auto;min-width:0;font-family:var(--mcd-mono);font-size:11px;color:var(--mcd-on-surface-variant);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.mcd-progress{display:flex;align-items:center;gap:8px;flex:none;padding:0 4px}
.mcd-linear{position:relative;flex:1 1 auto;height:4px;border-radius:2px;background:var(--mcd-surface-container-highest);overflow:hidden}
.mcd-linear::after{content:"";position:absolute;inset:0;width:40%;border-radius:2px;background:var(--mcd-primary);animation:mcd-indeterminate 1.4s ease-in-out infinite}
@keyframes mcd-indeterminate{0%{transform:translateX(-110%)}100%{transform:translateX(280%)}}
@media (prefers-reduced-motion:reduce){.mcd-linear::after{animation:none;transform:none;width:100%;opacity:.5}}
.mcd-progress-text{color:var(--mcd-on-surface-variant);font-size:11px;overflow-wrap:anywhere}
.mcd-hint{margin:0;color:var(--mcd-on-surface-variant);font-size:12px;line-height:1.45;overflow-wrap:anywhere}
.mcd-note{margin:0;color:var(--mcd-on-surface-variant);font-size:12px;line-height:1.45;overflow-wrap:anywhere}
.mcd-error{margin:0;color:var(--mcd-error);font-size:12px;line-height:1.45;overflow-wrap:anywhere}
.mcd-meta{color:var(--mcd-on-surface-variant);font-size:11px;white-space:nowrap}
.mcd-empty{margin:0;padding:8px 0;color:var(--mcd-on-surface-variant);font-size:12px}
.mcd-form{display:flex;flex-direction:column;gap:10px;flex:1 1 auto;min-height:0;overflow:auto}
.mcd-config-section{display:flex;flex-direction:column;gap:6px;padding:8px 10px;border-radius:var(--mcd-radius-md);background:var(--mcd-surface-container-high)}
.mcd-config-head{gap:6px}
.mcd-section-title{flex:1 1 auto;min-width:0;font-size:12px;font-weight:500;color:var(--mcd-on-surface);overflow-wrap:anywhere}
.mcd-select{flex:1 1 auto;min-width:0;padding:9px 10px;border:1px solid var(--mcd-outline);border-radius:var(--mcd-radius-md);background:transparent;color:var(--mcd-on-surface);font-family:inherit;font-size:13px}
.mcd-select:focus{outline:2px solid var(--mcd-primary);outline-offset:-1px}
.mcd-chip{flex:none;display:inline-flex;align-items:center;max-width:100%;padding:4px 10px;border:1px solid var(--mcd-outline-variant);border-radius:var(--mcd-radius-full);background:transparent;color:var(--mcd-on-surface);font-family:inherit;font-size:11px;cursor:pointer;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
@media (hover:hover){.mcd-chip:hover{background:var(--mcd-hover)}}
.mcd-chip[data-on=true]{background:var(--mcd-primary-container);color:var(--mcd-on-primary-container);border-color:transparent}
.mcd-pack-list{display:flex;flex-direction:column;gap:2px;max-height:150px;overflow:auto}
.mcd-check{display:flex;align-items:center;gap:8px;padding:5px 6px;border-radius:var(--mcd-radius-sm);cursor:pointer;user-select:none}
@media (hover:hover){.mcd-check:hover{background:var(--mcd-hover)}}
.mcd-check input{flex:none;width:16px;height:16px;margin:0;accent-color:var(--mcd-primary)}
.mcd-check-name{flex:1 1 auto;min-width:0;font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.mcd-badge{flex:none;padding:1px 6px;border-radius:var(--mcd-radius-full);background:var(--mcd-surface-container-highest);color:var(--mcd-on-surface-variant);font-size:10px}
.mcd-skin-list{display:flex;flex-wrap:wrap;gap:4px;max-height:104px;overflow:auto}
.mcd-settings{overflow:hidden}
.mcd-select-layer{position:absolute;inset:0;z-index:40}
.mcd-select-backdrop{position:absolute;inset:0;background:transparent}
.mcd-menu{position:absolute;z-index:1;display:flex;flex-direction:column;gap:2px;padding:6px;border:1px solid var(--mcd-outline-variant);border-radius:var(--mcd-radius-md);background:var(--mcd-surface-container-highest);box-shadow:var(--mcd-shadow-3);overflow-y:auto;overflow-x:hidden}
.mcd-menu:focus{outline:none}
.mcd-menu-item{display:flex;align-items:center;gap:6px;flex:none;min-height:40px;padding:0 10px;border:0;border-radius:var(--mcd-radius-sm);background:transparent;color:var(--mcd-on-surface);font-family:inherit;font-size:13px;text-align:left;cursor:pointer}
.mcd-menu-item[data-selected=true]{background:var(--mcd-primary-container);color:var(--mcd-on-primary-container)}
.mcd-menu-item:focus-visible{outline:2px solid var(--mcd-focus);outline-offset:-2px}
.mcd-menu-check{display:grid;place-items:center;flex:none;width:18px;height:18px}
.mcd-menu-check svg{width:18px;height:18px;fill:currentColor}
.mcd-menu-label{flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.mcd-select-trigger{display:flex;align-items:center;gap:8px;width:100%;text-align:left;cursor:pointer;color:var(--mcd-on-surface)}
.mcd-select-trigger[data-open=true]{outline:2px solid var(--mcd-primary);outline-offset:-1px;border-color:transparent}
.mcd-select-text{flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.mcd-select-trigger svg{flex:none;width:18px;height:18px;fill:var(--mcd-on-surface-variant)}
.mcd-preset-card{gap:4px}
.mcd-preset-text{display:flex;flex-direction:column;gap:2px;flex:1 1 auto;min-width:0}
.mcd-preset-name{font-size:14px;font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.mcd-preset-exe{opacity:.85}
.mcd-card-actions{display:flex;justify-content:flex-end;gap:4px;flex:none}
.mcd-badge-active{background:var(--mcd-primary-container);color:var(--mcd-on-primary-container)}
.mcd-add-preset{display:flex;align-items:center;justify-content:center;gap:8px;flex:none;height:52px;border:1px dashed var(--mcd-outline);border-radius:var(--mcd-radius-lg);background:transparent;color:var(--mcd-primary);font-family:inherit;font-size:13px;font-weight:500;cursor:pointer}
.mcd-add-preset svg{width:20px;height:20px;fill:currentColor}
@media (hover:hover){.mcd-add-preset:not(:disabled):hover{background:var(--mcd-primary-container);color:var(--mcd-on-primary-container)}}
.mcd-add-preset:disabled{opacity:.38;cursor:not-allowed}
.mcd-topbar{display:flex;align-items:center;gap:2px;flex:none;padding:2px 0 6px;border-bottom:1px solid var(--mcd-outline-variant)}
.mcd-topbar-title{flex:1 1 auto;min-width:0;padding-left:6px;font-size:16px;font-weight:500;letter-spacing:.15px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.mcd-scroll{flex:1 1 auto;min-height:0;overflow:auto;display:flex;flex-direction:column;gap:10px;padding:10px 2px 4px}
.mcd-card{display:flex;flex-direction:column;gap:10px;flex:none;padding:12px;border-radius:var(--mcd-radius-lg);background:var(--mcd-surface-container-high)}
.mcd-card-head{display:flex;align-items:center;gap:8px;min-height:32px}
.mcd-card-title{flex:1 1 auto;min-width:0;display:flex;align-items:center;gap:8px;font-size:14px;font-weight:500;letter-spacing:.1px}
.mcd-card-title svg{width:18px;height:18px;fill:var(--mcd-on-surface-variant)}
.mcd-field{display:flex;flex-direction:column;gap:3px;min-width:0;flex:1 1 auto}
.mcd-field-label{font-size:11px;font-weight:500;letter-spacing:.4px;color:var(--mcd-on-surface-variant);padding-left:2px}
.mcd-field-control{width:100%;min-width:0;min-height:48px;padding:12px;border:1px solid var(--mcd-outline);border-radius:var(--mcd-radius-md);background:transparent;color:var(--mcd-on-surface);font-family:inherit;font-size:13px;line-height:1.3}
.mcd-field-control:focus{outline:2px solid var(--mcd-primary);outline-offset:-1px;border-color:transparent}
.mcd-field-control[readonly]{color:var(--mcd-on-surface-variant)}
.mcd-field-row{display:flex;align-items:flex-end;gap:6px;min-width:0}
.mcd-btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;flex:none;height:40px;padding:0 18px;border:1px solid transparent;border-radius:var(--mcd-radius-full);background:transparent;color:var(--mcd-primary);font-family:inherit;font-size:13px;font-weight:500;letter-spacing:.1px;cursor:pointer;transition:background .15s ease}
.mcd-btn svg{width:18px;height:18px;fill:currentColor}
.mcd-btn[data-variant=filled]{background:var(--mcd-primary);color:var(--mcd-on-primary)}
.mcd-btn[data-variant=tonal]{background:var(--mcd-primary-container);color:var(--mcd-on-primary-container)}
.mcd-btn[data-variant=outlined]{border-color:var(--mcd-outline);color:var(--mcd-primary)}
.mcd-btn:disabled{opacity:.38;cursor:not-allowed}
@media (hover:hover){
  .mcd-btn:not(:disabled):hover{background:var(--mcd-hover)}
  .mcd-btn[data-variant=filled]:not(:disabled):hover{background:color-mix(in srgb,var(--mcd-primary) 88%,#000)}
  .mcd-btn[data-variant=tonal]:not(:disabled):hover{background:var(--mcd-primary-container)}
}
.mcd-switch{position:relative;display:inline-flex;align-items:center;gap:10px;min-height:32px;cursor:pointer;user-select:none}
.mcd-switch input{position:absolute;inset:0;width:100%;height:100%;margin:0;opacity:0;cursor:pointer}
.mcd-switch-track{position:relative;flex:none;width:48px;height:28px;border:2px solid var(--mcd-outline);border-radius:14px;background:var(--mcd-surface-container-highest);transition:background .15s ease,border-color .15s ease}
.mcd-switch-thumb{position:absolute;top:50%;left:4px;width:16px;height:16px;border-radius:50%;background:var(--mcd-outline);transform:translateY(-50%);transition:left .15s ease,width .15s ease,height .15s ease,background .15s ease}
.mcd-switch input:checked + .mcd-switch-track{background:var(--mcd-primary);border-color:var(--mcd-primary)}
.mcd-switch input:checked + .mcd-switch-track .mcd-switch-thumb{left:calc(100% - 22px);width:20px;height:20px;background:var(--mcd-on-primary)}
.mcd-switch input:focus-visible + .mcd-switch-track{outline:2px solid var(--mcd-focus);outline-offset:2px}
.mcd-switch-label{font-size:13px;color:var(--mcd-on-surface)}
.mcd-listitem{display:flex;align-items:center;gap:10px;min-height:48px;padding:4px;border-radius:var(--mcd-radius-md)}
.mcd-avatar{display:grid;place-items:center;flex:none;width:36px;height:36px;border-radius:50%;background:var(--mcd-primary-container);color:var(--mcd-on-primary-container);font-size:13px;font-weight:600}
.mcd-avatar svg{width:18px;height:18px;fill:currentColor}
.mcd-divider{flex:none;height:1px;margin:2px 0;background:var(--mcd-outline-variant)}
.mcd-helper{margin:0;font-size:12px;line-height:1.45;color:var(--mcd-on-surface-variant);overflow-wrap:anywhere}
.mcd-group-label{font-size:12px;font-weight:500;letter-spacing:.2px;color:var(--mcd-on-surface-variant);margin-top:2px}
.mcd-check{display:flex;align-items:center;gap:10px;min-height:36px;padding:2px 4px;border-radius:var(--mcd-radius-sm);cursor:pointer;user-select:none}
@media (hover:hover){.mcd-check:hover{background:var(--mcd-hover)}}
.mcd-check input{flex:none;width:18px;height:18px;margin:0;accent-color:var(--mcd-primary)}
.mcd-check-name{flex:1 1 auto;min-width:0;font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.mcd-chip{flex:none;display:inline-flex;align-items:center;max-width:100%;height:32px;padding:0 12px;border:1px solid var(--mcd-outline-variant);border-radius:var(--mcd-radius-full);background:transparent;color:var(--mcd-on-surface);font-family:inherit;font-size:12px;cursor:pointer;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
@media (hover:hover){.mcd-chip:hover{background:var(--mcd-hover)}}
.mcd-chip[data-on=true]{background:var(--mcd-primary-container);color:var(--mcd-on-primary-container);border-color:transparent}
.mcd-settings-bar{gap:6px;padding:4px 2px;border-bottom:1px solid var(--mcd-outline-variant)}
.mcd-guest-row{gap:6px;flex-wrap:wrap}
.mcd-guest-name{flex:0 0 auto;min-width:64px;font-size:12px;color:var(--mcd-on-surface-variant)}
.mcd-guest-row .mcd-select{flex:1 1 120px}
.mcd-config-section .mcd-input{flex:1 1 auto;width:auto;min-width:0}
.mcd-resize{position:absolute;right:2px;bottom:2px;display:flex;align-items:flex-end;justify-content:flex-end;width:20px;height:20px;padding:0 3px 3px 0;border:0;background:transparent;color:var(--mcd-on-surface-variant);cursor:nwse-resize;touch-action:none;border-radius:0 0 var(--mcd-radius-xl) 0}
.mcd-resize::after{content:"";width:8px;height:8px;border-right:2px solid currentColor;border-bottom:2px solid currentColor;border-bottom-right-radius:2px;opacity:.7}
.mcd-body::-webkit-scrollbar,.mcd-pre::-webkit-scrollbar,.mcd-hits::-webkit-scrollbar{width:8px;height:8px}
.mcd-body::-webkit-scrollbar-thumb,.mcd-pre::-webkit-scrollbar-thumb,.mcd-hits::-webkit-scrollbar-thumb{background:var(--mcd-outline-variant);border-radius:4px}
.mcd-body::-webkit-scrollbar-thumb:hover,.mcd-pre::-webkit-scrollbar-thumb:hover,.mcd-hits::-webkit-scrollbar-thumb:hover{background:var(--mcd-outline)}

.mcd-seg .mcd-icon-btn{width:32px;height:30px}
.mcd-seg .mcd-icon-btn svg{width:18px;height:18px}
.mcd-actions-row .mcd-icon-btn[data-variant=filled]{width:44px;height:44px}
.mcd-actions-row .mcd-icon-btn[data-variant=filled] svg{width:24px;height:24px}
.mcd-actions-row .mcd-icon-btn{margin-right:2px}
.mcd-icon-btn[data-variant=filled] svg{width:24px;height:24px}

/* ================= Material 3 component pass ================= */
.mcd-root{
  --mcd-secondary-container:color-mix(in srgb,var(--mcd-primary) 12%,var(--mcd-surface-container-highest));
  --mcd-on-secondary-container:color-mix(in srgb,var(--mcd-primary) 70%,var(--mcd-on-surface));
  --mcd-ease:cubic-bezier(.2,0,0,1);
  --mcd-ease-emphasized:cubic-bezier(.05,.7,.1,1);
}
body[data-ds-dark-theme] .mcd-root{
  --mcd-secondary-container:color-mix(in srgb,#8fd67a 12%,var(--mcd-surface-container-highest));
  --mcd-on-secondary-container:#b8e6a4;
}
@keyframes mcd-ripple{from{opacity:.16;transform:translate(-50%,-50%) scale(0)}to{opacity:0;transform:translate(-50%,-50%) scale(1)}}
/* shared state-layer + ripple surface */
.mcd-btn,.mcd-icon-btn,.mcd-chip,.mcd-tab,.mcd-menu-item,.mcd-add-preset,.mcd-logo-btn,.mcd-field-control,.mcd-select-trigger{
  position:relative;overflow:hidden;
  transition:background-color .15s var(--mcd-ease),color .15s var(--mcd-ease),border-color .15s var(--mcd-ease),box-shadow .15s var(--mcd-ease),opacity .15s var(--mcd-ease);
}
.mcd-btn::after,.mcd-icon-btn::after,.mcd-chip::after,.mcd-tab::after,.mcd-menu-item::after,.mcd-add-preset::after,.mcd-logo-btn::after{
  content:"";position:absolute;left:var(--mcd-ripple-x,50%);top:var(--mcd-ripple-y,50%);width:160%;aspect-ratio:1;border-radius:50%;background:currentColor;opacity:0;pointer-events:none;transform:translate(-50%,-50%) scale(0);z-index:0;
}
.mcd-btn[data-ripple-run=true]::after,.mcd-icon-btn[data-ripple-run=true]::after,.mcd-chip[data-ripple-run=true]::after,.mcd-tab[data-ripple-run=true]::after,.mcd-menu-item[data-ripple-run=true]::after,.mcd-add-preset[data-ripple-run=true]::after,.mcd-logo-btn[data-ripple-run=true]::after{animation:mcd-ripple .48s var(--mcd-ease)}
@media (prefers-reduced-motion:reduce){.mcd-btn[data-ripple-run=true]::after,.mcd-icon-btn[data-ripple-run=true]::after,.mcd-chip[data-ripple-run=true]::after,.mcd-tab[data-ripple-run=true]::after,.mcd-menu-item[data-ripple-run=true]::after,.mcd-add-preset[data-ripple-run=true]::after,.mcd-logo-btn[data-ripple-run=true]::after{animation:none}}
/* buttons: filled / tonal / outlined / text */
.mcd-btn{height:40px;padding:0 20px;border:1px solid transparent;border-radius:20px;font-size:14px;font-weight:500;letter-spacing:.1px;gap:8px}
.mcd-btn svg{width:18px;height:18px}
.mcd-btn[data-variant=filled]{background-color:var(--mcd-primary);color:var(--mcd-on-primary)}
.mcd-btn[data-variant=tonal]{background-color:var(--mcd-secondary-container);color:var(--mcd-on-secondary-container)}
.mcd-btn[data-variant=outlined]{background-color:transparent;border-color:var(--mcd-outline);color:var(--mcd-primary)}
.mcd-btn:not(:disabled):hover{background-image:linear-gradient(color-mix(in srgb,currentColor 8%,transparent),color-mix(in srgb,currentColor 8%,transparent))}
.mcd-btn:not(:disabled):active{background-image:linear-gradient(color-mix(in srgb,currentColor 12%,transparent),color-mix(in srgb,currentColor 12%,transparent))}
.mcd-btn:disabled{opacity:.38;cursor:not-allowed;background-image:none}
/* icon buttons: 40dp round, M3 variants */
.mcd-icon-btn{border-radius:var(--mcd-radius-full);color:var(--mcd-on-surface-variant)}
.mcd-icon-btn:not(:disabled):hover{background-color:color-mix(in srgb,var(--mcd-on-surface) 8%,transparent)}
.mcd-icon-btn:not(:disabled):active{background-color:color-mix(in srgb,var(--mcd-on-surface) 12%,transparent)}
.mcd-icon-btn[data-variant=filled]{color:var(--mcd-on-primary)}
.mcd-icon-btn[data-variant=tonal]{color:var(--mcd-on-secondary-container)}
/* primary tabs: 48dp, 3dp active indicator */
.mcd-tabs{display:flex;gap:0;padding:0;border-radius:0;background:transparent;border-bottom:1px solid var(--mcd-outline-variant);height:48px}
.mcd-tab{height:48px;border-radius:0;background:transparent;color:var(--mcd-on-surface-variant);font-size:13px;font-weight:500;gap:6px}
.mcd-tab-label{max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.mcd-tab[data-on=true]{background:transparent;color:var(--mcd-primary)}
.mcd-tab[data-on=true]::before{content:"";position:absolute;left:10px;right:10px;bottom:0;height:3px;border-radius:3px 3px 0 0;background:var(--mcd-primary);z-index:1}
.mcd-tab:not(:disabled):hover{background-color:color-mix(in srgb,var(--mcd-on-surface) 8%,transparent)}
.mcd-tab:not(:disabled):active{background-color:color-mix(in srgb,var(--mcd-on-surface) 12%,transparent)}
/* chips: M3 filter chip (8dp radius) */
.mcd-chip{height:32px;padding:0 12px;border-radius:8px;border:1px solid var(--mcd-outline);color:var(--mcd-on-surface-variant);font-size:13px;font-weight:500}
.mcd-chip[data-on=true]{background-color:var(--mcd-secondary-container);border-color:transparent;color:var(--mcd-on-secondary-container)}
.mcd-chip[data-on=true]::before{content:"✓";margin-right:6px;font-size:12px;line-height:1}
.mcd-chip:not(:disabled):hover{background-color:color-mix(in srgb,var(--mcd-on-surface) 8%,transparent)}
/* checkbox: M3 18dp box */
.mcd-check input[type=checkbox]{appearance:none;-webkit-appearance:none;display:grid;place-items:center;flex:none;width:18px;height:18px;margin:0;border:2px solid var(--mcd-outline);border-radius:2px;background:transparent;cursor:pointer;transition:background-color .15s var(--mcd-ease),border-color .15s var(--mcd-ease)}
.mcd-check input[type=checkbox]:checked{background:var(--mcd-primary);border-color:var(--mcd-primary)}
.mcd-check input[type=checkbox]:checked::before{content:"";width:4px;height:8px;margin-top:-2px;border:solid var(--mcd-on-primary);border-width:0 2px 2px 0;transform:rotate(45deg)}
.mcd-check input[type=checkbox]:focus-visible{outline:2px solid var(--mcd-focus);outline-offset:2px}
/* switches: M3 52x32 track, 24dp selected handle */
.mcd-switch-track{width:52px;height:32px;border-radius:16px;background:var(--mcd-surface-container-highest);border:2px solid var(--mcd-outline)}
.mcd-switch-thumb{left:5px;width:16px;height:16px;background:var(--mcd-outline);transition:left .2s var(--mcd-ease),width .2s var(--mcd-ease),height .2s var(--mcd-ease),background-color .2s var(--mcd-ease)}
.mcd-switch input:checked + .mcd-switch-track .mcd-switch-thumb{left:calc(100% - 27px);width:24px;height:24px}
.mcd-switch:hover .mcd-switch-track{box-shadow:0 0 0 8px color-mix(in srgb,var(--mcd-on-surface) 6%,transparent)}
/* text fields: M3 outlined field (4dp radius, floating label) */
.mcd-field{position:relative;padding-top:8px;gap:0}
.mcd-field-label{position:absolute;top:8px;left:8px;z-index:1;padding:0 4px;background:var(--mcd-surface-container-highest);transform:translateY(-50%);font-size:11px;line-height:16px;letter-spacing:.4px;color:var(--mcd-on-surface-variant);white-space:nowrap;max-width:calc(100% - 24px);overflow:hidden;text-overflow:ellipsis}
.mcd-field-control{min-height:52px;padding:12px;border:1px solid var(--mcd-outline);border-radius:4px;background-color:transparent;font-size:14px;line-height:1.3}
.mcd-field-control:focus,.mcd-field-control:focus-within{outline:none;border-color:var(--mcd-primary);box-shadow:inset 0 0 0 1px var(--mcd-primary)}
.mcd-field-control::placeholder{color:var(--mcd-on-surface-variant);opacity:1}
.mcd-select-trigger{display:flex;align-items:center;gap:8px;width:100%;text-align:left;cursor:pointer;color:var(--mcd-on-surface)}
.mcd-select-trigger[data-open=true]{border-color:var(--mcd-primary);box-shadow:inset 0 0 0 1px var(--mcd-primary)}
/* cards: M3 filled card (surface-container-highest, 12dp) */
.mcd-card{background:var(--mcd-surface-container-high);border-radius:12px;padding:16px;gap:12px}
.mcd-badge{display:inline-flex;align-items:center;height:20px;padding:0 8px;border-radius:4px;background:var(--mcd-surface-container-high);color:var(--mcd-on-surface-variant);font-size:11px;font-weight:500;white-space:nowrap}
.mcd-badge-active{background:var(--mcd-secondary-container);color:var(--mcd-on-secondary-container)}
/* menus: M3 dropdown (4dp radius, 48dp items) */
.mcd-menu{background:var(--mcd-surface-container);border:1px solid var(--mcd-outline-variant);border-radius:4px;padding:8px 0;box-shadow:var(--mcd-shadow-3)}
.mcd-menu-item{min-height:48px;padding:0 12px;border-radius:0;font-size:14px}
.mcd-menu-item[data-selected=true]{background:var(--mcd-surface-container-highest);color:var(--mcd-primary)}
.mcd-menu-item:not(:disabled):hover{background-color:color-mix(in srgb,var(--mcd-on-surface) 8%,transparent)}
.mcd-menu-item:not(:disabled):active{background-color:color-mix(in srgb,var(--mcd-on-surface) 12%,transparent)}
/* top app bar (small): 56dp */
.mcd-topbar{height:56px;padding:0 4px;border-bottom:1px solid var(--mcd-outline-variant)}
.mcd-topbar-title{font-size:18px;font-weight:500;letter-spacing:.15px;padding-left:8px}
/* add-preset row */
.mcd-add-preset{height:52px;border-radius:12px;border:1px dashed var(--mcd-outline);color:var(--mcd-primary);font-size:14px;font-weight:500}
.mcd-add-preset:not(:disabled):hover{background-color:color-mix(in srgb,var(--mcd-primary) 8%,transparent)}
/* hints / labels typography */
.mcd-helper{font-size:12px;line-height:1.45;color:var(--mcd-on-surface-variant)}
.mcd-group-label{font-size:12px;letter-spacing:.2px;color:var(--mcd-on-surface-variant)}
.mcd-error{font-size:12px;line-height:1.45;color:var(--mcd-error)}
.mcd-note{font-size:12px;line-height:1.45;color:var(--mcd-on-primary-container)}
/* misc surfaces */
.mcd-logo-btn{border-radius:var(--mcd-radius-full)}
.mcd-logo-btn:not(:disabled):hover{background-color:color-mix(in srgb,var(--mcd-primary) 8%,transparent)}
@media (prefers-reduced-motion:reduce){
  .mcd-btn,.mcd-icon-btn,.mcd-chip,.mcd-tab,.mcd-menu-item,.mcd-add-preset,.mcd-logo-btn,.mcd-field-control,.mcd-select-trigger,.mcd-switch-track,.mcd-switch-thumb,.mcd-check input[type=checkbox]{transition:none}
}

/* ================= Material 3 strict refinements ================= */
/* typescale (M3): Title L 22/28, Title M 16/24, Body M 14/20, Body S 12/16, Label L 14/20, Label M 12/16 */
.mcd-root{font-size:14px;line-height:20px}
.mcd-title{font-size:16px;line-height:24px;font-weight:500}
.mcd-subtitle{font-size:12px;line-height:16px}
.mcd-topbar-title{font-size:22px;line-height:28px;font-weight:400}
.mcd-card-title{font-size:16px;line-height:24px;font-weight:500}
.mcd-field-label{font-weight:500;line-height:16px}
.mcd-btn{font-size:14px;line-height:20px}
.mcd-tab{font-size:14px;line-height:20px}
.mcd-menu-item{font-size:14px;line-height:20px}
.mcd-chip{font-size:14px;line-height:20px}
.mcd-hint,.mcd-helper,.mcd-tooltip{font-size:12px;line-height:16px}
.mcd-line{font-size:12px;line-height:18px}
/* focus indicator uses the primary color (M3) */
.mcd-root :focus-visible{outline:2px solid var(--mcd-primary);outline-offset:2px}
/* extended FAB for the single start/stop action (56dp, 16dp radius, elevation 1→3) */
.mcd-fab-btn,.mcd-actions-row .mcd-icon-btn.mcd-fab-btn{width:56px;height:56px;border-radius:16px;box-shadow:var(--mcd-shadow-1)}
.mcd-fab-btn svg,.mcd-actions-row .mcd-icon-btn.mcd-fab-btn svg{width:24px;height:24px}
.mcd-fab-btn:not(:disabled):hover{box-shadow:var(--mcd-shadow-2)}
.mcd-fab-btn:not(:disabled):active{box-shadow:var(--mcd-shadow-1)}
/* disabled tokens: on-surface 38% content, 12% container */
.mcd-btn:disabled{border-color:transparent;background-color:transparent;color:color-mix(in srgb,var(--mcd-on-surface) 38%,transparent);opacity:1}
.mcd-btn[data-variant=outlined]:disabled{border-color:color-mix(in srgb,var(--mcd-outline) 12%,transparent)}
.mcd-btn[data-variant=filled]:disabled,.mcd-btn[data-variant=tonal]:disabled{background-color:color-mix(in srgb,var(--mcd-on-surface) 12%,transparent);color:color-mix(in srgb,var(--mcd-on-surface) 38%,transparent)}
.mcd-icon-btn[data-variant=filled]:disabled,.mcd-icon-btn[data-variant=tonal]:disabled{background-color:color-mix(in srgb,var(--mcd-on-surface) 12%,transparent);color:color-mix(in srgb,var(--mcd-on-surface) 38%,transparent);opacity:1}
/* outlined field: hover/focus label + border per M3 */
.mcd-field-control:hover:not(:disabled):not(:focus){border-color:var(--mcd-on-surface)}
.mcd-field:focus-within .mcd-field-label{color:var(--mcd-primary)}
.mcd-field-control:disabled{border-color:color-mix(in srgb,var(--mcd-outline) 12%,transparent);color:color-mix(in srgb,var(--mcd-on-surface) 38%,transparent)}
/* checkbox hover state layer */
.mcd-check:hover input[type=checkbox]:not(:checked){background-color:color-mix(in srgb,var(--mcd-on-surface) 8%,transparent)}
/* switch thumb shadow + focus ring per M3 */
.mcd-switch-track{box-shadow:var(--mcd-shadow-1)}
.mcd-switch input:focus-visible + .mcd-switch-track{outline:2px solid var(--mcd-primary);outline-offset:2px}
/* menu / tooltip motion (M3 emphasized decelerate) */
@keyframes mcd-menu-in{from{opacity:0;transform:scale(.9)}to{opacity:1;transform:scale(1)}}
@keyframes mcd-tooltip-in{from{opacity:0;scale:.96}to{opacity:1;scale:1}}
.mcd-menu{animation:mcd-menu-in .3s var(--mcd-ease-emphasized);transform-origin:top center}
.mcd-menu[data-above=true]{transform-origin:bottom center}
.mcd-tooltip{position:absolute;z-index:60;max-width:260px;padding:4px 8px;border-radius:4px;background:var(--mcd-surface-container-highest);color:var(--mcd-on-surface);box-shadow:var(--mcd-shadow-2);pointer-events:none;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;animation:mcd-tooltip-in .2s var(--mcd-ease)}
@media (prefers-reduced-motion:reduce){.mcd-menu,.mcd-tooltip{animation:none}}

/* ===== M3 spec alignment (values from official Material Web tokens v0.192) ===== */
.mcd-root{
  --mcd-dur-short4:200ms;
  --mcd-dur-medium2:300ms;
  --mcd-dur-long2:500ms;
  --mcd-ease-standard:cubic-bezier(.2,0,0,1);
  --mcd-ease-emphasized-decelerate:cubic-bezier(.05,.7,.1,1);
  --mcd-elev-1:0 1px 2px 0 rgba(0,0,0,.3),0 1px 3px 1px rgba(0,0,0,.15);
  --mcd-elev-2:0 1px 2px 0 rgba(0,0,0,.3),0 2px 6px 2px rgba(0,0,0,.15);
  --mcd-elev-3:0 1px 3px 0 rgba(0,0,0,.3),0 4px 8px 3px rgba(0,0,0,.15);
  --mcd-elev-4:0 2px 3px 0 rgba(0,0,0,.3),0 6px 10px 4px rgba(0,0,0,.15);
}
/* M3 filled text field: 56dp, surface-container-highest, 4/4/0/0 radius, 1dp active
   indicator (2dp primary on focus), Body L 16/24 input text, Body S 12/16 label. */
.mcd-field{position:relative;padding-top:0;gap:2px}
.mcd-field-label{position:absolute;top:8px;left:16px;z-index:1;padding:0;background:transparent;transform:none;font-size:12px;line-height:16px;letter-spacing:.4px;color:var(--mcd-on-surface-variant);transition:color var(--mcd-dur-short4) var(--mcd-ease-standard)}
.mcd-field-control{height:56px;min-height:56px;padding:24px 16px 8px;border:0;border-bottom:1px solid var(--mcd-on-surface-variant);border-radius:4px 4px 0 0;background:var(--mcd-surface-container-highest);font-size:16px;line-height:24px;letter-spacing:.5px;color:var(--mcd-on-surface)}
.mcd-field-control:hover:not(:disabled):not(:focus){border-bottom-color:var(--mcd-on-surface);background:color-mix(in srgb,var(--mcd-on-surface) 8%,var(--mcd-surface-container-highest))}
.mcd-field-control:focus,.mcd-field-control:focus-within{outline:none;border-bottom:2px solid var(--mcd-primary);box-shadow:none}
.mcd-field:focus-within .mcd-field-label{color:var(--mcd-primary)}
.mcd-field-control:disabled{background:color-mix(in srgb,var(--mcd-on-surface) 4%,transparent);border-bottom-color:color-mix(in srgb,var(--mcd-on-surface) 38%,transparent);color:color-mix(in srgb,var(--mcd-on-surface) 38%,transparent)}
.mcd-select-trigger{padding:22px 16px 8px;align-items:center}
.mcd-select-trigger[data-open=true]{border-bottom:2px solid var(--mcd-primary);box-shadow:none}
/* M3 FAB: 56dp, 16dp radius (corner-large), primary-container, elevation 3 -> 4 on hover. */
.mcd-icon-btn.mcd-fab-btn,.mcd-actions-row .mcd-icon-btn.mcd-fab-btn{width:56px;height:56px;border-radius:16px;background-color:var(--mcd-primary-container);color:var(--mcd-on-primary-container);box-shadow:var(--mcd-elev-3);transition:box-shadow var(--mcd-dur-medium1,250ms) var(--mcd-ease-standard)}
.mcd-icon-btn.mcd-fab-btn:not(:disabled):hover,.mcd-actions-row .mcd-icon-btn.mcd-fab-btn:not(:disabled):hover{background-color:var(--mcd-primary-container);box-shadow:var(--mcd-elev-4)}
.mcd-icon-btn.mcd-fab-btn:not(:disabled):active,.mcd-actions-row .mcd-icon-btn.mcd-fab-btn:not(:disabled):active{box-shadow:var(--mcd-elev-3)}
/* M3 icon button: 24dp icon, 40dp state layer */
.mcd-icon-btn svg,.mcd-actions-row .mcd-icon-btn svg{width:24px;height:24px}
.mcd-icon-btn[data-variant=text]{width:40px;height:40px}
/* M3 filled/tonal buttons lift to elevation 1 on hover */
.mcd-btn[data-variant=filled]:not(:disabled):hover,.mcd-btn[data-variant=tonal]:not(:disabled):hover{box-shadow:var(--mcd-elev-1)}
/* M3 menu: surface-container, corner-extra-small (4dp), elevation 2, selected row
   uses secondary-container/on-secondary-container. */
.mcd-menu{background:var(--mcd-surface-container);border-radius:4px;box-shadow:var(--mcd-elev-2);padding:8px 0}
.mcd-menu-item{min-height:48px;padding:0 12px;border-radius:0;font-size:14px;line-height:20px}
.mcd-menu-item[data-selected=true]{background:var(--mcd-secondary-container);color:var(--mcd-on-secondary-container)}
/* M3 filled card: elevation 0 -> 1 on hover */
.mcd-card{transition:box-shadow var(--mcd-dur-short4) var(--mcd-ease-standard),background-color var(--mcd-dur-short4) var(--mcd-ease-standard)}
@media (hover:hover){.mcd-card.mcd-preset-card:hover{box-shadow:var(--mcd-elev-1)}}
/* small top app bar: 64dp */
.mcd-topbar{height:64px}
/* M3 primary tab indicator */
.mcd-tab[data-on=true]::before{height:3px;border-radius:3px 3px 0 0}
/* M3 switch pressed handle grows to 28dp */
.mcd-switch:active .mcd-switch-thumb{width:28px;height:28px}
.mcd-switch input:checked:active + .mcd-switch-track .mcd-switch-thumb{left:calc(100% - 31px);background:var(--mcd-primary-container)}
/* M3 snackbar for transient notes */
.mcd-note{display:block;margin:0;padding:12px 16px;border-radius:4px;background:var(--mcd-inverse-surface);color:var(--mcd-inverse-on-surface);font-size:14px;line-height:20px;box-shadow:var(--mcd-elev-3)}
/* full-width add row is an M3 outlined button, not a dashed card */
.mcd-add-preset{border:1px solid var(--mcd-outline);border-style:solid;border-radius:20px;height:40px;background:transparent;font-size:14px;font-weight:500}
@media (prefers-reduced-motion:reduce){.mcd-fab-btn,.mcd-card,.mcd-field-label{transition:none}}

/* ===== M3 chrome: small top app bar + segmented button ===== */
.mcd-head{min-height:64px;padding:8px 8px 8px 12px;gap:12px}
.mcd-head-text{gap:2px}
.mcd-logo{width:40px;height:40px}
.mcd-logo svg{width:24px;height:24px}
.mcd-title{font-size:22px;line-height:28px;font-weight:400;letter-spacing:0}
.mcd-subtitle{font-size:12px;line-height:16px;letter-spacing:.4px}
.mcd-seg{display:inline-flex;flex:none;gap:0;padding:0;border:1px solid var(--mcd-outline);border-radius:20px;overflow:hidden;background:transparent;height:40px}
.mcd-seg-btn,.mcd-seg .mcd-icon-btn{display:inline-grid;place-items:center;flex:none;width:44px;height:40px;padding:0;border:0;border-radius:0;background:transparent;color:var(--mcd-on-surface);cursor:pointer;transition:background-color var(--mcd-dur-short4) var(--mcd-ease-standard),color var(--mcd-dur-short4) var(--mcd-ease-standard)}
.mcd-seg-btn + .mcd-seg-btn,.mcd-seg .mcd-icon-btn + .mcd-icon-btn{border-left:1px solid var(--mcd-outline)}
.mcd-seg-btn svg,.mcd-seg .mcd-icon-btn svg{width:18px;height:18px;fill:currentColor;pointer-events:none}
.mcd-seg-btn[data-on=true]{background:var(--mcd-secondary-container);color:var(--mcd-on-secondary-container)}
.mcd-seg-btn:disabled{opacity:.38;cursor:not-allowed}
/* M3 docked search bar: 56dp pill, surface-container-high, leading search icon,
   body-large input; focused surface becomes container-highest (state layer). */
.mcd-search-bar{display:flex;align-items:center;gap:4px;flex:0 0 auto;width:100%;align-self:stretch;height:56px;padding:0 8px 0 16px;border-radius:28px;background:var(--mcd-surface-container-high);transition:background-color var(--mcd-dur-short4) var(--mcd-ease-standard),box-shadow var(--mcd-dur-short4) var(--mcd-ease-standard)}
.mcd-search-bar > svg{flex:none;width:24px;height:24px;fill:var(--mcd-on-surface-variant)}
.mcd-search-bar:focus-within{background:var(--mcd-surface-container-highest);box-shadow:var(--mcd-elev-1)}
/* M3 selector for switching between connected game instances */
.mcd-machine-select{display:inline-flex;align-items:center;gap:6px;flex:none;max-width:100%;height:40px;padding:0 12px;border:1px solid var(--mcd-outline);border-radius:20px;background:transparent;color:var(--mcd-on-surface);font-family:inherit;font-size:14px;line-height:20px;cursor:pointer;transition:background-color var(--mcd-dur-short4) var(--mcd-ease-standard)}
.mcd-machine-select:hover{background-color:color-mix(in srgb,var(--mcd-on-surface) 8%,transparent)}
.mcd-machine-select svg{flex:none;width:18px;height:18px;fill:currentColor}
.mcd-machine-select svg:first-child{fill:var(--mcd-on-surface-variant)}
.mcd-machine-text{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.mcd-search-input{flex:1 1 auto;min-width:0;border:0;border-radius:0;background:transparent;padding:0 4px;color:var(--mcd-on-surface);font-family:inherit;font-size:16px;line-height:24px;letter-spacing:.5px;outline:none;appearance:none;-webkit-appearance:none}
.mcd-search-input::placeholder{color:var(--mcd-on-surface-variant);opacity:1}
.mcd-search-input:focus,.mcd-search-input:focus-visible{outline:none;box-shadow:none}
.mcd-search-input::-webkit-search-cancel-button{-webkit-appearance:none;appearance:none}
/* static section header (pack lists): the label is not a floating field label */
.mcd-field-static{padding-top:0;gap:6px}
.mcd-field-static .mcd-field-label{position:static;display:block;padding:0;margin:0;background:transparent;transform:none;font-size:12px;line-height:16px}
/* M3 filled multiline text field for the Python editor */
.mcd-code{width:100%;min-height:140px;padding:16px;border:0;border-bottom:1px solid var(--mcd-on-surface-variant);border-radius:4px 4px 0 0;background:var(--mcd-surface-container-highest);color:var(--mcd-on-surface);font-family:var(--mcd-mono);font-size:14px;line-height:20px;resize:vertical;outline:none}
.mcd-code:hover:not(:focus){border-bottom-color:var(--mcd-on-surface)}
.mcd-code:focus{border-bottom:2px solid var(--mcd-primary);outline:none;background:var(--mcd-surface-container-highest)}
.mcd-code::placeholder{color:var(--mcd-on-surface-variant)}
/* M3 pack picker: list items with leading pack icon, name + source meta, trailing checkbox */
.mcd-pack-section{display:flex;flex-direction:column;gap:8px}
.mcd-pack-head{display:flex;align-items:center;justify-content:space-between;gap:8px;min-height:40px}
.mcd-pack-title{font-size:14px;line-height:20px;font-weight:500;color:var(--mcd-on-surface)}
.mcd-pack-head .mcd-btn{height:36px;padding:0 12px;font-size:14px}
.mcd-pack-list{display:flex;flex-direction:column;gap:2px;max-height:none;overflow:visible}
.mcd-pack-item{display:flex;align-items:center;gap:12px;min-height:56px;padding:6px 8px 6px 6px;border-radius:12px;cursor:pointer;user-select:none;transition:background-color var(--mcd-dur-short4) var(--mcd-ease-standard)}
@media (hover:hover){.mcd-pack-item:hover{background-color:color-mix(in srgb,var(--mcd-on-surface) 8%,transparent)}}
.mcd-pack-icon{display:grid;place-items:center;flex:none;width:40px;height:40px;border-radius:50%;background:var(--mcd-secondary-container);color:var(--mcd-on-secondary-container)}
.mcd-pack-icon svg{width:22px;height:22px;fill:currentColor}
.mcd-pack-text{display:flex;flex-direction:column;gap:2px;flex:1 1 auto;min-width:0}
.mcd-pack-name{font-size:14px;line-height:20px;font-weight:500;color:var(--mcd-on-surface);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.mcd-pack-meta{font-size:12px;line-height:16px;color:var(--mcd-on-surface-variant);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.mcd-pack-item input[type=checkbox]{appearance:none;-webkit-appearance:none;display:grid;place-items:center;flex:none;width:18px;height:18px;margin:0;border:2px solid var(--mcd-outline);border-radius:2px;background:transparent;cursor:pointer}
.mcd-pack-item input[type=checkbox]:checked{background:var(--mcd-primary);border-color:var(--mcd-primary)}
.mcd-pack-item input[type=checkbox]:checked::before{content:"";width:4px;height:8px;margin-top:-2px;border:solid var(--mcd-on-primary);border-width:0 2px 2px 0;transform:rotate(45deg)}
.mcd-pack-item input[type=checkbox]:focus-visible{outline:2px solid var(--mcd-primary);outline-offset:2px}
@media (prefers-reduced-motion:reduce){.mcd-pack-item{transition:none}}
  `;

    /** Panel copy. Client locale dictionaries are separate from the Host locale files. */
    const en = {
      title: 'Minecraft dev',
      openPanel: 'Open the Minecraft dev panel',
      toIcon: 'Back to the icon',
      statusIdle: 'Not running',
      statusLaunching: 'Launching',
      statusReady: 'In game',
      statusStopped: 'Stopped',
      statusFailed: 'Launch failed',
      statusUnknown: 'Unknown',
      launch: 'Launch game',
      stop: 'Stop game',
      reload: 'Reload',
      refresh: 'Refresh',
      expand: 'Show console',
      collapse: 'Hide console',
      movePanel: 'Move panel (drag or arrow keys)',
      resizePanel: 'Resize panel (drag or arrow keys)',
      configTab: 'Config',
      world: 'World',
      worldDefault: 'Default dev world',
      newWorld: 'New world',
      newWorldPlaceholder: 'New world name…',
      create: 'Create',
      behaviorPacks: 'Behavior packs',
      resourcePacks: 'Resource packs',
      skins: 'Skin',
      skinsDir: 'Skin folder',
      skinsDirPlaceholder: 'Skin folder to scan (optional)',
      skinPathPlaceholder: 'Absolute path of a skin PNG',
      skinDefault: 'Default skin',
      skinUnselected: 'Select a skin',
      slim: 'Slim model',
      selectAll: 'All',
      clearAll: 'None',
      save: 'Save',
      saved: 'Saved',
      refreshList: 'Reload lists',
      packSourceProject: 'project',
      packSourceGlobal: 'global',
      noPacks: 'No selectable packs',
      noSkins: 'No skin PNG found',
      configLoadFailed: 'Could not load the launch config.',
      configSaved: 'Launch config saved.',
      createFailed: 'Could not create the world.',
      saveFailed: 'Could not save the launch config.',
      worldCreated: 'World created: {name}',
      worldSource: 'Copy from',
      worldSourceTemplate: 'Official template',
      worldSourceClone: 'Copy of',
      settings: 'Settings',
      settingsTitle: 'Launch presets',
      back: 'Back',
      presets: 'Presets',
      presetName: 'Preset name',
      gamePath: 'Game path',
      gamePathPlaceholder: 'Full path to Minecraft.Windows.exe',
      useDetectedPath: 'Use detected path',
      host: 'Host',
      guests: 'Guests',
      addGuest: 'Add guest',
      deleteGuest: 'Remove guest',
      noGuests: 'No guest launches yet',
      guest: 'Guest',
      addPreset: 'Add preset',
      deletePreset: 'Delete preset',
      noPresets: 'No launch preset available',
      newPresetName: 'New preset',
      presetSaved: 'Preset saved',
      presetAdded: 'Preset added',
      presetDeleted: 'Preset deleted',
      presetLoadFailed: 'Could not load the presets',
      presetSaveFailed: 'Could not save the preset',
      presetDeleteFailed: 'Could not delete the preset',
      pickerUnavailable: 'Folder picker unavailable',
      pickerFailed: 'Could not open the folder picker',
      importFailed: 'Import failed',
      packImported: 'Pack imported',
      skinsImported: 'Skins imported',
      importPacks: 'Import pack',
      importSkins: 'Import skins',
      gamePathDetected: 'Detected:',
      chooseGameFolder: 'Choose game folder',
      packSourceImported: 'imported',
      presetActive: 'Active',
      backToPresets: 'Back to presets',
      editPreset: 'Edit preset',
      setActive: 'Use this preset',
      gamePathAuto: 'Auto-detected game path',
      logs: 'Logs',
      exec: 'Run code',
      docs: 'Docs',
      search: 'Search',
      searching: 'Searching…',
      run: 'Run',
      busy: 'Working…',
      starting: 'Launching (up to ~3 min)',
      waited: 'waited {seconds}s',
      startingHint: 'Starting the ModPC client and waiting for a save…',
      notReadyHint: 'The game has not entered a save yet; logs and code execution may be limited.',
      remoteUnavailable: 'The UI bridge is not connected, so the game state cannot be read.',
      loadFailed: 'Could not read the state. Press Refresh to retry.',
      commandFailed: 'The command failed.',
      badJson: 'The command returned an unreadable payload.',
      logsEmpty: 'No log lines yet.',
      loadNewer: 'Continue',
      noNewer: 'Already at the newest logs.',
      logLauncher: 'Launcher',
      logGame: 'Game',
      machine: 'Game instance',
      machineAuto: 'Auto (latest)',
      machineClient: 'client',
      machineServer: 'server',
      machineLocal: 'host',
      userName: 'Username',
      userNamePlaceholder: 'In-game player name',
      onlyErrors: 'Errors only',
      gameLogsEmpty: 'No game log lines yet.',
      gameLogs: 'Game logs',
      nextCursor: 'next {cursor}',
      logCount: '{count} lines',
      execPlaceholder: 'Python code to run inside the game…',
      execResult: 'Result',
      execHint: 'Ctrl+Enter runs the code.',
      copy: 'Copy',
      copied: 'Copied',
      side: 'Side',
      client: 'Client',
      server: 'Server',
      docsPlaceholder: 'Search the bundled NetEase ModSDK docs…',
      noDocs: 'No document matched; try another keyword',
      docChars: '{shown}/{total} chars',
      docLoadMore: 'Load more',
      docTruncated: 'The preview is truncated; load more to continue.',
      docReadFailed: 'Could not read the document.',
      reloadOk: 'Reload requested.',
      cancelled: 'Stopped waiting. The game may still be launching in the background.',
      cancel: 'Cancel',
      waitTimedOut: 'Still launching after the wait; press Refresh to check again.',
    };

    const zh = {
      title: 'Minecraft 开发',
      openPanel: '打开 Minecraft 开发面板',
      toIcon: '回到图标',
      statusIdle: '未启动',
      statusLaunching: '启动中',
      statusReady: '已进入游戏',
      statusStopped: '已停止',
      statusFailed: '启动失败',
      statusUnknown: '未知',
      launch: '启动游戏',
      stop: '停止游戏',
      reload: '重载',
      refresh: '刷新',
      expand: '展开控制台',
      collapse: '收起控制台',
      movePanel: '移动面板（拖拽或方向键）',
      resizePanel: '调整面板大小（拖拽或方向键）',
      configTab: '配置',
      world: '世界',
      worldDefault: '默认开发世界',
      newWorld: '新建世界',
      newWorldPlaceholder: '新世界名…',
      create: '新建',
      behaviorPacks: '行为包',
      resourcePacks: '资源包',
      skins: '皮肤',
      skinsDir: '皮肤目录',
      skinsDirPlaceholder: '要扫描的皮肤目录（可选）',
      skinPathPlaceholder: '皮肤 PNG 的绝对路径',
      skinDefault: '默认皮肤',
      skinUnselected: '请选择皮肤（游戏必需）',
      slim: '纤细模型',
      selectAll: '全选',
      clearAll: '清空',
      save: '保存',
      saved: '已保存',
      refreshList: '刷新清单',
      packSourceProject: '工程',
      packSourceGlobal: '全局',
      noPacks: '没有找到可选的包',
      noSkins: '没有找到皮肤 PNG',
      configLoadFailed: '读取启动配置失败。',
      configSaved: '启动配置已保存。',
      createFailed: '新建世界失败。',
      saveFailed: '保存启动配置失败。',
      worldCreated: '已新建世界：{name}',
      worldSource: '复制来源',
      worldSourceTemplate: '官方模板',
      worldSourceClone: '复制自',
      settings: '设置',
      settingsTitle: '启动预设',
      back: '返回',
      presets: '预设',
      presetName: '预设名称',
      gamePath: '游戏路径',
      gamePathPlaceholder: 'Minecraft.Windows.exe 的完整路径',
      useDetectedPath: '使用探测到的路径',
      host: '主机',
      guests: '访客',
      addGuest: '添加访客',
      deleteGuest: '删除访客',
      noGuests: '还没有访客启动项',
      guest: '访客',
      addPreset: '新增预设',
      deletePreset: '删除预设',
      noPresets: '没有可用的启动预设',
      newPresetName: '新预设',
      presetSaved: '预设已保存',
      presetAdded: '已新增预设',
      presetDeleted: '已删除预设',
      presetLoadFailed: '读取预设失败',
      presetSaveFailed: '保存预设失败',
      presetDeleteFailed: '删除预设失败',
      pickerUnavailable: '文件夹选择器不可用',
      pickerFailed: '无法打开文件夹选择器',
      importFailed: '导入失败',
      packImported: '包已导入',
      skinsImported: '皮肤已导入',
      importPacks: '导入包',
      importSkins: '导入皮肤',
      gamePathDetected: '探测到：',
      chooseGameFolder: '选择游戏文件夹',
      packSourceImported: '导入',
      presetActive: '当前激活',
      backToPresets: '返回预设选择',
      editPreset: '编辑预设',
      setActive: '设为当前预设',
      gamePathAuto: '自动探测的游戏路径',
      logs: '日志',
      exec: '执行代码',
      docs: '文档检索',
      search: '搜索',
      searching: '搜索中…',
      run: '运行',
      busy: '处理中…',
      starting: '启动中（最长约 3 分钟）',
      waited: '已等待 {seconds} 秒',
      startingHint: '正在启动 ModPC 开发客户端并等待进入存档…',
      notReadyHint: '游戏尚未进入存档，日志与执行代码可能受限。',
      remoteUnavailable: '界面通道未就绪，暂时无法读取游戏状态。',
      loadFailed: '读取失败，点「刷新」重试。',
      commandFailed: '命令执行失败。',
      badJson: '命令返回内容无法解析。',
      logsEmpty: '暂无日志。',
      loadNewer: '继续',
      noNewer: '已是最新日志。',
      logLauncher: '启动器',
      logGame: '游戏',
      machine: '游戏实例',
      machineAuto: '自动（最近连接）',
      machineClient: '客户端',
      machineServer: '服务端',
      machineLocal: '主机',
      userName: '用户名',
      userNamePlaceholder: '游戏内玩家名',
      onlyErrors: '只看错误',
      gameLogsEmpty: '暂无游戏日志。',
      gameLogs: '游戏日志',
      nextCursor: 'next {cursor}',
      logCount: '{count} 行',
      execPlaceholder: '输入要在游戏中执行的 Python 代码…',
      execResult: '执行结果',
      execHint: 'Ctrl+Enter 运行。',
      copy: '复制',
      copied: '已复制',
      side: '端侧',
      client: '客户端',
      server: '服务端',
      docsPlaceholder: '输入关键词检索内置网易 ModSDK 文档…',
      noDocs: '未找到文档，换个关键词试试',
      docChars: '已显示 {shown}/{total} 字符',
      docLoadMore: '加载更多',
      docTruncated: '预览已截断，点「加载更多」继续。',
      docReadFailed: '读取文档失败。',
      reloadOk: '已发送重载请求。',
      cancelled: '已取消等待；游戏仍可能在后台启动。',
      cancel: '取消',
      waitTimedOut: '等待超时，游戏可能仍在启动；点「刷新」再看。',
    };

    /** Parse the JSON object text of a command result. */
    function parseJsonText(text) {
      if (typeof text !== 'string') return undefined;
      try {
        const value = JSON.parse(text);
        return value !== null && typeof value === 'object' && Array.isArray(value) === false ? value : undefined;
      } catch (error) {
        return undefined;
      }
    }

    /**
     * Unwrap one remote command execution outcome.
     *
     * The client remote transport is a RemoteResult: `{ ok: true, value: CommandExecution }`
     * or `{ ok: false, error: RemoteError }`; CommandExecution is `{ commandId, result }` and
     * `result` is `{ kind, text }`.
     *
     * @param {object} outcome - RemoteResult returned by `remote.commands.execute`.
     * @returns {{kind: string, text: string} | undefined} the command result, or undefined.
     */
    function commandResultOf(outcome) {
      if (outcome === null || outcome === undefined || typeof outcome !== 'object') return undefined;
      if (outcome.ok === false) {
        const error = outcome.error !== null && typeof outcome.error === 'object' ? outcome.error : {};
        const message = typeof error.message === 'string' ? error.message : 'command refused';
        const code = typeof error.code === 'string' ? ' (' + error.code + ')' : '';
        return { kind: 'error', text: message + code };
      }
      const value = outcome.value !== undefined ? outcome.value : outcome;
      if (value === null || typeof value !== 'object') return undefined;
      const result = value.result !== undefined ? value.result : value;
      if (result === null || typeof result !== 'object') return undefined;
      return {
        kind: typeof result.kind === 'string' ? result.kind : 'success',
        text: typeof result.text === 'string' ? result.text : '',
      };
    }

    /**
     * Extract the Status object from a status/start/stop/wait payload.
     *
     * The Host answers both `{ ok, status }` (its uniform envelope) and a bare
     * Status object; accept either so the panel never renders raw JSON.
     */
    function statusOf(data) {
      if (data === null || data === undefined || typeof data !== 'object') return undefined;
      const candidate = data.status !== null && typeof data.status === 'object' ? data.status : data;
      return typeof candidate.phase === 'string' ? candidate : undefined;
    }

    /** Unwrap the launcher log (`{ ok, source, logs }` or a bare `{ lines, next }`). */
    function logDataOf(data) {
      if (data === null || data === undefined || typeof data !== 'object') return undefined;
      return data.logs !== null && typeof data.logs === 'object' ? data.logs : data;
    }

    /** Readable message for a failed command: the payload `error` or the first line. */
    function messageOf(result, fallback) {
      const data = result !== null && result !== undefined ? result.data : undefined;
      if (data !== null && typeof data === 'object' && typeof data.error === 'string' && data.error !== '') return data.error;
      const line = firstLine(result !== null && result !== undefined ? result.text : '');
      return line !== '' ? line : fallback;
    }

    /** First non-empty line of a command result text. */
    function firstLine(text) {
      const line = String(text === undefined || text === null ? '' : text)
        .split('\n')
        .find((item) => item.trim() !== '');
      return line === undefined ? '' : line.trim();
    }

    /** Translate one key, substituting `{name}` placeholders; never throws or returns blank. */
    function translate(t, key, vars) {
      let text;
      try {
        text = typeof t === 'function' ? t(key) : key;
      } catch (error) {
        text = key;
      }
      if (typeof text !== 'string' || text === '') text = key;
      if (vars !== undefined) {
        for (const name of Object.keys(vars)) text = text.split('{' + name + '}').join(String(vars[name]));
      }
      return text;
    }

    /**
     * Encode one free-text command argument as base64url.
     *
     * The Host decodes any `--<name>-b64=<base64url>` into the `<name>` argument, which keeps
     * multi-line Python code and search queries intact through the command tokenizer. UTF-8 is
     * encoded with TextEncoder when available and the result is standard base64url (no padding).
     */
    function encodeArg(value) {
      const text = String(value === undefined || value === null ? '' : value);
      try {
        let bytes;
        if (typeof globalThis.TextEncoder === 'function') {
          bytes = new globalThis.TextEncoder().encode(text);
        } else {
          bytes = [];
          for (let index = 0; index < text.length; index += 1) {
            let code = text.charCodeAt(index);
            if (code >= 0xd800 && code <= 0xdbff && index + 1 < text.length) {
              const low = text.charCodeAt(index + 1);
              if (low >= 0xdc00 && low <= 0xdfff) {
                code = 0x10000 + ((code - 0xd800) << 10) + (low - 0xdc00);
                index += 1;
              }
            }
            if (code < 0x80) bytes.push(code);
            else if (code < 0x800) bytes.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f));
            else if (code < 0x10000) bytes.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
            else bytes.push(0xf0 | (code >> 18), 0x80 | ((code >> 12) & 0x3f), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
          }
        }
        let binary = '';
        for (let index = 0; index < bytes.length; index += 1) binary += String.fromCharCode(bytes[index]);
        const base64 = typeof globalThis.btoa === 'function' ? globalThis.btoa(binary) : '';
        if (base64 !== '') return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
      } catch (error) {
        // fall through to the manual encoder below
      }
      try {
        const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
        const bytes = [];
        for (let index = 0; index < text.length; index += 1) {
          const code = text.charCodeAt(index);
          if (code < 0x80) bytes.push(code);
          else if (code < 0x800) bytes.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f));
          else bytes.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
        }
        let output = '';
        for (let index = 0; index < bytes.length; index += 3) {
          const first = bytes[index];
          const second = index + 1 < bytes.length ? bytes[index + 1] : 0;
          const third = index + 2 < bytes.length ? bytes[index + 2] : 0;
          output += alphabet[first >> 2];
          output += alphabet[((first & 0x03) << 4) | (second >> 4)];
          if (index + 1 < bytes.length) output += alphabet[((second & 0x0f) << 2) | (third >> 6)];
          if (index + 2 < bytes.length) output += alphabet[third & 0x3f];
        }
        return output;
      } catch (error) {
        return '';
      }
    }

    /** A finite integer from an unknown value, or undefined. */
    function intOf(value) {
      const number = typeof value === 'number' ? value : Number(value);
      return Number.isFinite(number) ? Math.trunc(number) : undefined;
    }

    /** Clip one long text for display. */
    function clipText(text, limit) {
      const value = typeof text === 'string' ? text : '';
      return value.length > limit ? value.slice(0, limit) + '\n…' : value;
    }

    /** Normalize Status.phase to one of the five contract values (or 'unknown'). */
    function phaseOf(status) {
      const phase = status !== null && status !== undefined && typeof status === 'object' ? status.phase : undefined;
      if (phase === 'idle' || phase === 'launching' || phase === 'ready' || phase === 'stopped' || phase === 'failed') return phase;
      return 'unknown';
    }

    /** The locale key for one normalized phase. */
    const PHASE_KEY = {
      idle: 'statusIdle',
      launching: 'statusLaunching',
      ready: 'statusReady',
      stopped: 'statusStopped',
      failed: 'statusFailed',
      unknown: 'statusUnknown',
    };

    /** Whether the remote command bridge can be used. */
    function remoteReady(remote) {
      return (
        remote !== null &&
        remote !== undefined &&
        remote.commands !== null &&
        remote.commands !== undefined &&
        typeof remote.commands.execute === 'function'
      );
    }

    /** Best-effort clipboard write; resolves false when the API is missing or refuses. */
    function writeClipboard(text) {
      const value = typeof text === 'string' ? text : '';
      try {
        const nav = globalThis.navigator;
        if (nav !== undefined && nav.clipboard !== undefined && typeof nav.clipboard.writeText === 'function') {
          return Promise.resolve(nav.clipboard.writeText(value)).then(
            () => true,
            () => false,
          );
        }
      } catch (error) {
        // clipboard unavailable
      }
      return Promise.resolve(false);
    }

    /**
     * Current viewport size with safe fallbacks (the panel is a fixed-position card).
     * @returns {{width: number, height: number}}
     */
    function viewportSize() {
      const width = typeof globalThis.innerWidth === 'number' && globalThis.innerWidth > 0 ? globalThis.innerWidth : 1440;
      const height = typeof globalThis.innerHeight === 'number' && globalThis.innerHeight > 0 ? globalThis.innerHeight : 900;
      return { width, height };
    }

    /** Clamp one number into `[min, max]`. */
    function clampNumber(value, min, max) {
      return Math.min(Math.max(value, min), max);
    }

    /**
     * Presentation mode of the floating panel:
     *  - `icon`    only the Minecraft icon (a 56dp FAB);
     *  - `compact` the icon plus the primary actions, without logs or tabs;
     *  - `full`    the whole console with tabs and content.
     */
    const PANEL_MODES = ['icon', 'compact', 'full'];
    const COMPACT_WIDTH = 232;
    /** Height estimate used only for viewport clamping; the card itself hugs its content. */
    const COMPACT_HEIGHT = 92;

    /** Normalize one stored mode value. */
    function modeOf(value) {
      return value === 'compact' || value === 'full' ? value : 'icon';
    }

    /**
     * Keep one card rect inside the viewport so a resize never strands the panel.
     * The effective box depends on the mode: icon = FAB, compact = short card, full = whole card.
     * @param {{x?: number, y?: number, width?: number, height?: number, mode?: string}} rect
     * @returns {{x: number, y: number, width: number, height: number, mode: string}}
     */
    function clampPanelRect(rect) {
      const viewport = viewportSize();
      const mode = modeOf(rect.mode);
      const maxWidth = Math.max(PANEL_MIN_WIDTH, Math.min(PANEL_MAX_WIDTH, viewport.width - EDGE_MARGIN * 2));
      const width = clampNumber(intOf(rect.width) === undefined ? PANEL_DEFAULT_WIDTH : intOf(rect.width), PANEL_MIN_WIDTH, maxWidth);
      const heightCap = Math.max(PANEL_MIN_HEIGHT, viewport.height - EDGE_MARGIN * 2 - DEFAULT_MARGIN);
      const height = clampNumber(intOf(rect.height) === undefined ? PANEL_DEFAULT_HEIGHT : intOf(rect.height), PANEL_MIN_HEIGHT, heightCap);
      const effectiveWidth = mode === 'icon' ? FAB_SIZE : mode === 'compact' ? COMPACT_WIDTH : width;
      const effectiveHeight = mode === 'icon' ? FAB_SIZE : mode === 'compact' ? COMPACT_HEIGHT : height;
      const maxX = Math.max(EDGE_MARGIN, viewport.width - effectiveWidth - EDGE_MARGIN);
      const maxY = Math.max(EDGE_MARGIN, viewport.height - effectiveHeight - EDGE_MARGIN);
      const x = clampNumber(intOf(rect.x) === undefined ? maxX : intOf(rect.x), EDGE_MARGIN, maxX);
      const y = clampNumber(intOf(rect.y) === undefined ? maxY : intOf(rect.y), EDGE_MARGIN, maxY);
      return { x, y, width, height, mode };
    }

    /** Bottom-right default: the icon sits in the corner, the cards keep their size. */
    function defaultPanelRect(mode) {
      const viewport = viewportSize();
      const normalized = modeOf(mode);
      const restWidth = normalized === 'icon' ? FAB_SIZE : normalized === 'compact' ? COMPACT_WIDTH : PANEL_DEFAULT_WIDTH;
      const restHeight = normalized === 'icon' ? FAB_SIZE : normalized === 'compact' ? COMPACT_HEIGHT : PANEL_DEFAULT_HEIGHT;
      return clampPanelRect({
        x: viewport.width - restWidth - DEFAULT_MARGIN,
        y: viewport.height - restHeight - DEFAULT_MARGIN,
        width: PANEL_DEFAULT_WIDTH,
        height: PANEL_DEFAULT_HEIGHT,
        mode: normalized,
      });
    }

    /** Read persisted geometry and mode; malformed storage falls back to the icon corner. */
    function loadPanelRect() {
      let stored;
      try {
        const raw = globalThis.localStorage ? globalThis.localStorage.getItem(STORAGE_KEY) : null;
        if (typeof raw === 'string' && raw !== '') stored = JSON.parse(raw);
      } catch (error) {
        stored = undefined;
      }
      if (stored !== null && stored !== undefined && typeof stored === 'object') {
        // Geometry is remembered, but every page load starts from icon mode so the
        // floating entry never covers the conversation on its own.
        return clampPanelRect({
          x: intOf(stored.x),
          y: intOf(stored.y),
          width: intOf(stored.width),
          height: intOf(stored.height),
          mode: 'icon',
        });
      }
      return defaultPanelRect('full');
    }

    /** Persist geometry and mode; storage failure never breaks the panel. */
    function savePanelRect(rect) {
      try {
        if (!globalThis.localStorage) return;
        globalThis.localStorage.setItem(
          STORAGE_KEY,
          JSON.stringify({
            x: Math.round(rect.x),
            y: Math.round(rect.y),
            width: Math.round(rect.width),
            height: Math.round(rect.height),
            mode: modeOf(rect.mode),
          }),
        );
      } catch (error) {
        // geometry is a convenience; keep the panel usable without storage
      }
    }

    /**
     * Pick the Session this panel talks to.
     *
     * Prefers the Session retained by the main view (`retainedBy.mainView > 0`,
     * the ui-workspace rule). After a restart or while the workspace is settling
     * no Session is retained yet, so fall back to the most recently updated
     * Session instead of rendering nothing: the floating panel must stay
     * reachable, otherwise the user cannot even launch the game.
     * @param {object} list - Session list snapshot from `useSessions`.
     * @returns {string | undefined} the Session id.
     */
    function selectMainSession(list) {
      if (list === null || list === undefined || typeof list !== 'object') return undefined;
      const byId = list.byId;
      if (byId === null || byId === undefined || typeof byId !== 'object') return undefined;
      let fallbackId = undefined;
      let fallbackScore = -Infinity;
      for (const summary of Object.values(byId)) {
        if (summary === null || summary === undefined || typeof summary !== 'object') continue;
        const id = typeof summary.id === 'string' ? summary.id : undefined;
        if (id === undefined) continue;
        const retained = summary.retainedBy;
        const mainView = retained !== null && retained !== undefined ? retained.mainView : undefined;
        if (typeof mainView === 'number' && mainView > 0) return id;
        // 非主视图会话：记录最近更新者作为回退。
        const score = [summary.updatedAt, summary.lastActiveAt, summary.lastMessageAt, summary.createdAt]
          .map((value) => (typeof value === 'number' ? value : Number.NaN))
          .find((value) => Number.isFinite(value));
        const effective = typeof score === 'number' ? score : 0;
        if (fallbackId === undefined || effective > fallbackScore) {
          fallbackId = id;
          fallbackScore = effective;
        }
      }
      return fallbackId;
    }

    const views = new Map();
    const loads = new Map();
    const statusAttempts = new Set();

    /** A fresh, fully-populated view. */
    function emptyView() {
      return {
        status: undefined,
        statusError: undefined,
        machines: [],
        machineId: '',
        logs: {
          launcher: { lines: [], next: undefined, loaded: false, error: undefined },
          game: { lines: [], error: undefined, loaded: false, errorsOnly: false },
        },
        exec: { code: '', side: 'client', text: '', ran: false, error: undefined, gameLines: [] },
        docs: { query: '', hits: [], searched: false, path: undefined, title: '', text: '', total: 0, more: false, error: undefined },
        launch: {
          page: 'main',
          presetsPath: '',
          presets: [],
          activeId: '',
          selectedId: '',
          detectedGameExe: '',
          worlds: [],
          behavior: [],
          resource: [],
          skins: [],
          skinsDir: '',
          skinsExists: false,
          draft: undefined,
          busy: false,
          savedAt: undefined,
          error: undefined,
        },
      };
    }

    /** The cached view for one session, creating the empty snapshot on first use. */
    function viewOf(sessionId) {
      if (sessionId === undefined || sessionId === null) return emptyView();
      const cached = views.get(sessionId);
      if (cached !== undefined) return cached;
      const fresh = emptyView();
      views.set(sessionId, fresh);
      return fresh;
    }

    /** Normalize one `{seq,text}[]` payload from a command result. */
    function normalizeLines(data) {
      const lines = [];
      const source = data !== null && data !== undefined && Array.isArray(data.lines) ? data.lines : [];
      let fallback = 0;
      for (const line of source) {
        if (line === null || typeof line !== 'object') continue;
        const seq = intOf(line.seq);
        lines.push({
          seq: seq === undefined ? fallback : seq,
          text: typeof line.text === 'string' ? line.text : String(line.text === undefined ? '' : line.text),
        });
        fallback += 1;
      }
      return lines;
    }

    /** Merge one incremental launcher window into the cached snapshot; seq is unique. */
    function mergeLogs(previous, data) {
      const base = previous !== null && previous !== undefined && Array.isArray(previous.lines) ? previous.lines : [];
      const incoming = normalizeLines(data);
      const seen = new Set();
      const lines = [];
      const push = (list) => {
        for (const line of list) {
          if (line === null || typeof line !== 'object') continue;
          const seq = intOf(line.seq);
          if (seq !== undefined) {
            if (seen.has(seq)) continue;
            seen.add(seq);
          }
          lines.push({ seq: seq === undefined ? lines.length : seq, text: typeof line.text === 'string' ? line.text : String(line.text) });
        }
      };
      push(base);
      push(incoming);
      lines.sort((left, right) => left.seq - right.seq);
      const window = lines.length > LOG_MAX ? lines.slice(lines.length - LOG_MAX) : lines;
      return {
        lines: window,
        next: data !== undefined && data !== null && data.next !== undefined ? intOf(data.next) : previous !== undefined && previous !== null ? previous.next : undefined,
        loaded: true,
      };
    }

    /** Whether one log line looks like an error worth marking in the game log. */
    function looksLikeError(text) {
      return /error|exception|traceback|failed|fatal|错误|异常|失败/i.test(typeof text === 'string' ? text : '');
    }

    /** One monospace log block; game-log error lines are marked in the error color. */
    function LogLines(props) {
      const lines = Array.isArray(props.lines) ? props.lines : [];
      if (lines.length === 0) return null;
      return h(
        'div',
        { className: 'mcd-pre mcd-lines', tabIndex: 0, 'aria-label': props.label },
        lines.map((line, index) =>
          h(
            'div',
            { key: index, className: 'mcd-line', 'data-error': props.highlightErrors === true && looksLikeError(line.text) ? 'true' : 'false' },
            h('span', { className: 'mcd-line-seq' }, '[' + line.seq + '] '),
            h('span', null, line.text),
          ),
        ),
      );
    }

    /** Material Symbols-inspired icon paths (Apache-2.0 subset) used by the Material 3 panel. */
    const ICON_PATHS = {
      minecraft:
        'M12 2 3 7v10l9 5 9-5V7l-9-5Zm0 2.3 6.5 3.6L12 11.5 5.5 7.9 12 4.3ZM5 9.6l6 3.3v7.4l-6-3.3V9.6Zm8 10.7v-7.4l6-3.3v7.4l-6 3.3Z',
      play: 'M8 5v14l11-7z',
      stop: 'M6 6h12v12H6z',
      close:
        'M6.4 5 5 6.4l5.6 5.6L5 17.6 6.4 19l5.6-5.6L17.6 19 19 17.6l-5.6-5.6L19 6.4 17.6 5 12 10.6z',
      refresh:
        'M17.65 6.35A7.96 7.96 0 0 0 12 4a8 8 0 1 0 7.73 10h-2.08A5.99 5.99 0 1 1 12 6c1.66 0 3.14.69 4.22 1.78L13 11h7V4z',
      reload: 'M12 4V1L8 5l4 4V6a6 6 0 1 1-6 6H4a8 8 0 1 0 8-8z',
      openFull:
        'M4 4h7v2H6v5H4V4Zm9 0h7v7h-2V6h-5V4ZM4 13h2v5h5v2H4v-7Zm14 0h2v7h-7v-2h5v-5Z',
      console:
        'M4 5h16v14H4V5Zm2 2v10h12V7H6Zm2 1.5 3 3-3 3 1.4 1.4L13.8 11.5 9.4 7.1 8 8.5Z',
      terminal: 'M4 5h16v14H4V5Zm2 2v10h12V7H6Zm1.5 2.5 2 2-2 2 1 1 3-3-3-3-1 1Zm4.5 5h5v-1.5H12V16.5Z',
      book: 'M21 5c-1.11-.35-2.33-.5-3.5-.5-1.95 0-4.05.4-5.5 1.5-1.45-1.1-3.55-1.5-5.5-1.5S2.45 4.9 1 6v14.65c0 .25.25.5.5.5.1 0 .15-.05.25-.05C3.1 20.45 5.05 20 6.5 20c1.95 0 4.05.4 5.5 1.5 1.35-.85 3.8-1.5 5.5-1.5 1.65 0 3.35.3 4.75 1.05.1.05.15.05.25.05.25 0 .5-.25.5-.5V6c-.6-.45-1.25-.75-2-1Zm0 13.5c-1.1-.35-2.3-.5-3.5-.5-1.7 0-4.15.65-5.5 1.5V8c1.35-.85 3.8-1.5 5.5-1.5 1.2 0 2.4.15 3.5.5v11.5Z',
      collapse: 'M12 16 6 10h12z',
      chevron: 'M7 10l5 5 5-5z',
      expand: 'M12 8 6 14h12z',
      newer: 'M11 4h2v9h4l-5 5-5-5h4V4ZM5 19h14v2H5v-2Z',
      filter: 'M10 18h4v-2h-4v2ZM3 6v2h18V6H3Zm3 7h12v-2H6v2Z',
      tune: 'M3 17v2h6v-2H3zM3 5v2h10V5H3zm10 16v-2h8v-2h-8v-2h-2v6h2zM7 9v2H3v2h4v2h2V9H7zm14 4v-2H11v2h10zm-6-4h2V7h4V5h-4V3h-2v6z',
      settings:
        'M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58a.49.49 0 0 0 .12-.61l-1.92-3.32a.49.49 0 0 0-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54a.48.48 0 0 0-.48-.41h-3.84a.48.48 0 0 0-.48.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96a.48.48 0 0 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58a.49.49 0 0 0-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.48-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6A3.6 3.6 0 1 1 12 8.4a3.6 3.6 0 0 1 0 7.2z',
      back: 'M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z',
      delete: 'M6 19a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z',
      add: 'M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6z',
      folder: 'M10 4H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-8l-2-2z',
      edit: 'M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z',
      extension: 'M20.5 11H19V7a2 2 0 0 0-2-2h-4V3.5a2.5 2.5 0 0 0-5 0V5H4a2 2 0 0 0-2 2v3.8h1.5a2.7 2.7 0 0 1 0 5.4H2V20a2 2 0 0 0 2 2h3.8v-1.5a2.7 2.7 0 0 1 5.4 0V22H17a2 2 0 0 0 2-2v-4h1.5a2.5 2.5 0 0 0 0-5z',
      palette: 'M12 22a10 10 0 1 1 10-10c0 2.2-1.8 4-4 4h-1.5a2 2 0 0 0-1.4 3.4c.3.3.4.7.4 1.1 0 1.4-1.1 2.5-2.5 2.5zM6.5 11a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3zm3-4a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3zm5 0a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3z',
      check: 'M9 16.2 4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4z',
      computer: 'M4 5h16a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1h-6l1 2h2v2H7v-2h2l1-2H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Zm1 2v8h14V7H5Z',
      copy: 'M16 1H4a2 2 0 0 0-2 2v14h2V3h12zm3 4H8a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2zm0 16H8V7h11z',
      search:
        'M15.5 14h-.79l-.28-.27A6.47 6.47 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5Zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14Z',
      description:
        'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6Zm4 18H6V4h7v5h5v11Z',
      gamepad:
        'M21 6H3c-1.1 0-2 .9-2 2v8c0 1.1.9 2 2 2h18c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2zm-10 7H8v3H6v-3H3v-2h3V8h2v3h3v2zm4.5 2a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3zm3-3a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3z',
      client: 'M3 4h18v12H3V4Zm2 2v8h14V6H5Zm4 10h6v2H9v-2Z',
      server:
        'M4 3h16v6H4V3Zm2 2v2h2V5H6Zm-2 6h16v6H4v-6Zm2 2v2h2v-2H6Zm10-8h2v2h-2V5Zm0 8h2v2h-2v-2Z',
    };

    /** One inline Material icon. */
    function Icon(props) {
      return h(
        'svg',
        { viewBox: '0 0 24 24', 'aria-hidden': 'true', focusable: 'false' },
        h('path', { d: ICON_PATHS[props.name] || '' }),
      );
    }

    /** Material 3 icon button (text / filled / tonal) with tooltip and accessible label. */
    function IconButton(props) {
      const busy = props.busy === true;
      const pressed = props.pressed;
      return h(
        'button',
        {
          type: 'button',
          className: 'mcd-icon-btn' + (busy ? ' mcd-busy' : '') + (props.fab === true ? ' mcd-fab-btn' : ''),
          'data-variant': props.variant || 'text',
          'data-on': pressed === undefined ? undefined : pressed ? 'true' : 'false',
          'aria-pressed': pressed === undefined ? undefined : pressed ? 'true' : 'false',
          'aria-label': props.label,
          'data-tip': props.label,
          disabled: props.disabled === true,
          onClick: props.onClick,
          onKeyDown: props.onKeyDown,
        },
        h(Icon, { name: props.icon }),
      );
    }

    /**
     * Error boundary so a render bug shows a readable message instead of silently
     * removing the panel from the overlay.
     */
    class McDevBoundary extends React.Component {
      constructor(props) {
        super(props);
        this.state = { error: undefined };
      }
      static getDerivedStateFromError(error) {
        return { error };
      }
      render() {
        if (this.state.error !== undefined) {
          const message = this.state.error && this.state.error.message ? this.state.error.message : String(this.state.error);
          return h(
            'div',
            {
              style: {
                position: 'fixed', left: '12px', top: '12px', zIndex: 99999, maxWidth: '70vw',
                padding: '8px 12px', borderRadius: '10px', background: '#7f1d1d', color: '#fff',
                font: '12px/1.4 ui-monospace, monospace', whiteSpace: 'pre-wrap', pointerEvents: 'auto',
              },
            },
            'dsh-mcdev: ' + message,
          );
        }
        return this.props.children;
      }
    }

    /**
     * The floating console window. Renders nothing while the main view retains no Session, and
     * degrades to an in-window note when the remote command bridge is missing.
     */
    function McDevPanel(props) {
      const sessionId = props.sessionId;
      const remote = props.remote;
      const t = typeof props.t === 'function' ? props.t : (key) => key;
      const pickDirectory = typeof props.pickDirectory === 'function' ? props.pickDirectory : undefined;

      const [view, setView] = React.useState(() => viewOf(sessionId));
      const [panelRect, setPanelRect] = React.useState(() => loadPanelRect());
      const [dragging, setDragging] = React.useState(false);
      const [resizing, setResizing] = React.useState(false);
      const [tab, setTab] = React.useState('logs');
      const [action, setAction] = React.useState();
      const [error, setError] = React.useState();
      const [note, setNote] = React.useState();
      const [elapsed, setElapsed] = React.useState(0);
      const [logBusy, setLogBusy] = React.useState(false);
      const [execBusy, setExecBusy] = React.useState(false);
      const [docsBusy, setDocsBusy] = React.useState(false);
      const [readBusy, setReadBusy] = React.useState(false);
      const [logSource, setLogSource] = React.useState('launcher');
      const [newWorldName, setNewWorldName] = React.useState('');
      const [newWorldFrom, setNewWorldFrom] = React.useState('');
      const [selectMenu, setSelectMenu] = React.useState(undefined);
      const [tooltip, setTooltip] = React.useState(undefined);
      const menuRef = React.useRef(null);
      const rippleTimer = React.useRef(0);
      const tooltipTimer = React.useRef(0);

      const alive = React.useRef(true);
      const sessionRef = React.useRef(sessionId);
      sessionRef.current = sessionId;
      const remoteRef = React.useRef(remote);
      remoteRef.current = remote;
      const cancelToken = React.useRef(null);
      const actionRef = React.useRef();
      const noteTimer = React.useRef();
      const panelRectRef = React.useRef(panelRect);
      panelRectRef.current = panelRect;
      const dragRef = React.useRef(null);
      const resizeRef = React.useRef(null);
      const rootRef = React.useRef(null);
      const gripRef = React.useRef(null);
      /** Set when a pointer sequence moved the card: the following click must not expand it. */
      const suppressClickRef = React.useRef(false);
      const collapseRef = React.useRef(() => {});
      const mode = modeOf(panelRect.mode);
      const expanded = mode === 'full';
      const compact = mode === 'compact';

      // Every plugin re-apply (and therefore every page start) hands the user an icon entry.
      const bootKey = props.bootKey;
      React.useEffect(() => {
        if (bootKey === undefined || bootKey === null) return undefined;
        if (modeOf(panelRectRef.current.mode) !== 'icon') {
          applyRect({ ...panelRectRef.current, mode: 'icon' }, true);
        }
        return undefined;
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, [bootKey]);

      /** Apply one clamped card rect; `persist` writes the localStorage geometry. */
      const applyRect = (next, persist) => {
        const clamped = clampPanelRect(next);
        panelRectRef.current = clamped;
        setPanelRect(clamped);
        if (persist === true) savePanelRect(clamped);
      };

      /** Store one view patch for a session; update the mounted instance only when current. */
      const commit = (sid, updater) => {
        if (sid === undefined || sid === null) return;
        const next = updater(viewOf(sid));
        views.set(sid, next);
        if (alive.current && sessionRef.current === sid) setView(next);
      };

      /** Show a transient note, cleared on a timer that unmount clears. */
      const flashNote = (text) => {
        setNote(text);
        if (noteTimer.current !== undefined) clearTimeout(noteTimer.current);
        noteTimer.current = setTimeout(() => {
          noteTimer.current = undefined;
          if (alive.current) setNote(undefined);
        }, 2400);
      };

      /**
       * Run one `/mcdev ... --json` command through the session command bridge.
       * @returns {Promise<{kind: string, text: string, data: object | undefined}>}
       */
      const runCommand = async (sid, command) => {
        const bridge = remoteRef.current;
        if (!remoteReady(bridge)) return { kind: 'error', text: translate(t, 'remoteUnavailable'), data: undefined };
        try {
          const outcome = await bridge.commands.execute(sid, command, []);
          const result = commandResultOf(outcome);
          if (result === undefined) return { kind: 'error', text: translate(t, 'commandFailed'), data: undefined };
          return { kind: result.kind, text: result.text, data: parseJsonText(result.text) };
        } catch (caught) {
          const message = caught !== null && caught !== undefined && typeof caught.message === 'string' ? caught.message : '';
          return { kind: 'error', text: message !== '' ? message : translate(t, 'commandFailed'), data: undefined };
        }
      };

      /** Read `/mcdev status --json` once per force; cache the snapshot per session. */
      const loadStatus = async (force) => {
        const sid = sessionId;
        if (sid === undefined || sid === null || !remoteReady(remoteRef.current)) return false;
        const key = sid + '|status';
        if (loads.has(key)) {
          await loads.get(key);
          return true;
        }
        if (force !== true && viewOf(sid).status !== undefined) {
          commit(sid, (current) => current);
          return true;
        }
        const task = (async () => {
          const result = await runCommand(sid, '/mcdev status --json');
          const status = statusOf(result.data);
          if (status !== undefined) {
            commit(sid, (current) => ({ ...current, status, statusError: undefined }));
            void loadMachines(sid);
            return true;
          }
          const message = result.kind === 'error' ? messageOf(result, translate(t, 'loadFailed')) : translate(t, 'loadFailed');
          commit(sid, (current) => ({ ...current, statusError: message }));
          return false;
        })();
        loads.set(key, task);
        try {
          return await task;
        } finally {
          loads.delete(key);
        }
      };

      /** Read the connected game instances (machines) for the logs/exec selectors. */
      const loadMachines = async (sid) => {
        if (sid === undefined || sid === null || !remoteReady(remoteRef.current)) return;
        const key = sid + '|machines';
        if (loads.has(key)) {
          await loads.get(key);
          return;
        }
        const task = (async () => {
          const result = await runCommand(sid, '/mcdev games --json');
          const data = result.data;
          if (result.kind === 'error' || data === undefined || data.ok === false) return;
          const machines = Array.isArray(data.machines) ? data.machines : [];
          commit(sid, (current) => {
            const stillExists = machines.some((machine) => machine.id === current.machineId);
            return { ...current, machines, machineId: stillExists ? current.machineId : '' };
          });
        })().catch(() => {});
        loads.set(key, task);
        try {
          await task;
        } finally {
          loads.delete(key);
        }
      };

      /** Pick which game instance logs/exec target; '' = the provider's default (latest). */
      const selectMachine = (machineId) => {
        const sid = sessionId;
        if (sid === undefined || sid === null) return;
        commit(sid, (current) => ({
          ...current,
          machineId: typeof machineId === 'string' ? machineId : '',
          logs: { ...current.logs, game: { ...current.logs.game, lines: [], loaded: false, error: undefined } },
        }));
      };

      /** First mount: adopt the cached snapshot, or read the status once for this session. */
      React.useEffect(() => {
        alive.current = true;
        const sid = sessionId;
        if (sid === undefined || sid === null) {
          return () => {
            alive.current = false;
          };
        }
        const cached = viewOf(sid);
        if (cached.status !== undefined) {
          setView(cached);
          return () => {
            alive.current = false;
          };
        }
        if (statusAttempts.has(sid)) {
          // Another instance already read (or is reading) this session: adopt its snapshot
          // instead of appending a second status command event.
          const pending = loads.get(sid + '|status');
          if (pending !== undefined) {
            let live = true;
            pending.then(
              () => {
                if (live && alive.current && sessionRef.current === sid) setView(viewOf(sid));
              },
              () => {},
            );
            return () => {
              live = false;
              alive.current = false;
            };
          }
          setView(cached);
          return () => {
            alive.current = false;
          };
        }
        statusAttempts.add(sid);
        setView(cached);
        void loadStatus(false).then(() => {
          if (alive.current && sessionRef.current === sid) setView(viewOf(sid));
        });
        return () => {
          alive.current = false;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, [sessionId]);

      // Elapsed-time display while the launch command is awaited; no command is polled.
      React.useEffect(() => {
        if (action !== 'start') return undefined;
        const startedAt = Date.now();
        setElapsed(0);
        const timer = setInterval(() => {
          if (!alive.current) return;
          setElapsed(Math.floor((Date.now() - startedAt) / 1000));
        }, 1000);
        return () => clearInterval(timer);
      }, [action]);

      // Clear the transient-note timer on unmount.
      React.useEffect(
        () => () => {
          if (noteTimer.current !== undefined) {
            clearTimeout(noteTimer.current);
            noteTimer.current = undefined;
          }
        },
        [],
      );

      /**
       * Switch presentation mode (`icon` → `compact` → `full`, persisted).
       * Entering a card mode is a user action, so the status is re-read once.
       */
      const setMode = (next, options = {}) => {
        if (next !== 'icon' && next !== 'compact' && next !== 'full') return;
        if (mode === next) return;
        applyRect({ ...panelRectRef.current, mode: next }, true);
        if (next !== 'icon') {
          const sid = sessionId;
          if (sid !== undefined && sid !== null && remoteReady(remoteRef.current)) void loadStatus(true);
        }
        if (options.focus === true) {
          const root = rootRef.current;
          if (root !== null && root !== undefined && typeof root.focus === 'function') {
            try {
              root.focus({ preventScroll: true });
            } catch (error) {
              root.focus();
            }
          }
        }
      };

      /** Icon → compact. */
      const enterCompact = () => setMode('compact', { focus: true });
      /** Compact → full (or icon → full). */
      const expandPanel = () => setMode('full', { focus: true });
      /** Full → compact. */
      const collapsePanel = () => setMode('compact');
      /** Compact/full → icon. */
      const enterIcon = () => setMode('icon');
      collapseRef.current = collapsePanel;

      /** True when a pointer event starts on a control rather than the drag surface. */
      const isInteractiveTarget = (target) =>
        target !== null && target !== undefined && typeof target.closest === 'function'
          ? target.closest('button, input, textarea, select, a, [data-mcd-no-drag]') !== null
          : false;

      /** Start dragging the card from its title bar or the collapsed capsule. */
      const beginDrag = (event) => {
        if (event === null || event === undefined) return;
        if (typeof event.button === 'number' && event.button !== 0) return;
        if (isInteractiveTarget(event.target)) return;
        const node = event.currentTarget;
        if (node !== null && node !== undefined && typeof node.setPointerCapture === 'function' && event.pointerId !== undefined) {
          try {
            node.setPointerCapture(event.pointerId);
          } catch (error) {
            // pointer capture is best effort
          }
        }
        if (typeof event.preventDefault === 'function') event.preventDefault();
        dragRef.current = {
          pointerId: event.pointerId,
          startX: event.clientX,
          startY: event.clientY,
          originX: panelRectRef.current.x,
          originY: panelRectRef.current.y,
          moved: false,
        };
        setDragging(true);
      };

      /** Move the card with the captured pointer, clamped to the viewport. */
      const moveDrag = (event) => {
        const drag = dragRef.current;
        if (drag === null || drag === undefined) return;
        if (drag.pointerId !== undefined && event.pointerId !== undefined && drag.pointerId !== event.pointerId) return;
        const dx = (typeof event.clientX === 'number' ? event.clientX : drag.startX) - drag.startX;
        const dy = (typeof event.clientY === 'number' ? event.clientY : drag.startY) - drag.startY;
        if (dx !== 0 || dy !== 0) drag.moved = true;
        applyRect({ ...panelRectRef.current, x: drag.originX + dx, y: drag.originY + dy }, false);
      };

      /** Finish the drag: release capture and persist the final position. */
      const endDrag = (event) => {
        const drag = dragRef.current;
        if (drag === null || drag === undefined) return;
        dragRef.current = null;
        setDragging(false);
        const node = event !== null && event !== undefined ? event.currentTarget : null;
        if (node !== null && node !== undefined && typeof node.releasePointerCapture === 'function' && event.pointerId !== undefined) {
          try {
            node.releasePointerCapture(event.pointerId);
          } catch (error) {
            // already released
          }
        }
        if (drag.moved === true) {
          savePanelRect(panelRectRef.current);
          suppressClickRef.current = true;
        } else if (event !== null && event !== undefined && event.type === 'pointerup' && mode === 'icon') {
          // The icon is dragged via pointer events (pointerdown preventDefault suppresses
          // compatibility clicks), so a tap that did not move it goes to compact mode here.
          enterCompact();
        }
      };

      /** Arrow keys on the focused grip move the card by 8px (32px with Shift). */
      const onGripKeyDown = (event) => {
        const step = event.shiftKey === true ? KEYBOARD_STEP_LARGE : KEYBOARD_STEP;
        let dx = 0;
        let dy = 0;
        if (event.key === 'ArrowLeft') dx = -step;
        else if (event.key === 'ArrowRight') dx = step;
        else if (event.key === 'ArrowUp') dy = -step;
        else if (event.key === 'ArrowDown') dy = step;
        else return;
        event.preventDefault();
        applyRect({ ...panelRectRef.current, x: panelRectRef.current.x + dx, y: panelRectRef.current.y + dy }, true);
      };

      /** Start resizing from the bottom-right handle. */
      const beginResize = (event) => {
        if (event === null || event === undefined) return;
        if (typeof event.button === 'number' && event.button !== 0) return;
        const node = event.currentTarget;
        if (node !== null && node !== undefined && typeof node.setPointerCapture === 'function' && event.pointerId !== undefined) {
          try {
            node.setPointerCapture(event.pointerId);
          } catch (error) {
            // pointer capture is best effort
          }
        }
        if (typeof event.preventDefault === 'function') event.preventDefault();
        resizeRef.current = {
          pointerId: event.pointerId,
          startX: event.clientX,
          startY: event.clientY,
          originWidth: panelRectRef.current.width,
          originHeight: panelRectRef.current.height,
        };
        setResizing(true);
      };

      /** Resize the card; width stays within [320, 520] and the viewport keeps it visible. */
      const moveResize = (event) => {
        const resize = resizeRef.current;
        if (resize === null || resize === undefined) return;
        if (resize.pointerId !== undefined && event.pointerId !== undefined && resize.pointerId !== event.pointerId) return;
        const dx = (typeof event.clientX === 'number' ? event.clientX : resize.startX) - resize.startX;
        const dy = (typeof event.clientY === 'number' ? event.clientY : resize.startY) - resize.startY;
        applyRect({ ...panelRectRef.current, width: resize.originWidth + dx, height: resize.originHeight + dy }, false);
      };

      /** Finish the resize and persist the final size. */
      const endResize = (event) => {
        const resize = resizeRef.current;
        if (resize === null || resize === undefined) return;
        resizeRef.current = null;
        setResizing(false);
        const node = event !== null && event !== undefined ? event.currentTarget : null;
        if (node !== null && node !== undefined && typeof node.releasePointerCapture === 'function' && event.pointerId !== undefined) {
          try {
            node.releasePointerCapture(event.pointerId);
          } catch (error) {
            // already released
          }
        }
        savePanelRect(panelRectRef.current);
      };

      /** Arrow keys on the focused resize handle change the card size. */
      const onResizeKeyDown = (event) => {
        const step = event.shiftKey === true ? KEYBOARD_STEP_LARGE : KEYBOARD_STEP;
        let width = panelRectRef.current.width;
        let height = panelRectRef.current.height;
        if (event.key === 'ArrowLeft') width -= step;
        else if (event.key === 'ArrowRight') width += step;
        else if (event.key === 'ArrowUp') height -= step;
        else if (event.key === 'ArrowDown') height += step;
        else return;
        event.preventDefault();
        applyRect({ ...panelRectRef.current, width, height }, true);
      };

      // A viewport resize clamps the stored card back inside the window.
      React.useEffect(() => {
        const onViewportResize = () => {
          const next = clampPanelRect(panelRectRef.current);
          panelRectRef.current = next;
          setPanelRect(next);
          savePanelRect(next);
        };
        globalThis.addEventListener('resize', onViewportResize);
        return () => globalThis.removeEventListener('resize', onViewportResize);
      }, []);

      // Escape steps back one level: full → compact → icon.
      React.useEffect(() => {
        if (mode === 'icon') return undefined;
        const onKeyDown = (event) => {
          if (event.key !== 'Escape' || event.defaultPrevented) return;
          const root = rootRef.current;
          const active = typeof document !== 'undefined' ? document.activeElement : null;
          if (root === null || root === undefined || active === null || active === undefined) return;
          if (typeof root.contains !== 'function' || root.contains(active) !== true) return;
          event.preventDefault();
          event.stopPropagation();
          if (mode === 'full') collapseRef.current();
          else enterIcon();
        };
        globalThis.addEventListener('keydown', onKeyDown);
        return () => globalThis.removeEventListener('keydown', onKeyDown);
      }, [mode]);

      if (sessionId === undefined || sessionId === null) return null;

      const bridgeReady = remoteReady(remote);
      const status = view.status;
      const phase = phaseOf(status);
      const ready = status !== null && status !== undefined && status.ready === true;
      const launching = phase === 'launching' || action === 'start';
      const actionsDisabled = action !== undefined || !bridgeReady;
      const canLaunch = !actionsDisabled && phase !== 'launching' && phase !== 'ready';
      const canStop = !actionsDisabled && (phase === 'launching' || phase === 'ready');
      const canReload = !actionsDisabled && ready && phase === 'ready';
      const canRefresh = !actionsDisabled;

      /**
       * Launch the dev client: `start` returns `phase:'launching'` immediately, then exactly one
       * `wait --timeout 180` call (no polling) reports the final status. The wait can be
       * cancelled from the panel; the Host keeps launching either way.
       */
      const startGame = async () => {
        const sid = sessionId;
        // Synchronous guard: a double click in one tick must not append two command events.
        if (actionRef.current !== undefined) return;
        actionRef.current = 'start';
        setError(undefined);
        setNote(undefined);
        const token = { cancelled: false };
        cancelToken.current = token;
        setAction('start');
        try {
          const startResult = await runCommand(sid, '/mcdev start --json');
          if (token.cancelled) return;
          const startStatus = statusOf(startResult.data);
          if (startStatus !== undefined) {
            commit(sid, (current) => ({ ...current, status: startStatus, statusError: undefined }));
          }
          if (startResult.kind === 'error') {
            setError(messageOf(startResult, translate(t, 'commandFailed')));
            return;
          }
          if (startStatus === undefined) {
            setError(translate(t, 'badJson'));
            return;
          }
          if (startStatus.phase === 'ready') {
            void loadStatus(true);
            return;
          }
          if (startStatus.phase === 'failed') {
            setError(typeof startStatus.lastError === 'string' && startStatus.lastError !== '' ? startStatus.lastError : translate(t, 'commandFailed'));
            return;
          }
          // One wait call covers up to ~3 minutes of launching; the elapsed timer runs meanwhile.
          const waitResult = await runCommand(sid, '/mcdev wait --timeout ' + START_TIMEOUT_SECONDS + ' --json');
          if (token.cancelled) return;
          const waitStatus = statusOf(waitResult.data);
          if (waitStatus !== undefined) {
            commit(sid, (current) => ({ ...current, status: waitStatus, statusError: undefined }));
          }
          if (waitResult.kind === 'error') {
            setError(messageOf(waitResult, translate(t, 'loadFailed')));
            return;
          }
          if (waitStatus === undefined) {
            setError(translate(t, 'badJson'));
            return;
          }
          if (waitStatus.phase === 'failed') {
            setError(typeof waitStatus.lastError === 'string' && waitStatus.lastError !== '' ? waitStatus.lastError : translate(t, 'commandFailed'));
            return;
          }
          if (waitStatus.phase === 'ready') {
            // Pick up the connected MCP details once, after the game is in a save.
            void loadStatus(true);
          } else {
            flashNote(translate(t, 'waitTimedOut'));
          }
        } finally {
          if (cancelToken.current === token) cancelToken.current = null;
          if (actionRef.current === 'start') actionRef.current = undefined;
          if (alive.current) setAction(undefined);
        }
      };

      /** Stop waiting for the launch command; the start keeps running on the Host. */
      const cancelStart = () => {
        const token = cancelToken.current;
        if (token !== null && token !== undefined) token.cancelled = true;
        cancelToken.current = null;
        actionRef.current = undefined;
        setAction(undefined);
        flashNote(translate(t, 'cancelled'));
      };

      /** Stop the running client. */
      const stopGame = async () => {
        const sid = sessionId;
        if (actionRef.current !== undefined) return;
        actionRef.current = 'stop';
        setError(undefined);
        setNote(undefined);
        setAction('stop');
        try {
          const result = await runCommand(sid, '/mcdev stop --json');
          const stopStatus = statusOf(result.data);
          if (stopStatus !== undefined) {
            commit(sid, (current) => ({ ...current, status: stopStatus, statusError: undefined }));
          }
          if (result.kind === 'error') setError(messageOf(result, translate(t, 'commandFailed')));
          else if (stopStatus === undefined) setError(translate(t, 'badJson'));
        } finally {
          if (actionRef.current === 'stop') actionRef.current = undefined;
          if (alive.current) setAction(undefined);
        }
      };

      /** Reload game scripts, then refresh the snapshot once. */
      const reloadGame = async () => {
        const sid = sessionId;
        if (actionRef.current !== undefined) return;
        actionRef.current = 'reload';
        setError(undefined);
        setNote(undefined);
        setAction('reload');
        try {
          const machine = viewOf(sid).machineId;
          const machineSuffix = typeof machine === 'string' && machine !== '' ? ' --machine-b64=' + encodeArg(machine) : '';
          const result = await runCommand(sid, '/mcdev reload' + machineSuffix + ' --json');
          const data = result.data;
          if (result.kind === 'error') {
            setError(messageOf(result, translate(t, 'commandFailed')));
          } else if (data !== undefined && data.ok === false) {
            setError(typeof data.error === 'string' && data.error !== '' ? data.error : translate(t, 'commandFailed'));
          } else {
            flashNote(translate(t, 'reloadOk'));
          }
          if (data !== undefined && data.logs !== undefined && Array.isArray(data.logs.lines)) {
            commit(sid, (current) => ({ ...current, logs: { ...current.logs, launcher: mergeLogs(current.logs.launcher, data.logs) } }));
          }
          if (data !== undefined && data.gameLogs !== undefined && Array.isArray(data.gameLogs.lines)) {
            const gameLines = normalizeLines(data.gameLogs);
            commit(sid, (current) => ({
              ...current,
              logs: { ...current.logs, game: { ...current.logs.game, lines: gameLines, error: undefined, loaded: true } },
            }));
          }
          void loadStatus(true);
        } finally {
          if (actionRef.current === 'reload') actionRef.current = undefined;
          if (alive.current) setAction(undefined);
        }
      };

      // ---------------------------------------------------------------------
      // 启动预设（设置页）：游戏路径 + host（世界/包/皮肤）+ guest（皮肤）
      // ---------------------------------------------------------------------

      const clonePreset = (preset) => {
        if (preset === null || typeof preset !== 'object') return undefined;
        try {
          return JSON.parse(JSON.stringify(preset));
        } catch (error) {
          return undefined;
        }
      };

      /** Load presets + selectable worlds/packs/skins and pick the preset being edited. */
      const loadPresets = async (sid, options = {}) => {
        if (sid === undefined || sid === null || !remoteReady(remoteRef.current)) return;
        const key = sid + '|presets';
        if (loads.has(key)) {
          await loads.get(key);
          return;
        }
        const task = (async () => {
          commit(sid, (current) => ({ ...current, launch: { ...current.launch, busy: true, error: undefined } }));
          try {
            const result = await runCommand(sid, '/mcdev presets --json');
            const data = result.data;
            if (result.kind === 'error' || data === undefined || data.ok === false) {
              const message = data !== undefined && typeof data.error === 'string' && data.error !== ''
                ? data.error
                : messageOf(result, translate(t, 'presetLoadFailed'));
              commit(sid, (current) => ({ ...current, launch: { ...current.launch, busy: false, error: message } }));
              return;
            }
            const state = data.state !== null && typeof data.state === 'object' ? data.state : {};
            const presets = Array.isArray(state.presets) ? state.presets : [];
            const activeId = typeof state.activeId === 'string' ? state.activeId : '';
            const preferred = typeof options.selectId === 'string' && options.selectId !== ''
              ? options.selectId
              : viewOf(sid).launch.selectedId || activeId;
            const selected = presets.find((preset) => preset.id === preferred)
              || presets.find((preset) => preset.id === activeId)
              || presets[0];
            commit(sid, (snapshot) => {
              const current = snapshot.launch;
              const keepDraft = options.keepDraft === true && current.draft !== undefined;
              return {
                ...snapshot,
                launch: {
                  ...current,
                  presetsPath: typeof data.path === 'string' ? data.path : '',
                  presets,
                  activeId,
                  selectedId: selected !== undefined ? selected.id : '',
                  detectedGameExe: typeof data.detectedGameExe === 'string' ? data.detectedGameExe : '',
                  worlds: Array.isArray(data.worlds) ? data.worlds : [],
                  behavior: Array.isArray(data.behavior) ? data.behavior : [],
                  resource: Array.isArray(data.resource) ? data.resource : [],
                  skins: Array.isArray(data.skins) ? data.skins : [],
                  skinsDir: typeof data.skinsDir === 'string' ? data.skinsDir : '',
                  skinsExists: data.skinsExists === true,
                  draft: keepDraft ? current.draft : clonePreset(selected),
                  busy: false,
                  error: undefined,
                },
              };
            });
          } catch (caught) {
            const message = caught !== null && caught !== undefined && typeof caught.message === 'string' ? caught.message : '';
            commit(sid, (current) => ({
              ...current,
              launch: { ...current.launch, busy: false, error: message !== '' ? message : translate(t, 'presetLoadFailed') },
            }));
          } finally {
            loads.delete(key);
          }
        })();
        loads.set(key, task);
        await task;
      };

      /** Open the in-panel settings page (presets). */
      const openSettings = () => {
        const sid = sessionId;
        if (sid === undefined || sid === null) return;
        commit(sid, (current) => ({ ...current, launch: { ...current.launch, page: 'presets' } }));
        if (viewOf(sid).launch.presets.length === 0) void loadPresets(sid);
      };

      /** Leave the settings page. */
      const closeSettings = () => {
        const sid = sessionId;
        if (sid === undefined || sid === null) return;
        commit(sid, (current) => ({ ...current, launch: { ...current.launch, page: 'main' } }));
      };

      /** Back from one preset editor to the preset card list (discards unsaved edits). */
      const backToPresetList = () => {
        const sid = sessionId;
        if (sid === undefined || sid === null) return;
        commit(sid, (current) => ({ ...current, launch: { ...current.launch, page: 'presets', draft: undefined } }));
      };

      /** Open one preset's editor (entered from the edit button on its card). */
      const openPresetEditor = async (presetId) => {
        const sid = sessionId;
        if (sid === undefined || sid === null) return;
        let preset = viewOf(sid).launch.presets.find((item) => item.id === presetId);
        if (preset === undefined) {
          await loadPresets(sid, { selectId: presetId });
          preset = viewOf(sid).launch.presets.find((item) => item.id === presetId);
        }
        if (preset === undefined) return;
        commit(sid, (current) => ({
          ...current,
          launch: { ...current.launch, page: 'preset', selectedId: presetId, draft: clonePreset(preset) },
        }));
      };

      /**
       * Open the custom M3 select menu under its trigger. Coordinates are relative to
       * the panel root (`position:fixed` + `contain:content`), so the menu never leaves
       * the panel and ignores the settings scroll container.
       */
      const openSelect = (event, spec) => {
        const trigger = event !== null && event !== undefined ? event.currentTarget : null;
        const root = rootRef.current;
        if (trigger === null || root === null) return;
        const rootRect = root.getBoundingClientRect();
        const rect = trigger.getBoundingClientRect();
        const gap = 4;
        const spaceBelow = rootRect.bottom - rect.bottom - gap - 6;
        const spaceAbove = rect.top - rootRect.top - gap - 6;
        const above = spaceBelow < 160 && spaceAbove > spaceBelow;
        const maxHeight = Math.max(120, Math.min(300, above ? spaceAbove : spaceBelow));
        const left = Math.max(4, rect.left - rootRect.left);
        const width = Math.max(140, Math.min(rect.width, rootRect.width - left - 8));
        setSelectMenu({
          id: spec.id,
          label: spec.label,
          value: spec.value,
          choices: spec.choices,
          onChange: spec.onChange,
          left,
          width,
          maxHeight,
          above,
          top: rect.bottom - rootRect.top + gap,
          bottom: rootRect.height - (rect.top - rootRect.top) + gap,
        });
      };

      const closeSelect = () => setSelectMenu(undefined);

      React.useEffect(() => {
        if (selectMenu === undefined) return undefined;
        if (menuRef.current !== null) menuRef.current.focus();
        return undefined;
      }, [selectMenu !== undefined]); // eslint-disable-line react-hooks/exhaustive-deps

      React.useEffect(() => {
        setSelectMenu(undefined);
        return undefined;
      }, [view.launch.page]); // eslint-disable-line react-hooks/exhaustive-deps

      /** Patch the editable preset draft (deep enough for host/guests). */
      const updateDraft = (updater) => {
        const sid = sessionId;
        if (sid === undefined || sid === null) return;
        commit(sid, (current) => {
          const draft = clonePreset(current.launch.draft);
          if (draft === undefined) return current;
          updater(draft);
          return { ...current, launch: { ...current.launch, draft, savedAt: undefined } };
        });
      };

      /** Save one preset through the Host, then reload the list selecting it. */
      const persistPreset = async (preset, options = {}) => {
        const sid = sessionId;
        if (sid === undefined || sid === null || !remoteReady(remoteRef.current)) return;
        commit(sid, (current) => ({ ...current, launch: { ...current.launch, busy: true, error: undefined } }));
        try {
          const result = await runCommand(sid, '/mcdev preset-save --preset-b64=' + encodeArg(JSON.stringify(preset)) + ' --json');
          const data = result.data;
          if (result.kind === 'error' || data === undefined || data.ok === false) {
            const message = data !== undefined && typeof data.error === 'string' && data.error !== ''
              ? data.error
              : messageOf(result, translate(t, 'presetSaveFailed'));
            commit(sid, (current) => ({ ...current, launch: { ...current.launch, busy: false, error: message } }));
            return false;
          }
          const saved = data.preset !== null && typeof data.preset === 'object' ? data.preset : preset;
          if (options.activate === true && typeof saved.id === 'string') {
            await runCommand(sid, '/mcdev preset-active --preset-id-b64=' + encodeArg(saved.id) + ' --json');
          }
          await loadPresets(sid, { selectId: typeof saved.id === 'string' ? saved.id : undefined });
          commit(sid, (current) => ({ ...current, launch: { ...current.launch, savedAt: Date.now() } }));
          return true;
        } finally {
          commit(sid, (current) => ({ ...current, launch: { ...current.launch, busy: false } }));
        }
      };

      /** Save the current draft, then return to the preset card list. */
      const saveDraft = async () => {
        const sid = sessionId;
        const draft = viewOf(sid).launch.draft;
        if (draft === undefined) return;
        const ok = await persistPreset(draft, { activate: true });
        if (ok) {
          flashNote(translate(t, 'presetSaved'));
          commit(sid, (current) => ({
            ...current,
            launch: { ...current.launch, page: 'presets', draft: undefined },
          }));
        }
      };

      /** Add a new preset (starts from the detected defaults) and return to the list. */
      const addPreset = async () => {
        const sid = sessionId;
        commit(sid, (current) => ({ ...current, launch: { ...current.launch, page: 'presets' } }));
        const launch = viewOf(sid).launch;
        const count = launch.presets.length + 1;
        const firstSkin = Array.isArray(launch.skins) && launch.skins.length > 0 ? launch.skins[0].path : '';
        const preset = {
          name: translate(t, 'newPresetName') + ' ' + count,
          gameExe: launch.detectedGameExe || '',
          host: { world: '', behaviorPacks: null, resourcePacks: null, skin: firstSkin, slim: false },
          guests: [],
        };
        const ok = await persistPreset(preset, { activate: true });
        if (ok) flashNote(translate(t, 'presetAdded'));
      };

      /** Delete one preset (defaults to the selected one). */
      const removePreset = async (presetId) => {
        const sid = sessionId;
        const launch = viewOf(sid).launch;
        const target = typeof presetId === 'string' && presetId !== '' ? presetId : launch.selectedId;
        if (target === '' || launch.presets.length <= 1) return;
        commit(sid, (current) => ({ ...current, launch: { ...current.launch, busy: true, error: undefined } }));
        try {
          const result = await runCommand(sid, '/mcdev preset-delete --preset-id-b64=' + encodeArg(target) + ' --json');
          const data = result.data;
          if (result.kind === 'error' || data === undefined || data.ok === false) {
            const message = data !== undefined && typeof data.error === 'string' && data.error !== ''
              ? data.error
              : messageOf(result, translate(t, 'presetDeleteFailed'));
            commit(sid, (current) => ({ ...current, launch: { ...current.launch, busy: false, error: message } }));
            return;
          }
          flashNote(translate(t, 'presetDeleted'));
          await loadPresets(sid);
        } finally {
          commit(sid, (current) => ({ ...current, launch: { ...current.launch, busy: false } }));
        }
      };

      /** Switch the active preset. */
      const selectPreset = async (presetId) => {
        const sid = sessionId;
        if (typeof presetId !== 'string' || presetId === '') return;
        commit(sid, (current) => ({ ...current, launch: { ...current.launch, busy: true, error: undefined } }));
        try {
          await runCommand(sid, '/mcdev preset-active --preset-id-b64=' + encodeArg(presetId) + ' --json');
          await loadPresets(sid, { selectId: presetId });
        } finally {
          commit(sid, (current) => ({ ...current, launch: { ...current.launch, busy: false } }));
        }
      };

      /** Create a world for the preset (official template or copy of an existing world). */
      const createPresetWorld = async (worldName, worldFrom) => {
        const sid = sessionId;
        const name = typeof worldName === 'string' ? worldName.trim() : '';
        if (sid === undefined || sid === null || !remoteReady(remoteRef.current) || name === '') return;
        commit(sid, (current) => ({ ...current, launch: { ...current.launch, busy: true, error: undefined } }));
        try {
          const fromSuffix = typeof worldFrom === 'string' && worldFrom.trim() !== ''
            ? ' --world-from-b64=' + encodeArg(worldFrom.trim())
            : '';
          const result = await runCommand(sid, '/mcdev world-create --world-name-b64=' + encodeArg(name) + fromSuffix + ' --json');
          const data = result.data;
          if (result.kind === 'error' || data === undefined || data.ok === false) {
            const message = data !== undefined && typeof data.error === 'string' && data.error !== ''
              ? data.error
              : messageOf(result, translate(t, 'createFailed'));
            commit(sid, (current) => ({ ...current, launch: { ...current.launch, busy: false, error: message } }));
            return;
          }
          flashNote(translate(t, 'worldCreated', { name }));
          await loadPresets(sid);
          updateDraft((draft) => {
            draft.host = draft.host || {};
            draft.host.world = name;
          });
        } finally {
          commit(sid, (current) => ({ ...current, launch: { ...current.launch, busy: false } }));
        }
      };

      /** Open the native folder picker (no path typing anywhere). */
      const pickFolder = async () => {
        if (pickDirectory === undefined) return { error: translate(t, 'pickerUnavailable') };
        try {
          const picked = await pickDirectory();
          return typeof picked === 'string' && picked !== '' ? { path: picked } : {};
        } catch (caught) {
          const message = caught !== null && caught !== undefined && typeof caught.message === 'string' ? caught.message : '';
          return { error: message !== '' ? message : translate(t, 'pickerFailed') };
        }
      };

      /** Run one import command after a folder pick, then refresh the lists. */
      const runImport = async (command, noteKey) => {
        const sid = sessionId;
        if (sid === undefined || sid === null || !remoteReady(remoteRef.current)) return;
        const picked = await pickFolder();
        if (picked.error !== undefined) {
          commit(sid, (current) => ({ ...current, launch: { ...current.launch, error: picked.error } }));
          return;
        }
        if (picked.path === undefined) return; // cancelled by the user
        commit(sid, (current) => ({ ...current, launch: { ...current.launch, busy: true, error: undefined } }));
        try {
          const result = await runCommand(sid, command(picked.path));
          const data = result.data;
          if (result.kind === 'error' || data === undefined || data.ok === false) {
            const message = data !== undefined && typeof data.error === 'string' && data.error !== ''
              ? data.error
              : messageOf(result, translate(t, 'importFailed'));
            commit(sid, (current) => ({ ...current, launch: { ...current.launch, busy: false, error: message } }));
            return;
          }
          flashNote(translate(t, noteKey));
          await loadPresets(sid, { selectId: viewOf(sid).launch.selectedId, keepDraft: true });
        } finally {
          commit(sid, (current) => ({ ...current, launch: { ...current.launch, busy: false } }));
        }
      };

      /** Import a behavior/resource pack folder chosen in the native picker. */
      const importPackFolder = (kind) =>
        runImport(
          (source) => '/mcdev pack-import --kind ' + kind + ' --source-b64=' + encodeArg(source) + ' --json',
          'packImported',
        );

      /** Import a skin folder (copies its PNG files into the project). */
      const importSkinsFolder = () =>
        runImport((source) => '/mcdev skin-import --source-b64=' + encodeArg(source) + ' --json', 'skinsImported');

      /** Pick the game install folder and derive Minecraft.Windows.exe from it. */
      const pickGameFolder = async () => {
        const picked = await pickFolder();
        if (picked.error !== undefined) {
          commit(sessionId, (current) => ({ ...current, launch: { ...current.launch, error: picked.error } }));
          return;
        }
        if (picked.path === undefined) return;
        const base = picked.path.replace(/[\\/]+$/, '');
        updateDraft((draft) => {
          draft.gameExe = base + '\\Minecraft.Windows.exe';
        });
      };

      React.useEffect(() => {
        if (!expanded) return undefined;
        if (view.launch.page === 'main') return undefined;
        if (view.launch.presets.length === 0) {
          if (!view.launch.busy) void loadPresets(sessionId);
          return undefined;
        }
        // A preset editor without a draft (deep link / restored page) opens the selected preset.
        if (view.launch.page === 'preset' && view.launch.draft === undefined) {
          void openPresetEditor(view.launch.selectedId || view.launch.activeId);
        }
        return undefined;
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, [expanded, view.launch.page, view.launch.presets.length, view.launch.draft]);

      /** Force one status read (the only path that repeats it for the same session). */
      const refreshStatus = async () => {
        if (actionRef.current !== undefined) return;
        setError(undefined);
        setNote(undefined);
        setAction('refresh');
        try {
          await loadStatus(true);
        } finally {
          if (actionRef.current === 'refresh') actionRef.current = undefined;
          if (alive.current) setAction(undefined);
        }
      };

      /**
       * Read one log source.
       *
       * `launcher` is the official game log with an incremental cursor: the first read is the
       * latest window, `newer` continues after `next`. `game` is the in-game ModSDK/engine log
       * (`/mcdev game-logs`): no cursor, every read replaces the window with the latest lines.
       */
      const loadLogs = async (source, mode) => {
        const sid = sessionId;
        if (!remoteReady(remoteRef.current)) return;
        const kind = source === 'game' ? 'game' : 'launcher';
        const key = sid + '|logs|' + kind;
        if (loads.has(key)) {
          await loads.get(key);
          return;
        }
        const task = (async () => {
          setLogBusy(true);
          try {
            const logs = viewOf(sid).logs;
            if (kind === 'game') {
              const errorsOnly = logs.game.errorsOnly === true;
              const machine = viewOf(sid).machineId;
              const machineSuffix = typeof machine === 'string' && machine !== ''
                ? ' --machine-b64=' + encodeArg(machine)
                : '';
              const command = '/mcdev game-logs --limit ' + LOG_LIMIT + (errorsOnly ? ' --errors' : '') + machineSuffix + ' --json';
              const result = await runCommand(sid, command);
              const data = result.data;
              if (data !== undefined && data.ok === false) {
                const message = typeof data.error === 'string' && data.error !== '' ? data.error : translate(t, 'commandFailed');
                commit(sid, (snapshot) => ({
                  ...snapshot,
                  logs: { ...snapshot.logs, game: { ...snapshot.logs.game, lines: [], error: message, loaded: true } },
                }));
                return;
              }
              if (result.kind === 'error' || data === undefined || !Array.isArray(data.lines)) {
                const message = messageOf(result, translate(t, 'commandFailed'));
                commit(sid, (snapshot) => ({
                  ...snapshot,
                  logs: { ...snapshot.logs, game: { ...snapshot.logs.game, lines: [], error: message, loaded: true } },
                }));
                return;
              }
              const gameLines = normalizeLines(data);
              commit(sid, (snapshot) => ({
                ...snapshot,
                logs: { ...snapshot.logs, game: { ...snapshot.logs.game, lines: gameLines, error: undefined, loaded: true } },
              }));
              return;
            }
            const launcher = logs.launcher;
            let command;
            if (mode === 'newer') {
              const next = intOf(launcher.next);
              if (next === undefined) {
                flashNote(translate(t, 'noNewer'));
                return;
              }
              command = '/mcdev logs --since ' + next + ' --limit ' + LOG_LIMIT + ' --json';
            } else {
              command = '/mcdev logs --limit ' + LOG_LIMIT + ' --json';
            }
            const result = await runCommand(sid, command);
            const data = logDataOf(result.data);
            if (result.kind === 'error' || data === undefined || !Array.isArray(data.lines)) {
              const message = messageOf(result, translate(t, 'commandFailed'));
              commit(sid, (snapshot) => ({
                ...snapshot,
                logs: { ...snapshot.logs, launcher: { ...snapshot.logs.launcher, error: message } },
              }));
              return;
            }
            if (mode === 'newer' && Array.isArray(data.lines) && data.lines.length === 0) {
              flashNote(translate(t, 'noNewer'));
            }
            const nextLauncher = mode === 'newer' ? mergeLogs(launcher, data) : mergeLogs(undefined, data);
            commit(sid, (snapshot) => ({
              ...snapshot,
              logs: { ...snapshot.logs, launcher: { ...nextLauncher, error: undefined } },
            }));
          } finally {
            if (alive.current) setLogBusy(false);
          }
        })();
        loads.set(key, task);
        try {
          await task;
        } finally {
          loads.delete(key);
        }
      };

      // Opening the console is a user action: re-read the status once so a game that was
      // started/stopped outside this panel (another session, a crash) is reflected.
      React.useEffect(() => {
        if (!expanded) return undefined;
        const sid = sessionId;
        if (sid === undefined || sid === null) return undefined;
        void loadStatus(true);
        return undefined;
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, [expanded, sessionId]);

      const machineChoices = [{ value: '', label: translate(t, 'machineAuto') }].concat(
        (Array.isArray(view.machines) ? view.machines : []).map((machine, index) => {
          const sideLabel = machine.side === 'server' ? translate(t, 'machineServer') : translate(t, 'machineClient');
          const bits = [
            '#' + (index + 1),
            sideLabel,
            typeof machine.playerName === 'string' ? machine.playerName : '',
            typeof machine.world === 'string' ? machine.world : '',
            typeof machine.gameVersion === 'string' && machine.gameVersion !== '' ? 'v' + machine.gameVersion : '',
            machine.launchedHere === true ? translate(t, 'machineLocal') : '',
          ].filter((item) => item !== '');
          return { value: machine.id, label: bits.join(' · ') };
        }),
      );

      /** M3 selector for choosing which connected game instance logs/exec target. */
      const machineSelector = (key) => {
        if (machineChoices.length <= 1) return null;
        const selected = machineChoices.find((choice) => choice.value === view.machineId) || machineChoices[0];
        return h(
          'button',
          {
            type: 'button',
            className: 'mcd-machine-select',
            key: 'machine-' + key,
            'aria-haspopup': 'listbox',
            'aria-label': translate(t, 'machine'),
            title: translate(t, 'machine'),
            onClick: (event) =>
              openSelect(event, {
                id: 'machine-' + key,
                label: translate(t, 'machine'),
                value: view.machineId,
                choices: machineChoices,
                onChange: selectMachine,
              }),
          },
          h(Icon, { name: 'computer' }),
          h('span', { className: 'mcd-machine-text' }, selected.label),
          h(Icon, { name: 'chevron' }),
        );
      };

      // Opening the log tab (or switching its source/machine) reads a window.
      React.useEffect(() => {
        if (!expanded || tab !== 'logs') return undefined;
        const sid = sessionId;
        if (sid === undefined || sid === null) return undefined;
        void loadMachines(sid);
        const logs = viewOf(sid).logs;
        if (logSource === 'game') {
          void loadLogs('game', 'initial');
        } else if (!logs.launcher.loaded) {
          void loadLogs('launcher', 'initial');
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, [expanded, tab, logSource, view.machineId, sessionId]);

      // The exec tab also offers the machine selector: refresh the list when opened.
      React.useEffect(() => {
        if (!expanded || tab !== 'exec') return undefined;
        if (sessionId === undefined || sessionId === null) return undefined;
        void loadMachines(sessionId);
        return undefined;
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, [expanded, tab, sessionId]);

      /** Run one Python snippet through `/mcdev exec --json`. */
      const runCode = async () => {
        const sid = sessionId;
        const exec = viewOf(sid).exec;
        if (typeof exec.code !== 'string' || exec.code.trim() === '') return;
        const side = exec.side === 'server' ? 'server' : 'client';
        setExecBusy(true);
        commit(sid, (current) => ({ ...current, exec: { ...current.exec, ran: false, error: undefined } }));
        try {
          const machine = viewOf(sid).machineId;
          const machineSuffix = typeof machine === 'string' && machine !== '' ? ' --machine-b64=' + encodeArg(machine) : '';
          const result = await runCommand(sid, '/mcdev exec --side ' + side + ' --code-b64=' + encodeArg(exec.code) + machineSuffix + ' --json');
          const data = result.data;
          let text = '';
          if (data !== undefined) {
            const shown = {};
            if (data.ok !== undefined) shown.ok = data.ok;
            if (data.returnValue !== undefined) shown.returnValue = data.returnValue;
            if (data.error !== undefined) shown.error = data.error;
            if (Object.keys(shown).length === 0) shown.raw = data;
            try {
              text = clipText(JSON.stringify(shown, null, 2), TEXT_LIMIT);
            } catch (caught) {
              text = clipText(result.text, TEXT_LIMIT);
            }
          } else {
            text = clipText(result.text, TEXT_LIMIT);
          }
          let message;
          if (result.kind === 'error') message = messageOf(result, translate(t, 'commandFailed'));
          else if (data !== undefined && data.ok === false) message = typeof data.error === 'string' && data.error !== '' ? data.error : translate(t, 'commandFailed');
          const gameLines = data !== undefined && data.gameLogs !== undefined ? normalizeLines(data.gameLogs).slice(-20) : [];
          commit(sid, (current) => ({ ...current, exec: { ...current.exec, text, ran: true, error: message, gameLines } }));
        } finally {
          if (alive.current) setExecBusy(false);
        }
      };

      /** Search the bundled docs. */
      const searchDocs = async () => {
        const sid = sessionId;
        const query = viewOf(sid).docs.query;
        if (typeof query !== 'string' || query.trim() === '') return;
        setDocsBusy(true);
        commit(sid, (current) => ({ ...current, docs: { ...current.docs, error: undefined, searched: false } }));
        try {
          const result = await runCommand(sid, '/mcdev docs --query-b64=' + encodeArg(query.trim()) + ' --limit ' + DOC_LIMIT + ' --json');
          const data = result.data;
          const hits = data !== undefined && Array.isArray(data.hits) ? data.hits.filter((hit) => hit !== null && typeof hit === 'object' && typeof hit.path === 'string') : [];
          if (result.kind === 'error' || (data === undefined && result.text !== '')) {
            const message = messageOf(result, translate(t, 'commandFailed'));
            commit(sid, (current) => ({ ...current, docs: { ...current.docs, hits: [], searched: true, error: message, path: undefined, text: '', more: false, total: 0 } }));
            return;
          }
          commit(sid, (current) => ({
            ...current,
            docs: { ...current.docs, hits, searched: true, error: undefined, path: undefined, title: '', text: '', total: 0, more: false },
          }));
        } finally {
          if (alive.current) setDocsBusy(false);
        }
      };

      /** Read one document (or the next slice of it) through `/mcdev read --json`. */
      const readDoc = async (path, offset) => {
        const sid = sessionId;
        const docs = viewOf(sid).docs;
        const target = typeof path === 'string' && path !== '' ? path : docs.path;
        if (typeof target !== 'string' || target === '') return;
        const start = Math.max(0, intOf(offset) === undefined ? 0 : intOf(offset));
        setReadBusy(true);
        commit(sid, (current) => ({ ...current, docs: { ...current.docs, error: undefined } }));
        try {
          const result = await runCommand(sid, '/mcdev read --path-b64=' + encodeArg(target) + ' --offset ' + start + ' --json');
          const data = result.data;
          if (result.kind === 'error' || data === undefined || typeof data.text !== 'string') {
            const message = messageOf(result, translate(t, 'docReadFailed'));
            commit(sid, (current) => ({ ...current, docs: { ...current.docs, error: message } }));
            return;
          }
          const append = start > 0;
          const text = append ? docs.text + data.text : data.text;
          const total = typeof data.total === 'number' ? data.total : text.length;
          commit(sid, (current) => ({
            ...current,
            docs: {
              ...current.docs,
              path: typeof data.path === 'string' && data.path !== '' ? data.path : target,
              title: typeof data.title === 'string' ? data.title : '',
              text: clipText(text, TEXT_LIMIT * 3),
              total,
              more: data.more === true,
              error: undefined,
            },
          }));
        } finally {
          if (alive.current) setReadBusy(false);
        }
      };

      /** Copy one value, reporting success only; a clipboard failure stays silent. */
      const copyValue = (text) => {
        void writeClipboard(typeof text === 'string' ? text : '').then((ok) => {
          if (ok === true && alive.current) flashNote(translate(t, 'copied'));
        });
      };

      const tabs = [
        { id: 'logs', label: 'logs', icon: 'console' },
        { id: 'exec', label: 'exec', icon: 'terminal' },
        { id: 'docs', label: 'docs', icon: 'book' },
      ];

      /** Arrow-key navigation across the tab list. */
      const onTabKeyDown = (event, index) => {
        if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
        event.preventDefault();
        const delta = event.key === 'ArrowRight' ? 1 : -1;
        const nextIndex = (index + delta + tabs.length) % tabs.length;
        setTab(tabs[nextIndex].id);
        const list = event.currentTarget.parentElement;
        if (list !== null && list !== undefined && typeof list.querySelectorAll === 'function') {
          const nodes = list.querySelectorAll('[role="tab"]');
          if (nodes[nextIndex] !== undefined && typeof nodes[nextIndex].focus === 'function') nodes[nextIndex].focus();
        }
      };

      const statusTitle = status !== null && status !== undefined
        ? [typeof status.projectDir === 'string' ? status.projectDir : '', typeof status.lastError === 'string' ? status.lastError : '']
            .filter((item) => item !== '')
            .join('\n')
        : '';

      const busyAction = action !== undefined;

      const headPhase = action === 'start' ? 'launching' : phase;

      // One start/stop control: filled play when stopped, filled stop when running,
      // filled close while the launch is still waiting for the world (cancels the wait).
      const toggleAction = (() => {
        if (action === 'start') {
          return { key: 'toggle', icon: 'close', label: translate(t, 'cancel'), variant: 'filled', onClick: cancelStart };
        }
        if (phase === 'ready' || phase === 'launching') {
          return {
            key: 'toggle',
            icon: 'stop',
            label: translate(t, 'stop'),
            variant: 'filled',
            disabled: !canStop,
            onClick: () => void stopGame(),
          };
        }
        return {
          key: 'toggle',
          icon: 'play',
          label: translate(t, 'launch'),
          variant: 'filled',
          disabled: !canLaunch,
          onClick: () => void startGame(),
        };
      })();

      const primaryActions = [
        h(IconButton, { ...toggleAction, fab: true }),
        h(IconButton, {
          key: 'refresh',
          icon: 'refresh',
          label: translate(t, 'refresh'),
          busy: action === 'refresh',
          disabled: !canRefresh,
          onClick: () => void refreshStatus(),
        }),
        h(IconButton, {
          key: 'reload',
          icon: 'reload',
          label: translate(t, 'reload'),
          busy: action === 'reload',
          disabled: !canReload,
          onClick: () => void reloadGame(),
        }),
      ];

      const settingsPage = mode === 'full' ? view.launch.page : 'main';
      const settingsOpen = settingsPage !== 'main';

      /** Full-mode action row: settings sits at the far right, after a flexible spacer. */
      const fullActions = [
        ...primaryActions,
        h('div', { className: 'mcd-spacer', key: 'spacer' }),
        h(IconButton, {
          key: 'settings',
          icon: 'settings',
          label: translate(t, 'settings'),
          pressed: settingsOpen,
          variant: settingsOpen ? 'tonal' : 'text',
          onClick: () => (settingsOpen ? closeSettings() : openSettings()),
        }),
      ];

      /** The single Minecraft icon doubles as the "back to icon mode" control. */
      const logoButton = (key) =>
        h(
          'button',
          {
            key: key || 'logo',
            type: 'button',
            className: 'mcd-logo mcd-logo-btn',
            'data-mcd-no-drag': 'true',
            title: translate(t, 'toIcon'),
            'aria-label': translate(t, 'toIcon'),
            onClick: enterIcon,
          },
          h(Icon, { name: 'minecraft' }),
        );

      /** Icon mode: the icon asks for compact; drag suppression keeps a real drag from switching. */
      const onFabClick = () => {
        if (suppressClickRef.current === true) {
          suppressClickRef.current = false;
          return;
        }
        enterCompact();
      };

      const onFabKeyDown = (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          enterCompact();
        }
      };

      const dragHandle = h('div', {
        className: 'mcd-drag-handle',
        key: 'handle',
        tabIndex: 0,
        role: 'button',
        'aria-label': translate(t, 'movePanel'),
        title: translate(t, 'movePanel'),
        onPointerDown: beginDrag,
        onPointerMove: moveDrag,
        onPointerUp: endDrag,
        onPointerCancel: endDrag,
        onKeyDown: onGripKeyDown,
      });

      const header = h(
        'div',
        {
          className: 'mcd-head',
          key: 'head',
          onPointerDown: beginDrag,
          onPointerMove: moveDrag,
          onPointerUp: endDrag,
          onPointerCancel: endDrag,
        },
        logoButton('logo'),
        h(
          'div',
          { className: 'mcd-head-text', key: 'text' },
          h('span', { className: 'mcd-title' }, translate(t, 'title')),
          h(
            'span',
            { className: 'mcd-subtitle', title: statusTitle },
            h('span', { className: 'mcd-status-dot', 'data-phase': headPhase }),
            translate(t, PHASE_KEY[headPhase]),
          ),
        ),
        h('div', { className: 'mcd-actions', key: 'actions' },
          h(IconButton, { key: 'compact', icon: 'collapse', label: translate(t, 'collapse'), onClick: collapsePanel }),
        ),
      );

      const progress = launching
        ? h(
            'div',
            { className: 'mcd-progress', key: 'progress' },
            h('div', { className: 'mcd-linear', 'aria-hidden': 'true' }),
            h(
              'span',
              { className: 'mcd-progress-text' },
              translate(t, 'starting') + (action === 'start' ? ' · ' + translate(t, 'waited', { seconds: elapsed }) : ''),
            ),
            action === 'start'
              ? h(IconButton, { key: 'cancel', icon: 'close', label: translate(t, 'cancel'), onClick: cancelStart })
              : null,
          )
        : null;

      const notReadyHint = !launching && phase !== 'idle' && !ready ? h('p', { className: 'mcd-hint', key: 'notready' }, translate(t, 'notReadyHint')) : null;
      const statusError = view.statusError !== undefined && view.statusError !== '' && error === undefined
        ? h('p', { className: 'mcd-error', key: 'status-error', role: 'alert' }, view.statusError)
        : null;
      const failureLine = phase === 'failed' &&
        status !== null &&
        status !== undefined &&
        typeof status.lastError === 'string' &&
        status.lastError !== '' &&
        error === undefined
        ? h('p', { className: 'mcd-error', key: 'failure', role: 'alert' }, status.lastError)
        : null;
      const errorLine = error !== undefined ? h('p', { className: 'mcd-error', key: 'error', role: 'alert' }, error) : null;
      const noteLine = note !== undefined ? h('p', { className: 'mcd-note', key: 'note' }, note) : null;

      const settingsBar = settingsOpen
        ? h(
            'div',
            { className: 'mcd-topbar', key: 'settings-bar' },
            h(IconButton, {
              key: 'back',
              icon: 'back',
              label: settingsPage === 'preset' ? translate(t, 'backToPresets') : translate(t, 'back'),
              onClick: settingsPage === 'preset' ? backToPresetList : closeSettings,
            }),
            h(
              'span',
              { className: 'mcd-topbar-title' },
              settingsPage === 'preset'
                ? (view.launch.draft !== undefined && typeof view.launch.draft.name === 'string' ? view.launch.draft.name : translate(t, 'presets'))
                : translate(t, 'settingsTitle'),
            ),
            settingsPage === 'presets'
              ? h(IconButton, {
                  key: 'add-preset',
                  icon: 'add',
                  label: translate(t, 'addPreset'),
                  disabled: view.launch.busy,
                  onClick: () => void addPreset(),
                })
              : h(IconButton, {
                  key: 'save-preset',
                  icon: 'check',
                  variant: 'filled',
                  label: translate(t, 'save'),
                  busy: view.launch.busy,
                  disabled: view.launch.busy,
                  onClick: () => void saveDraft(),
                }),
          )
        : null;

      const tabBar = expanded && !settingsOpen
        ? h(
            'div',
            { className: 'mcd-tabs', role: 'tablist', 'aria-label': translate(t, 'title'), key: 'tabs' },
            tabs.map((entry, index) =>
              h(
                'button',
                {
                  key: entry.id,
                  type: 'button',
                  role: 'tab',
                  className: 'mcd-tab',
                  'data-on': tab === entry.id ? 'true' : 'false',
                  'aria-selected': tab === entry.id ? 'true' : 'false',
                  tabIndex: tab === entry.id ? 0 : -1,
                  'aria-label': translate(t, entry.label),
                  title: translate(t, entry.label),
                  onClick: () => setTab(entry.id),
                  onKeyDown: (event) => onTabKeyDown(event, index),
                },
                h(Icon, { name: entry.icon }),
                h('span', { className: 'mcd-tab-label' }, translate(t, entry.label)),
              ),
            ),
          )
        : null;

      let content = null;
      if (settingsOpen && view.launch.page === 'presets') {
        const launch = view.launch;
        const presets = Array.isArray(launch.presets) ? launch.presets : [];
        const presetCards = presets.map((preset, index) => {
          const host = preset.host !== null && typeof preset.host === 'object' ? preset.host : {};
          const guests = Array.isArray(preset.guests) ? preset.guests.length : 0;
          const active = preset.id === launch.activeId;
          const exeName = typeof preset.gameExe === 'string' && preset.gameExe !== ''
            ? preset.gameExe.split(/[\\/]/).pop()
            : translate(t, 'gamePathAuto');
          const world = typeof host.world === 'string' && host.world !== '' ? host.world : translate(t, 'worldDefault');
          return h(
            'div',
            { className: 'mcd-card mcd-preset-card', key: preset.id },
            h(
              'div',
              { className: 'mcd-card-head' },
              h('span', { className: 'mcd-avatar' }, String(index + 1)),
              h(
                'div',
                { className: 'mcd-preset-text' },
                h('span', { className: 'mcd-preset-name' }, preset.name),
                h('span', { className: 'mcd-helper' }, world + ' · ' + translate(t, 'guests') + ' ' + guests),
                h('span', { className: 'mcd-helper mcd-preset-exe', title: preset.gameExe || '' }, exeName),
              ),
              active ? h('span', { className: 'mcd-badge mcd-badge-active' }, translate(t, 'presetActive')) : null,
            ),
            h(
              'div',
              { className: 'mcd-card-actions' },
              h(IconButton, {
                key: 'activate',
                icon: 'check',
                label: translate(t, 'setActive'),
                variant: active ? 'tonal' : 'text',
                disabled: launch.busy || active,
                onClick: () => void selectPreset(preset.id),
              }),
              h(IconButton, {
                key: 'edit',
                icon: 'edit',
                label: translate(t, 'editPreset'),
                disabled: launch.busy,
                onClick: () => void openPresetEditor(preset.id),
              }),
              h(IconButton, {
                key: 'delete',
                icon: 'delete',
                label: translate(t, 'deletePreset'),
                disabled: launch.busy || presets.length <= 1,
                onClick: () => void removePreset(preset.id),
              }),
            ),
          );
        });
        content = h(
          'div',
          { className: 'mcd-panel mcd-settings', role: 'region', key: 'panel-presets' },
          launch.error !== undefined && launch.error !== '' ? h('p', { className: 'mcd-error', key: 'preset-error', role: 'alert' }, launch.error) : null,
          h(
            'div',
            { className: 'mcd-scroll', key: 'preset-list' },
            presets.length === 0 ? h('p', { className: 'mcd-empty' }, translate(t, 'noPresets')) : presetCards,
            h(
              'button',
              { type: 'button', className: 'mcd-add-preset', key: 'add-preset-card', disabled: launch.busy, onClick: () => void addPreset() },
              h(Icon, { name: 'add' }),
              translate(t, 'addPreset'),
            ),
          ),
        );
      } else if (settingsOpen) {

        const launch = view.launch;
        const draft = launch.draft;
        const host = draft !== undefined && draft.host !== null && typeof draft.host === 'object' ? draft.host : {};
        const behaviorEntries = Array.isArray(launch.behavior) ? launch.behavior : [];
        const resourceEntries = Array.isArray(launch.resource) ? launch.resource : [];
        const behaviorSelected = new Set(
          Array.isArray(host.behaviorPacks)
            ? host.behaviorPacks
            : behaviorEntries.filter((entry) => entry.source === 'project').map((entry) => entry.uuid),
        );
        const resourceSelected = new Set(
          Array.isArray(host.resourcePacks)
            ? host.resourcePacks
            : resourceEntries.filter((entry) => entry.source === 'project').map((entry) => entry.uuid),
        );
        const worlds = Array.isArray(launch.worlds) ? launch.worlds : [];
        const skinsList = Array.isArray(launch.skins) ? launch.skins : [];
        const guests = draft !== undefined && Array.isArray(draft.guests) ? draft.guests : [];
        const setHost = (patch) => updateDraft((next) => {
          next.host = next.host && typeof next.host === 'object' ? next.host : {};
          Object.assign(next.host, patch);
        });
        const field = (label, control, key) =>
          h('div', { className: 'mcd-field', key }, h('span', { className: 'mcd-field-label' }, label), control);
        const textField = (label, value, onChange, options = {}) =>
          field(
            label,
            h('input', {
              className: 'mcd-field-control',
              type: 'text',
              value: typeof value === 'string' ? value : '',
              readOnly: options.readOnly === true,
              placeholder: typeof options.placeholder === 'string' ? options.placeholder : '',
              'aria-label': label,
              onChange: (event) => onChange(event.target.value),
              onKeyDown: options.onKeyDown,
            }),
            options.key,
          );
        const selectField = (label, value, choices, onChange, key) => {
          const matching = choices.find((choice) => choice.value === value);
          // A preset may reference a skin outside the imported list; show its file name anyway.
          const fallbackLabel = typeof value === 'string' && value !== ''
            ? value.split(/[\\/]/).pop()
            : '';
          const selected = matching || { label: fallbackLabel };
          const open = selectMenu !== undefined && selectMenu.id === key;
          return field(
            label,
            h(
              'button',
              {
                type: 'button',
                className: 'mcd-field-control mcd-select-trigger',
                'aria-haspopup': 'listbox',
                'aria-label': label,
                'aria-expanded': open ? 'true' : 'false',
                'data-open': open ? 'true' : 'false',
                onClick: (event) => {
                  if (open) closeSelect();
                  else openSelect(event, { id: key, label, value, choices, onChange });
                },
                onKeyDown: (event) => {
                  if (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ') {
                    if (open) return;
                    event.preventDefault();
                    openSelect(event, { id: key, label, value, choices, onChange });
                  } else if (event.key === 'Escape' && open) {
                    event.preventDefault();
                    closeSelect();
                  }
                },
              },
              h('span', { className: 'mcd-select-text' }, selected.label),
              h(Icon, { name: 'chevron', key: 'caret' }),
            ),
            key,
          );
        };
        const toneButton = (label, icon, onClick, options = {}) =>
          h(
            'button',
            {
              type: 'button',
              className: 'mcd-btn',
              'data-variant': options.variant || 'tonal',
              disabled: options.disabled === true || launch.busy,
              onClick,
            },
            h(Icon, { name: icon }),
            label,
          );
        const switchRow = (label, checked, onChange, key) =>
          h(
            'label',
            { className: 'mcd-switch', key },
            h('input', { type: 'checkbox', checked: checked === true, onChange: (event) => onChange(event.target.checked) }),
            h('span', { className: 'mcd-switch-track' }, h('span', { className: 'mcd-switch-thumb' })),
            h('span', { className: 'mcd-switch-label' }, label),
          );
        const packList = (title, entries, selectedSet, kind, onListChange, key) =>
          h(
            'div',
            { className: 'mcd-pack-section', key },
            h(
              'div',
              { className: 'mcd-pack-head' },
              h('span', { className: 'mcd-pack-title' }, title),
              h(
                'button',
                {
                  type: 'button',
                  className: 'mcd-btn',
                  'data-variant': 'text',
                  disabled: launch.busy,
                  onClick: () => void importPackFolder(kind),
                },
                h(Icon, { name: 'add' }),
                translate(t, 'importPacks'),
              ),
            ),
            entries.length === 0
              ? h('p', { className: 'mcd-helper' }, translate(t, 'noPacks'))
              : h(
                  'div',
                  { className: 'mcd-pack-list' },
                  entries.map((entry) => {
                    const version = Array.isArray(entry.version)
                      ? entry.version.join('.')
                      : typeof entry.version === 'string' ? entry.version : '';
                    const sourceLabel = translate(
                      t,
                      entry.source === 'project' ? 'packSourceProject' : entry.source === 'imported' ? 'packSourceImported' : 'packSourceGlobal',
                    );
                    const name = typeof entry.name === 'string' && entry.name !== '' ? entry.name : entry.uuid;
                    return h(
                      'label',
                      {
                        className: 'mcd-pack-item',
                        key: entry.uuid,
                        title: typeof entry.dir === 'string' ? entry.dir : entry.uuid,
                      },
                      h('span', { className: 'mcd-pack-icon', key: 'icon' }, h(Icon, { name: kind === 'behavior' ? 'extension' : 'palette' })),
                      h(
                        'span',
                        { className: 'mcd-pack-text', key: 'text' },
                        h('span', { className: 'mcd-pack-name' }, name),
                        h('span', { className: 'mcd-pack-meta' }, sourceLabel + (version !== '' ? ' · ' + version : '')),
                      ),
                      h('input', {
                        key: 'check',
                        type: 'checkbox',
                        className: 'mcd-pack-check',
                        checked: selectedSet.has(entry.uuid),
                        onChange: (event) => {
                          const next = new Set(selectedSet);
                          if (event.target.checked) next.add(entry.uuid);
                          else next.delete(entry.uuid);
                          onListChange(Array.from(next));
                        },
                      }),
                    );
                  }),
                ),
          );
        const worldChoices = [
          { value: '', label: translate(t, 'worldDefault') },
          ...worlds.map((world) => ({
            value: world.name,
            label: world.name + (typeof world.levelName === 'string' && world.levelName !== world.name ? ' · ' + world.levelName : ''),
          })),
        ];
        const sourceChoices = [
          { value: '', label: translate(t, 'worldSourceTemplate') },
          ...worlds.map((world) => ({ value: world.name, label: translate(t, 'worldSourceClone') + ' ' + world.name })),
        ];
        const skinChoices = [
          { value: '', label: translate(t, 'skinDefault') },
          ...skinsList.map((file) => ({ value: file.path, label: file.name })),
        ];
        const hostSkinChoices = [
          { value: '', label: translate(t, 'skinUnselected') },
          ...skinsList.map((file) => ({ value: file.path, label: file.name })),
        ];
        content = h(
          'div',
          { className: 'mcd-panel mcd-settings', role: 'region', key: 'panel-settings' },
          launch.error !== undefined && launch.error !== '' ? h('p', { className: 'mcd-error', key: 'preset-error', role: 'alert' }, launch.error) : null,
          draft === undefined
            ? h('p', { className: 'mcd-empty' }, launch.busy ? translate(t, 'busy') : translate(t, 'noPresets'))
            : h(
                'div',
                { className: 'mcd-scroll', key: 'settings-scroll' },
                h(
                  'div',
                  { className: 'mcd-card', key: 'card-preset' },
                  h(
                    'div',
                    { className: 'mcd-card-head' },
                    h('span', { className: 'mcd-card-title' }, h(Icon, { name: 'settings' }), translate(t, 'presets')),
                    h('span', { className: 'mcd-helper' }, launch.activeId === launch.selectedId ? translate(t, 'presetActive') : ''),
                  ),
                  textField(translate(t, 'presetName'), draft.name, (value) => updateDraft((next) => { next.name = value; }), { key: 'preset-name' }),
                  textField(translate(t, 'gamePath'), draft.gameExe, () => {}, { key: 'game-path', readOnly: true, placeholder: translate(t, 'gamePathPlaceholder') }),
                  h(
                    'div',
                    { className: 'mcd-field-row', key: 'game-path-actions' },
                    toneButton(translate(t, 'chooseGameFolder'), 'folder', () => void pickGameFolder(), { variant: 'outlined' }),
                    toneButton(translate(t, 'useDetectedPath'), 'refresh', () => updateDraft((next) => { next.gameExe = launch.detectedGameExe; }), {
                      variant: 'outlined',
                      disabled: launch.detectedGameExe === '',
                    }),
                  ),
                  launch.detectedGameExe !== ''
                    ? h('p', { className: 'mcd-helper', key: 'game-path-hint' }, translate(t, 'gamePathDetected') + ' ' + launch.detectedGameExe)
                    : null,
                ),
                h(
                  'div',
                  { className: 'mcd-card', key: 'card-host' },
                  h('div', { className: 'mcd-card-head' }, h('span', { className: 'mcd-card-title' }, h(Icon, { name: 'gamepad' }), translate(t, 'host'))),
                  textField(translate(t, 'userName'), host.playerName || 'developer', (value) => setHost({ playerName: value }), {
                    key: 'host-player-name',
                    placeholder: translate(t, 'userNamePlaceholder'),
                  }),
                  selectField(translate(t, 'world'), host.world, worldChoices, (value) => setHost({ world: value }), 'host-world'),
                  h(
                    'div',
                    { className: 'mcd-field-row', key: 'new-world-row' },
                    textField(translate(t, 'newWorld'), newWorldName, setNewWorldName, {
                      key: 'new-world',
                      placeholder: translate(t, 'newWorldPlaceholder'),
                      onKeyDown: (event) => {
                        if (event.key === 'Enter') {
                          event.preventDefault();
                          void createPresetWorld(newWorldName, newWorldFrom);
                        }
                      },
                    }),
                    toneButton(translate(t, 'create'), 'add', () => void createPresetWorld(newWorldName, newWorldFrom), {
                      variant: 'filled',
                      disabled: newWorldName.trim() === '',
                    }),
                  ),
                  selectField(translate(t, 'worldSource'), newWorldFrom, sourceChoices, setNewWorldFrom, 'new-world-source'),
                  h('div', { className: 'mcd-divider', key: 'divider-packs' }),
                  packList(
                    translate(t, 'behaviorPacks'),
                    behaviorEntries,
                    behaviorSelected,
                    'behavior',
                    (list) => setHost({ behaviorPacks: list }),
                    'host-behavior',
                  ),
                  packList(
                    translate(t, 'resourcePacks'),
                    resourceEntries,
                    resourceSelected,
                    'resource',
                    (list) => setHost({ resourcePacks: list }),
                    'host-resource',
                  ),
                  h('div', { className: 'mcd-divider', key: 'divider-skin' }),
                  selectField(translate(t, 'skins'), host.skin, hostSkinChoices, (value) => setHost({ skin: value }), 'host-skin'),
                  h(
                    'div',
                    { className: 'mcd-field-row', key: 'skin-actions' },
                    toneButton(translate(t, 'importSkins'), 'add', () => void importSkinsFolder(), { variant: 'outlined' }),
                    skinsList.length === 0 ? h('span', { className: 'mcd-helper' }, translate(t, 'noSkins')) : null,
                  ),
                  switchRow(translate(t, 'slim'), host.slim === true, (checked) => setHost({ slim: checked }), 'host-slim'),
                ),
                h(
                  'div',
                  { className: 'mcd-card', key: 'card-guests' },
                  h(
                    'div',
                    { className: 'mcd-card-head' },
                    h('span', { className: 'mcd-card-title' }, h(Icon, { name: 'client' }), translate(t, 'guests') + ' · ' + guests.length),
                    toneButton(translate(t, 'addGuest'), 'add', () =>
                      updateDraft((next) => {
                        next.guests = Array.isArray(next.guests) ? next.guests : [];
                        next.guests.push({ name: translate(t, 'guest') + ' ' + (next.guests.length + 1), skin: '', slim: false });
                      }), { disabled: guests.length >= 7 }),
                  ),
                  guests.length === 0
                    ? h('p', { className: 'mcd-helper' }, translate(t, 'noGuests'))
                    : guests.map((guest, index) =>
                        h(
                          'div',
                          { className: 'mcd-listitem', key: guest.id || 'guest-' + index, style: { flexDirection: 'column', alignItems: 'stretch' } },
                          h(
                            'div',
                            { className: 'mcd-field-row', style: { alignItems: 'center' } },
                            h('span', { className: 'mcd-avatar' }, String(index + 1)),
                            textField(translate(t, 'userName'), guest.name || translate(t, 'guest') + ' ' + (index + 1), (value) =>
                              updateDraft((next) => {
                                next.guests[index].name = value;
                              }), {
                              key: 'guest-name-' + index,
                              placeholder: translate(t, 'userNamePlaceholder'),
                            }),
                            h(IconButton, {
                              key: 'remove-guest',
                              icon: 'delete',
                              label: translate(t, 'deleteGuest'),
                              disabled: launch.busy,
                              onClick: () =>
                                updateDraft((next) => {
                                  next.guests.splice(index, 1);
                                }),
                            }),
                          ),
                          selectField(translate(t, 'skins'), guest.skin, skinChoices, (value) =>
                            updateDraft((next) => {
                              next.guests[index].skin = value;
                            }), 'guest-skin-' + index),
                          switchRow(translate(t, 'slim'), guest.slim === true, (checked) =>
                            updateDraft((next) => {
                              next.guests[index].slim = checked;
                            }), 'guest-slim-' + index),
                        ),
                      ),
                ),
                h(
                  'div',
                  { className: 'mcd-field-row', key: 'save-row', style: { justifyContent: 'space-between' } },
                  toneButton(translate(t, 'save'), 'check', () => void saveDraft(), { variant: 'filled' }),
                  h('span', { className: 'mcd-helper' }, launch.savedAt !== undefined ? translate(t, 'saved') : ''),
                ),
              ),
        );
      } else if (expanded && tab === 'logs') {

        const logs = view.logs;
        const launcher = logs.launcher;
        const game = logs.game;
        const launcherLines = Array.isArray(launcher.lines) ? launcher.lines : [];
        const gameLines = Array.isArray(game.lines) ? game.lines : [];
        const next = intOf(launcher.next);
        const showGame = logSource === 'game';
        const launcherError = typeof launcher.error === 'string' && launcher.error !== '';
        const gameError = typeof game.error === 'string' && game.error !== '';
        content = h(
          'div',
          { className: 'mcd-panel', role: 'tabpanel', key: 'panel-logs' },
          h(
            'div',
            { className: 'mcd-row', key: 'toolbar' },
            h(
              'div',
              { className: 'mcd-seg', role: 'group', 'aria-label': translate(t, 'logs') },
              h(IconButton, {
                key: 'launcher',
                icon: 'description',
                label: translate(t, 'logLauncher'),
                pressed: !showGame,
                onClick: () => setLogSource('launcher'),
              }),
              h(IconButton, {
                key: 'game',
                icon: 'gamepad',
                label: translate(t, 'logGame'),
                pressed: showGame,
                onClick: () => setLogSource('game'),
              }),
            ),
            showGame ? machineSelector('logs') : null,
            showGame
              ? h(IconButton, {
                  key: 'refresh',
                  icon: 'refresh',
                  label: translate(t, 'refresh'),
                  busy: logBusy,
                  disabled: logBusy,
                  onClick: () => void loadLogs('game', 'initial'),
                })
              : h(IconButton, {
                  key: 'newer',
                  icon: 'newer',
                  label: translate(t, 'loadNewer'),
                  busy: logBusy,
                  disabled: logBusy || !launcher.loaded,
                  onClick: () => void loadLogs('launcher', 'newer'),
                }),
            showGame
              ? h(IconButton, {
                  key: 'errors',
                  icon: 'filter',
                  label: translate(t, 'onlyErrors'),
                  pressed: game.errorsOnly === true,
                  disabled: logBusy,
                  onClick: () => {
                    const errorsOnly = !(game.errorsOnly === true);
                    commit(sessionId, (current) => ({ ...current, logs: { ...current.logs, game: { ...current.logs.game, errorsOnly } } }));
                    void loadLogs('game', 'initial');
                  },
                })
              : null,
            logBusy ? h('span', { key: 'busy', className: 'mcd-meta' }, translate(t, 'busy')) : null,
            (showGame ? gameLines.length : launcherLines.length) > 0
              ? h('span', { key: 'count', className: 'mcd-meta' }, translate(t, 'logCount', { count: showGame ? gameLines.length : launcherLines.length }))
              : null,
            !showGame && next !== undefined ? h('span', { key: 'next', className: 'mcd-meta' }, translate(t, 'nextCursor', { cursor: next })) : null,
          ),
          showGame
            ? gameError
              ? h('p', { className: 'mcd-error', key: 'game-error', role: 'alert' }, game.error)
              : gameLines.length === 0
                ? h('p', { className: 'mcd-empty', key: 'game-empty' }, translate(t, game.loaded ? 'gameLogsEmpty' : 'busy'))
                : h(LogLines, { key: 'game-lines', lines: gameLines, highlightErrors: true, label: translate(t, 'logGame') })
            : launcherError
              ? h('p', { className: 'mcd-error', key: 'launcher-error', role: 'alert' }, launcher.error)
              : launcherLines.length === 0
                ? h('p', { className: 'mcd-empty', key: 'empty' }, translate(t, launcher.loaded ? 'logsEmpty' : 'busy'))
                : h(LogLines, { key: 'lines', lines: launcherLines, highlightErrors: false, label: translate(t, 'logLauncher') }),
        );
      } else if (expanded && tab === 'exec') {
        const exec = view.exec;
        content = h(
          'div',
          { className: 'mcd-panel', role: 'tabpanel', key: 'panel-exec' },
          h('textarea', {
            key: 'code',
            className: 'mcd-code',
            rows: 5,
            value: exec.code,
            spellCheck: false,
            placeholder: translate(t, 'execPlaceholder'),
            'aria-label': translate(t, 'exec'),
            onChange: (event) => {
              const value = event.target.value;
              commit(sessionId, (current) => ({ ...current, exec: { ...current.exec, code: value } }));
            },
            onKeyDown: (event) => {
              if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
                event.preventDefault();
                void runCode();
              }
            },
          }),
          h(
            'div',
            { className: 'mcd-row' },
            machineSelector('exec'),
            h('span', { className: 'mcd-meta' }, translate(t, 'side')),
            h(
              'div',
              { className: 'mcd-seg', role: 'group', 'aria-label': translate(t, 'side') },
              ['client', 'server'].map((side) =>
                h(IconButton, {
                  key: side,
                  icon: side,
                  label: translate(t, side),
                  pressed: exec.side === side,
                  onClick: () => commit(sessionId, (current) => ({ ...current, exec: { ...current.exec, side } })),
                }),
              ),
            ),
            h(IconButton, {
              key: 'run',
              icon: 'play',
              label: translate(t, 'run'),
              variant: 'filled',
              busy: execBusy,
              disabled: execBusy || typeof exec.code !== 'string' || exec.code.trim() === '',
              onClick: () => void runCode(),
            }),
            h('span', { key: 'hint', className: 'mcd-meta' }, translate(t, 'execHint')),
          ),
          exec.error !== undefined && exec.error !== '' ? h('p', { className: 'mcd-error', key: 'exec-error', role: 'alert' }, exec.error) : null,
          exec.ran
            ? h(
                'div',
                { className: 'mcd-doc', key: 'result' },
                h(
                  'div',
                  { className: 'mcd-row' },
                  h('span', { className: 'mcd-meta' }, translate(t, 'execResult')),
                  h(IconButton, { key: 'copy', icon: 'copy', label: translate(t, 'copy'), onClick: () => copyValue(exec.text) }),
                ),
                h('pre', { className: 'mcd-pre', tabIndex: 0, 'aria-label': translate(t, 'execResult') }, exec.text),
                Array.isArray(exec.gameLines) && exec.gameLines.length > 0
                  ? h(
                      'div',
                      { className: 'mcd-doc', key: 'game-logs' },
                      h('div', { className: 'mcd-row' }, h('span', { className: 'mcd-meta' }, translate(t, 'gameLogs'))),
                      h(LogLines, { lines: exec.gameLines, highlightErrors: true, label: translate(t, 'gameLogs') }),
                    )
                  : null,
              )
            : null,
        );
      } else if (expanded && tab === 'docs') {
        const docs = view.docs;
        content = h(
          'div',
          { className: 'mcd-panel', role: 'tabpanel', key: 'panel-docs' },
          h(
            'div',
            { className: 'mcd-search-bar', key: 'search-row' },
            h(Icon, { name: 'search', key: 'leading' }),
            h('input', {
              key: 'query',
              type: 'search',
              className: 'mcd-search-input',
              value: docs.query,
              placeholder: translate(t, 'docsPlaceholder'),
              'aria-label': translate(t, 'docs'),
              onChange: (event) => {
                const value = event.target.value;
                commit(sessionId, (current) => ({ ...current, docs: { ...current.docs, query: value } }));
              },
              onKeyDown: (event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  void searchDocs();
                }
              },
            }),
            h(IconButton, {
              key: 'search',
              icon: 'search',
              label: translate(t, 'search'),
              busy: docsBusy,
              disabled: docsBusy || docs.query.trim() === '',
              onClick: () => void searchDocs(),
            }),
          ),
          docs.error !== undefined && docs.error !== '' ? h('p', { className: 'mcd-error', key: 'docs-error', role: 'alert' }, docs.error) : null,
          Array.isArray(docs.hits) && docs.hits.length > 0
            ? h(
                'ul',
                { className: 'mcd-hits', key: 'hits' },
                docs.hits.map((hit, index) =>
                  h(
                    'li',
                    { key: typeof hit.path === 'string' ? hit.path : 'hit-' + index },
                    h(
                      'button',
                      {
                        type: 'button',
                        className: 'mcd-hit',
                        'data-on': docs.path === hit.path ? 'true' : 'false',
                        title: typeof hit.snippet === 'string' ? hit.snippet : hit.path,
                        onClick: () => void readDoc(hit.path, 0),
                      },
                      h('span', { className: 'mcd-hit-title' }, typeof hit.title === 'string' && hit.title !== '' ? hit.title : hit.path),
                      h('span', { className: 'mcd-hit-path' }, hit.path),
                      typeof hit.snippet === 'string' && hit.snippet !== '' ? h('span', { className: 'mcd-hit-snippet' }, hit.snippet) : null,
                    ),
                  ),
                ),
              )
            : docs.searched
              ? h('p', { className: 'mcd-empty', key: 'no-docs' }, translate(t, 'noDocs'))
              : null,
          typeof docs.path === 'string' && docs.path !== ''
            ? h(
                'div',
                { className: 'mcd-doc', key: 'doc' },
                h(
                  'div',
                  { className: 'mcd-row' },
                  h('span', { className: 'mcd-doc-path', title: docs.path }, typeof docs.title === 'string' && docs.title !== '' ? docs.title + ' · ' + docs.path : docs.path),
                  h('span', { className: 'mcd-meta' }, translate(t, 'docChars', { shown: typeof docs.text === 'string' ? docs.text.length : 0, total: typeof docs.total === 'number' && docs.total > 0 ? docs.total : typeof docs.text === 'string' ? docs.text.length : 0 })),
                  h(IconButton, { key: 'copy', icon: 'copy', label: translate(t, 'copy'), onClick: () => copyValue(docs.text) }),
                  docs.more
                    ? h(IconButton, {
                        key: 'more',
                        icon: 'newer',
                        label: translate(t, 'docLoadMore'),
                        busy: readBusy,
                        disabled: readBusy,
                        onClick: () => void readDoc(docs.path, typeof docs.text === 'string' ? docs.text.length : 0),
                      })
                    : null,
                ),
                h('pre', { className: 'mcd-pre', tabIndex: 0, 'aria-label': docs.path }, typeof docs.text === 'string' && docs.text !== '' ? docs.text : translate(t, 'logsEmpty')),
                docs.more ? h('p', { className: 'mcd-hint' }, translate(t, 'docTruncated')) : null,
              )
            : null,
        );
      }
      if (mode === 'icon') {
        return h(
          'div',
          {
            className: 'mcd-root',
            ref: rootRef,
            key: 'mcd-window',
            style: {
              left: panelRect.x + 'px',
              top: panelRect.y + 'px',
              width: FAB_SIZE + 'px',
              height: FAB_SIZE + 'px',
            },
            tabIndex: 0,
            role: 'button',
            'data-mode': 'icon',
            'data-dragging': dragging ? 'true' : 'false',
            'aria-label': translate(t, 'openPanel') + ' · ' + translate(t, PHASE_KEY[headPhase]),
            title: translate(t, 'openPanel') + (statusTitle !== '' ? '\n' + statusTitle : ''),
            onPointerDown: beginDrag,
            onPointerMove: moveDrag,
            onPointerUp: endDrag,
            onPointerCancel: endDrag,
            onClick: onFabClick,
            onKeyDown: onFabKeyDown,
          },
          h('style', { key: 'mcd-css' }, PANEL_CSS),
          h('span', { className: 'mcd-fab', key: 'fab', 'aria-hidden': 'true' }, h(Icon, { name: 'minecraft' })),
          h('span', { className: 'mcd-fab-badge', key: 'badge', 'data-phase': headPhase, 'aria-hidden': 'true' }),
        );
      }

      if (compact) {
        return h(
          'div',
          {
            className: 'mcd-root',
            ref: rootRef,
            key: 'mcd-window',
            style: {
              left: panelRect.x + 'px',
              top: panelRect.y + 'px',
              width: COMPACT_WIDTH + 'px',
              height: 'auto',
            },
            tabIndex: 0,
            'data-mode': 'compact',
            'data-dragging': dragging ? 'true' : 'false',
            'aria-label': translate(t, 'title'),
            onKeyDown: (event) => {
              if (event.key === 'Escape') {
                event.preventDefault();
                enterIcon();
              }
            },
          },
          h('style', { key: 'mcd-css' }, PANEL_CSS),
          h(
            'div',
            { className: 'mcd-compact', key: 'compact' },
            h(
              'div',
              {
                className: 'mcd-head',
                key: 'head',
                onPointerDown: beginDrag,
                onPointerMove: moveDrag,
                onPointerUp: endDrag,
                onPointerCancel: endDrag,
              },
              logoButton('logo'),
              h(
                'div',
                { className: 'mcd-head-text', key: 'text' },
                h('span', { className: 'mcd-title' }, translate(t, 'title')),
                h(
                  'span',
                  { className: 'mcd-subtitle', title: statusTitle },
                  h('span', { className: 'mcd-status-dot', 'data-phase': headPhase }),
                  translate(t, PHASE_KEY[headPhase]),
                ),
              ),
              h(
                'div',
                { key: 'expand', style: { marginLeft: 'auto', display: 'flex', alignItems: 'center' } },
                h(IconButton, { icon: 'openFull', label: translate(t, 'expand'), onClick: expandPanel }),
              ),
            ),
            h('div', { className: 'mcd-actions-row', key: 'actions' }, primaryActions),
          ),
        );
      }

      const tooltipLayer = tooltip === undefined
        ? null
        : h(
            'div',
            {
              className: 'mcd-tooltip',
              key: 'tooltip',
              role: 'tooltip',
              style: {
                left: tooltip.x + 'px',
                top: tooltip.y + 'px',
                transform: tooltip.above ? 'translate(-50%,-100%)' : 'translate(-50%,0)',
              },
            },
            tooltip.text,
          );

      /** M3 ripple: pointer-down sets the origin, CSS runs the expanding state layer. */
      const onRipplePointerDown = (event) => {
        hideTooltip();
        const point = event.target;
        if (point === null || point === undefined || typeof point.closest !== 'function') return;
        const target = point.closest('.mcd-btn,.mcd-icon-btn,.mcd-chip,.mcd-tab,.mcd-menu-item,.mcd-add-preset,.mcd-logo-btn');
        if (target === null || target.disabled === true) return;
        const rect = target.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) return;
        target.style.setProperty('--mcd-ripple-x', (((event.clientX - rect.left) / rect.width) * 100).toFixed(2) + '%');
        target.style.setProperty('--mcd-ripple-y', (((event.clientY - rect.top) / rect.height) * 100).toFixed(2) + '%');
        target.setAttribute('data-ripple-run', 'false');
        void target.offsetWidth; // restart the animation for repeated presses
        target.setAttribute('data-ripple-run', 'true');
        window.clearTimeout(rippleTimer.current);
        rippleTimer.current = window.setTimeout(() => {
          if (target.isConnected) target.setAttribute('data-ripple-run', 'false');
        }, 520);
      };

      /** M3 plain tooltip for icon buttons; replaces the native `title` bubble. */
      const hideTooltip = () => {
        window.clearTimeout(tooltipTimer.current);
        setTooltip(undefined);
      };
      const onShowTooltip = (event) => {
        const point = event.target;
        if (point === null || point === undefined || typeof point.closest !== 'function') return;
        const target = point.closest('[data-tip]');
        if (target === null || target.disabled === true) return;
        const root = rootRef.current;
        if (root === null) return;
        window.clearTimeout(tooltipTimer.current);
        tooltipTimer.current = window.setTimeout(() => {
          if (!target.isConnected) return;
          const text = target.getAttribute('data-tip');
          if (text === null || text === '') return;
          const rootRect = root.getBoundingClientRect();
          const rect = target.getBoundingClientRect();
          const half = 120;
          const above = rect.top - rootRect.top > 44;
          setTooltip({
            text,
            x: Math.max(8, Math.min(rootRect.width - 8, rect.left - rootRect.left + rect.width / 2)),
            y: above ? rect.top - rootRect.top - 6 : rect.bottom - rootRect.top + 6,
            above,
            maxWidth: half,
          });
        }, 550);
      };
      const onHideTooltip = (event) => {
        const point = event.target;
        if (point === null || point === undefined || typeof point.closest !== 'function') return;
        const target = point.closest('[data-tip]');
        if (target === null) return;
        const related = event.relatedTarget;
        if (related !== null && related !== undefined && typeof target.contains === 'function' && target.contains(related)) return;
        hideTooltip();
      };

      const selectLayer = selectMenu === undefined
        ? null
        : h(
            'div',
            { className: 'mcd-select-layer', key: 'select-layer' },
            h('div', {
              className: 'mcd-select-backdrop',
              key: 'select-backdrop',
              onPointerDown: closeSelect,
            }),
            h(
              'div',
              {
                className: 'mcd-menu',
                key: 'select-menu',
                ref: menuRef,
                role: 'listbox',
                'aria-label': selectMenu.label,
                'data-above': selectMenu.above ? 'true' : 'false',
                tabIndex: -1,
                style: selectMenu.above
                  ? { left: selectMenu.left + 'px', width: selectMenu.width + 'px', bottom: selectMenu.bottom + 'px', maxHeight: selectMenu.maxHeight + 'px' }
                  : { left: selectMenu.left + 'px', width: selectMenu.width + 'px', top: selectMenu.top + 'px', maxHeight: selectMenu.maxHeight + 'px' },
                onKeyDown: (event) => {
                  if (event.key === 'Escape') {
                    event.preventDefault();
                    event.stopPropagation();
                    closeSelect();
                  }
                },
              },
              selectMenu.choices.map((choice) =>
                h(
                  'button',
                  {
                    key: choice.value,
                    type: 'button',
                    role: 'option',
                    'aria-selected': choice.value === selectMenu.value ? 'true' : 'false',
                    className: 'mcd-menu-item',
                    'data-selected': choice.value === selectMenu.value ? 'true' : 'false',
                    title: choice.label,
                    onClick: () => {
                      const apply = selectMenu.onChange;
                      closeSelect();
                      apply(choice.value);
                    },
                  },
                  h('span', { className: 'mcd-menu-check', key: 'check' }, choice.value === selectMenu.value ? h(Icon, { name: 'check' }) : null),
                  h('span', { className: 'mcd-menu-label', key: 'label' }, choice.label),
                ),
              ),
            ),
          );

      return h(
        'div',
        {
          className: 'mcd-root',
          ref: rootRef,
          key: 'mcd-window',
          style: {
            left: panelRect.x + 'px',
            top: panelRect.y + 'px',
            width: panelRect.width + 'px',
            height: panelRect.height + 'px',
          },
          tabIndex: -1,
          'data-mode': 'full',
          'data-dragging': dragging ? 'true' : 'false',
          'data-resizing': resizing ? 'true' : 'false',
          'aria-label': translate(t, 'title'),
          onPointerDownCapture: onRipplePointerDown,
          onPointerOver: onShowTooltip,
          onPointerOut: onHideTooltip,
          onFocusIn: onShowTooltip,
          onFocusOut: onHideTooltip,
          onKeyDown: (event) => {
            if (event.key === 'Escape') {
              event.preventDefault();
              collapsePanel();
            }
          },
        },
        h('style', { key: 'mcd-css' }, PANEL_CSS),
        h(
          'div',
          { className: 'mcd-sheet', key: 'sheet' },
          dragHandle,
          header,
          h(
            'div',
            { className: 'mcd-body', key: 'body' },
            h('div', { className: 'mcd-actions-row', key: 'actions' }, fullActions),
            bridgeReady ? null : h('p', { className: 'mcd-hint', key: 'bridge' }, translate(t, 'remoteUnavailable')),
            progress,
            notReadyHint,
            statusError,
            failureLine,
            errorLine,
            noteLine,
            settingsBar,
            tabBar,
            content,
          ),
          h('div', {
            key: 'resize',
            className: 'mcd-resize',
            role: 'separator',
            tabIndex: 0,
            'aria-label': translate(t, 'resizePanel'),
            title: translate(t, 'resizePanel'),
            onPointerDown: beginResize,
            onPointerMove: moveResize,
            onPointerUp: endResize,
            onPointerCancel: endResize,
            onKeyDown: onResizeKeyDown,
          }),
          selectLayer,
          tooltipLayer,
        ),
      );
    }

    /**
     * The root `useSessions` selector hook is the documented way to learn which Session the
     * main view retains: `shell.overlay` entries receive no `sessionId` prop. This wrapper
     * always calls the hook unconditionally and hands the resolved id to the panel.
     */
    function McDevOverlayWithSessions(props) {
      const sessionId = props.useSessions(selectMainSession);
      return h(McDevBoundary, null, h(McDevPanel, { ...props, sessionId }));
    }

    /** Composition without the sessions hook: no Session can be resolved, so nothing renders. */
    function McDevOverlayNoSessions(props) {
      return h(McDevBoundary, null, h(McDevPanel, { ...props, sessionId: undefined }));
    }

    return {
      // Remote namespaces are injected property paths: declare `remote.commands` before
      // reading it. The locale service owns the panel dictionaries; `uiWorkspace`
      // supplies the native directory picker used by the settings page.
      inject: ['locale', 'remote', 'remote.commands', 'slots', 'uiWorkspace'],
      apply(ctx) {
        try {
          for (const node of globalThis.document.querySelectorAll('div')) {
            if (node.textContent === 'MCDEV-LOADED') node.remove();
          }
        } catch (error) {
          // one-off cleanup of an earlier debug marker
        }
        ctx.effect(
          () => {
            try {
              return ctx.locale.register(NS, { en, zh });
            } catch (error) {
              // A duplicate namespace must not break the panel; t() then falls back to keys.
              return undefined;
            }
          },
          'dsh-mcdev: panel locale',
        );
        const t = ctx.locale.bind(NS);
        BOOT_SEQ += 1;
        const bootKey = BOOT_SEQ;
        const pickDirectory = () => {
          try {
            const workspace = ctx.uiWorkspace;
            if (workspace !== undefined && workspace !== null && typeof workspace.pickDirectory === 'function') {
              return workspace.pickDirectory();
            }
          } catch (error) {
            // the picker service is optional; the panel shows a note when missing
          }
          return Promise.resolve(null);
        };
        ctx.effect(
          () =>
            ctx.slots.inject(SLOT, () =>
              ctx.slots.register(
                { name: SLOT, id: ENTRY_ID, order: ENTRY_ORDER, locale: NS },
                (props) =>
                  typeof props.useSessions === 'function'
                    ? h(McDevOverlayWithSessions, { ...props, remote: ctx.remote, t, bootKey, pickDirectory })
                    : h(McDevOverlayNoSessions, { ...props, remote: ctx.remote, t, bootKey, pickDirectory }),
              ),
            ),
          'dsh-mcdev: floating console',
        );
      },
    };
  },
});
