// 游戏内 bridge 行为包（dsh_bridge）的生成与安装，以及开发世界行为包清单维护。
//
// 设计依据（本机实测的官方 ModSDK 事实）：
// - 行为包目录：%APPDATA%\MinecraftPE_Netease\games\com.netease\behavior_packs\<uuid去横线>\
// - 引擎会加载行为包下**每个包含 modMain.py 的文件夹**作为代码模块（官方文档：Mcp 模块约定）；
// - manifest.json 用 format_version 1 + 一个 data 模块即可；
// - 类注册路径用完整模块路径，例如 "dsh_bridge.modMain.DshBridgeServerSystem"；
// - 世界清单 world_behavior_packs.json / world_resource_packs.json 是 [{pack_id, version}] 数组。
//
// 本文件只依赖 Node 内置模块；Python 源码以字符串形式内联，安装时写入磁盘。

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/** 固定的 bridge 行为包 uuid（不要随意改，世界清单按它登记）。 */
export const BRIDGE_PACK_UUID = 'd8b5fa0e-3f2e-4c9f-9a45-1c6f0f2b7a11';
/** 行为包 data 模块 uuid。 */
export const BRIDGE_MODULE_UUID = '6f1d4c2a-8b73-4d55-9e0c-3a1f7d9b2c84';
/** 游戏内模组名（Mod.Binding name / RegisterSystem namespace）。 */
export const BRIDGE_MOD_NAME = 'dsh_bridge';
/** bridge 协议版本。 */
export const BRIDGE_PROTOCOL_VERSION = '1.0.0';

/** %APPDATA%\MinecraftPE_Netease */
export function minecraftRootDir() {
  const appData = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
  return path.join(appData, 'MinecraftPE_Netease');
}

/** 行为包安装目录。 */
export function behaviorPacksDir() {
  return path.join(minecraftRootDir(), 'games', 'com.netease', 'behavior_packs');
}

/** 资源包安装目录。 */
export function resourcePacksDir() {
  return path.join(minecraftRootDir(), 'games', 'com.netease', 'resource_packs');
}

/** 世界根目录。 */
export function worldsDir() {
  return path.join(minecraftRootDir(), 'minecraftWorlds');
}

/** 官方引擎日志目录（Debug_Log*.txt）。 */
export function officialLogsDir() {
  return path.join(minecraftRootDir(), 'logs');
}

/** native provider 的锁目录（不落在开发世界目录里，避免污染世界文件）。 */
export function locksDir() {
  return path.join(minecraftRootDir(), '.dsh-mcdev', 'locks');
}

/** bridge 行为包在本机的安装目录。 */
export function bridgePackDir() {
  return path.join(behaviorPacksDir(), BRIDGE_PACK_UUID.replace(/-/g, ''));
}

/** 列出可能的世界模板目录（优先 games/com.netease/world_templates）。 */
export function worldTemplateDirs() {
  const root = minecraftRootDir();
  return [path.join(root, 'games', 'com.netease', 'world_templates'), path.join(root, 'world_templates')];
}

// ---------------------------------------------------------------------------
// Python 源码（游戏内运行；兼容 Python 3 / Python 2.7，不使用 f-string）
// ---------------------------------------------------------------------------

