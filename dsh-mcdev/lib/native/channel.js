// 游戏内 bridge 的 Host 侧 TCP 服务端：JSON lines 协议（每行一个 JSON，UTF-8）。
//
// 协议（与 lib/native/bridgePack.js 内生成的 modMain.py 对应）：
//   游戏 -> Host: {"type":"hello","side":"client|server","version":"1.0.0","token":"<一次性 token>"}
//                 {"id":<n>,"type":"pong","data":{...}}
//                 {"id":<n>,"type":"result","ok":true,"returnValue":...,"returnType":...,"returnRepr":...}
//                 {"id":<n>,"type":"result","ok":false,"error":"traceback..."}
//   Host -> 游戏: {"id":<n>,"type":"ping"}
//                 {"id":<n>,"type":"exec","code":"...","side":"client|server","timeout":10}
//                 {"id":<n>,"type":"reload"}
//
// 安全：监听 127.0.0.1 随机端口，并要求 hello 携带本次启动生成的随机 token；
// 不匹配的连接会被立即断开，hello 之前的其它消息一律忽略。
//
// 只依赖 Node 内置模块。

import net from 'node:net';
import { EventEmitter } from 'node:events';

/** 单行最大字节数（防御异常数据）。 */
const MAX_LINE_BYTES = 8 * 1024 * 1024;

export class GameChannel extends EventEmitter {
  /**
   * @param {{host?:string, defaultTimeoutMs?:number, token?:string}} [options]
   */
  constructor(options = {}) {
    super();
    this.host = options.host || '127.0.0.1';
    this.defaultTimeoutMs = Number(options.defaultTimeoutMs) || 60000;
    /** 一次性握手 token；为空表示不校验（仅在测试里使用）。 */
    this.token = typeof options.token === 'string' ? options.token : '';
    this._server = null;
    this._port = 0;
    this._clients = new Set();
    /** 每侧可以同时存在多个游戏实例（例如同时开多个客户端/服务端）；保留最近连接用于默认路由。 */
    this._bySide = { client: null, server: null };
    this._nextClientId = 1;
    this._pending = new Map();
    this._nextId = 1;
    this._closed = false;
    this._helloWaiters = [];
  }

  /** 是否已监听。 */
  get listening() {
    return Boolean(this._server && this._server.listening);
  }

  /** Host 监听端口（未监听时为 0）。 */
  get port() {
    return this._port;
  }

  /** 当前已连接的游戏侧列表（同一侧可能同时有多个实例）。 */
  clients() {
    return [...this._clients]
      .filter((client) => client.side)
      .map((client) => ({
        id: client.id,
        side: client.side,
        pid: client.pid,
        levelId: client.levelId || '',
        version: client.version || '',
        since: client.since,
        remotePort: client.socket && client.socket.remotePort,
      }));
  }

  /** 取某一侧的最近连接（无则 null）。 */
  clientForSide(side) {
    if (side !== 'client' && side !== 'server') return null;
    return this._bySide[side] || null;
  }

  /** 按连接 id 取连接（机器切换用），不存在返回 null。 */
  clientById(id) {
    for (const client of this._clients) {
      if (client.id === id && client.side) return client;
    }
    return null;
  }

  /** 启动监听（127.0.0.1 随机端口）。 */
  async listen() {
    if (this._server) throw new Error('GameChannel 已经启动');
    this._closed = false;
    const server = net.createServer((socket) => this._onConnection(socket));
    server.on('error', (error) => this.emit('error', error));
    await new Promise((resolve, reject) => {
      const onError = (error) => {
        server.removeListener('listening', onListening);
        reject(new Error(`bridge TCP 服务启动失败：${error.message}`));
      };
      const onListening = () => {
        server.removeListener('error', onError);
        resolve();
      };
      server.once('listening', onListening);
      server.once('error', onError);
      server.listen(0, this.host);
    });
    this._server = server;
    this._port = server.address().port;
    this.emit('listening', { port: this._port });
    return { port: this._port };
  }

