// native provider：自研官方链路的 ModPC 开发客户端控制（自己启动、自己读日志、自己开通道）。
//
// 与 Host 的 Provider 接口保持一致（Host 只依赖这些方法）。
// - 启动：直接 spawn Minecraft.Windows.exe（chatExtension=false + config=<dev_config.cppconfig>）；
// - 通信：自建行为包 dsh_bridge，游戏内经 loopback TCP JSON lines 与 Host 通话；
// - 日志：跟随官方 %APPDATA%\MinecraftPE_Netease\logs\Debug_Log*.txt；
// - 截图：PowerShell + PrintWindow 捕获游戏窗口；
// - 无 MCP：mcp* 方法返回空/抛错（日志走官方 Debug_Log，执行走游戏内 bridge 包）。
//
// 只依赖 Node 内置模块（插件 Host 运行在 DSH/Electron 自带 Node 里，不依赖系统 Node）。

import fs from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';

import { GameChannel } from './channel.js';
import { OfficialLogFollower } from './logs.js';
import { captureGameWindow } from './screenshot.js';
import { LogBuffer } from './util.js';
import { isPlainObject } from './util.js';
import { isProcessAlive, listGameProcesses, findProcessUsingWorld } from './util.js';
import {
  BRIDGE_PACK_UUID,
  behaviorPacksDir,
  bridgePackDir,
  ensureWorldPackList,
  installBridgePack,
  officialLogsDir,
  BRIDGE_PROTOCOL_VERSION,
} from './bridgePack.js';
import {
  DEFAULT_WORLD_NAME,
  acquireWorldLock,
  cppconfigPathOf,
  createWorld,
  discoverGame,
  ensureDevWorld,
  isValidWorldName,
  listWorlds,
  releaseWorldLock,
  resetDevWorld,
  spawnGame,
  spawnBareGame,
  stopGame,
  worldDirOf,
  writeDevConfig,
} from './launcher.js';
import {
  discoverSkinFile,
  importPack,
  importSkins,
  isPngFile,
  packCatalog,
  resolveSelectedPacks,
  skinFiles,
} from './catalog.js';
import {
  defaultPreset,
  findPreset,
  normalizePresets,
  presetsPath,
  readPresets,
  removePreset,
  resolveHostLaunch,
  setActivePreset,
  upsertPreset,
  writePresets,
} from './presets.js';

const DEFAULT_START_TIMEOUT_MS = 180000;
const DEFAULT_LOG_LIMIT = 2000;
const PROVIDER_NAME = 'native';
const RELOAD_KINDS = ['scripts', 'game', 'addons'];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** 等待子进程 spawn 成功（ENOENT 等错误在这里暴露）。 */
function waitForSpawn(child) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const cleanup = () => {
      child.removeListener('spawn', onSpawn);
      child.removeListener('error', onError);
    };
    const onSpawn = () => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve();
    };
    const onError = (error) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(error);
    };
    child.once('spawn', onSpawn);
    child.once('error', onError);
  });
}

/** 归一化 side。 */
function normalizeSide(side) {
  if (side === undefined || side === null || side === '') return 'client';
  const value = String(side).toLowerCase();
  if (value === 'client' || value === 'c') return 'client';
  if (value === 'server' || value === 's') return 'server';
  throw new Error(`side 仅支持 'client' 或 'server'（收到 ${side}）`);
}

/** 从 exec 结果拼一段与 legacy provider 兼容的可读文本。 */
function execText(result) {
  if (!result) return '';
  if (!result.ok) return String(result.error || '执行失败');
  const jsonValue = (() => {
    try {
      return JSON.stringify(result.returnValue);
    } catch {
      return String(result.returnRepr || '');
    }
  })();
  return [
    `Return type: ${result.returnType || 'unknown'}`,
    `Return repr: ${result.returnRepr || ''}`,
    `Return value JSON: ${jsonValue}`,
  ].join('\n');
}

/** 从错误里提取可读消息。 */
function errorMessage(error) {
  return error && error.message ? String(error.message) : String(error);
}

/**
 * 创建 native provider。
 * @param {object} [options]
 * @param {string} [options.projectDir] 项目目录
 * @param {string} [options.pluginDir] 插件目录（仅用于诊断输出）
 * @param {number} [options.logLimit] 日志环形缓冲行数（默认 2000）
 * @param {number} [options.startTimeoutMs] 等待进入存档的默认超时（默认 180000）
 */
export function createNativeProvider(options = {}) {
  return new NativeProvider(options);
}

export class NativeProvider {
  /** provider 标识。 */
  get provider() {
    return PROVIDER_NAME;
  }

  constructor(options = {}) {
    this.projectDir = path.resolve(options.projectDir || process.cwd());
    this.pluginDir = options.pluginDir ? path.resolve(options.pluginDir) : '';
    this.logLimit = Number(options.logLimit) || DEFAULT_LOG_LIMIT;
    this.startTimeoutMs = Number(options.startTimeoutMs) || DEFAULT_START_TIMEOUT_MS;
    // 探针 --keep 用：游戏进程 detached（Host 退出后仍存活）
    this._detachedGames = Boolean(options.detachedGames);

    this._phase = 'idle';
    this._gamePid = null;
    /** 本次启动主机使用的游戏内用户名（dev_config.cppconfig player_info.user_name）。 */
    this._hostPlayerName = '';
    /** 为预设里的每个访客额外拉起的客户端进程（停在主菜单，手动【好友】联机）。 */
    this._guestPids = [];
    this._guestChildren = [];
    this._child = null;
    this._since = null;
    this._lastError = '';
    this._stopRequested = false;
    this._channel = null;
    this._activePort = 0;
    this._logFollower = null;
    this._idleLogs = new LogBuffer(this.logLimit);
    /** 每个游戏实例（bridge 连接）的 print/traceback 环形缓冲，供机器切换查看。 */
    this._machineLines = new Map();
    this._machineSeq = new Map();
    this._readyInfo = null;
    this._readyCount = 0;
    this._gameExe = '';
    this._gameVersion = '';
    this._worldDir = '';
    this._worldName = DEFAULT_WORLD_NAME;
    this._bridgePack = null;
    this._notes = [];
    /** 当前持有的开发世界锁（同一世界只允许一个 native provider 会话）。 */
    this._worldLock = null;
  }