/** modMain.py：ModSDK 入口 + 客户端/服务端 system + TCP JSON lines 客户端。 */
const MOD_MAIN_PY = String.raw`# -*- coding: utf-8 -*-
# dsh_bridge —— dsh-mcdev native provider 的游戏内桥接模组。
# 本文件由 dsh-mcdev Host 自动生成，手动修改会在下次启动时被覆盖。
import json
import socket
import sys
import threading
import time
import traceback

import mod.client.extraClientApi as clientApi
import mod.server.extraServerApi as serverApi
from mod.common.mod import Mod

from .bridgeConfig import HOST, PORT, PROTOCOL_VERSION, MOD_NAME, TOKEN

try:
    _TEXT_TYPE = unicode
except NameError:
    _TEXT_TYPE = str

_IS_PY2 = sys.version_info[0] < 3


def _SAFE_REPR(value):
    try:
        return repr(value)
    except Exception:
        return "<repr failed>"


def _TYPE_NAME(value):
    try:
        return type(value).__name__
    except Exception:
        return "unknown"


def _JSON_SAFE(value, depth=0):
    if depth > 8:
        return {"__type__": _TYPE_NAME(value), "__repr__": _SAFE_REPR(value)}
    if value is None or isinstance(value, bool):
        return value
    if isinstance(value, (int, float)):
        return value
    if isinstance(value, _TEXT_TYPE):
        return value
    if isinstance(value, str):
        return value
    if isinstance(value, (list, tuple)):
        return [_JSON_SAFE(v, depth + 1) for v in value]
    if isinstance(value, dict):
        result = {}
        for k, v in value.items():
            try:
                key = k if isinstance(k, _TEXT_TYPE) else str(k)
            except Exception:
                key = _SAFE_REPR(k)
            result[key] = _JSON_SAFE(v, depth + 1)
        return result
    return {"__type__": _TYPE_NAME(value), "__repr__": _SAFE_REPR(value)}


if _IS_PY2:
    # Python 2 的 exec 是语句；把语句放进字符串里执行，保证本文件在 Python 3 下也能被解析
    def _EXEC_TEXT(code, globalVars):
        exec("exec code in globalVars, globalVars")
else:
    def _EXEC_TEXT(code, globalVars):
        exec(code, globalVars)


class _SideBridge(object):
    """单侧（client/server）桥接：一个后台线程连 Host，主线程执行代码。"""

    def __init__(self, side, comp, levelId):
        self.side = side
        self.comp = comp
        self.levelId = levelId
        self.sock = None
        self.sendLock = threading.Lock()
        self.stopFlag = False
        self._screenList = []
        self.env = {"__name__": "dsh_bridge_exec", "__doc__": None}
        self.env["clientApi"] = clientApi
        self.env["serverApi"] = serverApi
        self.env["dsh"] = self
        try:
            import gui
            self.env["gui"] = gui
        except Exception:
            pass
        self.thread = threading.Thread(target=self._threadMain)
        self.thread.daemon = True
        self.thread.start()

    # ---------- 对外辅助（exec 代码里可用 dsh.xxx()）----------
    def info(self):
        data = {"side": self.side, "version": PROTOCOL_VERSION, "levelId": self.levelId}
        try:
            data["stdout"] = _SAFE_REPR(sys.stdout)[:160]
            data["stderr"] = _SAFE_REPR(sys.stderr)[:160]
            data["logTee"] = bool(_LOG_TEE_INSTALLED.get("done"))
            data["sides"] = sorted(list(_STATES.keys()))
            try:
                import gui
                data["guiScreenApi"] = hasattr(gui, "get_all_screen_fullnames")
            except Exception:
                data["guiScreenApi"] = False
        except Exception:
            pass
        try:
            if self.side == "client":
                playerId = clientApi.GetLocalPlayerId()
                levelId = clientApi.GetLevelId()
                data["playerId"] = playerId
                data["levelId"] = levelId
                # 刚进世界的瞬间 GetLocalPlayerId() 可能是占位值 "-1"（非空但还没真正就绪），
                # 显式排除它，避免 Host 把 ready 判早。
                data["inWorld"] = bool(levelId) and bool(playerId) and str(playerId) != "-1"
            else:
                players = serverApi.GetPlayerList()
                data["playerCount"] = len(players) if players else 0
                data["inWorld"] = bool(players)
        except Exception:
            data["inWorld"] = False
            data["infoError"] = traceback.format_exc()
        return data

    def in_world(self):
        try:
            return bool(self.info().get("inWorld"))
        except Exception:
            return False

    def screens(self):
        # 优先官方 gui 接口（若存在），否则用 PushScreenEvent 维护的屏幕栈
        try:
            import gui
            names = gui.get_all_screen_fullnames()
            if names:
                return [str(name) for name in names]
        except Exception:
            pass
        return list(self._screenList)

    # ---------- 主线程执行 ----------
    def _submit(self, func, timeout=10.0):
        if self.comp is None:
            raise Exception("engine component not ready (side=" + self.side + ")")
        event = threading.Event()
        box = {"ok": False, "value": None, "error": None}

        def runner():
            try:
                box["value"] = func()
                box["ok"] = True
            except Exception:
                box["error"] = traceback.format_exc()
            finally:
                event.set()

        self.comp.AddTimer(0, runner)
        if not event.wait(timeout):
            raise Exception("主线程执行超时（%s 秒）" % timeout)
        if not box["ok"]:
            raise Exception(box["error"] or "unknown error")
        return box["value"]

    def _exec_code(self, codeText):
        globalVars = self.env
        try:
            compiledEval = compile(codeText, "<dsh_bridge>", "eval")
        except SyntaxError:
            compiledEval = None
        if compiledEval is not None:
            return eval(compiledEval, globalVars)
        globalVars["_result"] = None
        try:
            _EXEC_TEXT(codeText, globalVars)
            return globalVars.get("_result", None)
        finally:
            globalVars.pop("_result", None)

    def _handleExec(self, requestId, codeText, timeout):
        def task():
            return self._exec_code(codeText)

        try:
            value = self._submit(task, timeout)
            self._send({
                "id": requestId,
                "type": "result",
                "ok": True,
                "returnValue": _JSON_SAFE(value),
                "returnType": _TYPE_NAME(value),
                "returnRepr": _SAFE_REPR(value),
            })
        except Exception:
            # 把 traceback 打到 stderr（经日志 tee 进 Host logs()），同时作为错误回包
            traceback.print_exc()
            self._send({"id": requestId, "type": "result", "ok": False, "error": traceback.format_exc()})

    # ---------- socket ----------
    def _send(self, obj):
        sock = self.sock
        if sock is None:
            return False
        try:
            payload = json.dumps(obj, ensure_ascii=False)
        except Exception:
            payload = json.dumps({"type": "log", "text": "json encode failed: " + traceback.format_exc()})
        if not isinstance(payload, bytes):
            payload = payload.encode("utf-8")
        payload = payload + b"\n"
        try:
            with self.sendLock:
                sock.sendall(payload)
            return True
        except Exception:
            return False

    def sendLog(self, text, streamName):
        return self._send({"type": "log", "side": self.side, "stream": streamName, "text": text})

    def _onLine(self, rawLine):
        try:
            line = rawLine if isinstance(rawLine, _TEXT_TYPE) else rawLine.decode("utf-8", "replace")
            line = line.strip()
            if not line:
                return
            request = json.loads(line)
        except Exception:
            return
        reqType = request.get("type", "")
        requestId = request.get("id", None)
        if reqType == "ping":
            # 引擎 API 只能在主线程调用：ping 也通过 AddTimer 投主线程，避免跨线程访问引擎对象。
            try:
                data = self._submit(self.info, 3.0)
            except Exception:
                data = {"side": self.side, "version": PROTOCOL_VERSION, "inWorld": False, "levelId": self.levelId, "pingError": traceback.format_exc()}
            self._send({"id": requestId, "type": "pong", "data": data})
        elif reqType == "exec":
            side = request.get("side", self.side)
            if side != self.side:
                self._send({"id": requestId, "type": "result", "ok": False, "error": "side mismatch: bridge is " + self.side})
                return
            timeout = request.get("timeout", 10.0)
            try:
                timeout = float(timeout)
            except Exception:
                timeout = 10.0
            self._handleExec(requestId, request.get("code", ""), timeout)
        elif reqType == "reload":
            self._send({"id": requestId, "type": "result", "ok": False, "error": "unsupported: native bridge 暂不支持热重载，请重启游戏"})
        else:
            self._send({"id": requestId, "type": "result", "ok": False, "error": "unknown request type: " + str(reqType)})

    def _threadMain(self):
        while not self.stopFlag:
            sock = None
            try:
                sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
                sock.settimeout(3.0)
                sock.connect((HOST, PORT))
                sock.settimeout(None)
                self.sock = sock
                self._send({"type": "hello", "side": self.side, "version": PROTOCOL_VERSION, "mod": MOD_NAME, "token": TOKEN})
                print("[dsh_bridge] " + self.side + " connected to host " + str(HOST) + ":" + str(PORT))
                buf = b""
                while not self.stopFlag:
                    try:
                        chunk = sock.recv(65536)
                    except Exception:
                        break
                    if not chunk:
                        break
                    buf = buf + chunk
                    while True:
                        index = buf.find(b"\n")
                        if index < 0:
                            break
                        line = buf[:index]
                        buf = buf[index + 1:]
                        self._onLine(line)
            except Exception:
                pass
            finally:
                self.sock = None
                if sock is not None:
                    try:
                        sock.close()
                    except Exception:
                        pass
            if not self.stopFlag:
                time.sleep(1.0)
        print("[dsh_bridge] " + self.side + " bridge stopped")

    def close(self):
        self.stopFlag = True
        sock = self.sock
        self.sock = None
        if sock is not None:
            try:
                sock.close()
            except Exception:
                pass


_STATES = {}


def _startSide(side, comp, levelId):
    _install_log_tee()
    state = _STATES.get(side)
    if state is None:
        try:
            state = _SideBridge(side, comp, levelId)
            _STATES[side] = state
        except Exception:
            traceback.print_exc()
            return None
    else:
        state.comp = comp
        state.levelId = levelId
    return state


def pushScreen(screenName):
    state = _STATES.get("client")
    if state is None or not screenName:
        return
    name = str(screenName)
    if name not in state._screenList:
        state._screenList.append(name)


def popScreen(screenName):
    state = _STATES.get("client")
    if state is None or not screenName:
        return
    name = str(screenName)
    try:
        state._screenList.remove(name)
    except ValueError:
        pass


ServerSystem = serverApi.GetServerSystemCls()
ClientSystem = clientApi.GetClientSystemCls()


class DshBridgeServerSystem(ServerSystem):
    def __init__(self, namespace, systemName):
        ServerSystem.__init__(self, namespace, systemName)
        try:
            comp = serverApi.GetEngineCompFactory().CreateGame(serverApi.GetLevelId())
        except Exception:
            comp = None
            traceback.print_exc()
        _startSide("server", comp, serverApi.GetLevelId())
        print("[dsh_bridge] server system init")

    def Destroy(self):
        state = _STATES.get("server")
        if state is not None:
            state.close()
        try:
            ServerSystem.Destroy(self)
        except Exception:
            pass


class DshBridgeClientSystem(ClientSystem):
    def __init__(self, namespace, systemName):
        ClientSystem.__init__(self, namespace, systemName)
        try:
            comp = clientApi.GetEngineCompFactory().CreateGame(clientApi.GetLevelId())
        except Exception:
            comp = None
            traceback.print_exc()
        _startSide("client", comp, clientApi.GetLevelId())
        try:
            namespaceEngine = clientApi.GetEngineNamespace()
            systemEngine = clientApi.GetEngineSystemName()
            self.ListenForEvent(namespaceEngine, systemEngine, "PushScreenEvent", self, self._onPushScreen)
            self.ListenForEvent(namespaceEngine, systemEngine, "PopScreenEvent", self, self._onPopScreen)
        except Exception:
            traceback.print_exc()
        print("[dsh_bridge] client system init")

    def _onPushScreen(self, args=None):
        args = args or {}
        pushScreen(args.get("screenDef") or args.get("screenName") or "")

    def _onPopScreen(self, args=None):
        args = args or {}
        popScreen(args.get("screenDef") or args.get("screenName") or "")

    def Destroy(self):
        state = _STATES.get("client")
        if state is not None:
            state.close()
        try:
            ClientSystem.Destroy(self)
        except Exception:
            pass


@Mod.Binding(name=MOD_NAME, version="1.0.0")
class DshBridgeMod(object):
    @Mod.InitServer()
    def dshBridgeInitServer(self):
        for clsPath in ("dsh_bridge.modMain.DshBridgeServerSystem", "modMain.DshBridgeServerSystem"):
            try:
                serverApi.RegisterSystem(MOD_NAME, "DshBridgeServerSystem", clsPath)
                print("[dsh_bridge] server RegisterSystem ok: " + clsPath)
                break
            except Exception:
                traceback.print_exc()
                print("[dsh_bridge] server RegisterSystem failed: " + clsPath)

    @Mod.InitClient()
    def dshBridgeInitClient(self):
        for clsPath in ("dsh_bridge.modMain.DshBridgeClientSystem", "modMain.DshBridgeClientSystem"):
            try:
                clientApi.RegisterSystem(MOD_NAME, "DshBridgeClientSystem", clsPath)
                print("[dsh_bridge] client RegisterSystem ok: " + clsPath)
                break
            except Exception:
                traceback.print_exc()
                print("[dsh_bridge] client RegisterSystem failed: " + clsPath)
`;

