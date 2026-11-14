// native provider 的启动侧：发现游戏 exe、确保开发世界、写 dev_config.cppconfig、spawn/stop 游戏进程。
//
// 官方事实（本机实测）：
// - 启动只需：`Minecraft.Windows.exe chatExtension=false config="<world>\dev_config.cppconfig"`
// - dev_config.cppconfig 是纯 JSON：player_info / room_info / skin_info / world_info.level_id
// - 开发世界就是 %APPDATA%\MinecraftPE_Netease\minecraftWorlds\<name>（含 level.dat、世界清单）
//
// 只依赖 Node 内置模块；配置读取见 ./util.js。

import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

import { configPathOf, findGameVersions, readConfigWithDefaults } from './util.js';
import { isProcessAlive, killProcessTree, waitFor } from './util.js';
import { minecraftRootDir, worldTemplateDirs, worldsDir, locksDir } from './bridgePack.js';

export { configPathOf, readConfigWithDefaults, isProcessAlive, killProcessTree };

/** 默认开发世界名。 */
export const DEFAULT_WORLD_NAME = 'MC_DEV_WORLD';

/**
 * 一个开发世界同一时间只允许一个 native provider 会话操作（P0：并发会搞崩世界 DB）。
 * 锁文件放在 %APPDATA%\MinecraftPE_Netease\.dsh-mcdev\locks\<worldName>.lock，
 * 内容 { pid, startedAt, projectDir }；进程已死的锁视为过期可接管。
 */
export function worldLockPath(worldDir) {
  const worldName = path.basename(worldDir) || 'world';
  return path.join(locksDir(), `${worldName}.lock`);
}

function readLockFile(lockPath) {
  try {
    if (!fs.existsSync(lockPath)) return null;
    const data = JSON.parse(fs.readFileSync(lockPath, 'utf8').replace(/^\uFEFF/, ''));
    if (!data || typeof data !== 'object') return null;
    return data;
  } catch {
    return null;
  }
}

/**
 * 获取开发世界锁（同进程重复调用直接复用）。
 * @returns {{path:string, pid:number, startedAt:number, tookOver:boolean}}
 */
export function acquireWorldLock(worldDir, options = {}) {
  const lockPath = worldLockPath(worldDir);
  const pid = Number(options.pid) || process.pid;
  const existing = readLockFile(lockPath);
  let tookOver = false;
  if (existing) {
    const existingPid = Number(existing.pid) || 0;
    if (existingPid && existingPid !== pid && isProcessAlive(existingPid)) {
      throw new Error(
        `开发世界「${path.basename(worldDir)}」已被另一个 native provider 占用（pid=${existingPid}，启动于 ${existing.startedAt || '?'}）。` +
          '同一开发世界不能并发启动两个实例（会破坏世界 DB）。请先停止该会话，或等待其退出后重试。',
      );
    }
    if (existingPid && existingPid !== pid) tookOver = true;
  }
  fs.mkdirSync(path.dirname(lockPath), { recursive: true });
  const payload = { pid, startedAt: Date.now(), projectDir: options.projectDir || '' };
  const tempPath = `${lockPath}.${pid}.tmp`;
  fs.writeFileSync(tempPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  fs.renameSync(tempPath, lockPath);
  return { path: lockPath, pid, startedAt: payload.startedAt, tookOver, worldDir };
}

/** 释放开发世界锁（只删除自己 pid 持有的锁）。 */
export function releaseWorldLock(worldDir, options = {}) {
  const lockPath = worldLockPath(worldDir);
  const pid = Number(options.pid) || process.pid;
  const existing = readLockFile(lockPath);
  if (!existing) return false;
  if (Number(existing.pid) !== pid) return false;
  try {
    fs.unlinkSync(lockPath);
    return true;
  } catch {
    return false;
  }
}

/** 由 .mcdev.json 解析开发世界目录。 */
export function worldDirOf(projectDir, config = {}) {
  const name = String(config.world_folder_name || config.world_name || DEFAULT_WORLD_NAME);
  return path.join(worldsDir(), name);
}

/** 世界内的 dev_config.cppconfig 路径。 */
export function cppconfigPathOf(worldDir) {
  return path.join(worldDir, 'dev_config.cppconfig');
}

/** 游戏版本列表（新到旧）与选中 exe。 */
export function discoverGame(config = {}) {
  const { baseDir, versions } = findGameVersions();
  let exe = '';
  let version = '';
  const configured = String(config.game_executable_path || '');
  if (configured && fs.existsSync(configured)) {
    exe = configured;
    const match = /[\\/]([^\\/]+)[\\/]Minecraft\.Windows\.exe$/i.exec(configured);
    version = match ? match[1] : '';
  } else if (versions.length) {
    exe = versions[0].exe;
    version = versions[0].version;
  }
  return {
    baseDir,
    exe: exe || undefined,
    version: version || undefined,
    versions: versions.map((item) => item.version),
  };
}

/** 递归复制目录（不依赖 fs.cpSync，兼容较老的 Electron Node）。 */
function copyDirRecursive(source, target) {
  fs.mkdirSync(target, { recursive: true });
  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    const from = path.join(source, entry.name);
    const to = path.join(target, entry.name);
    if (entry.isDirectory()) copyDirRecursive(from, to);
    else if (entry.isFile()) fs.copyFileSync(from, to);
  }
}

