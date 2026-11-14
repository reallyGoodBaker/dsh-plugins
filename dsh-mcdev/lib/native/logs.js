// 官方引擎日志跟随：%APPDATA%\MinecraftPE_Netease\logs\Debug_Log<timestamp>.txt
//
// 官方 ModPC 客户端运行时会写完整引擎日志（实测 8 分钟约 10MB），行格式：
//   [2026-11-14 08:51:44:612 INFO PLATFORM 14560 24768] Build Platform 8
// 游戏每次启动会新建一个 Debug_Log*.txt；本模块以“启动时刻”为基线：
// - 启动前已存在的旧文件：只跟随新增内容（不把历史日志塞进缓冲）；
// - 启动后新建的文件：从 0 开始读（拿到完整的启动/进入世界日志）；
// - 按字节偏移增量读、处理多字节 UTF-8 边界与文件轮转。
//
// 日志缓冲见 ./util.js 的 LogBuffer（seq 游标 / ANSI 剥离 / since/next/skipped/grep）。
// errors=true 时返回“错误类”行：含 ERROR / WARN / Traceback 等特征的行（来源标记为 stderr）。

import fs from 'node:fs';
import path from 'node:path';

import { LogBuffer } from './util.js';
import { officialLogsDir } from './bridgePack.js';

const LOG_FILE_RE = /^Debug_Log.*\.txt$/i;
/** 单次轮询单文件最多读取字节数（防止一次吞下超大文件）。 */
const MAX_READ_PER_POLL = 4 * 1024 * 1024;
/** 新文件开始时最多回读的字节数（防止极端情况下读几十 MB）。 */
const MAX_INITIAL_READ = 8 * 1024 * 1024;

/** 判断一行是否是“错误类”日志。 */
function isErrorLine(line) {
  return /\[(ERROR|WARN|WARNING|FATAL|CRITICAL)\]|\bERROR\b|\bWARN\b|Traceback \(most recent call last\)|^\s*File ".*", line \d+/.test(line);
}

export class OfficialLogFollower {
  /**
   * @param {{dir?:string, limit?:number, pollMs?:number, startedAt?:number}} [options]
   */
  constructor(options = {}) {
    this.dir = options.dir || officialLogsDir();
    this.pollMs = Number(options.pollMs) || 500;
    this._logs = new LogBuffer(Number(options.limit) || 2000);
    this._startedAt = Number(options.startedAt) || Date.now();
    this._timer = null;
    this._running = false;
    this._files = new Map(); // file -> {offset, remainder:Buffer, startedByUs:boolean}
    this._currentFile = '';
    this._bytesRead = 0;
    this._errors = [];
  }

  /** 是否正在跟随。 */
  get running() {
    return this._running;
  }

  /** 当前主要跟随的日志文件（最近修改的 Debug_Log）。 */
  get currentFile() {
    return this._currentFile;
  }

  /** 统计信息（诊断用）。 */
  stats() {
    return { dir: this.dir, currentFile: this._currentFile, files: this._files.size, bytesRead: this._bytesRead };
  }

  /** 开始跟随（幂等）。 */
  start() {
    if (this._running) return this;
    fs.mkdirSync(this.dir, { recursive: true });
    this._running = true;
    // 基线：已存在的旧文件从当前末尾开始；之后新建的文件从 0 开始
    for (const file of this._listLogFiles()) {
      try {
        const stat = fs.statSync(file);
        this._files.set(file, { offset: stat.size, remainder: Buffer.alloc(0), startedByUs: false });
      } catch {
        /* ignore */
      }
    }
    this._timer = setInterval(() => {
      try {
        this._poll();
      } catch (error) {
        this._errors.push(String(error && error.message ? error.message : error));
        if (this._errors.length > 20) this._errors.shift();
      }
    }, this.pollMs);
    if (this._timer.unref) this._timer.unref();
    return this;
  }