/** __init__.py：让 dsh_bridge 目录成为 Python 包。 */
const PACKAGE_INIT_PY = '# -*- coding: utf-8 -*-\n# dsh_bridge package (generated by dsh-mcdev)\n';

/** 追加到 modMain.py 的日志 tee 代码（把游戏内 print/traceback 通过 socket 发回 Host）。 */
const LOG_TEE_PY = String.raw`

# ---------------------------------------------------------------------------
# stdout/stderr 捕获：游戏内 print / traceback 会写到进程 stdout（GUI 进程里通常看不到），
# 这里把它 tee 一份到 Host（socket log 事件），Host 合并进 logs()，避免"日志黑盒"。
# ---------------------------------------------------------------------------
_LOG_TEE_INSTALLED = {"done": False}


def _broadcast_log(text, streamName):
    # 只通过一个 state 发送：同一解释器里 client/server 两个 state 共用这个 tee，
    # 若逐个 state 发送会重复两遍；若两侧是独立解释器，则各自 _STATES 只有一个 state，仍只发一次。
    state = _STATES.get("client") or _STATES.get("server")
    if state is None:
        return
    try:
        state.sendLog(text, streamName)
    except Exception:
        pass


class _LogTee(object):
    def __init__(self, streamName, base):
        self.streamName = streamName
        self.base = base
        self.buf = ""

    def write(self, data):
        try:
            self.base.write(data)
        except Exception:
            pass
        try:
            text = data if isinstance(data, _TEXT_TYPE) else data.decode("utf-8", "replace")
            self.buf = self.buf + text
            while True:
                index = self.buf.find("\n")
                if index < 0:
                    break
                line = self.buf[:index]
                self.buf = self.buf[index + 1:]
                line = line.rstrip("\r")
                if line:
                    _broadcast_log(line, self.streamName)
        except Exception:
            pass

    def flush(self):
        try:
            self.base.flush()
        except Exception:
            pass

    def writelines(self, lines):
        for line in lines:
            self.write(line)

    def __getattr__(self, name):
        return getattr(self.base, name)


def _install_log_tee():
    if _LOG_TEE_INSTALLED.get("done"):
        return
    _LOG_TEE_INSTALLED["done"] = True
    try:
        sys.stdout = _LogTee("stdout", sys.stdout)
        sys.stderr = _LogTee("stderr", sys.stderr)
    except Exception:
        traceback.print_exc()
`;