/** 找出第一个可用的世界模板目录（含 level.dat 的子目录）。 */
function findWorldTemplate() {
  for (const base of worldTemplateDirs()) {
    if (!fs.existsSync(base)) continue;
    let entries = [];
    try {
      entries = fs.readdirSync(base, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const dir = path.join(base, entry.name);
      if (fs.existsSync(path.join(dir, 'level.dat'))) return dir;
    }
  }
  return '';
}

/**
 * 确保开发世界存在。
 * 已存在（含 level.dat）直接复用；不存在时尝试从官方世界模板复制。
 * @returns {{worldDir:string, created:boolean, template?:string, worldName:string}}
 */
export function ensureDevWorld(projectDir, config = {}) {
  const worldName = String(config.world_folder_name || config.world_name || DEFAULT_WORLD_NAME);
  const worldDir = worldDirOf(projectDir, config);
  const levelDat = path.join(worldDir, 'level.dat');
  if (fs.existsSync(levelDat)) {
    return { worldDir, created: false, worldName };
  }
  const template = findWorldTemplate();
  if (!template) {
    throw new Error(
      `开发世界不存在且找不到可复制的世界模板：${worldDir}。请先用 MC Studio/官方启动器创建一次开发世界（world_folder_name=${worldName}）后重试。`,
    );
  }
  fs.mkdirSync(path.dirname(worldDir), { recursive: true });
  copyDirRecursive(template, worldDir);
  try {
    fs.writeFileSync(path.join(worldDir, 'levelname.txt'), worldName, 'utf8');
  } catch {
    /* levelname.txt 不是必需 */
  }
  return { worldDir, created: true, template, worldName };
}

/**
 * 写 dev_config.cppconfig（保留旧文件为 .bak）。
 * @returns {{path:string, backupPath:string, config:object}}
 */
export function writeDevConfig(worldDir, config = {}) {
  const cppconfigPath = cppconfigPathOf(worldDir);
  fs.mkdirSync(worldDir, { recursive: true });
  const skinInfo = config.skin_info && typeof config.skin_info === 'object' ? config.skin_info : {};
  const worldName = String(config.world_folder_name || config.world_name || DEFAULT_WORLD_NAME);
  const devConfig = {
    player_info: { urs: '', user_id: 0, user_name: 'developer' },
    room_info: {},
    skin_info: { skin: String(skinInfo.skin || ''), slim: Boolean(skinInfo.slim) },
    world_info: { level_id: worldName },
  };
  let backupPath = '';
  if (fs.existsSync(cppconfigPath)) {
    backupPath = `${cppconfigPath}.bak`;
    try {
      fs.copyFileSync(cppconfigPath, backupPath);
    } catch {
      backupPath = '';
    }
  }
  fs.writeFileSync(cppconfigPath, `${JSON.stringify(devConfig, null, 4)}\n`, 'utf8');
  return { path: cppconfigPath, backupPath, config: devConfig };
}

/**
 * 重置开发世界（start({reset:true}) 用）：
 * - 只有能找到官方世界模板时才重建（把旧世界改名为 <world>.bak-<时间戳> 保留，不直接删除）；
 * - 找不到模板则保留旧世界并返回原因（由调用方记 warning），不会清空世界。
 * @returns {{reset:boolean, reason?:string, backupDir?:string, worldDir:string}}
 */
export function resetDevWorld(projectDir, config = {}) {
  const worldDir = worldDirOf(projectDir, config);
  const worldName = String(config.world_folder_name || config.world_name || DEFAULT_WORLD_NAME);
  const template = findWorldTemplate();
  if (!template) {
    return { reset: false, reason: '找不到官方世界模板，无法重建世界；已保留现有世界（不会清空）', worldDir };
  }
  let backupDir = '';
  if (fs.existsSync(worldDir)) {
    backupDir = `${worldDir}.bak-${Date.now()}`;
    fs.renameSync(worldDir, backupDir);
  }
  fs.mkdirSync(path.dirname(worldDir), { recursive: true });
  copyDirRecursive(template, worldDir);
  try {
    fs.writeFileSync(path.join(worldDir, 'levelname.txt'), worldName, 'utf8');
  } catch {
    /* levelname.txt 不是必需 */
  }
  return { reset: true, backupDir, worldDir };
}

/**
 * 启动游戏进程。
 * @param {{exe:string, cppconfigPath:string, extraArgs?:string[], detached?:boolean}} options
 * @returns {import('node:child_process').ChildProcess}
 */
export function spawnGame(options) {
  const { exe, cppconfigPath } = options;
  if (!exe || !fs.existsSync(exe)) throw new Error(`游戏可执行文件不存在：${exe || '<空>'}`);
  if (!cppconfigPath || !fs.existsSync(cppconfigPath)) throw new Error(`dev_config.cppconfig 不存在：${cppconfigPath || '<空>'}`);
  const args = ['chatExtension=false', `config=${cppconfigPath}`, ...(options.extraArgs || [])];
  const detached = Boolean(options.detached);
  const child = spawn(exe, args, {
    cwd: path.dirname(exe),
    // 注意：不要设置 windowsHide=true——它会给 GUI 进程传 STARTF_USESHOWWINDOW/SW_HIDE，
    // 实测会导致游戏主窗口不可见（EnumWindows/MainWindowHandle 都拿不到），截图失败。
    windowsHide: false,
    stdio: 'ignore',
    detached,
  });
  // detached 模式用于探针 --keep：让游戏在 Host 进程退出后继续运行（unref 不阻止 Node 退出）
  if (detached && typeof child.unref === 'function') child.unref();
  return child;
}

/** 停止游戏进程树（只应传入本 provider 自己启动的 PID）。 */
export async function stopGame(pid) {
  const value = Number(pid);
  if (!Number.isInteger(value) || value <= 0) return false;
  if (!isProcessAlive(value)) return true;
  await killProcessTree(value);
  return waitFor(() => !isProcessAlive(value), 10000, 250);
}

/** %APPDATA%\MinecraftPE_Netease 根目录（便于 Host/探针输出）。 */
export function appRoot() {
  return minecraftRootDir();
}
