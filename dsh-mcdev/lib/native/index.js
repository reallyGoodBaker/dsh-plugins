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
import { configPathOf, isPlainObject, readConfigWithDefaults, writeMergedConfig } from './util.js';
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
  stopGame,
  worldDirOf,
  writeDevConfig,
} from './launcher.js';
import {
  launchProfilePath,
  packCatalog,
  readLaunchProfile,
  resolveSelectedPacks,
  skinDirsOf,
  skinFiles,
  worldNameOf,
  writeLaunchProfile,
} from './launchProfile.js';

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
 * @param {string} [options.projectDir] 项目目录（含 .mcdev.json）
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
    this._child = null;
    this._since = null;
    this._lastError = '';
    this._stopRequested = false;
    this._channel = null;
    this._activePort = 0;
    this._logFollower = null;
    this._idleLogs = new LogBuffer(this.logLimit);
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

  /** 当前会话 .mcdev.json 路径。 */
  get configPath() {
    return configPathOf(this.projectDir);
  }

  /** bridge 行为包安装目录。 */
  get bridgePackDirPath() {
    return bridgePackDir();
  }

  // ---------------------------------------------------------------------------
  // 项目 / 配置
  // ---------------------------------------------------------------------------

  /** 切换项目目录（同步；未运行时才允许）。 */
  setProjectDir(projectDir) {
    if (this._gamePid && isProcessAlive(this._gamePid)) return false;
    if (typeof projectDir !== 'string' || !projectDir.trim()) return false;
    this.projectDir = path.resolve(projectDir);
    return true;
  }

  /** 读取 .mcdev.json（与默认值合并；文件不存在返回默认值，不写文件）。 */
  readConfig(projectDir) {
    return readConfigWithDefaults(projectDir || this.projectDir);
  }

  /** 合并写回 .mcdev.json（写前备份 .mcdev.json.bak）。 */
  updateConfig(patch, projectDir) {
    if (!isPlainObject(patch)) throw new Error('updateConfig(patch) 需要一个普通对象');
    const dir = path.resolve(projectDir || this.projectDir);
    const { config } = writeMergedConfig(dir, patch);
    return config;
  }

  // ---------------------------------------------------------------------------
  // 启动配置（插件自有的世界 / 行为包 / 资源包 / 皮肤选择）
  // ---------------------------------------------------------------------------

  /** 读取启动配置。 */
  launchProfile(projectDir) {
    const dir = path.resolve(projectDir || this.projectDir);
    return { path: launchProfilePath(dir), profile: readLaunchProfile(dir) };
  }

  /** 合并写回启动配置（不修改 .mcdev.json）。 */
  updateLaunchProfile(patch, projectDir) {
    if (!isPlainObject(patch)) throw new Error('updateLaunchProfile(patch) 需要一个普通对象');
    const dir = path.resolve(projectDir || this.projectDir);
    const { path: profilePath, profile } = writeLaunchProfile(dir, patch);
    return { path: profilePath, profile };
  }

  /** 列出可选世界 + 当前生效世界。 */
  listWorlds(projectDir) {
    const dir = path.resolve(projectDir || this.projectDir);
    const config = this.readConfig(dir);
    const profile = readLaunchProfile(dir);
    return { worlds: listWorlds(), current: worldNameOf(config, profile), profile };
  }

  /** 列出可选行为包/资源包 + 当前选择。 */
  packCatalog(projectDir) {
    const dir = path.resolve(projectDir || this.projectDir);
    const config = this.readConfig(dir);
    const profile = readLaunchProfile(dir);
    const catalog = packCatalog(dir, config);
    const selected = resolveSelectedPacks(catalog, {
      behaviorPacks: profile.behaviorPacks,
      resourcePacks: profile.resourcePacks,
    });
    return {
      ...catalog,
      profile,
      selected: {
        behavior: selected.behavior.map((item) => item.uuid),
        resource: selected.resource.map((item) => item.uuid),
        missing: selected.missing,
      },
    };
  }

  /** 列出可选皮肤 PNG（可选 dirs 覆盖：面板传入的皮肤目录）。 */
  skins(projectDir, skinsDir) {
    const dir = path.resolve(projectDir || this.projectDir);
    const profile = readLaunchProfile(dir);
    const withDir = typeof skinsDir === 'string' && skinsDir.trim() !== ''
      ? { ...profile, skinsDir: skinsDir.trim() }
      : profile;
    return { profile, ...skinFiles(dir, withDir) };
  }

  /** 新建世界：默认从官方模板复制；fromWorld 可指定复制来源世界。 */
  createWorld(worldName, fromWorld) {
    if (!isValidWorldName(worldName)) throw new Error('世界名不合法：不能为空，不能含路径分隔符或特殊字符，最长 64 字符');
    return createWorld(worldName, fromWorld);
  }

  /** 发现游戏 exe / 版本 / 开发世界 / bridge 包状态。 */
  discover(projectDir) {
    const dir = path.resolve(projectDir || this.projectDir);
    let config = null;
    let configError = '';
    try {
      config = this.readConfig(dir);
    } catch (error) {
      configError = error.message;
    }
    const configSafe = config || {};
    const game = discoverGame(configSafe);
    const profile = readLaunchProfile(dir);
    const effectiveWorld = worldNameOf(configSafe, profile);
    const worldDir = worldDirOf(dir, { ...configSafe, world_folder_name: effectiveWorld });
    const packDir = bridgePackDir();
    const result = {
      provider: PROVIDER_NAME,
      projectDir: dir,
      configPath: configPathOf(dir),
      gameExe: game.exe,
      gameVersion: game.version,
      versions: game.versions,
      launch: {
        path: launchProfilePath(dir),
        profile,
        world: effectiveWorld,
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
    if (config) result.config = config;
    if (configError) result.configError = configError;
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
      configPath: configPathOf(this.projectDir),
      gameExe: this._gameExe || undefined,
      gameVersion: this._gameVersion || undefined,
      world: {
        name: this._worldName || DEFAULT_WORLD_NAME,
        dir: this._worldDir || undefined,
        devConfigPath: this._worldDir ? cppconfigPathOf(this._worldDir) : undefined,
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
    const config = this.readConfig(dir);
    const game = discoverGame(config);
    if (!game.exe) {
      throw new Error(
        '找不到 Minecraft.Windows.exe：请安装网易 ModPC 开发客户端，或在 .mcdev.json 的 game_executable_path 指定完整路径。',
      );
    }
    this._gameExe = game.exe;
    this._gameVersion = game.version || '';

    // 启动配置（插件自有）：世界 / 行为包 / 资源包 / 皮肤，可被本次 start 参数覆盖。
    const profile = readLaunchProfile(dir);
    const worldName = worldNameOf(config, {
      world: typeof options.world === 'string' && options.world.trim() !== '' ? options.world : profile.world,
    });
    const skinInfo = config.skin_info && typeof config.skin_info === 'object' ? config.skin_info : {};
    const launchConfig = {
      ...config,
      world_folder_name: worldName,
      world_name: worldName,
      skin_info: {
        skin: options.skin !== undefined ? String(options.skin) : String(profile.skin || skinInfo.skin || ''),
        slim: options.slim !== undefined ? options.slim === true : profile.slim === true ? true : Boolean(skinInfo.slim),
      },
    };
    this._worldName = worldName;

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
      if (launchConfig.skin_info.skin !== '') this._notes.push(`[dsh] 皮肤：${launchConfig.skin_info.skin}（slim=${launchConfig.skin_info.slim}）`);

      // 2.5) 外部实例检查：世界锁只约束本插件，外部客户端（MC Studio / 手动开的 ModPC）不检查它。
      // 同一开发世界被另一个客户端打开时断开启动，避免并发写坏世界 DB。
      const runningClients = await listGameProcesses();
      const conflict = findProcessUsingWorld(runningClients, worldInfo.worldDir, this._gamePid);
      if (conflict) {
        throw new Error(
          `开发世界「${this._worldName}」已被另一个客户端进程打开（pid=${conflict.pid}），请先关闭它再启动，避免并发写坏世界 DB`,
        );
      }

      // 3) 可选包清单：启动配置的白名单（null = 工程全部），解析成实际要附加的 uuid。
      const catalog = packCatalog(dir, launchConfig);
      selectedPacks = resolveSelectedPacks(catalog, {
        behaviorPacks: options.behaviorPacks !== undefined ? options.behaviorPacks : profile.behaviorPacks,
        resourcePacks: options.resourcePacks !== undefined ? options.resourcePacks : profile.resourcePacks,
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
      if (this._logFollower) this._logFollower.note(`游戏内 bridge 已连接：side=${info.side} version=${info.version || '?'}`);
    });
    this._channel.on('disconnect', (info) => {
      if (this._logFollower) this._logFollower.note(`游戏内 bridge 断开：side=${info.side}`);
    });
    // 游戏内 print / traceback 经 socket 上报，合并进同一日志缓冲（否则 GUI 进程的 stdout 看不到）
    this._channel.on('log', (info) => {
      if (this._logFollower) this._logFollower.appendLine(info.text, info.stream);
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
    this._releaseWorldLock();
    return this.status();
  }

  // ---------------------------------------------------------------------------
  // 日志
  // ---------------------------------------------------------------------------

  /** 官方日志（Debug_Log*.txt 跟随，游标语义见 LogBuffer）。 */
  logs(args = {}) {
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
    const result = await this._channel.exec(normalizedSide, code, { timeoutMs });
    if (!result.ok) {
      return { ok: false, side: normalizedSide, error: result.error || '执行失败（游戏内 bridge 未返回错误详情）' };
    }
    return {
      ok: true,
      side: normalizedSide,
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
      const result = await this.exec(code, 'client', { timeoutMs: options.timeoutMs === undefined ? 30000 : Number(options.timeoutMs) });
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
  }

  /** 游戏进程退出后的状态收尾。 */
  _finalizeGameExit(code, signal) {
    if (!this._gamePid) return;
    const wasStopping = this._stopRequested;
    this._gamePid = null;
    this._child = null;
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