/** 实际写入的 modMain.py = 主体 + 日志 tee（tee 依赖前面的 _STATES/_TEXT_TYPE 定义）。 */
const MOD_MAIN_FULL_PY = MOD_MAIN_PY + LOG_TEE_PY;

/** 生成 bridgeConfig.py（写入 Host 端口）。 */
function buildBridgeConfigPy(port, host, token) {
  return [
    '# -*- coding: utf-8 -*-',
    '# 由 dsh-mcdev Host 自动生成，每次 start 都会重写。',
    `HOST = ${JSON.stringify(String(host || '127.0.0.1'))}`,
    `PORT = ${Number(port)}`,
    `PROTOCOL_VERSION = ${JSON.stringify(BRIDGE_PROTOCOL_VERSION)}`,
    `MOD_NAME = ${JSON.stringify(BRIDGE_MOD_NAME)}`,
    `TOKEN = ${JSON.stringify(String(token || ''))}`,
    '',
  ].join('\n');
}

/** 生成行为包 manifest。 */
function buildManifest() {
  return {
    format_version: 1,
    header: {
      description: 'dsh-mcdev native bridge (auto-generated)',
      name: BRIDGE_MOD_NAME,
      uuid: BRIDGE_PACK_UUID,
      version: [1, 0, 0],
      min_engine_version: [1, 18, 0],
    },
    modules: [
      {
        description: '',
        type: 'data',
        uuid: BRIDGE_MODULE_UUID,
        version: [1, 0, 0],
      },
    ],
  };
}

