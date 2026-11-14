window.__ModuleLoader__.load({
  id: '@local/dsh-checkpoint',
  factory(require) {
    const React = require('react');
    const h = React.createElement;

    /** Per-session setup wizard: a compact dock panel above the composer. */
    const NS = 'checkpointSetup';
    const STORAGE_PREFIX = 'dsh.checkpoint.setup.';

    /**
     * Panel styles: the same hand-written Material 3 language as the direction card
     * (baseline palette, 12dp radius, M3 type scale), scoped to this component.
     */
    const WIZARD_CSS = `
/* Strict Material 3 session-setup panel.
   Colour roles are the M3 baseline palette with a body[data-ds-dark-theme] dark scheme;
   spacing is the 4dp grid and type the M3 scale. */
.cps-root{--m3-primary:#6750a4;--m3-on-primary:#ffffff;--m3-primary-container:#eaddff;--m3-on-primary-container:#21005d;--m3-secondary-container:#e8def8;--m3-on-secondary-container:#1d192b;--m3-surface:#f7f2fa;--m3-surface-variant:#e7e0ec;--m3-surface-container-high:#ece6f0;--m3-on-surface:#1d1b20;--m3-on-surface-variant:#49454f;--m3-outline:#79747e;--m3-outline-variant:#cac4d0;--m3-error:#b3261e;--m3-success:#386a20;--m3-warn:#7d5260;--m3-state-hover:rgba(29,27,32,.08);--m3-state-press:rgba(29,27,32,.12);--m3-primary-state:rgba(103,80,164,.08);--m3-primary-state-press:rgba(103,80,164,.12);--m3-disabled-bg:rgba(29,27,32,.12);--m3-disabled-fg:rgba(29,27,32,.38);--m3-font:"Roboto","Segoe UI",system-ui,-apple-system,"PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif;display:flex;flex-direction:column;gap:16px;box-sizing:border-box;padding:16px;border-radius:12px;border:1px solid var(--m3-outline-variant);background:var(--m3-surface);color:var(--m3-on-surface);font-family:var(--m3-font);font-size:14px;font-weight:400;line-height:1.43;letter-spacing:.25px;text-align:start}
body[data-ds-dark-theme] .cps-root{--m3-primary:#d0bcff;--m3-on-primary:#381e72;--m3-primary-container:#4f378b;--m3-on-primary-container:#eaddff;--m3-secondary-container:#4a4458;--m3-on-secondary-container:#e8def8;--m3-surface:#1d1b20;--m3-surface-variant:#49454f;--m3-surface-container-high:#2b2930;--m3-on-surface:#e6e0e9;--m3-on-surface-variant:#cac4d0;--m3-outline:#938f99;--m3-outline-variant:#49454f;--m3-error:#f2b8b5;--m3-success:#b7f397;--m3-warn:#efb8c8;--m3-state-hover:rgba(230,224,233,.08);--m3-state-press:rgba(230,224,233,.12);--m3-primary-state:rgba(208,188,255,.08);--m3-primary-state-press:rgba(208,188,255,.12);--m3-disabled-bg:rgba(230,224,233,.12);--m3-disabled-fg:rgba(230,224,233,.38)}
.cps-root *{box-sizing:border-box}
.cps-head{display:flex;flex-direction:column;gap:4px}
.cps-title{margin:0;font-size:16px;font-weight:500;line-height:1.5;letter-spacing:.15px}
.cps-intro{margin:0;font-size:14px;line-height:1.43;letter-spacing:.25px;color:var(--m3-on-surface-variant)}
.cps-rows{display:flex;flex-direction:column;gap:16px}
.cps-row{display:flex;align-items:center;justify-content:space-between;gap:16px;min-width:0}
.cps-label{font-size:14px;font-weight:400;line-height:1.43;letter-spacing:.25px;min-width:0}
.cps-hint{font-size:12px;line-height:1.33;letter-spacing:.4px;color:var(--m3-on-surface-variant)}
.cps-seg{display:inline-flex;flex:none;padding:2px;border-radius:16px;background:var(--m3-surface-variant);gap:2px}
.cps-seg-btn{height:28px;padding:0 12px;border:0;border-radius:14px;background:transparent;color:var(--m3-on-surface-variant);font-family:var(--m3-font);font-size:12px;font-weight:500;line-height:1.33;letter-spacing:.5px;cursor:pointer;transition:background .18s cubic-bezier(.2,0,0,1),color .18s cubic-bezier(.2,0,0,1)}
.cps-seg-btn[data-on=true]{background:var(--m3-primary);color:var(--m3-on-primary)}
.cps-seg-btn:focus-visible{outline:2px solid var(--m3-primary);outline-offset:2px}
.cps-check{display:inline-flex;align-items:center;gap:8px;font-size:14px;line-height:1.43;letter-spacing:.25px;cursor:pointer;color:var(--m3-on-surface-variant)}
.cps-check input{width:18px;height:18px;margin:0;accent-color:var(--m3-primary);cursor:pointer}
.cps-note{margin:0;font-size:12px;line-height:1.33;letter-spacing:.4px;color:var(--m3-on-surface-variant)}
.cps-error{margin:0;font-size:12px;line-height:1.33;letter-spacing:.4px;color:var(--m3-error)}
.cps-footer{display:flex;justify-content:flex-end;align-items:center;gap:8px}
.cps-btn{height:40px;min-width:64px;padding:0 24px;border:0;border-radius:20px;font-family:var(--m3-font);font-size:14px;font-weight:500;line-height:1.43;letter-spacing:.1px;cursor:pointer;background:transparent;color:var(--m3-primary);transition:background .2s cubic-bezier(.2,0,0,1),color .2s cubic-bezier(.2,0,0,1)}
.cps-btn:focus-visible{outline:2px solid var(--m3-primary);outline-offset:2px}
.cps-btn:disabled{cursor:not-allowed;opacity:.38}
.cps-btn-primary{background:var(--m3-primary);color:var(--m3-on-primary)}
@media(hover:hover){.cps-btn:not(:disabled):hover{background:var(--m3-state-hover)}.cps-btn-primary:not(:disabled):hover{background:var(--m3-primary)}}
`;


    /** Compact dock strip: newest checkpoint, an expandable list, and create/compress actions. */
    const CHECKPOINT_CSS = `
.cpx-root{--m3-primary:#6750a4;--m3-on-primary:#ffffff;--m3-primary-container:#eaddff;--m3-on-primary-container:#21005d;--m3-secondary-container:#e8def8;--m3-on-secondary-container:#1d192b;--m3-surface:#f7f2fa;--m3-surface-variant:#e7e0ec;--m3-surface-container-high:#ece6f0;--m3-on-surface:#1d1b20;--m3-on-surface-variant:#49454f;--m3-outline:#79747e;--m3-outline-variant:#cac4d0;--m3-error:#b3261e;--m3-elevation-1:0 1px 2px rgba(0,0,0,.3),0 1px 3px 1px rgba(0,0,0,.15);--m3-state-hover:rgba(29,27,32,.08);--m3-state-press:rgba(29,27,32,.12);--m3-primary-state:rgba(103,80,164,.08);--m3-font:"Roboto","Segoe UI",system-ui,-apple-system,"PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif;display:flex;flex-direction:column;gap:4px;box-sizing:border-box;padding:8px 8px 8px 16px;border:0;border-radius:12px;background:var(--m3-surface-container-high);color:var(--m3-on-surface);box-shadow:var(--m3-elevation-1);font-family:var(--m3-font);font-size:12px;line-height:1.33;letter-spacing:.4px}
body[data-ds-dark-theme] .cpx-root{--m3-primary:#d0bcff;--m3-on-primary:#381e72;--m3-primary-container:#4f378b;--m3-on-primary-container:#eaddff;--m3-secondary-container:#4a4458;--m3-on-secondary-container:#e8def8;--m3-surface:#1d1b20;--m3-surface-variant:#49454f;--m3-surface-container-high:#2b2930;--m3-on-surface:#e6e0e9;--m3-on-surface-variant:#cac4d0;--m3-outline:#938f99;--m3-outline-variant:#49454f;--m3-error:#f2b8b5;--m3-elevation-1:0 1px 3px rgba(0,0,0,.5),0 2px 6px 2px rgba(0,0,0,.35);--m3-state-hover:rgba(230,224,233,.08);--m3-state-press:rgba(230,224,233,.12);--m3-primary-state:rgba(208,188,255,.08);--m3-font:"Roboto","Segoe UI",system-ui,-apple-system,"PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif}
.cpx-root *{box-sizing:border-box}
.cpx-head{display:flex;align-items:center;gap:8px;min-width:0;flex-wrap:nowrap}
.cpx-title{margin:0;font-weight:500;color:var(--m3-on-surface-variant);letter-spacing:.5px;white-space:nowrap}
.cpx-chip{flex:none;display:inline-flex;align-items:center;gap:6px;height:24px;padding:0 8px;border-radius:8px;background:var(--m3-surface-variant);color:var(--m3-on-surface);font-weight:500;letter-spacing:.5px}
.cpx-chip[data-baseline=true]{background:var(--m3-primary-container);color:var(--m3-on-primary-container)}
.cpx-note{margin:0;color:var(--m3-on-surface-variant);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:340px}
.cpx-count{flex:none;color:var(--m3-on-surface-variant);white-space:nowrap}
.cpx-actions{margin-left:auto;display:flex;gap:2px;flex:none;align-items:center}
.cpx-icon{display:inline-flex;align-items:center;justify-content:center;width:32px;height:32px;margin:0;padding:0;border:0;border-radius:16px;background:transparent;color:var(--m3-on-surface-variant);cursor:pointer;transition:background .15s cubic-bezier(.2,0,0,1),color .15s cubic-bezier(.2,0,0,1)}
@media(hover:hover){.cpx-icon:not(:disabled):hover{background:var(--m3-state-hover)}}
.cpx-icon:active:not(:disabled){background:var(--m3-state-press)}
.cpx-icon:focus-visible{outline:2px solid var(--m3-primary);outline-offset:2px}
.cpx-icon:disabled{cursor:not-allowed;opacity:.38}
.cpx-icon svg{width:20px;height:20px;fill:currentColor;pointer-events:none}
.cpx-status{padding:0 8px 2px;max-width:none;white-space:normal}
/* Popover list (rendered in shell.overlay, not inside the dock card). */
.cpl-layer{position:fixed;inset:0;z-index:70}
.cpl-panel{display:flex;flex-direction:column;gap:8px;max-height:45vh;overflow:auto;padding:12px;border-radius:12px;box-shadow:0 8px 24px rgba(0,0,0,.4);animation:cpl-in .16s cubic-bezier(.2,0,0,1) both}
@keyframes cpl-in{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:none}}
.cpl-head{display:flex;align-items:center;gap:8px}
.cpl-title{margin:0;font-size:14px;font-weight:500;line-height:1.43;letter-spacing:.1px;color:var(--m3-on-surface)}
.cpl-count{margin-left:auto;color:var(--m3-on-surface-variant)}
.cpl-hint{margin:0;color:var(--m3-on-surface-variant);font-size:12px;line-height:1.33;letter-spacing:.4px}
.cpx-list{display:flex;flex-direction:column;gap:2px;margin:0;padding:0;list-style:none}
.cpx-row{display:flex;align-items:center;gap:8px;width:100%;min-height:40px;margin:0;padding:8px 12px;border:0;border-radius:8px;background:transparent;color:var(--m3-on-surface);font-family:var(--m3-font);font-size:12px;line-height:1.33;letter-spacing:.4px;text-align:start;cursor:pointer;transition:background .15s cubic-bezier(.2,0,0,1)}
@media(hover:hover){.cpx-row:hover{background:var(--m3-state-hover)}}
.cpx-row:active{background:var(--m3-state-press)}
.cpx-row:focus-visible{outline:2px solid var(--m3-primary);outline-offset:-2px}
.cpx-row-id{flex:none;display:inline-flex;align-items:center;height:24px;padding:0 8px;border-radius:8px;background:var(--m3-surface-variant);color:var(--m3-on-surface);font-weight:500;letter-spacing:.5px}
.cpx-row[data-baseline=true] .cpx-row-id{background:var(--m3-primary-container);color:var(--m3-on-primary-container)}
.cpx-row-note{flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--m3-on-surface-variant)}
.cpx-row-meta{flex:none;color:var(--m3-on-surface-variant);white-space:nowrap}
`;


    /** Material icon path data for the icon-only dock actions. */
    const DOCK_ICONS = {
      list: 'M3 13h2v-2H3v2zm0 4h2v-2H3v2zm0-8h2V7H3v2zm4 4h14v-2H7v2zm0 4h14v-2H7v2zM7 7v2h14V7H7z',
      add: 'M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z',
      tune: 'M3 17v2h6v-2H3zM3 5v2h10V5H3zm10 16v-2h8v-2h-8v-2h-2v6h2zM7 9v2H3v2h4v2h2V9H7zm14 4v-2H11v2h10zm-6-4h2V7h4V5h-4V3h-2v6z',
      compress: 'M7.41 18.59 8.83 20 12 16.83 15.17 20l1.41-1.41L12 14l-4.59 4.59zm9.18-13.18L15.17 4 12 7.17 8.83 4 7.41 5.41 12 10l4.59-4.59z',
      refresh: 'M17.65 6.35A7.958 7.958 0 0 0 12 4c-4.42 0-7.99 3.58-8 8s3.58 8 8 8c3.73 0 6.84-2.55 7.73-6h-2.08A5.99 5.99 0 0 1 12 18c-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z',
    };

    /** One Material icon glyph. */
    function DockIcon(props) {
      return h('svg', { viewBox: '0 0 24 24', 'aria-hidden': 'true', focusable: 'false' }, h('path', { d: DOCK_ICONS[props.name] }));
    }

    /**
     * The checkpoint list opens as a frame-wide popover: the dock card keeps its single-row
     * height, and shell.overlay is the portal-safe seat for fixed layers. The strip publishes
     * its data here and the overlay component subscribes to the tiny store below.
     */
    const listOverlay = {
      open: false,
      anchor: null,
      checkpoints: [],
      baseline: null,
      inputActions: undefined,
      insert: undefined,
      translate: (key) => key,
    };
    const listOverlayListeners = new Set();

    /** Publish one overlay state change and wake the overlay component. */
    function publishListOverlay(patch) {
      Object.assign(listOverlay, patch);
      for (const listener of listOverlayListeners) listener();
    }

    /** M3 popover listing every checkpoint; a row click inserts its #cp reference. */
    function CheckpointListOverlay() {
      const [, bump] = React.useState(0);
      React.useEffect(() => {
        const listener = () => bump((value) => value + 1);
        listOverlayListeners.add(listener);
        return () => {
          listOverlayListeners.delete(listener);
        };
      }, []);
      React.useEffect(() => {
        if (listOverlay.open !== true) return undefined;
        const onKey = (event) => {
          if (event.key === 'Escape') publishListOverlay({ open: false });
        };
        window.addEventListener('keydown', onKey);
        return () => {
          window.removeEventListener('keydown', onKey);
        };
      });
      if (listOverlay.open !== true) return null;
      const t = listOverlay.translate;
      const rows = Array.isArray(listOverlay.checkpoints) ? listOverlay.checkpoints.slice().reverse() : [];
      const anchor = listOverlay.anchor;
      const style = { position: 'fixed', left: '8px', bottom: '96px', width: 'min(420px, calc(100vw - 24px))' };
      if (typeof window !== 'undefined' && anchor !== null && anchor !== undefined) {
        style.left = Math.max(8, Math.min(anchor.left, window.innerWidth - 428)) + 'px';
        style.width = Math.max(280, Math.min(420, anchor.width)) + 'px';
        if (anchor.top > window.innerHeight * 0.55) style.bottom = Math.max(8, window.innerHeight - anchor.top + 8) + 'px';
        else style.top = Math.min(window.innerHeight - 120, anchor.bottom + 8) + 'px';
      }
      const close = () => publishListOverlay({ open: false });
      const choose = (id) => {
        if (typeof listOverlay.insert === 'function') listOverlay.insert(id);
        close();
      };
      return h(
        'div',
        { className: 'cpl-layer', onClick: close },
        h('style', { key: 'cpl-css' }, CHECKPOINT_CSS),
        h(
          'div',
          { key: 'panel', className: 'cpx-root cpl-panel', style, role: 'dialog', 'aria-label': t('cpListTitle'), onClick: (event) => event.stopPropagation() },
          h(
            'div',
            { key: 'head', className: 'cpl-head' },
            h('span', { className: 'cpl-title' }, t('cpListTitle')),
            h('span', { className: 'cpl-count' }, t('cpCount').replace('{count}', String(rows.length))),
          ),
          h(
            'ul',
            { key: 'list', className: 'cpx-list' },
            rows.map((entry) =>
              h(
                'li',
                { key: entry.id },
                h(
                  'button',
                  {
                    type: 'button',
                    className: 'cpx-row',
                    'data-baseline': entry.baseline === true ? 'true' : 'false',
                    title: t('cpReferenceTitle').replace('{id}', entry.id),
                    onClick: () => choose(entry.id),
                  },
                  h('span', { className: 'cpx-row-id' }, entry.id),
                  h('span', { className: 'cpx-row-note' }, entry.note !== undefined && entry.note !== '' ? entry.note : '—'),
                  entry.committed === true ? h('span', { className: 'cpx-row-meta' }, t('cpCommitted')) : null,
                  entry.createdAt !== undefined ? h('span', { className: 'cpx-row-meta' }, formatWhen(entry.createdAt)) : null,
                ),
              ),
            ),
          ),
          h('p', { key: 'hint', className: 'cpl-hint' }, t('cpListHint')),
        ),
      );
    }

    /**
     * Session-scoped slot content remounts whenever the session advances, and every command
     * execution appends trajectory events. Caching the read per session per page load keeps the
     * strip from executing `/checkpoint list --json` again on each remount (an unguarded effect
     * loops forever and floods the conversation).
     */
    const checkpointViews = new Map();
    const checkpointLoads = new Map();
    const checkpointAttempts = new Set();
    const checkpointRetries = new Set();

    /** Manual "open setup" requests: the strip asks, the mounted dock bridge opens the dialog. */
    const setupOpenListeners = new Set();

    /** Ask the dock bridge to show the setup dialog. */
    function requestSetupDialog() {
      for (const listener of setupOpenListeners) listener();
    }

    /** One-line M3 card: newest checkpoint plus icon actions; the list is a frame-wide popover. */
    function CheckpointStrip(props) {
      const sessionId = props.sessionId;
      const remote = props.remote;
      const inputActions = props.inputActions;
      const t = props.t;
      const listButtonRef = React.useRef(null);
      const [view, setView] = React.useState(() =>
        sessionId !== undefined && sessionId !== null && checkpointViews.has(sessionId) ? checkpointViews.get(sessionId) : {},
      );
      const [busy, setBusy] = React.useState();
      const [note, setNote] = React.useState();
      const [failed, setFailed] = React.useState(false);

      // Action feedback is transient: clear it so the card stays text-minimal.
      React.useEffect(() => {
        if (note === undefined) return undefined;
        const timer = setTimeout(() => setNote(undefined), 3000);
        return () => clearTimeout(timer);
      }, [note]);

      /** Insert one `#cp-N` reference into the composer draft, falling back to the clipboard. */
      const insertReference = (id) => {
        const reference = '#' + id + ' ';
        try {
          if (inputActions !== undefined && typeof inputActions.insertText === 'function') {
            const span = typeof inputActions.captureInsertion === 'function' ? inputActions.captureInsertion() : undefined;
            if (inputActions.insertText(reference, span)) {
              setNote(t('cpInserted').replace('{id}', id));
              return;
            }
          }
        } catch (error) {
          // fall through to the clipboard fallback
        }
        try {
          if (globalThis.navigator !== undefined && globalThis.navigator.clipboard !== undefined) {
            void globalThis.navigator.clipboard.writeText('#' + id);
          }
        } catch (error) {
          // clipboard may be unavailable; the note still reports the reference
        }
        setNote(t('cpCopied').replace('{id}', id));
      };

      /**
       * Read the checkpoint index once and cache it per session.
       * `force` is used after a user action so the strip reflects the new store state.
       * @returns {Promise<boolean>} whether a fresh view was stored.
       */
      const load = async (force) => {
        if (sessionId === undefined || sessionId === null) return false;
        if (remote === undefined || remote.commands === undefined) return false;
        if (checkpointLoads.has(sessionId)) await checkpointLoads.get(sessionId);
        if (force !== true && checkpointViews.has(sessionId)) {
          setView(checkpointViews.get(sessionId));
          setFailed(false);
          return true;
        }
        const task = (async () => {
          try {
            const outcome = await remote.commands.execute(sessionId, '/checkpoint list --json', []);
            const result = commandResultOf(outcome);
            const data = parseJsonText(result === undefined ? '' : result.text);
            if (data === undefined) return false;
            checkpointViews.set(sessionId, data);
            setView(data);
            setFailed(false);
            return true;
          } catch (error) {
            // keep the previous view; the strip stays quiet and retries below
            return false;
          } finally {
            checkpointLoads.delete(sessionId);
          }
        })();
        checkpointLoads.set(sessionId, task);
        return task;
      };

      // Bounded background retry: the very first read can hit a session that is still
      // settling. A few retries keep the strip empty no longer than necessary without
      // turning a persistent failure into a remount-driven command loop.
      React.useEffect(() => {
        if (sessionId === undefined || sessionId === null) return;
        // The session-scoped dock remounts while a command is in flight: pull the latest
        // cached view instead of keeping the snapshot this instance rendered with.
        if (checkpointViews.has(sessionId)) {
          setView(checkpointViews.get(sessionId));
          setFailed(false);
          return;
        }
        if (checkpointAttempts.has(sessionId)) return;
        checkpointAttempts.add(sessionId);
        checkpointRetries.add(sessionId);
        const attempt = async (left) => {
          const ok = await load(false);
          if (ok) {
            setFailed(false);
            checkpointRetries.delete(sessionId);
            return;
          }
          if (left > 1) setTimeout(() => void attempt(left - 1), 1500);
          else {
            setFailed(true);
            checkpointRetries.delete(sessionId);
          }
        };
        void attempt(3);
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, [sessionId]);

      if (sessionId === undefined || sessionId === null) return null;

      const run = async (command) => {
        if (busy !== undefined) return;
        setBusy(command);
        setNote(undefined);
        try {
          const outcome = await remote.commands.execute(sessionId, command, []);
          const result = commandResultOf(outcome);
          const text = result === undefined ? '' : result.text;
          const data = parseJsonText(text);
          if (data !== undefined && Array.isArray(data.checkpoints)) {
            // `--json` returns the fresh index with the command result, so the strip
            // updates without a second `/checkpoint list` command in the conversation.
            checkpointViews.set(sessionId, data);
            setView(data);
            setFailed(false);
            if (listOverlay.open === true) publishListOverlay({ checkpoints: data.checkpoints });
            const report = Array.isArray(data.report) ? data.report : [];
            const compactionLine = report.find((line) => /上下文压缩|compaction/i.test(String(line)));
            if (compactionLine !== undefined) setNote(String(compactionLine));
            else if (typeof data.id === 'string') setNote(t('cpCreated').replace('{id}', data.id));
            else setNote(firstLine(text));
          } else if (result !== undefined && result.kind === 'error') {
            setNote(firstLine(text));
          } else {
            setNote(firstLine(text));
            await load(true);
          }
        } catch (error) {
          setNote(String((error && error.message) || error));
        } finally {
          setBusy(undefined);
        }
      };

      // The store is workspace-wide (a git commit is shared), but this dock belongs to one
      // conversation: rank only this session's checkpoints so conversations never mix.
      const rows = (Array.isArray(view.checkpoints) ? view.checkpoints : []).filter((entry) => entry.sessionId === sessionId);
      const latest = rows.length > 0 ? rows[rows.length - 1] : null;
      const baseline = typeof view.baseline === 'string' ? view.baseline : null;

      const openList = () => {
        if (listOverlay.open === true) {
          publishListOverlay({ open: false });
          return;
        }
        const node = listButtonRef.current;
        const rect = node !== null && node !== undefined && typeof node.getBoundingClientRect === 'function' ? node.getBoundingClientRect() : null;
        publishListOverlay({
          open: true,
          anchor: rect === null ? null : { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, width: rect.width },
          checkpoints: rows,
          baseline,
          inputActions,
          insert: insertReference,
          translate: t,
        });
      };
      const iconButton = (key, name, label, onClick, disabled) =>
        h(
          'button',
          { key, type: 'button', className: 'cpx-icon', title: label, 'aria-label': label, disabled, onClick },
          h(DockIcon, { name }),
        );
      return h(
        'div',
        { className: 'cpx-root' },
        h('style', { key: 'cpx-css' }, CHECKPOINT_CSS),
        h(
          'div',
          { className: 'cpx-head' },
          h('span', { className: 'cpx-title' }, t('cpTitle')),
          latest === null
            ? h('span', { className: 'cpx-note' }, failed ? t('cpLoadFailed') : t('cpEmpty'))
            : h('span', { className: 'cpx-chip', 'data-baseline': baseline === latest.id ? 'true' : 'false' }, latest.id + (latest.committed === true ? ' · ' + t('cpCommitted') : '')),
          h(
            'div',
            { className: 'cpx-actions' },
            h(
              'button',
              {
                key: 'list',
                ref: listButtonRef,
                type: 'button',
                className: 'cpx-icon',
                title: t('cpList'),
                'aria-label': t('cpList'),
                'aria-haspopup': 'dialog',
                disabled: busy !== undefined || rows.length === 0,
                onClick: openList,
              },
              h(DockIcon, { name: 'list' }),
            ),
            iconButton('create', 'add', t('cpCreate'), () => run('/checkpoint create --json --note="' + t('cpManualNote') + '"'), busy !== undefined),
            iconButton('compress', 'compress', t('cpCompress'), () => run('/checkpoint compress --json'), busy !== undefined),
            iconButton('refresh', 'refresh', t('cpRefresh'), () => void load(true), busy !== undefined),
            iconButton('settings', 'tune', t('cpSettings'), () => requestSetupDialog(), false),
          ),
        ),
        note !== undefined ? h('p', { key: 'note', className: 'cpx-note cpx-status' }, note) : null,
      );
    }

    const en = {
      title: 'Set up this session',
      intro: 'Choose how smart directions and checkpoints behave in this session.',
      smartDirection: 'Smart directions',
      autoContinue: 'Auto-continue after a direction card',
      checkpointAutoCommit: 'Auto-commit git changes on /checkpoint',
      startupCheckpoint: 'Create a checkpoint when a session starts',
      modeAuto: 'Global',
      modeOn: 'On',
      modeOff: 'Off',
      makeGlobal: 'Also save as the global default',
      save: 'Save',
      skip: 'Do not ask again',
      cpTitle: 'Checkpoints',
      cpEmpty: 'No checkpoint yet',
      cpCount: '{count} total',
      cpCreate: 'Create',
      cpCompress: 'Compress',
      cpRefresh: 'Refresh',
      cpWorking: 'Working…',
      cpCreated: 'Created {id}',
      cpLoadFailed: 'Could not read checkpoints — press Refresh',
      cpList: 'List',
      cpHideList: 'Hide',
      cpListTitle: 'Checkpoints',
      cpListHint: 'Click a checkpoint to insert its #cp reference into the composer draft.',
      cpInserted: 'Inserted {id}',
      cpCopied: 'Copied {id} to the clipboard',
      cpCommitted: 'committed',
      cpReferenceTitle: 'Insert #{id} into the composer',
      cpSettings: 'Session setup',
      cpManualNote: 'manual',
      checkpointOnCard: 'Checkpoint on every direction form',
      saved: 'Saved for this session',
      unavailable: 'Settings are not available yet; they will sync with the first message.',
    };

    const zh = {
      title: '本会话设置',
      intro: '选择本会话里“智能方向”和“检查点”的行为。',
      smartDirection: '智能方向',
      autoContinue: '方向卡片提交后自动继续',
      checkpointAutoCommit: '执行 /checkpoint 时自动提交 git',
      startupCheckpoint: '新会话开始时自动创建检查点',
      modeAuto: '跟随全局',
      modeOn: '开',
      modeOff: '关',
      makeGlobal: '同时设为全局默认',
      save: '保存',
      skip: '以后不再自动提示',
      cpTitle: '检查点',
      cpEmpty: '还没有检查点',
      cpCount: '共 {count} 个',
      cpCreate: '新建',
      cpCompress: '压缩',
      cpRefresh: '刷新',
      cpWorking: '处理中…',
      cpCreated: '已创建 {id}',
      cpLoadFailed: '读取检查点失败，点“刷新”重试',
      cpList: '列表',
      cpHideList: '收起',
      cpListTitle: '检查点列表',
      cpListHint: '点一条检查点，就把它的 #cp 引用插入输入框。',
      cpInserted: '已插入 {id}',
      cpCopied: '已复制 {id} 到剪贴板',
      cpCommitted: '已提交',
      cpReferenceTitle: '把 #{id} 插入输入框',
      cpSettings: '会话设置',
      cpManualNote: '手动创建',
      checkpointOnCard: '每次方向表单自动建检查点',
      saved: '已保存本会话设置',
      unavailable: '设置暂时不可用；发送第一条消息后会同步。',
    };

    /** Narrow optional browser storage access. */
    function storageGet(key) {
      try {
        return globalThis.localStorage ? globalThis.localStorage.getItem(key) : null;
      } catch (error) {
        return null;
      }
    }

    /** Store one browser-local marker (best effort). */
    function storageSet(key, value) {
      try {
        if (globalThis.localStorage) globalThis.localStorage.setItem(key, value);
      } catch (error) {
        // local storage may be unavailable; the hint simply shows again
      }
    }

    /** Parse the JSON text of a command result. */
    function parseJsonText(text) {
      if (typeof text !== 'string') return undefined;
      try {
        const value = JSON.parse(text);
        return value !== null && typeof value === 'object' ? value : undefined;
      } catch (error) {
        return undefined;
      }
    }

    /**
     * Unwrap one remote command execution outcome.
     *
     * The client remote transport is a RemoteResult: `{ ok: true, value: CommandExecution }`
     * or `{ ok: false, error: RemoteError }`; CommandExecution is `{ commandId, result }` and
     * `result` is `{ kind, text }`. The earlier code read `outcome.text` directly, which is
     * always undefined, so every read "failed" without ever throwing.
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

    /** First non-empty line of a command result text. */
    function firstLine(text) {
      const line = String(text === undefined || text === null ? '' : text)
        .split('\n')
        .find((item) => item.trim() !== '');
      return line === undefined ? '' : line.trim();
    }

    /** Short local timestamp for one checkpoint row. */
    function formatWhen(value) {
      if (typeof value !== 'string' || value === '') return '';
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) return value.slice(0, 16).replace('T', ' ');
      try {
        return date.toLocaleString(undefined, { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
      } catch (error) {
        return value.slice(0, 16).replace('T', ' ');
      }
    }

    /** One three-way segmented control. */
    function Segmented(props) {
      const options = [
        ['auto', props.t('modeAuto')],
        ['on', props.t('modeOn')],
        ['off', props.t('modeOff')],
      ];
      return h(
        'span',
        { className: 'cps-seg', role: 'group', 'aria-label': props.label },
        options.map(([value, label]) =>
          h(
            'button',
            {
              key: value,
              type: 'button',
              className: 'cps-seg-btn',
              'data-on': props.value === value ? 'true' : 'false',
              'aria-pressed': props.value === value,
              onClick: () => props.onChange(value),
            },
            label,
          ),
        ),
      );
    }

    /** M3 setup dialog state; the module store is the single source of truth across dock remounts. */
    const DEFAULT_SETUP_CHOICE = {
      smartDirection: 'auto',
      autoContinue: 'auto',
      checkpointAutoCommit: 'auto',
      checkpointOnCard: 'on',
      startupCheckpoint: 'off',
      makeGlobal: false,
    };

    const setupDialog = {
      open: false,
      choice: DEFAULT_SETUP_CHOICE,
      saving: false,
      note: undefined,
      translate: (key) => key,
    };
    const setupDialogListeners = new Set();
    /** Sessions whose setup status was read this page load (the dock remounts often). */
    const setupChecked = new Set();
    /** Sessions whose /setup snapshot was loaded already (reopen reuses it). */
    const setupLoaded = new Set();
    /** Runtime handles provided by the mounted dock bridge. */
    const setupRuntime = { sessionId: null, remote: undefined, t: (key) => key };

    /** Publish one setup-dialog state change and wake the dialog. */
    function publishSetupDialog(patch) {
      Object.assign(setupDialog, patch);
      for (const listener of setupDialogListeners) listener();
    }

    /** Change one form field and repaint. */
    function setSetupChoice(patch) {
      setupDialog.choice = { ...setupDialog.choice, ...patch };
      publishSetupDialog({ choice: setupDialog.choice });
    }

    /** Open the dialog (manual trigger or a needsSetup snapshot). */
    function openSetupDialog() {
      if (setupDialog.open === true) return;
      publishSetupDialog({ open: true, saving: false, note: undefined });
    }

    /** Send one /setup command; a blank session may have no live agent yet, so retry. */
    async function flushSetup(command, attemptsLeft) {
      const { sessionId, remote, t } = setupRuntime;
      if (sessionId === null || sessionId === undefined || remote === undefined || remote.commands === undefined) return;
      try {
        const outcome = await remote.commands.execute(sessionId, command, []);
        const result = commandResultOf(outcome);
        if (result !== undefined && result.kind === 'error') publishSetupDialog({ note: firstLine(result.text) });
      } catch (error) {
        if (attemptsLeft > 0) {
          setTimeout(() => {
            void flushSetup(command, attemptsLeft - 1);
          }, 2000);
        } else {
          publishSetupDialog({ note: t('unavailable') });
        }
      }
    }

    /** Persist the form choices and close immediately (one command, no extra status read). */
    function saveSetup() {
      if (setupDialog.saving === true) return;
      const { sessionId, t } = setupRuntime;
      const choice = setupDialog.choice;
      if (sessionId !== null && sessionId !== undefined) storageSet(STORAGE_PREFIX + sessionId, 'saved');
      publishSetupDialog({ open: false, saving: true, note: t('saved') });
      const command =
        '/setup --json set smartDirection=' +
        choice.smartDirection +
        ' autoContinue=' +
        choice.autoContinue +
        ' checkpointAutoCommit=' +
        choice.checkpointAutoCommit +
        ' checkpointOnCard=' +
        choice.checkpointOnCard +
        ' startupCheckpoint=' +
        choice.startupCheckpoint +
        (choice.makeGlobal ? ' --global' : '');
      void flushSetup(command, 30).then(() => publishSetupDialog({ saving: false }));
    }

    /** Dismiss the wizard for this conversation and close immediately. */
    function skipSetup() {
      const { sessionId } = setupRuntime;
      if (sessionId !== null && sessionId !== undefined) storageSet(STORAGE_PREFIX + sessionId, 'dismissed');
      publishSetupDialog({ open: false, saving: false });
      void flushSetup('/setup --json dismiss', 30);
    }

    /** Read /setup --json once and fold it into the form defaults. */
    async function refreshSetupStatus(attemptsLeft) {
      const { sessionId, remote, t } = setupRuntime;
      if (sessionId === null || sessionId === undefined || remote === undefined || remote.commands === undefined) return undefined;
      try {
        const outcome = await remote.commands.execute(sessionId, '/setup --json', []);
        const result = commandResultOf(outcome);
        if (result === undefined || result.kind === 'error') throw new Error('unexpected setup response');
        const data = parseJsonText(result.text);
        if (data === undefined) throw new Error('unexpected setup response');
        setupLoaded.add(sessionId);
        const global = data.global !== null && typeof data.global === 'object' ? data.global : {};
        setSetupChoice({
          smartDirection: typeof global.smartDirection === 'string' ? global.smartDirection : 'auto',
          autoContinue: typeof global.autoContinue === 'string' ? global.autoContinue : 'auto',
          checkpointAutoCommit: typeof global.checkpointAutoCommit === 'string' ? global.checkpointAutoCommit : 'auto',
          checkpointOnCard: typeof global.checkpointOnCard === 'string' ? global.checkpointOnCard : 'on',
          startupCheckpoint: global.startupCheckpoint === 'on' ? 'on' : 'off',
        });
        // The dock may remount while this command runs; opening from the module store keeps the
        // needsSetup signal independent of the requesting component instance.
        if (data.needsSetup === true) openSetupDialog();
        return data;
      } catch (error) {
        if (attemptsLeft > 0) {
          await new Promise((resolve) => setTimeout(resolve, 2000));
          return refreshSetupStatus(attemptsLeft - 1);
        }
        publishSetupDialog({ note: t('unavailable') });
        return undefined;
      }
    }

    /** Centered M3 dialog frame for the setup form. */
    const SETUP_DIALOG_CSS = `
.cpw-layer{position:fixed;inset:0;z-index:80;display:flex;align-items:center;justify-content:center;box-sizing:border-box;padding:24px;background:rgba(0,0,0,.4);animation:cpw-fade .15s cubic-bezier(.2,0,0,1) both}
@keyframes cpw-fade{from{opacity:0}to{opacity:1}}
.cpw-dialog{box-sizing:border-box;width:min(480px,100%);max-height:min(720px,calc(100vh - 48px));overflow:auto;background:var(--m3-surface-container-high)!important;border:0!important;border-width:0!important;outline:0!important;box-shadow:0 8px 24px rgba(0,0,0,.42)!important;animation:cpw-in .16s cubic-bezier(.2,0,0,1) both}
@keyframes cpw-in{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
`;

    /** Pure setup form rendered inside the dialog; the dialog owns positioning and scrim. */
    function WizardBody(props) {
      const t = props.t;
      const choice = props.choice;
      const setChoice = props.setChoice;
      const row = (key, labelKey, extra) =>
        h(
          'div',
          { key, className: 'cps-row' },
          h('span', { className: 'cps-label' }, t(labelKey)),
          extra,
        );
      return h(
        'div',
        {
          className: 'cps-root cpw-dialog',
          role: 'dialog',
          'aria-modal': 'true',
          'aria-label': t('title'),
          onClick: (event) => event.stopPropagation(),
        },
        h('style', { key: 'cps-css' }, WIZARD_CSS + SETUP_DIALOG_CSS),
        h(
          'div',
          { key: 'head', className: 'cps-head' },
          h('p', { className: 'cps-title' }, t('title')),
          h('p', { className: 'cps-intro' }, t('intro')),
        ),
        h(
          'div',
          { key: 'rows', className: 'cps-rows' },
          row(
            'smart-direction',
            'smartDirection',
            h(Segmented, {
              key: 'seg',
              t,
              label: t('smartDirection'),
              value: choice.smartDirection,
              onChange: (value) => setChoice({ smartDirection: value }),
            }),
          ),
          row(
            'auto-continue',
            'autoContinue',
            h(Segmented, {
              key: 'seg',
              t,
              label: t('autoContinue'),
              value: choice.autoContinue,
              onChange: (value) => setChoice({ autoContinue: value }),
            }),
          ),
          row(
            'auto-commit',
            'checkpointAutoCommit',
            h(Segmented, {
              key: 'seg',
              t,
              label: t('checkpointAutoCommit'),
              value: choice.checkpointAutoCommit,
              onChange: (value) => setChoice({ checkpointAutoCommit: value }),
            }),
          ),
          row(
            'checkpoint-on-card',
            'checkpointOnCard',
            h(Segmented, {
              key: 'seg',
              t,
              label: t('checkpointOnCard'),
              value: choice.checkpointOnCard,
              onChange: (value) => setChoice({ checkpointOnCard: value }),
            }),
          ),
          h(
            'label',
            { key: 'startup', className: 'cps-check' },
            h('input', {
              type: 'checkbox',
              checked: choice.startupCheckpoint === 'on',
              onChange: (event) => setChoice({ startupCheckpoint: event.target.checked ? 'on' : 'off' }),
            }),
            t('startupCheckpoint'),
          ),
          h(
            'label',
            { key: 'global', className: 'cps-check' },
            h('input', {
              type: 'checkbox',
              checked: choice.makeGlobal === true,
              onChange: (event) => setChoice({ makeGlobal: event.target.checked }),
            }),
            t('makeGlobal'),
          ),
        ),
        props.note !== undefined ? h('p', { key: 'note', className: 'cps-note', role: 'status' }, props.note) : null,
        h(
          'div',
          { key: 'footer', className: 'cps-footer' },
          h('button', { key: 'skip', type: 'button', className: 'cps-btn', disabled: props.saving, onClick: props.onSkip }, t('skip')),
          h('button', { key: 'save', type: 'button', className: 'cps-btn cps-btn-primary', disabled: props.saving, onClick: props.onSave }, t('save')),
        ),
      );
    }

    /**
     * Dock bridge: hands its session, remote and translator to the module store, reads the setup
     * status once, and renders nothing (the dialog lives in shell.overlay).
     */
    function SetupWizard(props) {
      const sessionId = props.sessionId;
      const remote = props.remote;
      const t = props.t;

      React.useEffect(() => {
        setupRuntime.sessionId = sessionId === undefined ? null : sessionId;
        setupRuntime.remote = remote;
        setupRuntime.t = t;
        // The dialog renders from the module store: publish the translator so it never falls
        // back to raw message keys when it opens before this effect's first publish.
        publishSetupDialog({ translate: t });
      }, [sessionId, remote, t]);

      React.useEffect(() => {
        if (sessionId === undefined || sessionId === null) return undefined;
        if (storageGet(STORAGE_PREFIX + 'global') === 'off') return undefined;
        if (setupChecked.has(sessionId)) return undefined;
        setupChecked.add(sessionId);
        let cancelled = false;
        void refreshSetupStatus(9);
        return () => {
          cancelled = true;
        };
      }, [sessionId]);

      React.useEffect(() => {
        const listener = () => {
          openSetupDialog();
          if (sessionId !== undefined && sessionId !== null && !setupLoaded.has(sessionId)) void refreshSetupStatus(0);
        };
        if (sessionId !== undefined && sessionId !== null) setupOpenListeners.add(listener);
        return () => {
          setupOpenListeners.delete(listener);
        };
      }, [sessionId]);

      return null;
    }

    /** Frame-wide renderer for the setup dialog; kept outside the dock so nothing stretches. */
    function SetupWizardDialog() {
      const [, bump] = React.useState(0);
      React.useEffect(() => {
        const listener = () => bump((value) => value + 1);
        setupDialogListeners.add(listener);
        return () => {
          setupDialogListeners.delete(listener);
        };
      }, []);
      React.useEffect(() => {
        if (setupDialog.open !== true) return undefined;
        const onKey = (event) => {
          if (event.key === 'Escape') skipSetup();
        };
        window.addEventListener('keydown', onKey);
        return () => {
          window.removeEventListener('keydown', onKey);
        };
      });
      if (setupDialog.open !== true) return null;
      const t = setupDialog.translate;
      return h(
        'div',
        { className: 'cpw-layer', onClick: skipSetup },
        h(WizardBody, {
          t,
          choice: setupDialog.choice,
          setChoice: setSetupChoice,
          saving: setupDialog.saving,
          note: setupDialog.note,
          onSave: saveSetup,
          onSkip: skipSetup,
        }),
      );
    }

    return {
      inject: ['remote', 'slots', 'locale'],
      apply(ctx) {
        ctx.effect(() => ctx.locale.register(NS, { en, zh }), 'dsh-checkpoint: setup locale');
        const t = ctx.locale.bind(NS);
        ctx.effect(
          () =>
            ctx.slots.inject('conversation.composer.dock', () =>
              ctx.slots.register(
                { name: 'conversation.composer.dock', id: 'smart-workflow-setup', order: 5 },
                (props) => h(SetupWizard, { ...props, remote: ctx.remote, t }),
              ),
            ),
          'dsh-checkpoint: setup wizard',
        );
        ctx.effect(
          () =>
            ctx.slots.inject('shell.overlay', () =>
              ctx.slots.register({ name: 'shell.overlay', id: 'smart-workflow-setup-dialog', order: 19 }, () => h(SetupWizardDialog)),
            ),
          'dsh-checkpoint: setup dialog overlay',
        );
        ctx.effect(
          () =>
            ctx.slots.inject('conversation.composer.dock', () =>
              ctx.slots.register(
                { name: 'conversation.composer.dock', id: 'smart-workflow-checkpoints', order: 6 },
                (props) => h(CheckpointStrip, { ...props, remote: ctx.remote, t }),
              ),
            ),
          'dsh-checkpoint: checkpoint strip',
        );
        ctx.effect(
          () =>
            ctx.slots.inject('shell.overlay', () =>
              ctx.slots.register({ name: 'shell.overlay', id: 'smart-workflow-checkpoint-list', order: 20 }, () => h(CheckpointListOverlay)),
            ),
          'dsh-checkpoint: checkpoint list overlay',
        );
      },
    };
  },
});
