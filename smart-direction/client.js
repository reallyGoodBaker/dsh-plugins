window.__ModuleLoader__.load({
  id: '@local/dsh-smart-direction',
  factory(require) {
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
  },
});
