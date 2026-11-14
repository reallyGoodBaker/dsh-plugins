// 启动预设用的「包 / 皮肤」目录与导入。
//
// - 工程包：<project>/bp、<project>/rp（约定）
// - 全局包：%APPDATA%\MinecraftPE_Netease\games\com.netease\{behavior,resource}_packs
// - 导入包：<project>/.mcdev/packs/{behavior,resource}/<name>
// - 皮肤：<project>/.mcdev/skins/*.png（通过文件夹导入）
//
// 不再读取 .mcdev.json：启动预设是完全自包含的。
// 只依赖 Node 内置模块。

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  BRIDGE_PACK_UUID,
  behaviorPacksDir,
  minecraftRootDir,
  readPackManifest,
  resourcePacksDir,
  scanPackManifests,
} from './bridgePack.js';

const MAX_PACK_SELECTIONS = 200;
const IMPORT_DIR = '.mcdev';
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** 皮肤文件必须是真实 PNG（4/8 字节的假文件会让游戏进程直接崩溃）。 */
export function isPngFile(file) {
  try {
    const fd = fs.openSync(file, 'r');
    const header = Buffer.alloc(8);
    fs.readSync(fd, header, 0, 8, 0);
    fs.closeSync(fd);
    return header.equals(PNG_SIGNATURE);
  } catch {
    return false;
  }
}

/** 导入包目录（kind: behavior | resource）。 */
export function importedPacksDir(projectDir, kind) {
  const name = kind === 'resource' ? 'resource' : 'behavior';
  return path.join(projectDir, IMPORT_DIR, 'packs', name);
}