  /** 当前会话项目目录。 */
  get projectDirPath() {
    return this.projectDir;
  }

  /** bridge 行为包安装目录。 */
  get bridgePackDirPath() {
    return bridgePackDir();
  }

  // ---------------------------------------------------------------------------
  // 项目
  // ---------------------------------------------------------------------------

  /** 切换项目目录（同步；未运行时才允许）。 */
  setProjectDir(projectDir) {
    if (this._gamePid && isProcessAlive(this._gamePid)) return false;
    if (typeof projectDir !== 'string' || !projectDir.trim()) return false;
    this.projectDir = path.resolve(projectDir);
    return true;
  }

  // ---------------------------------------------------------------------------
  // 目录：世界 / 包 / 皮肤（导入）
  // ---------------------------------------------------------------------------

  /** 列出可选世界 + 当前激活预设的世界。 */
  listWorlds(projectDir) {
    const dir = path.resolve(projectDir || this.projectDir);
    const state = this._ensurePresets(dir);
    const preset = findPreset(state, '');
    const host = preset !== null ? resolveHostLaunch(preset) : { world: '' };
    return {
      worlds: listWorlds(),
      current: host.world,
      presetId: preset !== null ? preset.id : '',
      presetName: preset !== null ? preset.name : '',
    };
  }

  /** 列出可选行为包/资源包 + 当前激活预设的选择。 */
  packCatalog(projectDir) {
    const dir = path.resolve(projectDir || this.projectDir);
    const state = this._ensurePresets(dir);
    const preset = findPreset(state, '');
    const host = preset !== null ? resolveHostLaunch(preset) : { behaviorPacks: null, resourcePacks: null };
    const catalog = packCatalog(dir);
    const selected = resolveSelectedPacks(catalog, {
      behaviorPacks: host.behaviorPacks,
      resourcePacks: host.resourcePacks,
    });
    return {
      ...catalog,
      presetId: preset !== null ? preset.id : '',
      presetName: preset !== null ? preset.name : '',
      selected: {
        behavior: selected.behavior.map((item) => item.uuid),
        resource: selected.resource.map((item) => item.uuid),
        missing: selected.missing,
      },
    };
  }

  /** 列出已导入皮肤 PNG（<project>/.mcdev/skins）。 */
  skins(projectDir) {
    const dir = path.resolve(projectDir || this.projectDir);
    return skinFiles(dir);
  }

  /** 通过 filepicker 导入行为包/资源包文件夹（复制到 <project>/.mcdev/packs/<kind>）。 */
  importPack(kind, sourceDir, projectDir) {
    const dir = path.resolve(projectDir || this.projectDir);
    if (kind !== 'behavior' && kind !== 'resource') throw new Error('kind 必须是 behavior 或 resource');
    const result = importPack(dir, kind, sourceDir);
    return { ...result, ...this.packCatalog(dir) };
  }

  /** 通过 filepicker 导入皮肤文件夹（复制 PNG 到 <project>/.mcdev/skins）。 */
  importSkins(sourceDir, projectDir) {
    const dir = path.resolve(projectDir || this.projectDir);
    return importSkins(dir, sourceDir);
  }

  /** 从官方模板新建世界（绝不覆盖已有世界）。 */
  createWorld(worldName, fromWorld) {
    if (!isValidWorldName(worldName)) throw new Error('世界名不合法：不能为空，不能含路径分隔符或特殊字符，最长 64 字符');
    return createWorld(worldName, fromWorld);
  }

  // ---------------------------------------------------------------------------
  // 启动预设（presets）：游戏路径 + host（世界/包/皮肤）+ guest（皮肤）
  // ---------------------------------------------------------------------------

  /** 读取预设集合；文件不存在时用当前工程可检索项创建内置默认预设。 */
  ensurePresetsState(projectDir) {
    return this._ensurePresets(projectDir);
  }

  /** 预设集合 + 探测到的游戏路径（面板设置页用）。 */
  presets(projectDir) {
    const dir = path.resolve(projectDir || this.projectDir);
    const state = this._ensurePresets(dir);
    const game = discoverGame({});
    return {
      path: presetsPath(dir),
      state,
      detectedGameExe: game.exe || '',
      versions: game.versions || [],
      presetCount: state.presets.length,
      catalog: packCatalog(dir),
      skins: skinFiles(dir),
      worlds: listWorlds(),
    };
  }

  /** 新增或更新一个预设（按 id）。 */
  savePreset(preset, projectDir) {
    if (!isPlainObject(preset)) throw new Error('savePreset(preset) 需要一个普通对象');
    const dir = path.resolve(projectDir || this.projectDir);
    const state = this._ensurePresets(dir);
    const { state: next, preset: saved, created } = upsertPreset(state, preset);
    const written = writePresets(dir, next);
    return { path: written.path, state: written.state, preset: saved, created };
  }

  /** 删除一个预设（至少保留一个）。 */
  deletePreset(presetId, projectDir) {
    const dir = path.resolve(projectDir || this.projectDir);
    const state = this._ensurePresets(dir);
    const next = removePreset(state, presetId);
    const written = writePresets(dir, next);
    return { path: written.path, state: written.state };
  }

  /** 设置当前激活预设。 */
  setActivePreset(presetId, projectDir) {
    const dir = path.resolve(projectDir || this.projectDir);
    const state = this._ensurePresets(dir);
    const next = setActivePreset(state, presetId);
    const written = writePresets(dir, next);
    return { path: written.path, state: written.state };
  }

