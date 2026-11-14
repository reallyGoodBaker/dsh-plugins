window.__ModuleLoader__.load({
  id: '@local/dsh-smart-workflow',
  factory(require) {
    // ------------------------------------------------------------------
    // Half 1: smart-direction card body, decision record renderer, locale.
    // ------------------------------------------------------------------
    const smartDirectionHalf = (() => {
    const React = require('react');
    const h = React.createElement;

    /**
     * Material 3 stylesheet for the direction card.
     *
     * The card owns its visual language: the M3 baseline tonal palette, M3 typography,
     * shape, elevation, state layers and motion. It deliberately does not consume the
     * host theme tokens, so it looks the same under every DSH skin. The shipped card
     * frame is neutralized through the `:has()` selector so only this surface shows.
     *
     * Light and dark schemes follow the host's `data-ds-dark-theme` attribute.
     */
    const CARD_CSS = `
/* Strict Material 3 direction card.
   Colour roles are the M3 baseline palette, so the card keeps its Material identity under any
   host skin; body[data-ds-dark-theme] swaps in the baseline dark scheme. Spacing uses the
   4dp grid (4/8/12/16/24), type uses the M3 scale, and every block is separated by rhythm. */
@keyframes sdv2-in{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:none}}
section[data-action-card]:has(> .sdv2-root){box-sizing:border-box!important;border:0!important;border-radius:0!important;background:transparent!important;box-shadow:none!important;padding:0!important;overflow:visible!important;max-height:none!important}
.sdv2-root{--m3-primary:#6750a4;--m3-on-primary:#ffffff;--m3-primary-container:#eaddff;--m3-on-primary-container:#21005d;--m3-secondary-container:#e8def8;--m3-on-secondary-container:#1d192b;--m3-surface:#f7f2fa;--m3-surface-variant:#e7e0ec;--m3-surface-container-high:#ece6f0;--m3-on-surface:#1d1b20;--m3-on-surface-variant:#49454f;--m3-outline:#79747e;--m3-outline-variant:#cac4d0;--m3-error:#b3261e;--m3-success:#386a20;--m3-warn:#7d5260;--m3-state-hover:rgba(29,27,32,.08);--m3-state-press:rgba(29,27,32,.12);--m3-primary-state:rgba(103,80,164,.08);--m3-primary-state-press:rgba(103,80,164,.12);--m3-disabled-bg:rgba(29,27,32,.12);--m3-disabled-fg:rgba(29,27,32,.38);--m3-font:"Roboto","Segoe UI",system-ui,-apple-system,"PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif}
body[data-ds-dark-theme] .sdv2-root{--m3-primary:#d0bcff;--m3-on-primary:#381e72;--m3-primary-container:#4f378b;--m3-on-primary-container:#eaddff;--m3-secondary-container:#4a4458;--m3-on-secondary-container:#e8def8;--m3-surface:#1d1b20;--m3-surface-variant:#49454f;--m3-surface-container-high:#2b2930;--m3-on-surface:#e6e0e9;--m3-on-surface-variant:#cac4d0;--m3-outline:#938f99;--m3-outline-variant:#49454f;--m3-error:#f2b8b5;--m3-success:#b7f397;--m3-warn:#efb8c8;--m3-state-hover:rgba(230,224,233,.08);--m3-state-press:rgba(230,224,233,.12);--m3-primary-state:rgba(208,188,255,.08);--m3-primary-state-press:rgba(208,188,255,.12);--m3-disabled-bg:rgba(230,224,233,.12);--m3-disabled-fg:rgba(230,224,233,.38)}
.sdv2-root{box-sizing:border-box;display:flex;flex-direction:column;gap:16px;margin:6px 0 0;padding:16px;border:1px solid var(--m3-outline-variant);border-radius:12px;background:var(--m3-surface);color:var(--m3-on-surface);font-family:var(--m3-font);font-size:14px;font-weight:400;line-height:1.43;letter-spacing:.25px;text-align:start;animation:sdv2-in .18s cubic-bezier(.2,0,0,1) both}
.sdv2-root *{box-sizing:border-box}
/* ---------- header: title, question, supporting copy, label ---------- */
.sdv2-root .sdv2-head{display:flex;flex-direction:column;gap:8px;min-width:0;color:var(--m3-on-surface-variant)}
.sdv2-root .sdv2-head strong{display:block;margin:0;color:var(--m3-on-surface);font-size:22px;font-weight:400;line-height:1.27;letter-spacing:0}
.sdv2-root .sdv2-head button{margin:0;padding:0;border:0;background:transparent;color:var(--m3-primary);font-family:var(--m3-font);font-size:12px;font-weight:500;line-height:1.33;letter-spacing:.5px;cursor:pointer;text-align:start}
.sdv2-root .sdv2-head button:focus-visible{outline:2px solid var(--m3-primary);outline-offset:2px;border-radius:4px}
.sdv2-root .sdv2-question-block{display:flex;flex-direction:column;gap:8px;min-width:0;max-width:72ch}
.sdv2-root .sdv2-question{margin:0;color:var(--m3-on-surface);font-size:16px;font-weight:500;line-height:1.5;letter-spacing:.15px;overflow-wrap:anywhere}
.sdv2-root .sdv2-muted{margin:0;color:var(--m3-on-surface-variant);font-size:14px;font-weight:400;line-height:1.43;letter-spacing:.25px;overflow-wrap:anywhere;white-space:pre-wrap}
.sdv2-root .sdv2-hint{margin:0;color:var(--m3-on-surface-variant);font-size:12px;font-weight:400;line-height:1.33;letter-spacing:.4px}
.sdv2-root .sdv2-divider{height:1px;margin:0;background:var(--m3-outline-variant);flex:none}
/* ---------- sections and options ---------- */
.sdv2-root .sdv2-section{display:flex;flex-direction:column;gap:8px;min-width:0}
.sdv2-root .sdv2-section-title{margin:0;color:var(--m3-on-surface-variant);font-size:14px;font-weight:500;line-height:1.43;letter-spacing:.1px}
.sdv2-root .sdv2-options{display:flex;flex-direction:column;gap:12px;min-width:0}
.sdv2-root .sdv2-option{display:flex;flex-direction:column;gap:0;padding:16px;border:1px solid var(--m3-outline-variant);border-radius:12px;background:transparent;transition:background .18s cubic-bezier(.2,0,0,1),border-color .18s cubic-bezier(.2,0,0,1)}
@media(hover:hover){.sdv2-root .sdv2-option:hover{background:var(--m3-state-hover)}}
.sdv2-root .sdv2-option[data-selected=true]{border-color:var(--m3-primary);background:var(--m3-secondary-container)}
.sdv2-root .sdv2-option-head{display:flex;align-items:flex-start;gap:12px;min-width:0}
.sdv2-root .sdv2-control-label{position:relative;flex:none;display:inline-flex;margin:1px 0 0;cursor:pointer}
.sdv2-root .sdv2-native{position:absolute;width:1px;height:1px;margin:0;opacity:0;pointer-events:none}
.sdv2-root .sdv2-state-layer{position:absolute;left:50%;top:50%;width:40px;height:40px;border-radius:50%;transform:translate(-50%,-50%);background:transparent;pointer-events:none;transition:background .15s cubic-bezier(.2,0,0,1)}
@media(hover:hover){.sdv2-root .sdv2-control-label:hover .sdv2-state-layer{background:var(--m3-state-hover)}}
.sdv2-root .sdv2-control-label:active .sdv2-state-layer{background:var(--m3-state-press)}
.sdv2-root .sdv2-control{display:inline-flex;align-items:center;justify-content:center;flex:none;width:18px;height:18px;margin:0;border:2px solid var(--m3-on-surface-variant);border-radius:2px;background:transparent;transition:background .15s cubic-bezier(.2,0,0,1),border-color .15s cubic-bezier(.2,0,0,1)}
.sdv2-root .sdv2-control[data-kind=radio]{width:20px;height:20px;border-radius:50%}
.sdv2-root .sdv2-check{width:14px;height:14px;fill:var(--m3-on-primary);opacity:0;transition:opacity .12s cubic-bezier(.2,0,0,1)}
.sdv2-root .sdv2-dot{width:10px;height:10px;border-radius:50%;background:var(--m3-primary);transform:scale(0);transition:transform .15s cubic-bezier(.2,0,0,1)}
.sdv2-root .sdv2-native:checked~.sdv2-control{background:var(--m3-primary);border-color:var(--m3-primary)}
.sdv2-root .sdv2-native:checked~.sdv2-control[data-kind=radio]{background:transparent}
.sdv2-root .sdv2-native:checked~.sdv2-control .sdv2-check{opacity:1}
.sdv2-root .sdv2-native:checked~.sdv2-control .sdv2-dot{transform:scale(1)}
.sdv2-root .sdv2-native:focus-visible~.sdv2-control{outline:2px solid var(--m3-primary);outline-offset:2px}
.sdv2-root .sdv2-option-label{flex:1 1 auto;min-width:0;margin:0;color:var(--m3-on-surface);font-size:16px;font-weight:400;line-height:1.5;letter-spacing:.5px;cursor:pointer;overflow-wrap:anywhere}
.sdv2-root .sdv2-option[data-selected=true] .sdv2-option-label{color:var(--m3-on-surface)}
/* benefit / risk rows: label-small role, body-medium value */
.sdv2-root .sdv2-facts{display:grid;grid-template-columns:auto minmax(0,1fr);gap:8px 12px;margin:12px 0 0;padding-left:32px}
.sdv2-root .sdv2-fact{display:contents}
.sdv2-root .sdv2-fact-label{color:var(--m3-on-surface-variant);font-size:12px;font-weight:500;line-height:1.5;letter-spacing:.5px;white-space:nowrap}
.sdv2-root .sdv2-fact-text{color:var(--m3-on-surface-variant);font-size:14px;font-weight:400;line-height:1.43;letter-spacing:.25px;overflow-wrap:anywhere}
.sdv2-root .sdv2-option[data-selected=true] .sdv2-fact-label,.sdv2-root .sdv2-option[data-selected=true] .sdv2-fact-text{color:var(--m3-on-surface-variant)}
/* ---------- M3 outlined text field with floating label ---------- */
.sdv2-root .sdv2-field{position:relative;box-sizing:border-box;width:100%;margin:12px 0 0;padding:0;border:1px solid var(--m3-outline);border-radius:4px;background:transparent;min-inline-size:0;transition:border-color .15s cubic-bezier(.2,0,0,1)}
@media(hover:hover){.sdv2-root .sdv2-field:hover{border-color:var(--m3-on-surface)}}
.sdv2-root .sdv2-field:focus-within{border-color:var(--m3-primary);border-width:2px}
.sdv2-root .sdv2-field-label{display:block;padding:0 4px;margin-left:8px;color:var(--m3-on-surface-variant);font-family:var(--m3-font);font-size:12px;font-weight:500;line-height:1.33;letter-spacing:.5px}
.sdv2-root .sdv2-field:focus-within .sdv2-field-label{color:var(--m3-primary)}
.sdv2-root .sdv2-field-input{box-sizing:border-box;display:block;width:100%;margin:0;padding:8px 16px 12px;border:0;background:transparent;color:var(--m3-on-surface);font-family:var(--m3-font);font-size:14px;font-weight:400;line-height:1.43;letter-spacing:.25px;resize:vertical;min-height:32px;caret-color:var(--m3-primary)}
.sdv2-root .sdv2-field-input::placeholder{color:var(--m3-on-surface-variant);opacity:1}
.sdv2-root .sdv2-field-input:focus{outline:none}
.sdv2-root .sdv2-custom .sdv2-field{margin-top:0}
.sdv2-root .sdv2-custom .sdv2-field-input{min-height:80px}
/* ---------- footer buttons ---------- */
.sdv2-root .sdv2-footer{display:flex;justify-content:flex-end;align-items:center;gap:8px;margin:0}
.sdv2-root button.sdv2-btn{box-sizing:border-box;display:inline-flex;align-items:center;justify-content:center;gap:8px;height:40px;min-width:64px;padding:0 24px;border:0;border-radius:20px;background:transparent;color:var(--m3-primary);font-family:var(--m3-font);font-size:14px;font-weight:500;line-height:1.43;letter-spacing:.1px;cursor:pointer;white-space:nowrap;transition:background .2s cubic-bezier(.2,0,0,1),color .2s cubic-bezier(.2,0,0,1)}
.sdv2-root button.sdv2-btn:focus-visible{outline:2px solid var(--m3-primary);outline-offset:2px}
.sdv2-root button.sdv2-btn-filled{background:var(--m3-primary);color:var(--m3-on-primary)}
@media(hover:hover){.sdv2-root button.sdv2-btn-filled:hover:not(:disabled){background:var(--m3-primary)}.sdv2-root button.sdv2-btn-text:hover:not(:disabled){background:var(--m3-primary-state)}}
.sdv2-root button.sdv2-btn:active:not(:disabled){background:var(--m3-state-press)}
.sdv2-root button.sdv2-btn-filled:active:not(:disabled){background:var(--m3-primary)}
.sdv2-root button.sdv2-btn-text{padding:0 12px;color:var(--m3-primary)}
.sdv2-root button.sdv2-btn:disabled{opacity:1;background:transparent;color:var(--m3-disabled-fg);cursor:not-allowed}
.sdv2-root button.sdv2-btn-filled:disabled{background:var(--m3-disabled-bg);color:var(--m3-disabled-fg)}
/* ---------- receipt (decision record) ---------- */
.sdv2-root .sdv2-receipt{display:flex;flex-direction:column;gap:16px;min-width:0}
.sdv2-root .sdv2-receipt-section{display:flex;flex-direction:column;gap:8px;min-width:0}
.sdv2-root .sdv2-badge{display:inline-flex;align-items:center;gap:8px;align-self:flex-start;height:32px;padding:0 12px;border:0;border-radius:8px;background:var(--m3-primary-container);color:var(--m3-on-primary-container);font-size:12px;font-weight:500;line-height:1;letter-spacing:.5px}
.sdv2-root .sdv2-badge[data-phase=dismissed],.sdv2-root .sdv2-badge[data-phase=replaced]{background:var(--m3-surface-container-high);color:var(--m3-on-surface-variant)}
.sdv2-root .sdv2-dot-indicator{width:8px;height:8px;border-radius:50%;background:var(--m3-primary);flex:none}
.sdv2-root .sdv2-badge[data-phase=dismissed] .sdv2-dot-indicator,.sdv2-root .sdv2-badge[data-phase=replaced] .sdv2-dot-indicator{background:var(--m3-on-surface-variant)}
.sdv2-root .sdv2-list{display:flex;flex-wrap:wrap;gap:8px;margin:0;padding:0;list-style:none}
.sdv2-root .sdv2-list-item{display:inline-flex;align-items:center;gap:6px;max-width:100%;height:32px;padding:0 12px;border:1px solid var(--m3-outline-variant);border-radius:8px;background:transparent;color:var(--m3-on-surface);font-size:14px;font-weight:400;line-height:1;letter-spacing:.25px}
.sdv2-root .sdv2-list-item>span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.sdv2-root .sdv2-notes{display:flex;flex-direction:column;gap:8px;margin:0;padding:0;list-style:none}
.sdv2-root .sdv2-note{margin:0;padding:12px 16px;border-radius:12px;background:var(--m3-surface-variant);color:var(--m3-on-surface);font-size:14px;font-weight:400;line-height:1.43;letter-spacing:.25px;overflow-wrap:anywhere}
.sdv2-root .sdv2-note b{display:inline-block;margin-right:8px;color:var(--m3-on-surface-variant);font-weight:500;font-size:12px;letter-spacing:.5px}
/* ---------- status / errors / images ---------- */
.sdv2-root .sdv2-status{margin:0;color:var(--m3-on-surface-variant);font-size:12px;font-weight:400;line-height:1.33;letter-spacing:.4px}
.sdv2-root .sdv2-alert{margin:0;color:var(--m3-error);font-size:12px;font-weight:400;line-height:1.33;letter-spacing:.4px}
.sdv2-root .sdv2-images{display:flex;flex-wrap:wrap;gap:8px;margin:0;padding:0;list-style:none}
.sdv2-root .sdv2-image-item{position:relative;display:block;border-radius:8px;overflow:hidden;border:1px solid var(--m3-outline-variant)}
.sdv2-root .sdv2-image{display:block;width:96px;height:72px;object-fit:cover}
.sdv2-root .sdv2-image-remove{position:absolute;top:2px;right:2px;box-sizing:border-box;width:20px;height:20px;padding:0;border:0;border-radius:50%;background:rgba(0,0,0,.6);color:#ffffff;font-family:var(--m3-font);font-size:14px;line-height:20px;text-align:center;cursor:pointer}
.sdv2-root .sdv2-image-hint{margin:0;color:var(--m3-on-surface-variant);font-size:12px;line-height:1.33;letter-spacing:.4px}
.sdv2-root .sdv2-image-note{margin:0;color:var(--m3-error);font-size:12px;line-height:1.33;letter-spacing:.4px}
.sdv2-root .sdv2-option-images{display:flex;flex-direction:column;gap:8px;margin:12px 0 0;min-width:0}
.sdv2-root .sdv2-option .sdv2-images{margin-top:0}
`;

    /** English copy for the direction card; every visible string comes from this namespace. */
    const en = {
      submit: 'Submit',
      dismiss: 'Not now',
      benefit: 'Benefit',
      risk: 'Risk',
      optionsLabel: 'Options',
      selectedLabel: 'Selected',
      guidanceLabel: 'Guidance',
      guidancePlaceholder: 'Optional extra guidance for this direction',
      customLabel: 'Your own direction',
      customPlaceholder: 'Describe a direction of your own',
      submitted: 'Direction submitted',
      dismissed: 'Dismissed',
      replaced: 'Replaced',
      saving: 'Saving…',
      transport: 'Could not confirm the result. Reconnect and check the card before retrying.',
      unavailable: 'This direction card is unavailable. Check the plugin in Plugins.',
      selectHint: 'Select one direction, or several when the card allows it. Add any extra guidance under each option.',
      recordContinue: 'Continuing automatically with your choices',
      imagesLabel: 'Images',
      imageHint: 'Paste a screenshot with Ctrl+V inside this field (up to 3 per card; sent with the submission)',
      imageRemove: 'Remove image',
      imageTooMany: 'At most 3 images can be attached',
      imageTooLarge: 'That image is too large; it was skipped',
      imageFailed: 'That image could not be read; it was skipped',
    };

    /** Simplified Chinese copy for the direction card. */
    const zh = {
      submit: '提交',
      dismiss: '暂不需要',
      benefit: '收益',
      risk: '风险',
      optionsLabel: '方向选项',
      selectedLabel: '已选择',
      guidanceLabel: '补充指引',
      guidancePlaceholder: '可选：为这个方向补充要求',
      customLabel: '自定义方向',
      customPlaceholder: '描述一个你自己的方向',
      submitted: '已提交方向',
      dismissed: '已忽略',
      replaced: '已替换',
      saving: '正在保存…',
      transport: '暂时无法确认结果，请重新连接并查看卡片状态后再重试。',
      unavailable: '这张方向卡片暂时不可用，请到插件页面查看。',
      selectHint: '可选择其中一个方向；卡片允许时可以多选，并可在每个选项下补充要求。',
      recordContinue: '已按你的选择自动继续',
      imagesLabel: '图片',
      imageHint: '在此输入框内按 Ctrl+V 粘贴截图（每张卡最多 3 张，随提交发送）',
      imageRemove: '移除图片',
      imageTooMany: '最多只能附加 3 张图片',
      imageTooLarge: '图片过大，已跳过',
      imageFailed: '图片读取失败，已跳过',
    };

    /** Host refusal reasons that already have a translated status line in this namespace. */
    const TRANSLATED_REASON_KEYS = ['unavailable', 'transport'];

    /** Trim a string field, tolerating non-strings from a malformed record. */
    function textOf(value) {
      return typeof value === 'string' ? value.trim() : '';
    }

    /**
     * Normalize `proposal.details` defensively. Returns null when the record cannot support
     * controls, in which case the body shows the summary and a quiet unavailable note.
     */
    function parseDetails(value) {
      if (value === null || typeof value !== 'object' || Array.isArray(value)) return null;
      const question = textOf(value.question);
      if (question === '') return null;
      const rawOptions = Array.isArray(value.options) ? value.options : [];
      const options = [];
      const seen = new Set();
      for (const raw of rawOptions) {
        if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) continue;
        const id = textOf(raw.id);
        if (id === '' || seen.has(id)) continue;
        seen.add(id);
        const label = textOf(raw.label);
        const hint = textOf(raw.hint);
        options.push({
          id,
          label: label === '' ? id : label,
          benefit: textOf(raw.benefit),
          risk: textOf(raw.risk),
          hint: hint === '' ? undefined : hint,
        });
      }
      if (options.length === 0) return null;
      return {
        question,
        context: textOf(value.context),
        options,
        allowMultiple: value.allow_multiple === true,
        allowCustom: value.allow_custom !== false,
      };
    }

    /** Read the recorded receipt fields from `decision.data`, tolerating missing or ill-typed data. */
    function parseReceipt(decision) {
      const empty = { selected: [], guidance: [], custom: '' };
      if (decision === null || typeof decision !== 'object') return empty;
      const data = decision.data;
      if (data === null || typeof data !== 'object' || Array.isArray(data)) return empty;
      const selected = Array.isArray(data.selected)
        ? data.selected.filter((id) => typeof id === 'string' && id.trim() !== '').map((id) => id.trim())
        : [];
      const guidance = [];
      if (data.guidance !== null && typeof data.guidance === 'object' && !Array.isArray(data.guidance)) {
        for (const id of Object.keys(data.guidance)) {
          const text = textOf(data.guidance[id]);
          if (id !== '' && text !== '') guidance.push({ id, text });
        }
      }
      const images = [];
      if (Array.isArray(data.images)) {
        for (const item of data.images) {
          if (item === null || typeof item !== 'object' || Array.isArray(item)) continue;
          const mediaType = textOf(item.mediaType);
          if (mediaType === '') continue;
          const name = textOf(item.name);
          const target = textOf(item.target);
          const label = textOf(item.label);
          images.push({
            target: target === '' ? 'custom' : target,
            label,
            name: name === '' ? mediaType.replace('image/', '') : name,
            mediaType,
          });
        }
      }
      return {
        selected,
        guidance,
        custom: textOf(data.custom),
        images,
      };
    }

    /** Map a host refusal reason onto copy this namespace can translate. */
    function refusalKey(reason) {
      return typeof reason === 'string' && TRANSLATED_REASON_KEYS.indexOf(reason) !== -1 ? reason : 'unavailable';
    }

    /** Paste policy for the card; the Host enforces the same caps again. */
    const MAX_IMAGES = 3;
    const IMAGE_PAYLOAD_MAX = 2_600_000;
    const IMAGE_MEDIA_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];

    /** Read one clipboard file as a data URL. */
    function readAsDataUrl(file) {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(reader.error || new Error('image read failed'));
        reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
        reader.readAsDataURL(file);
      });
    }

    /**
     * Turn one pasted file into a compact base64 payload, downscaling oversized screenshots
     * through an offscreen canvas. Throws only when no usable payload can be produced.
     */
    async function prepareImage(file) {
      const dataUrl = await readAsDataUrl(file);
      const comma = dataUrl.indexOf(',');
      if (comma < 0) throw new Error('invalid image data');
      const mediaType = dataUrl.slice(5, comma).split(';')[0];
      if (IMAGE_MEDIA_TYPES.indexOf(mediaType) === -1) throw new Error('unsupported image type');
      let base64 = dataUrl.slice(comma + 1);
      let finalType = mediaType;
      try {
        const bitmap = await createImageBitmap(file);
        const width = bitmap.width;
        const height = bitmap.height;
        if (width > 1600 || height > 1600 || base64.length > 1_600_000) {
          const scale = Math.min(1600 / width, 1600 / height, 1);
          const canvas = document.createElement('canvas');
          canvas.width = Math.max(1, Math.round(width * scale));
          canvas.height = Math.max(1, Math.round(height * scale));
          const painter = canvas.getContext('2d');
          if (painter === null) throw new Error('canvas unavailable');
          painter.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
          const encoded = canvas.toDataURL('image/jpeg', 0.82);
          const outComma = encoded.indexOf(',');
          if (outComma < 0) throw new Error('image encode failed');
          base64 = encoded.slice(outComma + 1);
          finalType = 'image/jpeg';
        }
        if (typeof bitmap.close === 'function') bitmap.close();
      } catch (error) {
        // Keep the original bytes when decoding or scaling is unavailable.
      }
      if (base64.length > IMAGE_PAYLOAD_MAX) throw new Error('image too large');
      const name = typeof file.name === 'string' && file.name !== '' ? file.name : 'pasted-image';
      return {
        id: 'img-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8),
        name,
        mediaType: finalType,
        data: base64,
        preview: 'data:' + finalType + ';base64,' + base64,
      };
    }

    /** The M3 checkbox/radio mark; the stylesheet shows the mark matching the control kind. */
    function controlMark(kind) {
      if (kind === 'radio') return h('span', { key: 'mark', className: 'sdv2-dot' });
      return h(
        'svg',
        { key: 'mark', className: 'sdv2-check', viewBox: '0 0 24 24', 'aria-hidden': 'true' },
        h('path', { d: 'M9.55 17.3 4.8 12.55l1.4-1.4 3.35 3.35 8.25-8.25 1.4 1.4z' }),
      );
    }

    /** One labeled two-column fact row, the same structure the reply text uses. */
    function factRow(key, label, text) {
      if (text === '') return null;
      return h(
        'div',
        { key, className: 'sdv2-fact' },
        h('span', { className: 'sdv2-fact-label' }, label),
        h('span', { className: 'sdv2-fact-text' }, text),
      );
    }

    /** A labeled card section; every content group in the card is one of these. */
    function section(key, label, children) {
      return h('section', { key, className: 'sdv2-section', 'aria-label': label }, h('p', { className: 'sdv2-section-title' }, label), children);
    }

    /**
     * Body of a `smart_direction` card. Open state shows the summary, the question, one row per
     * option with its own guidance box, an optional custom-direction box and submit/dismiss.
     * A recorded decision turns the body into a read-only receipt.
     */
    function SmartDirectionCard(props) {
      const proposal = props.proposal;
      const decision = props.decision;
      const act = props.act;
      const t = props.t;
      const summary = props.summary;

      const uid = React.useId();
      const details = React.useMemo(
        () => parseDetails(proposal === undefined || proposal === null ? undefined : proposal.details),
        [proposal],
      );
      const [selected, setSelected] = React.useState([]);
      const [guidance, setGuidance] = React.useState({});
      const [custom, setCustom] = React.useState('');
      const [images, setImages] = React.useState([]);
      const [imageNote, setImageNote] = React.useState();
      const [pending, setPending] = React.useState();
      const [status, setStatus] = React.useState();
      const [receipt, setReceipt] = React.useState();

      const settledDecision = decision === undefined || decision === null ? receipt : decision;
      const busy = pending !== undefined;

      function toggleOption(id) {
        setSelected((previous) => {
          if (previous.indexOf(id) !== -1) return previous.filter((value) => value !== id);
          return details !== null && details.allowMultiple ? [...previous, id] : [id];
        });
      }

      function updateGuidance(id, value) {
        setGuidance((previous) => ({ ...previous, [id]: value }));
      }

      function removeImage(id) {
        setImages((previous) => previous.filter((image) => image.id !== id));
        setImageNote(undefined);
      }

      async function handlePaste(event, target) {
        const clipboard = event.clipboardData;
        if (clipboard === null || clipboard === undefined) return;
        const files = [];
        if (clipboard.items !== undefined && clipboard.items !== null) {
          for (const item of Array.from(clipboard.items)) {
            if (item.kind !== 'file' || typeof item.type !== 'string' || item.type.indexOf('image/') !== 0) continue;
            const file = item.getAsFile();
            if (file !== null && file !== undefined) files.push(file);
          }
        }
        if (files.length === 0) return;
        event.preventDefault();
        if (busy) return;
        const room = MAX_IMAGES - images.length;
        if (room <= 0) {
          setImageNote(t('imageTooMany'));
          return;
        }
        const accepted = [];
        let note;
        for (const file of files.slice(0, room)) {
          try {
            accepted.push({ ...(await prepareImage(file)), target });
          } catch (error) {
            note = String((error && error.message) || '').indexOf('too large') !== -1 ? t('imageTooLarge') : t('imageFailed');
          }
        }
        if (files.length > room) note = t('imageTooMany');
        if (accepted.length > 0) setImages((previous) => [...previous, ...accepted]);
        setImageNote(note);
      }

      /** One image strip bound to a specific direction target (`custom` for the free-form box). */
      function imageStrip(target) {
        const bound = images.filter((image) => image.target === target);
        return h(
          'div',
          { key: 'images', className: 'sdv2-option-images' },
          bound.length > 0
            ? h(
                'ul',
                { className: 'sdv2-images' },
                bound.map((image) =>
                  h(
                    'li',
                    { key: image.id, className: 'sdv2-image-item' },
                    h('img', { src: image.preview, alt: image.name, className: 'sdv2-image' }),
                    h(
                      'button',
                      {
                        type: 'button',
                        className: 'sdv2-image-remove',
                        onClick: () => removeImage(image.id),
                        'aria-label': t('imageRemove') + ' ' + image.name,
                      },
                      '×',
                    ),
                  ),
                ),
              )
            : null,
          h('p', { className: 'sdv2-image-hint' }, t('imageHint')),
        );
      }

      async function send(verb, payload) {
        setPending(verb);
        setStatus(undefined);
        try {
          const result = payload === undefined ? await act(verb) : await act(verb, payload);
          if (result === undefined || result === null || typeof result !== 'object') {
            setStatus({ tone: 'alert', key: 'transport' });
            return;
          }
          if (result.status === 'refused' || result.status === 'unconfirmed') {
            setStatus({ tone: 'alert', key: refusalKey(result.reason) });
            return;
          }
          if (result.status === 'accepted') {
            setStatus({ tone: 'status', key: 'saving' });
            return;
          }
          if (result.status === 'settled') {
            if (result.decision !== undefined && result.decision !== null) setReceipt(result.decision);
            else setStatus({ tone: 'status', key: 'transport' });
            return;
          }
          setStatus({ tone: 'alert', key: 'transport' });
        } catch (error) {
          setStatus({ tone: 'alert', key: 'transport' });
        } finally {
          setPending(undefined);
        }
      }

      function submit() {
        if (details === null || busy) return;
        const chosen = [];
        const guidancePayload = {};
        for (const option of details.options) {
          if (selected.indexOf(option.id) !== -1) chosen.push(option.id);
          const value = textOf(guidance[option.id]);
          if (value !== '') guidancePayload[option.id] = value;
        }
        const customText = details.allowCustom ? textOf(custom) : '';
        const payload = { selected: chosen };
        if (Object.keys(guidancePayload).length > 0) payload.guidance = guidancePayload;
        if (customText !== '') payload.custom = customText;
        if (images.length > 0) {
          payload.images = images.map((image) => ({
            target: image.target,
            name: image.name,
            mediaType: image.mediaType,
            data: image.data,
          }));
        }
        send('choose', payload);
      }

      const styleTag = h('style', { key: 'sdv2-css' }, CARD_CSS);

      // Settled state: a structured, read-only receipt rebuilt from the recorded decision.
      if (settledDecision !== undefined && settledDecision !== null) {
        const phase = typeof settledDecision === 'object' ? settledDecision.phase : undefined;
        const phaseKey =
          phase === 'chosen' ? 'submitted' : phase === 'dismissed' ? 'dismissed' : phase === 'replaced' ? 'replaced' : undefined;
        const data = parseReceipt(settledDecision);
        const labelOf = (id) => {
          if (details !== null) {
            for (const option of details.options) if (option.id === id) return option.label;
          }
          return id;
        };
        const receiptSections = [];
        if (data.selected.length > 0) {
          receiptSections.push(
            section(
              'selected',
              t('selectedLabel'),
              h(
                'ul',
                { className: 'sdv2-list' },
                data.selected.map((id) =>
                  h('li', { key: `chosen-${id}`, className: 'sdv2-list-item' }, h('span', null, labelOf(id))),
                ),
              ),
            ),
          );
        }
        if (data.guidance.length > 0) {
          receiptSections.push(
            section(
              'guidance',
              t('guidanceLabel'),
              h(
                'ul',
                { className: 'sdv2-notes' },
                data.guidance.map((entry) =>
                  h('li', { key: `guidance-${entry.id}`, className: 'sdv2-note' }, h('b', null, labelOf(entry.id)), entry.text),
                ),
              ),
            ),
          );
        }
        if (data.custom !== '') {
          receiptSections.push(section('custom', t('customLabel'), h('p', { className: 'sdv2-note' }, data.custom)));
        }
        if (data.images.length > 0) {
          receiptSections.push(
            section(
              'images',
              t('imagesLabel'),
              h(
                'ul',
                { className: 'sdv2-list' },
                data.images.map((image, index) => {
                  const targetLabel = image.target === 'custom' ? t('customLabel') : labelOf(image.target);
                  return h(
                    'li',
                    { key: `image-${index}`, className: 'sdv2-list-item' },
                    h('span', null, targetLabel + ' · ' + image.name),
                  );
                }),
              ),
            ),
          );
        }
        return h(
          'div',
          { className: 'sdv2-root' },
          styleTag,
          h('div', { key: 'head', className: 'sdv2-head' }, summary),
          h(
            'div',
            { key: 'receipt', className: 'sdv2-receipt' },
            phaseKey !== undefined
              ? h(
                  'span',
                  { className: 'sdv2-badge', 'data-phase': phase },
                  h('span', { className: 'sdv2-dot-indicator' }),
                  t(phaseKey),
                )
              : null,
            ...receiptSections,
          ),
        );
      }

      // Malformed details: keep the frame's summary and a quiet note instead of throwing.
      if (details === null) {
        return h(
          'div',
          { className: 'sdv2-root' },
          styleTag,
          h('div', { className: 'sdv2-head' }, summary),
          h('p', { role: 'status', className: 'sdv2-hint' }, t('unavailable')),
        );
      }

      const groupName = uid + '-choice';
      const selectedIds = selected.filter((id) => details.options.some((option) => option.id === id));
      const customText = details.allowCustom ? textOf(custom) : '';
      const canSubmit = pending === undefined && (selectedIds.length > 0 || customText !== '');
      const pieces = [
        styleTag,
        h('div', { key: 'head', className: 'sdv2-head' }, summary),
        h(
          'div',
          { key: 'question', className: 'sdv2-question-block' },
          h('p', { className: 'sdv2-question' }, details.question),
          details.context !== '' ? h('p', { className: 'sdv2-muted' }, details.context) : null,
          h('p', { className: 'sdv2-hint' }, t('selectHint')),
        ),
      ];

      pieces.push(
        section(
          'options',
          t('optionsLabel'),
          h(
            'div',
            { role: details.allowMultiple ? 'group' : 'radiogroup', 'aria-label': details.question, className: 'sdv2-options' },
            details.options.map((option, index) => {
              const isSelected = selectedIds.indexOf(option.id) !== -1;
              const controlId = `${uid}-option-${index}`;
              const kind = details.allowMultiple ? 'checkbox' : 'radio';
              const choose = () => (kind === 'checkbox' ? toggleOption(option.id) : setSelected([option.id]));
              const control = h(
                'label',
                {
                  key: 'control',
                  className: 'sdv2-control-label',
                  htmlFor: controlId,
                  // Toggle from the visible M3 mark itself and stop the label's own activation,
                  // so one click is exactly one state change even though the native input is hidden.
                  onClick: (event) => {
                    event.preventDefault();
                    choose();
                  },
                },
                h('input', {
                  id: controlId,
                  type: kind,
                  name: kind === 'radio' ? groupName : undefined,
                  className: 'sdv2-native',
                  checked: isSelected,
                  onChange: choose,
                }),
                h('span', { key: 'state', className: 'sdv2-state-layer', 'aria-hidden': 'true' }),
                h('span', { className: 'sdv2-control', 'data-kind': kind }, controlMark(kind)),
              );
              const facts = h(
                'div',
                { key: 'facts', className: 'sdv2-facts' },
                factRow('benefit', t('benefit'), option.benefit),
                factRow('risk', t('risk'), option.risk),
              );
              const rows = [
                h(
                  'div',
                  { key: 'head', className: 'sdv2-option-head' },
                  control,
                  h('label', { htmlFor: controlId, className: 'sdv2-option-label' }, option.label),
                ),
                facts,
                h(
                  'fieldset',
                  { key: 'guidance', className: 'sdv2-field' },
                  h('legend', { className: 'sdv2-field-label' }, t('guidanceLabel')),
                  h('textarea', {
                    className: 'sdv2-field-input',
                    value: guidance[option.id] === undefined ? '' : guidance[option.id],
                    placeholder: option.hint !== undefined ? option.hint : t('guidancePlaceholder'),
                    'aria-label': option.label + ' ' + t('guidancePlaceholder'),
                    onChange: (event) => updateGuidance(option.id, event.target.value),
                    onPaste: (event) => handlePaste(event, option.id),
                    rows: 1,
                    maxLength: 2000,
                  }),
                ),
                imageStrip(option.id),
              ];
              return h(
                'div',
                { key: option.id, className: 'sdv2-option', 'data-selected': isSelected ? 'true' : 'false' },
                ...rows,
              );
            }),
          ),
        ),
      );

      if (details.allowCustom) {
        const customId = uid + '-custom';
        pieces.push(
          h(
            'div',
            { key: 'custom', className: 'sdv2-custom' },
            h(
              'fieldset',
              { className: 'sdv2-field' },
              h('legend', { className: 'sdv2-field-label' }, t('customLabel')),
              h('textarea', {
                id: customId,
                className: 'sdv2-field-input',
                value: custom,
                rows: 3,
                maxLength: 4000,
                placeholder: t('customPlaceholder'),
                onChange: (event) => setCustom(event.target.value),
                onPaste: (event) => handlePaste(event, 'custom'),
              }),
            ),
            imageStrip('custom'),
          ),
        );
      }

      if (imageNote !== undefined) {
        pieces.push(h('p', { key: 'image-note', className: 'sdv2-image-note' }, imageNote));
      }

      pieces.push(h('div', { key: 'divider', className: 'sdv2-divider' }));

      if (status !== undefined) {
        pieces.push(
          h(
            'p',
            {
              key: 'status',
              role: status.tone === 'alert' ? 'alert' : 'status',
              className: status.tone === 'alert' ? 'sdv2-alert' : 'sdv2-status',
            },
            t(status.key),
          ),
        );
      }

      pieces.push(
        h(
          'footer',
          { key: 'footer', className: 'sdv2-footer' },
          h(
            'button',
            {
              key: 'dismiss',
              type: 'button',
              disabled: busy,
              onClick: () => send('dismiss'),
              className: 'sdv2-btn sdv2-btn-text',
            },
            t('dismiss'),
          ),
          h(
            'button',
            {
              key: 'submit',
              type: 'button',
              disabled: !canSubmit,
              onClick: submit,
              className: 'sdv2-btn sdv2-btn-filled',
            },
            t('submit'),
          ),
        ),
      );

      return h('div', { className: 'sdv2-root', 'aria-busy': busy ? 'true' : undefined }, ...pieces);
    }

    // ------------------------------------------------------------------
    // Structured decision record in the user transcript
    // ------------------------------------------------------------------

    /** Marker lines the Host writes into the wake-up user message. */
    const DECISION_MARKERS = ['Direction card recorded', 'Direction card submitted']
    const DECISION_RULE_ID = 'smart-direction.decision'

    /** Material 3 receipt for the wake-up decision record inside the user bubble. */
    const DECISION_RECORD_CSS = `
.sdv3-root{--sdv3-primary:#6750a4;--sdv3-on-primary:#ffffff;--sdv3-primary-container:#eaddff;--sdv3-on-primary-container:#21005d;--sdv3-surface-container-low:#f7f2fa;--sdv3-surface-container:#f3edf7;--sdv3-surface-container-high:#ece6f0;--sdv3-on-surface:#1d1b20;--sdv3-on-surface-variant:#49454f;--sdv3-outline-variant:#cac4d0;--sdv3-font:"Roboto","Segoe UI",system-ui,-apple-system,"PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif;display:flex;flex-direction:column;gap:16px;padding:16px;border-radius:12px;background:var(--sdv3-surface-container-low);color:var(--sdv3-on-surface);font-family:var(--sdv3-font);font-size:14px;font-weight:400;line-height:1.43;letter-spacing:.25px;text-align:start;box-shadow:0 1px 2px rgba(0,0,0,.3),0 1px 3px 1px rgba(0,0,0,.15)}
body[data-ds-dark-theme] .sdv3-root{--sdv3-primary:#d0bcff;--sdv3-on-primary:#381e72;--sdv3-primary-container:#4f378b;--sdv3-on-primary-container:#eaddff;--sdv3-surface-container-low:#1d1b20;--sdv3-surface-container:#211f26;--sdv3-surface-container-high:#2b2930;--sdv3-on-surface:#e6e0e9;--sdv3-on-surface-variant:#cac4d0;--sdv3-outline-variant:#49454f;box-shadow:0 1px 3px rgba(0,0,0,.5),0 1px 2px rgba(0,0,0,.35)}
.sdv3-root *{box-sizing:border-box}
.sdv3-head{display:flex;align-items:center;gap:8px}
.sdv3-badge{display:inline-flex;align-items:center;gap:8px;height:32px;padding:0 12px;border-radius:8px;background:var(--sdv3-primary-container);color:var(--sdv3-on-primary-container);font-size:12px;font-weight:500;line-height:1;letter-spacing:.5px}
.sdv3-dot{width:8px;height:8px;border-radius:50%;background:var(--sdv3-primary);flex:none}
.sdv3-section{display:flex;flex-direction:column;gap:8px;min-width:0}
.sdv3-label{font-size:12px;font-weight:500;line-height:1.33;letter-spacing:.5px;color:var(--sdv3-on-surface-variant)}
.sdv3-chips{display:flex;flex-wrap:wrap;gap:8px;margin:0;padding:0;list-style:none}
.sdv3-chip{display:inline-flex;align-items:center;max-width:100%;height:32px;padding:0 12px;border:1px solid var(--sdv3-outline-variant);border-radius:8px;font-size:14px;font-weight:400;line-height:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.sdv3-notes{display:flex;flex-direction:column;gap:8px;margin:0;padding:0;list-style:none}
.sdv3-note{margin:0;padding:12px 16px;border-radius:12px;background:var(--sdv3-surface-container);font-size:14px;font-weight:400;line-height:1.43;letter-spacing:.25px;overflow-wrap:anywhere}
.sdv3-note b{display:inline-block;margin-right:8px;color:var(--sdv3-on-surface-variant);font-size:12px;font-weight:500;letter-spacing:.5px}
.sdv3-foot{margin:0;font-size:12px;font-weight:400;line-height:1.33;letter-spacing:.4px;color:var(--sdv3-on-surface-variant)}
`;

    /** Normalize a parsed decision record; tolerates every malformed shape. */
    function normalizeRecord(value) {
      const record = { status: 'chosen', title: '', selected: [], guidance: [], custom: '', images: [] };
      if (value === null || typeof value !== 'object' || Array.isArray(value)) return record;
      if (typeof value.status === 'string' && value.status !== '') record.status = value.status;
      if (typeof value.title === 'string') record.title = value.title;
      if (Array.isArray(value.selected)) {
        for (const item of value.selected) {
          if (item === null || typeof item !== 'object' || Array.isArray(item)) continue;
          const id = textOf(item.id);
          if (id === '') continue;
          const label = textOf(item.label);
          record.selected.push({ id, label: label === '' ? id : label });
        }
      }
      if (Array.isArray(value.guidance)) {
        for (const item of value.guidance) {
          if (item === null || typeof item !== 'object' || Array.isArray(item)) continue;
          const id = textOf(item.id);
          const text = textOf(item.text);
          if (id === '' || text === '') continue;
          const label = textOf(item.label);
          record.guidance.push({ id, label: label === '' ? id : label, text });
        }
      }
      if (Array.isArray(value.images)) {
        for (const item of value.images) {
          if (item === null || typeof item !== 'object' || Array.isArray(item)) continue;
          const mediaType = textOf(item.mediaType);
          if (mediaType === '') continue;
          const target = textOf(item.target);
          const label = textOf(item.label);
          const name = textOf(item.name);
          record.images.push({
            target: target === '' ? 'custom' : target,
            label,
            name: name === '' ? mediaType.replace('image/', '') : name,
          });
        }
      }
      if (typeof value.custom === 'string') record.custom = value.custom.trim();
      return record;
    }

    /** Parse the structured `card:` line, or the legacy plain-text receipt. */
    function parseDecisionRecord(raw) {
      if (typeof raw !== 'string' || raw === '') return normalizeRecord(undefined);
      const lines = raw.split('\n');
      for (const line of lines) {
        if (!line.startsWith('card: ')) continue;
        try {
          return normalizeRecord(JSON.parse(line.slice('card: '.length)));
        } catch (error) {
          break;
        }
      }
      const legacy = { status: 'chosen', selected: [], guidance: [], custom: '' };
      for (const line of lines) {
        if (line.startsWith('Selected: ')) {
          const body = line.slice('Selected: '.length).replace(/\.\s*$/, '');
          for (const part of body.split(', ')) {
            const match = /^(\S+) "(.*)"$/.exec(part.trim());
            if (match) legacy.selected.push({ id: match[1], label: match[2] });
          }
        } else if (line.startsWith('Custom direction: ')) {
          legacy.custom = line.slice('Custom direction: '.length).trim();
        } else if (line.startsWith('- ')) {
          const match = /^- (\S+) "(.*)": (.*)$/.exec(line);
          if (match) legacy.guidance.push({ id: match[1], label: match[2], text: match[3] });
        }
      }
      return normalizeRecord(legacy);
    }

    /** The rule that turns the plugin's wake-up user message into a structured node. */
    const DECISION_RULE = {
      id: DECISION_RULE_ID,
      order: 5,
      match(text, from) {
        if (from !== 0 || typeof text !== 'string') return undefined;
        const known = DECISION_MARKERS.some((marker) => text.startsWith(marker));
        if (!known) return undefined;
        return { id: DECISION_RULE_ID, start: 0, end: text.length, data: { kind: 'direction-decision' } };
      },
    };

    /** Compact M3-flavored receipt for the user-message bubble. */
    function DecisionRecordView(props) {
      const t = props.t;
      const record = React.useMemo(() => parseDecisionRecord(props.raw), [props.raw]);
      const pieces = [h('style', { key: 'sdv3-css' }, DECISION_RECORD_CSS)];
      pieces.push(
        h(
          'div',
          { key: 'head', className: 'sdv3-head' },
          h('span', { className: 'sdv3-badge' }, h('span', { className: 'sdv3-dot' }), t('submitted')),
        ),
      );
      if (record.selected.length > 0) {
        pieces.push(
          h(
            'div',
            { key: 'selected', className: 'sdv3-section' },
            h('span', { className: 'sdv3-label' }, t('selectedLabel')),
            h(
              'ul',
              { className: 'sdv3-chips' },
              record.selected.map((item) => h('li', { key: item.id, className: 'sdv3-chip' }, item.label)),
            ),
          ),
        );
      }
      if (record.guidance.length > 0) {
        pieces.push(
          h(
            'div',
            { key: 'guidance', className: 'sdv3-section' },
            h('span', { className: 'sdv3-label' }, t('guidanceLabel')),
            h(
              'ul',
              { className: 'sdv3-notes' },
              record.guidance.map((item) =>
                h('li', { key: item.id, className: 'sdv3-note' }, h('b', null, item.label), item.text),
              ),
            ),
          ),
        );
      }
      if (record.custom !== '') {
        pieces.push(
          h(
            'div',
            { key: 'custom', className: 'sdv3-section' },
            h('span', { className: 'sdv3-label' }, t('customLabel')),
            h('p', { className: 'sdv3-note' }, record.custom),
          ),
        );
      }
      if (record.images.length > 0) {
        pieces.push(
          h(
            'div',
            { key: 'images', className: 'sdv3-section' },
            h('span', { className: 'sdv3-label' }, t('imagesLabel')),
            h(
              'ul',
              { className: 'sdv3-chips' },
              record.images.map((image, index) =>
                h(
                  'li',
                  { key: `image-${index}`, className: 'sdv3-chip' },
                  (image.label !== '' ? image.label : t('customLabel')) + ' · ' + image.name,
                ),
              ),
            ),
          ),
        );
      }
      if (record.status === 'chosen') {
        pieces.push(h('p', { key: 'next', className: 'sdv3-foot' }, t('recordContinue')));
      }
      return h('div', { className: 'sdv3-root' }, ...pieces);
    }

    return {
      inject: ['actionCards', 'locale', 'slots'],
      apply(ctx) {
        ctx.effect(() => ctx.locale.register('smartDirection', { en, zh }), 'smart-direction: locale');
        ctx.effect(
          () =>
            ctx.actionCards.register({
              action: 'smart_direction',
              locale: 'smartDirection',
              Body: SmartDirectionCard,
            }),
          'smart-direction: card body',
        );

        // Structured record for the wake-up user message: rule + inline node renderer.
        let translate = (key) => key;
        try {
          translate = ctx.locale.bind('smartDirection');
        } catch (error) {
          // keep the raw-key fallback
        }
        let uiConversation;
        try {
          uiConversation = typeof ctx.get === 'function' ? ctx.get('uiConversation') : undefined;
        } catch (error) {
          uiConversation = undefined;
        }
        if (uiConversation !== undefined && uiConversation.userText !== undefined) {
          try {
            ctx.effect(() => uiConversation.userText.register(DECISION_RULE), 'smart-direction: decision rule');
            ctx.effect(
              () =>
                ctx.slots.inject('conversation.user.text.node', () =>
                  ctx.slots.register({ name: 'conversation.user.text.node', key: DECISION_RULE_ID }, (props) =>
                    h(DecisionRecordView, { ...props, t: translate }),
                  ),
                ),
              'smart-direction: decision renderer',
            );
          } catch (error) {
            try {
              console.warn('smart-direction: decision record renderer unavailable', error);
            } catch (ignored) {
              // ignore logging failures
            }
          }
        }
      },
    };
    })();

    // ------------------------------------------------------------------
    // Half 2: per-session setup wizard and checkpoint strip in the dock.
    // ------------------------------------------------------------------
    const checkpointHalf = (() => {
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
    })();

    return {
      // The remote namespaces are injected property paths (Cordis service proxies):
      // a plugin must declare 'remote.commands' before reading ctx.remote.commands.
      inject: ['actionCards', 'locale', 'remote', 'remote.commands', 'slots'],
      apply(ctx) {
        smartDirectionHalf.apply(ctx);
        checkpointHalf.apply(ctx);
      },
    };
  },
});
