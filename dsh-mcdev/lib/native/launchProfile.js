// 启动配置（launch profile）：本插件自有的「世界 / 行为包 / 资源包 / 皮肤」选择。
//
// 存在 <project>/.mcdev/launch-profile.json，不修改用户的 .mcdev.json：
// - world          要启动的世界文件夹名（空 = 跟随 .mcdev.json）
// - behaviorPacks  行为包 uuid 白名单；null = 工程解析出的全部行为包
// - resourcePacks  资源包 uuid 白名单；null = 工程解析出的全部资源包
// - skin           皮肤 PNG 绝对路径（空 = 默认皮肤）
// - slim           是否纤细手臂
// - skinsDir       用户指定的皮肤目录（供面板枚举 PNG）
//
// 只依赖 Node 内置模块。

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  BRIDGE_PACK_UUID,
  behaviorPacksDir,
  collectProjectPacks,
  resourcePacksDir,
  scanPackManifests,
} from './bridgePack.js';

const MAX_PACK_SELECTIONS = 200;

/** 启动配置文件名（相对工程目录）。 */
export function launchProfilePath(projectDir) {
  return path.join(projectDir, '.mcdev', 'launch-profile.json');
}

/** 一份空的启动配置。 */
export function emptyLaunchProfile() {
  return { world: '', behaviorPacks: null, resourcePacks: null, skin: '', slim: false, skinsDir: '' };
}

function cleanString(value, maxLength) {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, maxLength);
}

function cleanPackList(value) {
  if (value === null || value === undefined) return null;
  if (!Array.isArray(value)) return null;
  const out = [];
  const seen = new Set();
  for (const item of value.slice(0, MAX_PACK_SELECTIONS)) {
    if (typeof item !== 'string') continue;
    const uuid = item.trim();
    if (uuid === '' || seen.has(uuid)) continue;
    seen.add(uuid);
    out.push(uuid);
  }
  return out;
}

/** 归一化任意输入为合法的启动配置（未知字段丢弃，坏值回退默认）。 */
export function normalizeLaunchProfile(raw) {
  const base = emptyLaunchProfile();
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return base;
  base.world = cleanString(raw.world, 64);
  base.behaviorPacks = cleanPackList(raw.behaviorPacks);
  base.resourcePacks = cleanPackList(raw.resourcePacks);
  base.skin = cleanString(raw.skin, 1024);
  base.slim = raw.slim === true;
  base.skinsDir = cleanString(raw.skinsDir, 1024);
  return base;
}

/** 读取启动配置（文件缺失/损坏时返回空配置，不抛错）。 */
export function readLaunchProfile(projectDir) {
  try {
    const file = launchProfilePath(projectDir);
    if (!fs.existsSync(file)) return emptyLaunchProfile();
    const data = JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
    return normalizeLaunchProfile(data);
  } catch {
    return emptyLaunchProfile();
  }
}

/**
 * 合并写回启动配置（写前备份为 .bak）。
 * @returns {{path:string, profile:object, backupPath:string}}
 */
export function writeLaunchProfile(projectDir, patch) {
  const file = launchProfilePath(projectDir);
  const current = readLaunchProfile(projectDir);
  const merged = normalizeLaunchProfile({ ...current, ...(patch && typeof patch === 'object' ? patch : {}) });
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
  fs.writeFileSync(file, `${JSON.stringify(merged, null, 2)}\n`, 'utf8');
  return { path: file, profile: merged, backupPath };
}

/** 一条可选包记录（行为包或资源包）。 */
function packEntry(kind, source, dir, manifest) {
  return {
    uuid: manifest.uuid,
    version: manifest.version,
    name: manifest.name || path.basename(dir),
    kind,
    source,
    dir,
  };
}

/**
 * 工程包 + 全局包的完整清单（bridge 包不列出来，它是插件自动附加的）。
 * @param {string} projectDir - 工程目录。
 * @param {object} [config] - .mcdev.json 内容（可选）。
 */