  /**
   * 等待游戏侧连上（hello）。
   * @param {{timeoutMs?:number, requireSides?:'client'|'server'|string[], minSides?:number}} [options]
   * @returns {Promise<{sides:string[], clients:any[]}|null>} 超时返回 null
   */
  waitForHello(options = {}) {
    const timeoutMs = Number(options.timeoutMs) || 60000;
    const requireSides = options.requireSides || ['client'];
    const minSides = Number(options.minSides) || 1;
    const satisfied = () => {
      const ready = this.clients().filter((client) => requireSides.includes(client.side));
      return ready.length >= minSides;
    };
    if (satisfied()) {
      return Promise.resolve({ sides: this.clients().map((c) => c.side), clients: this.clients() });
    }
    return new Promise((resolve) => {
      let settled = false;
      const finish = (value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        this.removeListener('hello', onHello);
        this.removeListener('close', onClose);
        resolve(value);
      };
      const onHello = () => {
        if (!satisfied()) return;
        finish({ sides: this.clients().map((c) => c.side), clients: this.clients() });
      };
      const onClose = () => finish(null);
      const timer = setTimeout(() => finish(null), Math.max(100, timeoutMs));
      this.on('hello', onHello);
      this.on('close', onClose);
    });
  }

  /** 发送 ping 并等待 pong，返回游戏侧自报状态（含 inWorld）。machine 为空时走该侧最近连接。 */
  async ping(side = 'client', timeoutMs = 3000, machine = '') {
    const response = await this._request(side, { type: 'ping' }, { timeoutMs, machine });
    return response && response.data;
  }

  /**
   * 在指定侧执行 Python 代码。
   * @param {'client'|'server'} side
   * @param {string} code
   * @param {{timeoutMs?:number, machine?:string}} [options] machine = 连接 id（clients() 返回）
   * @returns {Promise<{ok:boolean, returnValue?:any, returnType?:string, returnRepr?:string, error?:string}>}
   */
  async exec(side, code, options = {}) {
    const timeoutMs = Number(options.timeoutMs) || this.defaultTimeoutMs;
    const machine = typeof options.machine === 'string' ? options.machine : '';
    const response = await this._request(
      side,
      { type: 'exec', code: String(code), side, timeout: Math.max(1, Math.round(timeoutMs / 1000)) },
      { timeoutMs, machine },
    );
    return {
      ok: Boolean(response && response.ok),
      returnValue: response ? response.returnValue : undefined,
      returnType: response ? response.returnType : undefined,
      returnRepr: response ? response.returnRepr : undefined,
      error: response && response.error ? String(response.error) : undefined,
    };
  }

  /** 请求游戏侧重载（当前 bridge 返回 unsupported）。 */
  async reload(side = 'client', timeoutMs = 10000, machine = '') {
    const response = await this._request(side, { type: 'reload' }, { timeoutMs, machine });
    return { ok: Boolean(response && response.ok), error: response && response.error ? String(response.error) : undefined };
  }

  /** 关闭服务端与所有连接。 */
  close() {
    if (this._closed) return;
    this._closed = true;
    for (const pending of this._pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(new Error('bridge 连接已关闭'));
    }
    this._pending.clear();
    for (const client of this._clients) {
      try {
        client.socket.destroy();
      } catch {
        /* ignore */
      }
    }
    this._clients.clear();
    this._bySide = { client: null, server: null };
    if (this._server) {
      try {
        this._server.close();
      } catch {
        /* ignore */
      }
      this._server = null;
    }
    this._port = 0;
    this.emit('close');
  }

  // -------------------------------------------------------------------------
  // 内部
  // -------------------------------------------------------------------------

  _onConnection(socket) {
    const client = {
      id: `c${this._nextClientId++}`,
      socket,
      side: null,
      pid: 0,
      levelId: '',
      version: '',
      since: Date.now(),
      buffer: '',
    };
    this._clients.add(client);
    socket.setEncoding('utf8');
    socket.setNoDelay(true);
    socket.on('data', (chunk) => this._onData(client, chunk));
    socket.on('error', () => this._dropClient(client));
    socket.on('close', () => this._dropClient(client));
    this.emit('connection', { remotePort: socket.remotePort });
  }

  _onData(client, chunk) {
    client.buffer += chunk;
    if (client.buffer.length > MAX_LINE_BYTES) {
      client.buffer = '';
      this._dropClient(client);
      return;
    }
    for (;;) {
      const index = client.buffer.indexOf('\n');
      if (index < 0) break;
      const line = client.buffer.slice(0, index).trim();
      client.buffer = client.buffer.slice(index + 1);
      if (!line) continue;
      let message = null;
      try {
        message = JSON.parse(line);
      } catch {
        continue;
      }
      if (message && typeof message === 'object') this._onMessage(client, message);
    }
  }