/**
 * 安装/更新 bridge 行为包到本机行为包目录。
 * @param {{port:number, host?:string, logFile?:string}} options
 * @returns {{dir:string, uuid:string, port:number, files:string[]}}
 */
export function installBridgePack(options = {}) {
  const port = Number(options.port);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`installBridgePack 需要有效的 Host 端口（收到 ${options.port}）`);
  }
  const host = options.host || '127.0.0.1';
  const packDir = bridgePackDir();
  const moduleDir = path.join(packDir, BRIDGE_MOD_NAME);
  fs.mkdirSync(moduleDir, { recursive: true });

  const files = [
    [path.join(packDir, 'manifest.json'), `${JSON.stringify(buildManifest(), null, 2)}\n`],
    [path.join(moduleDir, '__init__.py'), PACKAGE_INIT_PY],
    [path.join(moduleDir, 'bridgeConfig.py'), buildBridgeConfigPy(port, host, options.token)],
    [path.join(moduleDir, 'modMain.py'), MOD_MAIN_FULL_PY],
  ];
  for (const [file, content] of files) {
    fs.writeFileSync(file, content, 'utf8');
  }
  return {
    dir: packDir,
    uuid: BRIDGE_PACK_UUID,
    port,
    host,
    version: [1, 0, 0],
    files: files.map(([file]) => file),
  };
}