  /** 确保预设文件存在：默认预设从当前工程/客户端可检索项生成。 */
  _ensurePresets(projectDir) {
    const dir = path.resolve(projectDir || this.projectDir);
    const existing = readPresets(dir);
    if (existing !== null) return existing;
    const game = discoverGame({});
    const worlds = listWorlds();
    const preferredWorld = worlds.find((world) => world.name === DEFAULT_WORLD_NAME) || worlds[0];
    const seed = {
      gameExe: game.exe || '',
      world: preferredWorld !== undefined ? preferredWorld.name : DEFAULT_WORLD_NAME,
      // 游戏必须有一个有效皮肤才会进存档；默认预设从本机已有皮肤里挑一个。
      skin: discoverSkinFile(dir),
      slim: false,
    };
    const preset = defaultPreset(seed);
    const state = normalizePresets({ activeId: preset.id, presets: [preset] });
    writePresets(dir, state);
    return state;
  }

  /** 发现游戏 exe / 版本 / 开发世界 / bridge 包状态。 */
  discover(projectDir) {
    const dir = path.resolve(projectDir || this.projectDir);
    const game = discoverGame({});
    const presetState = readPresets(dir);
    const activePreset = presetState !== null ? findPreset(presetState, '') : null;
    const hostLaunch = activePreset !== null ? resolveHostLaunch(activePreset) : { world: DEFAULT_WORLD_NAME };
    const effectiveWorld = hostLaunch.world || DEFAULT_WORLD_NAME;
    const worldDir = worldDirOf(dir, { world_folder_name: effectiveWorld });
    const packDir = bridgePackDir();
    const result = {
      provider: PROVIDER_NAME,
      projectDir: dir,
      gameExe: game.exe,
      gameVersion: game.version,
      versions: game.versions,
      launch: {
        path: presetsPath(dir),
        presetId: activePreset !== null ? activePreset.id : undefined,
        presetName: activePreset !== null ? activePreset.name : undefined,
        guests: activePreset !== null ? activePreset.guests.length : 0,
        presetCount: presetState !== null ? presetState.presets.length : 0,
        worlds: listWorlds().length,
      },
      world: {
        name: effectiveWorld,
        dir: worldDir,
        exists: fs.existsSync(path.join(worldDir, 'level.dat')),
        devConfigPath: cppconfigPathOf(worldDir),
      },
      bridgePack: {
        dir: packDir,
        uuid: BRIDGE_PACK_UUID,
        installed: fs.existsSync(path.join(packDir, 'manifest.json')),
      },
      logsDir: officialLogsDir(),
      behaviorPacksDir: behaviorPacksDir(),
      appRoot: path.dirname(officialLogsDir()),
    };
    // 未运行时缓存
    if (!this._gamePid || !isProcessAlive(this._gamePid)) {
      this._gameExe = game.exe || '';
      this._gameVersion = game.version || '';
      this._worldDir = worldDir;
    }
    return result;
  }

  // ---------------------------------------------------------------------------
  // 状态
  // ---------------------------------------------------------------------------

  /** 当前状态（同步，无 IO）。 */
  status() {
    if (this._gamePid && !isProcessAlive(this._gamePid)) this._finalizeGameExit(undefined, undefined);
    const clients = this._channel ? this._channel.clients() : [];
    const status = {
      provider: PROVIDER_NAME,
      phase: this._phase,
      ready: this._phase === 'ready',
      readyCount: this._readyCount,
      projectDir: this.projectDir,
      configPath: undefined,
      gameExe: this._gameExe || undefined,
      gameVersion: this._gameVersion || undefined,
      world: {
        name: this._worldName || DEFAULT_WORLD_NAME,
        dir: this._worldDir || undefined,
        devConfigPath: this._worldDir ? cppconfigPathOf(this._worldDir) : undefined,
      },
      launch: {
        presetId: this._presetId || undefined,
        presetName: this._presetName || undefined,
        guests: this._guestCount || 0,
        launchedGuests: this._guestPids.length,
      },
      bridge: {
        port: this._activePort || 0,
        connected: clients.length > 0,
        clients: clients.map((client) => client.side),
        protocol: BRIDGE_PROTOCOL_VERSION,
      },
      logs: this._logFollower
        ? { dir: this._logFollower.dir, file: this._logFollower.currentFile || undefined, running: this._logFollower.running }
        : { dir: officialLogsDir(), running: false },
      // 与 legacy provider 的 Status 形状保持兼容（native 无 MCP）
      mcp: { port: 0, connected: false, enabled: false, tools: [] },
    };
    if (this._gamePid) status.gamePid = this._gamePid;
    if (this._gamePid) status.pid = this._gamePid;
    if (this._guestPids.length > 0) status.guestPids = [...this._guestPids];
    if (this._since) {
      status.since = this._since;
      status.elapsedMs = Date.now() - this._since;
    }
    if (this._readyInfo) status.readyInfo = this._readyInfo;
    if (this._worldLock) {
      status.worldLock = {
        path: this._worldLock.path,
        pid: this._worldLock.pid,
        startedAt: this._worldLock.startedAt,
        tookOver: Boolean(this._worldLock.tookOver),
      };
    }
    if (this._lastError) status.lastError = this._lastError;
    return status;
  }

  // ---------------------------------------------------------------------------
  // 启动 / 就绪 / 停止
  // ---------------------------------------------------------------------------