/** 导入皮肤目录。 */
export function importedSkinsDir(projectDir) {
  return path.join(projectDir, IMPORT_DIR, 'skins');
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

/** 工程约定包（<project>/bp、<project>/rp）。 */
function projectPacks(projectDir) {
  const behavior = [];
  const resource = [];
  const add = (list, kind, dir) => {
    const manifest = readPackManifest(dir);
    if (manifest) list.push(packEntry(kind, 'project', dir, manifest));
  };
  add(behavior, 'behavior', path.join(projectDir, 'bp'));
  add(behavior, 'behavior', path.join(projectDir, 'behavior_pack'));
  add(resource, 'resource', path.join(projectDir, 'rp'));
  add(resource, 'resource', path.join(projectDir, 'resource_pack'));
  return { behavior, resource };
}

/**
 * 完整可选包清单（工程包 + 导入包 + 全局包；bridge 包不列出）。
 * @param {string} projectDir
 * @returns {{behavior:object[], resource:object[], warnings:string[]}}
 */
export function packCatalog(projectDir) {
  const behavior = [];
  const resource = [];
  const seen = new Set();
  const push = (list, entry) => {
    const key = `${entry.kind}:${entry.uuid}`;
    if (seen.has(key) || entry.uuid === BRIDGE_PACK_UUID) return;
    seen.add(key);
    list.push(entry);
  };
  const project = projectPacks(projectDir);
  for (const entry of project.behavior) push(behavior, entry);
  for (const entry of project.resource) push(resource, entry);
  for (const entry of scanPackManifests(importedPacksDir(projectDir, 'behavior'))) {
    push(behavior, packEntry('behavior', 'imported', entry.dir, entry));
  }
  for (const entry of scanPackManifests(importedPacksDir(projectDir, 'resource'))) {
    push(resource, packEntry('resource', 'imported', entry.dir, entry));
  }
  for (const entry of scanPackManifests(behaviorPacksDir())) {
    push(behavior, packEntry('behavior', 'global', entry.dir, entry));
  }
  for (const entry of scanPackManifests(resourcePacksDir())) {
    push(resource, packEntry('resource', 'global', entry.dir, entry));
  }
  const warnings = [];
  if (behavior.length === 0) warnings.push('没有找到可选行为包：请把行为包放进 <工程>/bp，或在设置页导入行为包文件夹');
  if (resource.length === 0) warnings.push('没有找到可选资源包：请把资源包放进 <工程>/rp，或在设置页导入资源包文件夹');
  return { behavior, resource, warnings };
}

/**
 * 解析预设里的包白名单。
 * - null：工程包（bp/rp）全部；
 * - 数组：按 uuid 精确选择（工程/导入/全局均可）。
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

/** 世界名校验（导入目录/新建世界共用）。 */
export function isValidWorldName(name) {
  const value = cleanString(name, 64);
  if (value === '' || value.length > 64) return false;
  if (value === '.' || value === '..') return false;
  // eslint-disable-next-line no-control-regex
  return !/[\\/:*?"<>|\u0000-\u001f]/.test(value);
}

function uniqueTarget(baseDir, folderName) {
  const safe = cleanString(folderName, 64).replace(/[\\/:*?"<>|]/g, '_') || 'pack';
  let target = path.join(baseDir, safe);
  let index = 2;
  while (fs.existsSync(target)) {
    target = path.join(baseDir, `${safe}-${index}`);
    index += 1;
  }
  return target;
}

function copyDirRecursive(source, target) {
  fs.mkdirSync(target, { recursive: true });
  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    const from = path.join(source, entry.name);
    const to = path.join(target, entry.name);
    if (entry.isDirectory()) copyDirRecursive(from, to);
    else if (entry.isFile()) fs.copyFileSync(from, to);
  }
}

/**
 * 导入一个行为包/资源包文件夹：校验 manifest，复制到 <project>/.mcdev/packs/<kind>/<name>。
 * @param {string} projectDir
 * @param {'behavior'|'resource'} kind
 * @param {string} sourceDir - 用户通过 filepicker 选择的文件夹。
 * @returns {{pack:object, dir:string}}
 */
export function importPack(projectDir, kind, sourceDir) {
  const source = cleanString(sourceDir, 1024);
  if (source === '') throw new Error('没有选择要导入的文件夹');
  const manifest = readPackManifest(source);
  if (!manifest) throw new Error('所选文件夹不是有效的行为包/资源包：缺少 manifest.json（或 header.uuid）');
  const baseDir = importedPacksDir(projectDir, kind);
  fs.mkdirSync(baseDir, { recursive: true });
  const target = uniqueTarget(baseDir, path.basename(source));
  copyDirRecursive(source, target);
  return { pack: packEntry(kind, 'imported', target, manifest), dir: target };
}

/**
 * 扫描用户机器上已有的皮肤 PNG（只读，用于默认预设的初始皮肤）。
 * 顺序：工程导入皮肤 -> 用户图片目录 -> 客户端 skin_packs。
 * @returns {string} 第一个有效 PNG 的绝对路径，找不到返回 ''。
 */
export function discoverSkinFile(projectDir) {
  const imported = skinFiles(projectDir).files;
  if (imported.length > 0) return imported[0].path;
  const roots = [];
  try {
    roots.push(path.join(os.homedir(), 'Pictures', 'skins'));
  } catch {
    /* 没有家目录时跳过 */
  }
  roots.push(path.join(minecraftRootDir(), 'games', 'com.netease', 'skin_packs'));
  const walk = (dir, depth) => {
    if (depth > 3) return '';
    let entries = [];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return '';
    }
    for (const entry of entries) {
      if (entry.isFile() && /\.png$/i.test(entry.name)) {
        const file = path.join(dir, entry.name);
        if (isPngFile(file)) return file;
      }
    }
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const found = walk(path.join(dir, entry.name), depth + 1);
      if (found !== '') return found;
    }
    return '';
  };
  for (const root of roots) {
    const found = walk(root, 0);
    if (found !== '') return found;
  }
  return '';
}

/** 皮肤文件列表（只列 <project>/.mcdev/skins 下的 PNG）。 */
export function skinFiles(projectDir) {
  const dir = importedSkinsDir(projectDir);
  const files = [];
  let entries = [];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    entries = [];
  }
  for (const entry of entries) {
    if (!entry.isFile() || !/\.png$/i.test(entry.name)) continue;
    const file = path.join(dir, entry.name);
    let size = 0;
    let mtime = 0;
    try {
      const stat = fs.statSync(file);
      size = stat.size;
      mtime = stat.mtimeMs;
    } catch {
      /* 统计失败不影响列出 */
    }
    files.push({ path: file, name: entry.name, size, mtime, dir });
  }
  files.sort((a, b) => a.name.localeCompare(b.name));
  return { dir, exists: fs.existsSync(dir), files };
}

/**
 * 导入一个皮肤文件夹：把其中的 PNG 复制到 <project>/.mcdev/skins/。
 * @returns {{count:number, files:object[]}}
 */
export function importSkins(projectDir, sourceDir) {
  const source = cleanString(sourceDir, 1024);
  if (source === '') throw new Error('没有选择要导入的皮肤文件夹');
  let entries = [];
  try {
    entries = fs.readdirSync(source, { withFileTypes: true });
  } catch (error) {
    throw new Error(`读取皮肤文件夹失败：${error instanceof Error ? error.message : String(error)}`);
  }
  const pngs = entries.filter((entry) => entry.isFile() && /\.png$/i.test(entry.name) && isPngFile(path.join(source, entry.name)));
  if (pngs.length === 0) throw new Error('所选文件夹里没有有效的 PNG 皮肤文件（不是 PNG 或已损坏）');
  const target = importedSkinsDir(projectDir);
  fs.mkdirSync(target, { recursive: true });
  for (const entry of pngs) {
    let name = entry.name;
    let dest = path.join(target, name);
    let index = 2;
    while (fs.existsSync(dest)) {
      const ext = path.extname(entry.name);
      name = `${path.basename(entry.name, ext)}-${index}${ext}`;
      dest = path.join(target, name);
      index += 1;
    }
    fs.copyFileSync(path.join(source, entry.name), dest);
  }
  return skinFiles(projectDir);
}
