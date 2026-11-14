// 启动预设（presets）：一个预设 = 一套「游戏路径 + 1 个 host + 若干 guest」的多人测试方案。
//
// 存在 <project>/.mcdev/launch-presets.json，完全自包含（不读取 .mcdev.json）。
// - gameExe：该预设使用的 Minecraft.Windows.exe（不同机器安装位置可能不同）
// - host：世界 / 行为包 / 资源包 / 皮肤 / 纤细模型
// - guests：只配置皮肤 / 纤细模型（世界与包由 host 决定）
//
// 只依赖 Node 内置模块。

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const MAX_PRESETS = 30;
const MAX_GUESTS = 7;
const DEFAULT_PRESET_NAME = '默认预设';

/** 预设文件路径。 */
export function presetsPath(projectDir) {
  return path.join(projectDir, '.mcdev', 'launch-presets.json');
}

function cleanString(value, maxLength) {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, maxLength);
}

/** 包白名单：null = 工程包全部；数组 = 精确选择。 */
export function cleanPackList(value) {
  if (value === null || value === undefined) return null;
  if (!Array.isArray(value)) return null;
  const out = [];
  const seen = new Set();
  for (const item of value.slice(0, 200)) {
    if (typeof item !== 'string') continue;
    const uuid = item.trim();
    if (uuid === '' || seen.has(uuid)) continue;
    seen.add(uuid);
    out.push(uuid);
  }
  return out;
}