  /**
   * 启动游戏（自研官方链路）。
   * @param {object} [options]
   * @param {boolean} [options.reset] 尝试重建开发世界（无模板时保留原世界）
   * @param {boolean} [options.join] 预留（官方启动即直接进存档）
   * @param {number} [options.waitMs] >0 等待进入存档；0/省略立即返回 launching
   * @param {string} [options.projectDir] 覆盖本次启动的项目目录
   */
  async start(options = {}) {
    if (this._gamePid && isProcessAlive(this._gamePid)) return this.status();
    const dir = path.resolve(options.projectDir || this.projectDir);
    let stat = null;
    try {
      stat = fs.statSync(dir);
    } catch {
      stat = null;
    }
    if (!stat || !stat.isDirectory()) throw new Error(`项目目录不存在或不是目录：${dir}`);

    const waitMs = options.waitMs === undefined || options.waitMs === null ? 0 : Math.max(0, Number(options.waitMs) || 0);
    this._notes = [];

    // 启动预设：完全自包含（游戏路径 + host 世界/包/皮肤 + guest 皮肤）。
    const presetState = this._ensurePresets(dir);
    const requestedPresetId = typeof options.presetId === 'string' ? options.presetId : '';
    const preset = findPreset(presetState, requestedPresetId) || findPreset(presetState, '');
    if (preset === null || preset === undefined) throw new Error('找不到可用的启动预设：请先在设置里创建一个');
    const host = resolveHostLaunch(preset);
    const worldName = typeof options.world === 'string' && options.world.trim() !== '' ? options.world.trim() : host.world;
    const launchConfig = {
      world_folder_name: worldName,
      world_name: worldName,
      player_info: {
        user_name: typeof options.playerName === 'string' && options.playerName.trim() !== ''
          ? options.playerName.trim()
          : host.playerName,
      },
      skin_info: {
        skin: options.skin !== undefined ? String(options.skin) : String(host.skin || ''),
        slim: options.slim !== undefined ? options.slim === true : host.slim === true,
      },
    };
    this._hostPlayerName = launchConfig.player_info.user_name;
    this._worldName = worldName;
    this._presetId = preset.id;
    this._presetName = preset.name;
    this._guestCount = Array.isArray(preset.guests) ? preset.guests.length : 0;

    let game = discoverGame({});
    if (preset.gameExe !== '') {
      if (!fs.existsSync(preset.gameExe)) {
        throw new Error(`预设「${preset.name}」的游戏路径不存在：${preset.gameExe}（请在设置页修改该预设的游戏路径）`);
      }
      const match = /[\\/]([^\\/]+)[\\/]Minecraft\.Windows\.exe$/i.exec(preset.gameExe);
      game = { ...game, exe: preset.gameExe, version: match ? match[1] : game.version };
    }
    if (!game.exe) {
      throw new Error('找不到 Minecraft.Windows.exe：请在预设里填写游戏路径（设置页的「游戏路径」）。');
    }
    this._gameExe = game.exe;
    this._gameVersion = game.version || '';

    // 0) 世界级互斥锁：同一开发世界只允许一个 native provider 会话（并发会破坏世界 DB，实测会崩）
    if (!this._worldLock) {
      const worldDirForLock = worldDirOf(dir, launchConfig);
      try {
        this._worldLock = acquireWorldLock(worldDirForLock, { projectDir: dir });
      } catch (error) {
        this._lastError = errorMessage(error);
        throw new Error(this._lastError);
      }
      if (this._worldLock.tookOver) {
        this._notes.push('[dsh] 接管了过期的世界锁（上一个 native provider 进程已退出）');
      }
    }

    let worldInfo;
    let devConfig;
    let selectedPacks;
    try {
      // 1) reset（可选）
      if (options.reset === true) {
        const resetResult = resetDevWorld(dir, launchConfig);
        this._notes.push(resetResult.reset
          ? `[dsh] 已重建开发世界：${resetResult.worldDir}（旧世界备份：${resetResult.backupDir}）`
          : `[dsh] reset 未执行：${resetResult.reason}`);
      }

      // 2) 确保开发世界 + 写 dev_config.cppconfig
      worldInfo = ensureDevWorld(dir, launchConfig);
      this._worldDir = worldInfo.worldDir;
      if (worldInfo.created) this._notes.push(`[dsh] 已从模板创建开发世界：${worldInfo.worldDir}`);
      devConfig = writeDevConfig(worldInfo.worldDir, launchConfig);
      this._notes.push(`[dsh] dev_config.cppconfig 已写入：${devConfig.path}`);
      this._notes.push(`[dsh] 启动预设：${preset.name}（game=${game.exe}）`);
      if (this._guestCount > 0) {
        this._notes.push(`[dsh] 预设包含 ${this._guestCount} 个 guest 启动项（本次只启动 host；guest 自动拉起等待联机方案）`);
      }
      if (launchConfig.skin_info.skin === '') {
        throw new Error('预设未选择皮肤：请先在设置页「导入皮肤文件夹」并选择一个皮肤（游戏需要有效皮肤才会进入存档）');
      }
      if (launchConfig.skin_info.skin !== '') {
        const skinFile = launchConfig.skin_info.skin;
        if (!fs.existsSync(skinFile)) {
          throw new Error(`皮肤文件不存在：${skinFile}（请在设置页重新导入皮肤）`);
        }
        if (!isPngFile(skinFile)) {
          throw new Error(`皮肤文件不是有效的 PNG：${skinFile}（请重新导入皮肤文件夹）`);
        }
        this._notes.push(`[dsh] 皮肤：${skinFile}（slim=${launchConfig.skin_info.slim}）`);
      }

      // 2.5) 外部实例检查：世界锁只约束本插件，外部客户端（MC Studio / 手动开的 ModPC）不检查它。
      // 同一开发世界被另一个客户端打开时断开启动，避免并发写坏世界 DB。
      const runningClients = await listGameProcesses();
      const conflict = findProcessUsingWorld(runningClients, worldInfo.worldDir, this._gamePid);
      if (conflict) {
        throw new Error(
          `开发世界「${this._worldName}」已被另一个客户端进程打开（pid=${conflict.pid}），请先关闭它再启动，避免并发写坏世界 DB`,
        );
      }

      // 3) 可选包清单：host 预设的白名单（null = 工程全部），解析成实际要附加的 uuid。
      const catalog = packCatalog(dir);
      selectedPacks = resolveSelectedPacks(catalog, {
        behaviorPacks: options.behaviorPacks !== undefined ? options.behaviorPacks : host.behaviorPacks,
        resourcePacks: options.resourcePacks !== undefined ? options.resourcePacks : host.resourcePacks,
      });
      for (const missing of selectedPacks.missing) {
        this._notes.push(`[dsh] warning: 选择的包不存在，已忽略 uuid=${missing}`);
      }
      this._notes.push(
        `[dsh] 附加包：行为包 ${selectedPacks.behavior.length} 个 / 资源包 ${selectedPacks.resource.length} 个`,
      );
      for (const warning of catalog.warnings) this._notes.push(`[dsh] warning: ${warning}`);
    } catch (error) {
      this._releaseWorldLock();
      this._phase = 'failed';
      this._lastError = `准备开发世界失败：${errorMessage(error)}`;
      throw new Error(this._lastError);
    }

    // 4) 启动 Host TCP 服务 + 安装 bridge 行为包
    this._resetChannel();
    this._logFollower = new OfficialLogFollower({ dir: officialLogsDir(), limit: this.logLimit, startedAt: Date.now() });
    this._logFollower.start();
    for (const note of this._notes) this._logFollower.note(note.replace(/^\[dsh\]\s*/, ''));
    this._notes = [];

    this._channelToken = randomBytes(16).toString('hex');
    this._channel = new GameChannel({ host: '127.0.0.1', token: this._channelToken });
    this._channel.on('error', (error) => this._logFollower && this._logFollower.note(`bridge TCP 错误：${errorMessage(error)}`));
    this._channel.on('hello', (info) => {
      const machine = info.machine || {};
      if (this._logFollower) {
        this._logFollower.note(
          `游戏内 bridge 已连接：side=${info.side} pid=${machine.pid || '?'} version=${info.version || '?'}`,
        );
      }
    });
    this._channel.on('disconnect', (info) => {
      if (this._logFollower) this._logFollower.note(`游戏内 bridge 断开：side=${info.side} pid=${(info.machine && info.machine.pid) || '?'}`);
    });
    // 游戏内 print / traceback 经 socket 上报，合并进同一日志缓冲（否则 GUI 进程的 stdout 看不到）；
    // 同时按机器（连接 id）分别缓存，供"切换机器看日志"使用。
    this._channel.on('log', (info) => {
      if (this._logFollower) this._logFollower.appendLine(info.text, info.stream);
      if (typeof info.id === 'string' && info.id !== '') {
        const seq = this._machineSeq.get(info.id) || 0;
        this._machineSeq.set(info.id, seq + 1);
        const buffer = this._machineLines.get(info.id) || [];
        buffer.push({ seq, text: info.text, stream: info.stream, side: info.side, pid: info.pid });
        const max = Math.max(200, Number(this.logLimit) || 800);
        if (buffer.length > max) buffer.splice(0, buffer.length - max);
        this._machineLines.set(info.id, buffer);
      }
    });

    let child = null;
    try {
      await this._channel.listen();
      this._activePort = this._channel.port;
      const pack = installBridgePack({ port: this._activePort, token: this._channelToken });
      this._bridgePack = pack;
      this._logFollower.note(`bridge 行为包已安装：${pack.dir}（port=${pack.port}）`);
      const packLists = ensureWorldPackList(worldInfo.worldDir, {
        behavior: selectedPacks.behavior,
        resource: selectedPacks.resource,
      });
      for (const warning of packLists.warnings) this._logFollower.note(`warning: ${warning}`);
      this._logFollower.note(
        `世界行为包：${packLists.behaviorPacks.map((item) => item.pack_id).join(', ')}`,
      );

      // 5) spawn
      this._phase = 'launching';
      this._since = Date.now();
      this._lastError = '';
      this._stopRequested = false;
      this._readyInfo = null;
      this._readyCount = 0;
      this._logFollower.note(`启动游戏：${game.exe}（版本 ${game.version || '?'}）`);
      this._logFollower.note(`cppconfig：${devConfig.path}`);
      child = spawnGame({ exe: game.exe, cppconfigPath: devConfig.path, detached: this._detachedGames });
      this._child = child;
      this._gamePid = child.pid;
      await waitForSpawn(child);
      this._logFollower.note(`游戏进程已启动：pid=${child.pid}`);
      child.on('exit', (code, signal) => this._finalizeGameExit(code, signal));
      child.on('error', (error) => {
        this._lastError = `游戏进程错误：${errorMessage(error)}`;
        if (this._logFollower) this._logFollower.note(this._lastError);
      });

      // 6) 访客客户端：预设里有几个 guest 就额外拉起几个空白客户端（主菜单形态，
      //    和 MC Studio【工具箱 → Mod PC 开发包】启动的第二个客户端一样）。
      //    它们没有 cppconfig，不自动进世界；需要在游戏里【好友】加入本机世界。
      const guests = Array.isArray(preset.guests) ? preset.guests : [];
      this._guestCount = guests.length;
      this._guestPids = [];
      this._guestChildren = [];
      if (guests.length > 0 && options.launchGuests !== false) {
        for (let index = 0; index < guests.length; index += 1) {
          const guestName = typeof guests[index].name === 'string' && guests[index].name !== '' ? guests[index].name : `Guest ${index + 1}`;
          try {
            const guestChild = spawnBareGame({ exe: game.exe, detached: this._detachedGames });
            const guestPid = Number(guestChild.pid) || 0;
            if (guestPid > 0) {
              this._guestPids.push(guestPid);
              this._guestChildren.push(guestChild);
            }
            this._logFollower.note(`访客客户端「${guestName}」已启动：pid=${guestPid || '?'}（主菜单；请在【好友】里加入本机世界）`);
            guestChild.on('exit', () => {
              this._guestPids = this._guestPids.filter((pid) => pid !== guestPid);
              this._guestChildren = this._guestChildren.filter((item) => item !== guestChild);
            });
            guestChild.on('error', (error) => {
              if (this._logFollower) this._logFollower.note(`访客客户端「${guestName}」启动错误：${errorMessage(error)}`);
            });
          } catch (error) {
            this._logFollower.note(`访客客户端「${guestName}」启动失败：${errorMessage(error)}`);
          }
        }
      }
    } catch (error) {
      // 启动失败：清理已创建的资源，避免残留（channel/日志跟随）
      this._lastError = `启动失败：${errorMessage(error)}`;
      try {
        if (child && this._gamePid) await stopGame(this._gamePid);
      } catch {
        /* ignore */
      }
      this._resetChannel();
      if (this._logFollower) this._logFollower.stop();
      this._gamePid = null;
      this._child = null;
      this._phase = 'failed';
      this._releaseWorldLock();
      throw new Error(this._lastError);
    }

    if (waitMs > 0) return this.waitReady(waitMs);
    return this.status();
  }