  _onMessage(client, message) {
    const type = message.type;
    // hello 之前的任何消息都不可信：忽略。
    if (!client.side && type !== 'hello') return;
    if (type === 'hello') {
      if (this.token !== '' && message.token !== this.token) {
        this.emit('unauthorized', {
          remotePort: client.socket && client.socket.remotePort,
        });
        try {
          client.socket.destroy();
        } catch {
          /* ignore */
        }
        return;
      }
      const side = message.side === 'server' ? 'server' : 'client';
      client.side = side;
      client.version = String(message.version || '');
      client.pid = Number(message.pid) > 0 ? Number(message.pid) : 0;
      client.levelId = typeof message.levelId === 'string' ? message.levelId : '';
      // 同一实例重连（同 side + 同 pid）时替换旧连接；不同实例并存在列表里。
      if (client.pid > 0) {
        for (const other of [...this._clients]) {
          if (other !== client && other.pid === client.pid && other.side === side) {
            try {
              other.socket.destroy();
            } catch {
              /* ignore */
            }
            this._clients.delete(other);
          }
        }
      }
      this._bySide[side] = client;
      this.emit('hello', {
        side,
        machine: { id: client.id, side, pid: client.pid, levelId: client.levelId },
        version: client.version,
        clients: this.clients(),
      });
      return;
    }
    if (type === 'pong' || type === 'result') {
      this._resolvePending(message);
      return;
    }
    if (type === 'log') {
      this.emit('log', {
        id: client.id,
        pid: client.pid,
        levelId: client.levelId,
        side: message.side || client.side || '',
        stream: message.stream === 'stderr' ? 'stderr' : 'stdout',
        text: String(message.text === undefined || message.text === null ? '' : message.text),
      });
      return;
    }
    this.emit('message', message);
  }

  _resolvePending(message) {
    const id = message.id;
    if (id === undefined || id === null) return;
    const pending = this._pending.get(id);
    if (!pending) return;
    this._pending.delete(id);
    clearTimeout(pending.timer);
    pending.resolve(message);
  }

  _dropClient(client) {
    if (!this._clients.has(client)) return;
    this._clients.delete(client);
    if (client.side && this._bySide[client.side] === client) {
      // 该侧还有其它实例时回退到最近一个；否则置空。
      const remaining = [...this._clients].filter((item) => item.side === client.side);
      this._bySide[client.side] = remaining.length > 0 ? remaining[remaining.length - 1] : null;
    }
    // 该连接上的未完成请求立即失败（避免调用方干等超时）
    for (const [id, pending] of this._pending) {
      if (pending.client === client) {
        this._pending.delete(id);
        clearTimeout(pending.timer);
        pending.reject(new Error(`游戏内 ${client.side || 'unknown'} 侧连接已断开`));
      }
    }
    this.emit('disconnect', { side: client.side, machine: { id: client.id, side: client.side, pid: client.pid }, clients: this.clients() });
  }

  _write(client, object) {
    try {
      client.socket.write(`${JSON.stringify(object)}\n`, 'utf8');
      return true;
    } catch {
      this._dropClient(client);
      return false;
    }
  }

  _request(side, payload, options = {}) {
    if (this._closed) return Promise.reject(new Error('bridge 连接已关闭'));
    const machine = typeof options.machine === 'string' ? options.machine : '';
    const client = machine !== '' ? this.clientById(machine) : this.clientForSide(side);
    if (!client) {
      if (machine !== '') {
        return Promise.reject(new Error(`所选游戏实例已断开（machine=${machine}），请重新选择机器`));
      }
      return Promise.reject(
        new Error(`游戏内 ${side} 侧 bridge 尚未连接（请确认游戏已进入存档，且 dsh_bridge 行为包已安装并出现在世界清单中）`),
      );
    }
    const id = this._nextId++;
    const timeoutMs = Number(options.timeoutMs) || this.defaultTimeoutMs;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this._pending.delete(id);
        reject(new Error(`等待游戏内 ${side} 侧响应超时（${timeoutMs}ms）`));
      }, Math.max(100, timeoutMs));
      this._pending.set(id, { resolve, reject, timer, client, side });
      if (!this._write(client, { id, ...payload })) {
        this._pending.delete(id);
        clearTimeout(timer);
        reject(new Error(`向游戏内 ${side} 侧发送请求失败`));
      }
    });
  }
}