/** 读取任意行为包/资源包目录的 manifest（失败返回 null，不抛异常）。 */
export function readPackManifest(packDir) {
  try {
    const manifestPath = path.join(packDir, 'manifest.json');
    if (!fs.existsSync(manifestPath)) return null;
    const data = JSON.parse(fs.readFileSync(manifestPath, 'utf8').replace(/^\uFEFF/, ''));
    const header = data && data.header;
    if (!header || !header.uuid) return null;
    return { uuid: String(header.uuid), version: normalizeVersion(header.version), name: header.name || '', raw: data };
  } catch {
    return null;
  }
}

/** 归一化版本号为 [int,int,int]。 */
function normalizeVersion(version) {
  if (!Array.isArray(version) || !version.length) return [1, 0, 0];
  const out = version.slice(0, 3).map((value) => {
    const num = Number(value);
    return Number.isInteger(num) && num >= 0 ? num : 0;
  });
  while (out.length < 3) out.push(0);
  return out;
}

/** 扫描一个目录，收集其中所有直接子目录的 manifest（bp/rp 通用）。 */
export function scanPackManifests(dir) {
  const result = [];
  if (!dir || !fs.existsSync(dir)) return result;
  let entries = [];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return result;
  }
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const manifest = readPackManifest(path.join(dir, entry.name));
    if (manifest) result.push({ dir: path.join(dir, entry.name), ...manifest });
  }
  return result;
}

/**
 * 从工程 .mcdev.json 的 included_mod_dirs + 常见约定（<project>/bp、<project>/rp）解析工程包 uuid。
 * 解析失败只记 warning，不抛错（清单保留原样）。
 * @returns {{behavior:{uuid:string,version:number[],name:string,source:string}[], resource:any[], warnings:string[]}}
 */