  /**
   * 等待当前会话进入存档（不启动新进程）。
   * 就绪判定：bridge client 已连接 + ping 返回 inWorld=true
   * （GetLevelId 非空、GetLocalPlayerId 非空且不等于占位值 "-1"）。
   */
  async waitReady(timeoutMs = this.startTimeoutMs) {
    if (this._phase === 'ready') return this.status();
    if (!this._gamePid || !isProcessAlive(this._gamePid)) return this.status();
    const wait = Math.max(0, Number(timeoutMs) || this.startTimeoutMs);
    const deadline = Date.now() + wait;
    while (Date.now() < deadline) {
      if (!this._gamePid || !isProcessAlive(this._gamePid)) return this.status();
      if (this._channel && this._channel.clientForSide('client')) {
        try {
          const info = await this._channel.ping('client', 2500);
          if (info && info.inWorld) {
            this._phase = 'ready';
            this._lastError = '';
            this._readyInfo = info;
            this._readyCount += 1;
            if (this._logFollower) {
              this._logFollower.note(
                `游戏已进入存档（耗时 ${Date.now() - this._since}ms，levelId=${info.levelId || '?'} playerId=${info.playerId || '?'}）`,
              );
            }
            // 顺带 ping 一次服务端（不阻塞就绪）
            this._channel
              .ping('server', 1500)
              .then((serverInfo) => {
                if (serverInfo && this._logFollower) {
                  this._logFollower.note(`服务端 bridge 就绪（inWorld=${serverInfo.inWorld} players=${serverInfo.playerCount}）`);
                }
              })
              .catch(() => {});
            return this.status();
          }
        } catch {
          /* 继续等待 */
        }
      }
      await sleep(500);
    }
    this._lastError = `等待游戏进入存档超时（${Math.round(wait / 1000)}s）。请检查游戏窗口是否正常打开、日志是否有报错（可用 logs() 查看官方 Debug_Log）。`;
    if (this._logFollower) this._logFollower.note(this._lastError);
    return this.status();
  }