  /** 停止跟随。 */
  stop() {
    this._running = false;
    if (this._timer) {
      clearInterval(this._timer);
      this._timer = null;
    }
    return this;
  }

  /** 查询日志（游标语义见 LogBuffer.query）。 */
  query(args = {}) {
    return this._logs.query(args);
  }

  /** 由 Host 追加一条自己的提示行（混在日志流里方便排查）。 */
  note(text) {
    return this._logs.pushLine(`[dsh] ${text}`, 'stdout');
  }

  /** 追加一条游戏内 bridge 通过 socket 上报的日志行（Python print / traceback）。 */
  appendLine(text, source = 'stdout') {
    return this._logs.pushLine(String(text ?? ''), source === 'stderr' ? 'stderr' : 'stdout');
  }

  /** 订阅新行（返回取消函数）。 */
  onLine(listener) {
    return this._logs.onLine(listener);
  }

  /** 立即轮询一次（探针/测试用）。 */
  pollNow() {
    this._poll();
    return this.query({ limit: 2000 });
  }

  // -------------------------------------------------------------------------
  // 内部
  // -------------------------------------------------------------------------

  _listLogFiles() {
    let entries = [];
    try {
      entries = fs.readdirSync(this.dir, { withFileTypes: true });
    } catch {
      return [];
    }
    const files = [];
    for (const entry of entries) {
      if (!entry.isFile() || !LOG_FILE_RE.test(entry.name)) continue;
      files.push(path.join(this.dir, entry.name));
    }
    files.sort((a, b) => {
      try {
        return fs.statSync(a).mtimeMs - fs.statSync(b).mtimeMs;
      } catch {
        return 0;
      }
    });
    return files;
  }

  _poll() {
    if (!this._running) return;
    const files = this._listLogFiles();
    if (!files.length) return;
    for (const file of files) {
      let stat;
      try {
        stat = fs.statSync(file);
      } catch {
        continue;
      }
      let state = this._files.get(file);
      if (!state) {
        // 新文件：启动后新建的才从 0 读；早于启动基线的旧文件跳过历史
        const isFresh = stat.mtimeMs >= this._startedAt - 10000;
        const initialOffset = isFresh ? Math.max(0, stat.size - MAX_INITIAL_READ) : stat.size;
        state = { offset: initialOffset, remainder: Buffer.alloc(0), startedByUs: isFresh };
        this._files.set(file, state);
      }
      this._currentFile = file;
      if (stat.size <= state.offset) {
        if (stat.size < state.offset) {
          // 文件被截断/轮转：从头再读
          state.offset = 0;
        } else {
          continue;
        }
      }
      const length = Math.min(stat.size - state.offset, MAX_READ_PER_POLL);
      let chunk = null;
      let value = 0;
      try {
        const fd = fs.openSync(file, 'r');
        try {
          chunk = Buffer.alloc(length);
          value = fs.readSync(fd, chunk, 0, length, state.offset);
        } finally {
          fs.closeSync(fd);
        }
      } catch {
        continue;
      }
      if (value <= 0) continue;
      chunk = chunk.subarray(0, value);
      state.offset += value;
      this._bytesRead += value;
      state.remainder = Buffer.concat([state.remainder, chunk]);
      let index = state.remainder.indexOf(0x0a);
      while (index >= 0) {
        const lineBuffer = state.remainder.subarray(0, index);
        state.remainder = state.remainder.subarray(index + 1);
        const line = lineBuffer.toString('utf8').replace(/\r$/, '');
        if (line.trim()) this._logs.pushLine(line, isErrorLine(line) ? 'stderr' : 'stdout');
        index = state.remainder.indexOf(0x0a);
      }
      if (state.remainder.length > 1024 * 1024) {
        // 超长行（无换行）直接落盘，避免无限累积
        this._logs.pushLine(state.remainder.toString('utf8'), 'stdout');
        state.remainder = Buffer.alloc(0);
      }
    }
  }
}