export function packCatalog(projectDir, config = {}) {
  const project = collectProjectPacks(projectDir, config);
  const behavior = [];
  const resource = [];
  const seen = new Set();
  const push = (list, entry) => {
    const key = `${entry.kind}:${entry.uuid}`;
    if (seen.has(key) || entry.uuid === BRIDGE_PACK_UUID) return;
    seen.add(key);
    list.push(entry);
  };
  for (const item of project.behavior) push(behavior, packEntry('behavior', 'project', item.source, item));
  for (const item of project.resource) push(resource, packEntry('resource', 'project', item.source, item));
  for (const item of scanPackManifests(behaviorPacksDir())) push(behavior, packEntry('behavior', 'global', item.dir, item));
  for (const item of scanPackManifests(resourcePacksDir())) push(resource, packEntry('resource', 'global', item.dir, item));
  return { behavior, resource, warnings: project.warnings };
}

/**
 * 把启动配置里的白名单解析成实际要附加的包清单。
 * - null/undefined：默认 = 工程解析出的全部包；
 * - 数组：按 uuid 从清单里选（可以选到全局包），未找到的 uuid 记入 missing。
 * @returns {{behavior:object[], resource:object[], missing:string[]}}
 */
export function resolveSelectedPacks(catalog, selection = {}) {
  const resolve = (entries, selected) => {
    if (selected === null || selected === undefined) return entries.filter((entry) => entry.source === 'project');
    const byUuid = new Map(entries.map((entry) => [entry.uuid, entry]));
    const picked = [];
    const missing = [];
    for (const uuid of selected) {
      const entry = byUuid.get(uuid);
      if (entry) picked.push(entry);
      else missing.push(uuid);
    }
    return { picked, missing };
  };
  const behavior = resolve(catalog.behavior || [], selection.behaviorPacks);
  const resource = resolve(catalog.resource || [], selection.resourcePacks);
  const missing = [
    ...(Array.isArray(behavior) ? [] : behavior.missing),
    ...(Array.isArray(resource) ? [] : resource.missing),
  ];
  return {
    behavior: Array.isArray(behavior) ? behavior : behavior.picked,
    resource: Array.isArray(resource) ? resource : resource.picked,
    missing,
  };
}

/** 皮肤目录候选：用户指定目录、工程 .mcdev/skins、用户图片目录。 */
export function skinDirsOf(projectDir, profile = {}) {
  const dirs = [];
  const add = (dir) => {
    const value = cleanString(dir, 1024);
    if (value === '' || dirs.includes(value)) return;
    dirs.push(value);
  };
  add(profile.skinsDir);
  add(path.join(projectDir, '.mcdev', 'skins'));
  try {
    add(path.join(os.homedir(), 'Pictures', 'skins'));
  } catch {
    /* 没有家目录时跳过 */
  }
  return dirs;
}

/**
 * 枚举可选的皮肤 PNG。
 * @returns {{dirs:{dir:string,exists:boolean,files:object[]}[], files:object[]}}
 */
export function skinFiles(projectDir, profile = {}) {
  const dirs = [];
  const files = [];
  const seen = new Set();
  for (const dir of skinDirsOf(projectDir, profile)) {
    let exists = false;
    let entries = [];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
      exists = true;
    } catch {
      entries = [];
    }
    const local = [];
    for (const entry of entries) {
      if (!entry.isFile()) continue;
      if (!/\.png$/i.test(entry.name)) continue;
      const file = path.join(dir, entry.name);
      if (seen.has(file)) continue;
      seen.add(file);
      let size = 0;
      let mtime = 0;
      try {
        const stat = fs.statSync(file);
        size = stat.size;
        mtime = stat.mtimeMs;
      } catch {
        /* 统计失败不影响列出 */
      }
      local.push({ path: file, name: entry.name, size, mtime, dir });
    }
    local.sort((a, b) => a.name.localeCompare(b.name));
    dirs.push({ dir, exists, files: local });
    files.push(...local);
  }
  return { dirs, files };
}

/** 由启动配置解析一次启动实际使用的世界名。 */
export function worldNameOf(config = {}, profile = {}) {
  const explicit = cleanString(profile.world, 64);
  if (explicit !== '') return explicit;
  return String(config.world_folder_name || config.world_name || 'MC_DEV_WORLD');
}