  /** 停止游戏（只结束本 provider 启动的进程）。 */
  async stop() {
    this._stopRequested = true;
    // 先收掉为访客额外拉起的客户端（主界面进程），再停主机。
    const guestPids = this._guestPids.splice(0);
    this._guestChildren = [];
    for (const guestPid of guestPids) {
      if (!isProcessAlive(guestPid)) continue;
      if (this._logFollower) this._logFollower.note(`停止访客客户端（pid=${guestPid}）…`);
      try {
        await stopGame(guestPid);
      } catch (error) {
        if (this._logFollower) this._logFollower.note(`停止访客客户端失败：${errorMessage(error)}`);
      }
    }
    const pid = this._gamePid && isProcessAlive(this._gamePid) ? this._gamePid : null;
    if (pid) {
      if (this._logFollower) this._logFollower.note(`停止游戏进程（pid=${pid}）…`);
      try {
        await stopGame(pid);
      } catch (error) {
        if (this._logFollower) this._logFollower.note(`停止失败：${errorMessage(error)}`);
      }
    }
    this._resetChannel();
    if (this._logFollower) {
      this._logFollower.stop();
      this._logFollower.note('已停止（游戏进程已结束）');
    }
    // 停止后再补一次日志轮询，把退出前的日志读进缓冲
    if (this._logFollower) this._logFollower.pollNow();
    this._phase = 'stopped';
    this._gamePid = null;
    this._child = null;
    this._readyInfo = null;
    this._hostPlayerName = '';
    this._releaseWorldLock();
    return this.status();
  }

  // ---------------------------------------------------------------------------
  // 日志
  // ---------------------------------------------------------------------------

  /** 官方日志（Debug_Log*.txt 跟随，游标语义见 LogBuffer）；machine 指定时返回该实例的 print 缓冲。 */
  logs(args = {}) {
    const machine = args && typeof args.machine === 'string' ? args.machine : '';
    if (machine !== '') return this.machineLogs(machine, args || {});
    if (this._logFollower) {
      if (this._logFollower.running) this._logFollower.pollNow();
      return this._logFollower.query(args || {});
    }
    return this._idleLogs.query(args || {});
  }

  /** 订阅新日志行（返回取消函数）。 */
  onLog(listener) {
    if (this._logFollower) return this._logFollower.onLine(listener);
    return this._idleLogs.onLine(listener);
  }

  // ---------------------------------------------------------------------------
  // 游戏内操作
  // ---------------------------------------------------------------------------

  /** 要求已进入存档。 */
  _assertReady(action) {
    if (!this._gamePid || !isProcessAlive(this._gamePid)) {
      throw new Error(`游戏未启动，无法${action}。请先 start() 并 waitReady()。`);
    }
    if (this._phase !== 'ready') {
      throw new Error(`游戏未进入存档（当前状态：${this._phase}），无法${action}。请先 start() 并 waitReady()。`);
    }
  }

  /**
   * 在游戏内执行 Python 代码。
   * @param {string} code Python 代码（表达式返回表达式值；语句可设置 _result）
   * @param {'client'|'server'} [side]
   * @param {{timeoutMs?:number}} [options]
   */
  async exec(code, side = 'client', options = {}) {
    if (typeof code !== 'string' || !code.trim()) throw new Error('exec(code) 需要非空的 Python 代码字符串');
    const normalizedSide = normalizeSide(side);
    this._assertReady('执行代码');
    const timeoutMs = options.timeoutMs === undefined ? 60000 : Number(options.timeoutMs);
    const machine = typeof options.machine === 'string' ? options.machine : '';
    const result = await this._channel.exec(normalizedSide, code, { timeoutMs, machine });
    if (!result.ok) {
      return { ok: false, side: normalizedSide, machine: machine || undefined, error: result.error || '执行失败（游戏内 bridge 未返回错误详情）' };
    }
    return {
      ok: true,
      side: normalizedSide,
      machine: machine || undefined,
      returnValue: result.returnValue,
      returnType: result.returnType,
      returnRepr: result.returnRepr,
      text: execText(result),
    };
  }