function newId(prefix) {
  try {
    return `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
  } catch {
    return `${prefix}-${Date.now().toString(36)}`;
  }
}

/** 归一化 host 配置。 */
export function normalizeHost(raw) {
  const base = { world: '', behaviorPacks: null, resourcePacks: null, skin: '', slim: false };
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return base;
  base.world = cleanString(raw.world, 64);
  base.behaviorPacks = cleanPackList(raw.behaviorPacks);
  base.resourcePacks = cleanPackList(raw.resourcePacks);
  base.skin = cleanString(raw.skin, 1024);
  base.slim = raw.slim === true;
  return base;
}

/** 归一化 guest 配置（只允许皮肤与纤细模型）。 */
export function normalizeGuest(raw, index) {
  const base = { id: '', name: '', skin: '', slim: false };
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    base.id = newId('g');
    base.name = `Guest ${index + 1}`;
    return base;
  }
  base.id = cleanString(raw.id, 40) || newId('g');
  base.name = cleanString(raw.name, 60) || `Guest ${index + 1}`;
  base.skin = cleanString(raw.skin, 1024);
  base.slim = raw.slim === true;
  return base;
}

/** 归一化一个预设。 */
export function normalizePreset(raw) {
  const preset = { id: '', name: DEFAULT_PRESET_NAME, gameExe: '', host: normalizeHost(null), guests: [] };
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    preset.id = newId('p');
    return preset;
  }
  preset.id = cleanString(raw.id, 40) || newId('p');
  preset.name = cleanString(raw.name, 60) || DEFAULT_PRESET_NAME;
  preset.gameExe = cleanString(raw.gameExe, 1024);
  preset.host = normalizeHost(raw.host);
  const guests = Array.isArray(raw.guests) ? raw.guests.slice(0, MAX_GUESTS) : [];
  preset.guests = guests.map((guest, index) => normalizeGuest(guest, index));
  const seen = new Set();
  for (const guest of preset.guests) {
    if (seen.has(guest.id)) guest.id = newId('g');
    seen.add(guest.id);
  }
  return preset;
}

/** 一份空的预设集合。 */
export function emptyPresets() {
  return { version: 1, activeId: '', presets: [] };
}

/** 归一化预设集合：保证 activeId 有效。 */
export function normalizePresets(raw) {
  const out = emptyPresets();
  const source = raw !== null && typeof raw === 'object' && Array.isArray(raw.presets) ? raw.presets.slice(0, MAX_PRESETS) : [];
  const seen = new Set();
  for (const item of source) {
    const preset = normalizePreset(item);
    if (seen.has(preset.id)) preset.id = newId('p');
    seen.add(preset.id);
    out.presets.push(preset);
  }
  out.activeId = cleanString(raw !== null && typeof raw === 'object' ? raw.activeId : '', 40);
  if (out.presets.length === 0 || !seen.has(out.activeId)) {
    out.activeId = out.presets.length > 0 ? out.presets[0].id : '';
  }
  return out;
}

/** 读取预设集合；文件缺失时返回 null。 */
export function readPresets(projectDir) {
  try {
    const file = presetsPath(projectDir);
    if (!fs.existsSync(file)) return null;
    const data = JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
    return normalizePresets(data);
  } catch {
    return null;
  }
}

/** 写回预设集合（写前备份 .bak）。 */
export function writePresets(projectDir, state) {
  const file = presetsPath(projectDir);
  const normalized = normalizePresets(state);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  let backupPath = '';
  if (fs.existsSync(file)) {
    backupPath = `${file}.bak`;
    try {
      fs.copyFileSync(file, backupPath);
    } catch {
      backupPath = '';
    }
  }
  fs.writeFileSync(file, `${JSON.stringify(normalized, null, 2)}\n`, 'utf8');
  return { path: file, state: normalized, backupPath };
}

/**
 * 构造内置默认预设：世界/皮肤/gameExe 取自当前工程与客户端能检索到的内容。
 * @param {{gameExe?:string, world?:string, skin?:string, slim?:boolean}} seed
 */
export function defaultPreset(seed = {}) {
  return normalizePreset({
    name: DEFAULT_PRESET_NAME,
    gameExe: seed.gameExe || '',
    host: {
      world: seed.world || '',
      behaviorPacks: null,
      resourcePacks: null,
      skin: seed.skin || '',
      slim: seed.slim === true,
    },
    guests: [],
  });
}

/** 找到指定 id 的预设（找不到返回 null；id 为空时返回当前激活预设）。 */
export function findPreset(state, id) {
  if (state === null || state === undefined || !Array.isArray(state.presets)) return null;
  const wanted = cleanString(id, 40);
  if (wanted === '') {
    return state.presets.find((preset) => preset.id === state.activeId) || state.presets[0] || null;
  }
  return state.presets.find((preset) => preset.id === wanted) || null;
}

/** upsert 一个预设；按 id 覆盖。 */
export function upsertPreset(state, rawPreset) {
  const preset = normalizePreset(rawPreset);
  const next = normalizePresets(state);
  const index = next.presets.findIndex((item) => item.id === preset.id);
  if (index >= 0) next.presets[index] = preset;
  else next.presets.push(preset);
  if (next.activeId === '') next.activeId = preset.id;
  return { state: normalizePresets(next), preset, created: index < 0 };
}

/** 删除一个预设；至少保留一个。 */
export function removePreset(state, id) {
  const next = normalizePresets(state);
  const wanted = cleanString(id, 40);
  const index = next.presets.findIndex((item) => item.id === wanted);
  if (index < 0) throw new Error(`预设不存在：${wanted || id}`);
  if (next.presets.length <= 1) throw new Error('至少保留一个启动预设');
  next.presets.splice(index, 1);
  if (next.activeId === wanted) next.activeId = next.presets[0].id;
  return normalizePresets(next);
}

/** 设置当前激活预设。 */
export function setActivePreset(state, id) {
  const next = normalizePresets(state);
  const wanted = cleanString(id, 40);
  if (!next.presets.some((preset) => preset.id === wanted)) throw new Error(`预设不存在：${wanted || id}`);
  next.activeId = wanted;
  return next;
}

/**
 * 从预设解析启动参数（完全来自预设，不再读取 .mcdev.json）。
 * 未选世界时回退到默认开发世界名。
 */
export function resolveHostLaunch(preset, defaultWorld = 'MC_DEV_WORLD') {
  const host = normalizeHost(preset !== null && preset !== undefined ? preset.host : null);
  return {
    world: host.world !== '' ? host.world : defaultWorld,
    behaviorPacks: host.behaviorPacks,
    resourcePacks: host.resourcePacks,
    skin: host.skin,
    slim: host.slim === true,
  };
}