export function collectProjectPacks(projectDir, config = {}) {
  const behavior = [];
  const resource = [];
  const warnings = [];
  const seenBehavior = new Set();
  const seenResource = new Set();
  const base = path.resolve(projectDir);

  const addBehavior = (candidate) => {
    const manifest = readPackManifest(candidate);
    if (!manifest || seenBehavior.has(manifest.uuid)) return;
    seenBehavior.add(manifest.uuid);
    behavior.push({ uuid: manifest.uuid, version: manifest.version, name: manifest.name, source: candidate, kind: 'behavior' });
  };
  const addResource = (candidate) => {
    const manifest = readPackManifest(candidate);
    if (!manifest || seenResource.has(manifest.uuid)) return;
    seenResource.add(manifest.uuid);
    resource.push({ uuid: manifest.uuid, version: manifest.version, name: manifest.name, source: candidate, kind: 'resource' });
  };

  // 1) included_mod_dirs 指向的工程根目录：根视为行为包，根下的 bp/ 与 rp/ 分开处理
  const modDirs = Array.isArray(config.included_mod_dirs) ? config.included_mod_dirs : [];
  for (const item of modDirs) {
    const raw = typeof item === 'string' ? item : item && item.path;
    if (!raw) continue;
    const root = path.isAbsolute(raw) ? raw : path.resolve(base, raw);
    addBehavior(root);
    addBehavior(path.join(root, 'bp'));
    addBehavior(path.join(root, 'behavior_pack'));
    addResource(path.join(root, 'rp'));
    addResource(path.join(root, 'resource_pack'));
  }

  // 2) 工程约定：<project>/bp 是行为包、<project>/rp 是资源包（不要互相串）
  addBehavior(base);
  addBehavior(path.join(base, 'bp'));
  addBehavior(path.join(base, 'behavior_pack'));
  addResource(path.join(base, 'rp'));
  addResource(path.join(base, 'resource_pack'));

  if (!behavior.length) warnings.push('未能从工程 included_mod_dirs/bp 解析出行为包 uuid，世界行为包清单将保留原状（只追加 bridge 包）');
  if (!resource.length) warnings.push('未能从工程 rp 解析出资源包 uuid，世界资源包清单将保留原状');
  return { behavior, resource, warnings };
}

/** 读取世界清单 JSON 数组（不存在返回 []）。 */
function readWorldPackList(file) {
  try {
    if (!fs.existsSync(file)) return [];
    const data = JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

/** 把 adds 合并进清单（按 pack_id 去重，已存在的保留原 version，不删除任何已有项）。 */
function mergePackList(existing, adds) {
  const out = existing.map((item) => ({ ...item }));
  const known = new Set(out.map((item) => String(item && item.pack_id)));
  const added = [];
  for (const add of adds) {
    const id = String(add.uuid);
    if (known.has(id)) continue;
    known.add(id);
    out.push({ pack_id: id, version: normalizeVersion(add.version) });
    added.push(id);
  }
  return { list: out, added };
}

/**
 * 确保开发世界的 world_behavior_packs.json / world_resource_packs.json 包含 bridge 包与工程包。
 * 已有条目（包括外部工具的包）一律保留，不删除。
 * @returns {{behaviorPacks:any[], resourcePacks:any[], addedBehavior:string[], addedResource:string[], warnings:string[]}}
 */
export function ensureWorldPackList(worldDir, adds = {}) {
  const behaviorFile = path.join(worldDir, 'world_behavior_packs.json');
  const resourceFile = path.join(worldDir, 'world_resource_packs.json');
  const warnings = [];

  const existingBehavior = readWorldPackList(behaviorFile);
  const existingResource = readWorldPackList(resourceFile);

  const behaviorAdds = [{ uuid: BRIDGE_PACK_UUID, version: [1, 0, 0] }, ...(adds.behavior || [])];
  const resourceAdds = [...(adds.resource || [])];
  const mergedBehavior = mergePackList(existingBehavior, behaviorAdds);
  const mergedResource = mergePackList(existingResource, resourceAdds);

  try {
    fs.writeFileSync(behaviorFile, `${JSON.stringify(mergedBehavior.list, null, 4)}\n`, 'utf8');
  } catch (error) {
    warnings.push(`写入 world_behavior_packs.json 失败：${error.message}`);
  }
  // 资源包清单没有新增项时不重写（避免动用户文件）
  if (resourceAdds.length && mergedResource.added.length) {
    try {
      fs.writeFileSync(resourceFile, `${JSON.stringify(mergedResource.list, null, 4)}\n`, 'utf8');
    } catch (error) {
      warnings.push(`写入 world_resource_packs.json 失败：${error.message}`);
    }
  }

  return {
    behaviorPacks: mergedBehavior.list,
    resourcePacks: mergedResource.list,
    addedBehavior: mergedBehavior.added,
    addedResource: mergedResource.added,
    warnings,
  };
}