  /**
   * 重载。
   * native provider：scripts/game 不支持（官方 ModSDK 无 ReloadScript，需重启）；
   * addons 尝试官方 clientlevel.refresh_addons()（资源包刷新），失败则返回可读错误。
   */
  async reload(kind = 'scripts', options = {}) {
    const normalized = String(kind || 'scripts').toLowerCase();
    if (!RELOAD_KINDS.includes(normalized)) {
      throw new Error(`reload(kind) 仅支持：${RELOAD_KINDS.join(' | ')}（收到 ${kind}）`);
    }
    if (normalized !== 'addons') {
      return {
        ok: false,
        kind: normalized,
        error: 'native provider 暂不支持脚本/世界热重载（官方 ModSDK 没有 ReloadScript）。请 stop() 后重新 start() 使脚本改动生效。',
        detail: { supported: false, restartRequired: true },
      };
    }
    this._assertReady('刷新资源包');
    const code = [
      'try:',
      '    import clientlevel',
      '    clientlevel.refresh_addons()',
      '    _result = {"refreshed": True}',
      'except Exception:',
      '    import traceback',
      '    _result = {"refreshed": False, "error": traceback.format_exc()}',
    ].join('\n');
    try {
      const result = await this.exec(code, 'client', {
        timeoutMs: options.timeoutMs === undefined ? 30000 : Number(options.timeoutMs),
        machine: typeof options.machine === 'string' ? options.machine : '',
      });
      const detail = result.returnValue || {};
      return { ok: Boolean(result.ok && detail.refreshed), kind: normalized, detail, error: detail.error || result.error };
    } catch (error) {
      return { ok: false, kind: normalized, error: errorMessage(error) };
    }
  }

  /** 截取游戏窗口（不抢前台），保存 JPG。窗口刚创建时可能暂时找不到，内部会重试几次。 */
  async screenshot(options = {}) {
    if (!this._gamePid || !isProcessAlive(this._gamePid)) {
      return { ok: false, error: '游戏未启动，无法截图。请先 start()。' };
    }
    const dir = path.join(this.projectDir, '.mcdev', 'screenshots');
    fs.mkdirSync(dir, { recursive: true });
    const file = options.file || path.join(dir, `native-${Date.now()}.jpg`);
    const timeoutMs = options.timeoutMs === undefined ? 20000 : Number(options.timeoutMs);
    let lastError = '截图失败';
    for (let attempt = 1; attempt <= 3; attempt++) {
      const result = await captureGameWindow({ gamePid: this._gamePid, outFile: file, timeoutMs });
      if (result.ok) {
        return {
          ok: true,
          file: result.file || file,
          width: result.width,
          height: result.height,
          bytes: result.bytes,
          method: result.method,
          title: result.title,
          text: `截图已保存：${result.file || file}（${result.width}x${result.height}，${result.bytes} 字节）`,
        };
      }
      lastError = result.error || '截图失败';
      // 只有"窗口还没准备好/最小化"这类问题值得重试
      const retryable = /主窗口|MainWindowHandle|窗口|尚未创建/.test(lastError);
      if (!retryable || attempt === 3) break;
      await sleep(800);
    }
    return { ok: false, error: lastError };
  }

  /**
   * JSON UI 调试（native 只支持 /help 与 /screens；官方 ModSDK 未导出完整 JSON UI 树）。
   * @param {string} command
   */
  async jsonui(command, options = {}) {
    const cmd = String(command ?? '').trim();
    if (!cmd) throw new Error('jsonui(command) 需要命令字符串，例如 "/help"、"/screens"');
    if (cmd === '/help' || cmd === '/help ') {
      return {
        ok: true,
        text: [
          'native provider jsonui 支持的命令：',
          '  /help     显示本帮助',
          '  /screens  列出当前 UI 屏幕（来自 PushScreenEvent/PopScreenEvent 与官方 gui.get_all_screen_fullnames）',
          '',
          '完整 JSON UI 树/节点查询暂不可用（官方 gui 调试器未开放稳定读取路径）。',
        ].join('\n'),
      };
    }
    if (cmd !== '/screens') {
      return {
        ok: false,
        text: '',
        error: `jsonui 目前只支持 /help 与 /screens（收到 "${cmd}"）。完整 JSON UI 树查询暂不可用。`,
      };
    }
    this._assertReady('查询 UI 屏幕');
    try {
      const result = await this.exec(
        '_result = {"screens": dsh.screens(), "in_world": dsh.in_world(), "info": dsh.info()}',
        'client',
        { timeoutMs: options.timeoutMs === undefined ? 15000 : Number(options.timeoutMs) },
      );
      if (!result.ok) return { ok: false, text: '', error: result.error };
      const data = (result.returnValue && typeof result.returnValue === 'object') ? result.returnValue : {};
      const screens = Array.isArray(data.screens) ? data.screens : [];
      const payload = {
        cmd,
        ok: true,
        data: { screens, top_screen: screens.length ? String(screens[screens.length - 1]).split('.').pop() : '', top_screen_fullname: screens.length ? screens[screens.length - 1] : '', in_world: Boolean(data.in_world), info: data.info || null },
      };
      return { ok: true, text: JSON.stringify(payload, null, 2) };
    } catch (error) {
      return { ok: false, text: '', error: errorMessage(error) };
    }
  }

  /**
   * 屏幕输入（native 不支持合成输入；仅 /state 返回窗口/屏幕信息）。
   */
  async input(stepsOrString, options = {}) {
    const value = stepsOrString;
    if (typeof value === 'string' && value.trim() === '/state') {
      this._assertReady('查询输入状态');
      try {
        const result = await this.exec('_result = dsh.info()', 'client', {
          timeoutMs: options.timeoutMs === undefined ? 10000 : Number(options.timeoutMs),
        });
        if (!result.ok) return { ok: false, text: '', error: result.error };
        return { ok: true, text: JSON.stringify(result.returnValue || {}, null, 2), structured: result.returnValue };
      } catch (error) {
        return { ok: false, text: '', error: errorMessage(error) };
      }
    }
    return {
      ok: false,
      text: '',
      error: '暂不支持屏幕输入合成（官方 ModSDK 只提供只读输入事件，没有合成键鼠 API）。',
    };
  }

  // ---------------------------------------------------------------------------
  // MCP（native 无 MCP，保留空实现保持 Provider 接口同形）
  // ---------------------------------------------------------------------------

  mcpConnected() {
    return false;
  }

  async mcpConnect() {
    return undefined;
  }

  async mcpTools() {
    return [];
  }

  async mcpCall(name) {
    throw new Error(`没有 MCP 通道，无法调用工具 ${name}；请使用 exec/jsonui/screenshot。`);
  }

  // ---------------------------------------------------------------------------
  // 生命周期
  // ---------------------------------------------------------------------------

  /** 释放资源。 */
  async dispose() {
    try {
      if (this._gamePid && isProcessAlive(this._gamePid)) await this.stop();
    } catch {
      /* dispose 不抛异常 */
    }
    this._resetChannel();
    if (this._logFollower) {
      this._logFollower.stop();
      this._logFollower = null;
    }
    this._gamePid = null;
    this._child = null;
    this._phase = 'stopped';
    this._hostPlayerName = '';
    this._releaseWorldLock();
  }

  // ---------------------------------------------------------------------------
  // 内部
  // ---------------------------------------------------------------------------

  /** 释放开发世界锁（只删除本进程持有的锁）。 */
  _releaseWorldLock() {
    const lock = this._worldLock;
    if (!lock) return false;
    this._worldLock = null;
    try {
      return releaseWorldLock(lock.worldDir || path.dirname(lock.path));
    } catch {
      return false;
    }
  }

  _resetChannel() {
    if (this._channel) {
      try {
        this._channel.close();
      } catch {
        /* ignore */
      }
      this._channel = null;
    }
    this._machineLines.clear();
    this._machineSeq.clear();
  }

  /**
   * 当前连接的游戏实例列表（机器切换用）。
   * 同一侧（client/server）可以有多个实例；用 bridge 上报的 pid 关联本机进程命令行，
   * 解析 exe / 版本 / 世界目录，方便用户区分是哪一台。
   * @returns {Promise<Array<{id:string, side:string, pid:number, connectedAt:number, exe:string, gameVersion:string, world:string, inWorld:boolean, levelId:string, launchedHere:boolean}>>}
   */
  async machines() {
    const clients = this._channel ? this._channel.clients() : [];
    if (clients.length === 0) return [];
    let processes = [];
    try {
      processes = await listGameProcesses();
    } catch {
      processes = [];
    }
    const byPid = new Map(processes.map((item) => [item.pid, item]));
    const machines = [];
    for (const client of clients) {
      const processInfo = byPid.get(client.pid);
      const commandLine = processInfo ? processInfo.commandLine : '';
      const exeMatch = /"([^"]*Minecraft\.Windows\.exe)"/i.exec(commandLine) || [null, ''];
      const exe = exeMatch[1] ? exeMatch[1].replace(/\\\\/g, '\\') : '';
      const versionMatch = /([\\/])(\d+\.\d+\.\d+\.\d+)[\\/]Minecraft\.Windows\.exe/i.exec(exe);
      const gameVersion = versionMatch ? versionMatch[2] : '';
      const configMatch = /config="?([^"\s]+\.cppconfig)"?/i.exec(commandLine);
      const world = configMatch ? path.basename(path.dirname(configMatch[1].replace(/\\\\/g, '\\'))) : '';
      let inWorld = false;
      let levelId = client.levelId || '';
      try {
        const info = await this._channel.ping(client.side, 1500, client.id);
        inWorld = Boolean(info && info.inWorld);
        if (info && typeof info.levelId === 'string' && info.levelId !== '') levelId = info.levelId;
      } catch {
        inWorld = false;
      }
      machines.push({
        id: client.id,
        side: client.side,
        pid: client.pid,
        connectedAt: client.since,
        exe,
        gameVersion,
        world,
        inWorld,
        levelId,
        launchedHere: client.pid > 0 && client.pid === this._gamePid,
        playerName: client.pid > 0 && client.pid === this._gamePid ? this._hostPlayerName || '' : '',
        version: client.version,
      });
    }
    return machines;
  }

  /** 某个游戏实例的 print/traceback 日志（Host 侧按机器过滤）。 */
  machineLogs(machineId, args = {}) {
    const buffer = this._machineLines.get(machineId);
    const limit = Number.isInteger(args.limit) ? Math.max(1, Math.min(args.limit, 500)) : 120;
    if (!buffer || buffer.length === 0) return { lines: [], next: 0, machine: machineId };
    const lines = args.errors === true
      ? buffer.filter((line) => /error|exception|traceback|failed|fatal|错误|异常|失败/i.test(line.text)).slice(-limit)
      : buffer.slice(-limit);
    return { lines, next: buffer[buffer.length - 1].seq + 1, machine: machineId };
  }

  /** 游戏进程退出后的状态收尾。 */
  _finalizeGameExit(code, signal) {
    if (!this._gamePid) return;
    const wasStopping = this._stopRequested;
    this._gamePid = null;
    this._child = null;
    this._hostPlayerName = '';
    // 主机退出时把为访客额外拉起的客户端一并收掉，避免留下孤儿窗口。
    const guestPids = this._guestPids.splice(0);
    this._guestChildren = [];
    for (const guestPid of guestPids) {
      if (isProcessAlive(guestPid)) stopGame(guestPid).catch(() => {});
    }
    this._resetChannel();
    if (this._logFollower) {
      this._logFollower.stop();
      this._logFollower.pollNow();
    }
    if (wasStopping) {
      this._phase = 'stopped';
    } else {
      this._phase = 'failed';
      this._lastError = `游戏进程已退出（code=${code === undefined ? 'unknown' : code}${signal ? `, signal=${signal}` : ''}）`;
      if (this._logFollower) this._logFollower.note(this._lastError);
    }
  }
}
