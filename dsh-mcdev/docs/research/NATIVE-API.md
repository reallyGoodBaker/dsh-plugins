# NATIVE-API：ModSDK 运行时核对（自研 bridge 行为包）

> 目标：用「行为包里的 ModSDK Python + loopback socket」替代 MCDK，因此需要确认 ModSDK 运行时到底能用什么。
> 本文档 = **语料核对 + 真机实测**。每条结论都标注来源或「仍未验证」，不发明 API。
>
> - 语料快照：`docs/corpus` 669 篇 / 6.96 MB（`docs/index.json` builtAt `2026-11-14T00:24:33.696Z`）。
> - 检索方式：`docs_search("<关键词>")` + `docs_read("<path>")`。
> - **真机实测环境**：ModPC **3.10.0.436581**、开发世界 `MC_DEV_WORLD`、2026-11-14、本机（探针 `scripts/native-probe.mjs` 连续 `ok=true`）；实测细节与 native provider 实现见 **`docs/NATIVE.md`**（bridge 产出，本文引用其编号章节）。
> - 证据标签：`[官方]` corpus 权威文档明确；`[示例]` 仅示例代码出现、无专门文档；`[框架]` QuModLibs 文档（非官方承诺）；`[实测]` 2026-11-14 真机验证（见 `docs/NATIVE.md`）；`[项目上下文]` 本仓库 CONTRACT.md / 既有 MCDK 联调事实；`[仍未验证]` 既无文档也无实测，**不得当作承诺**。

## 0. 结论速览

| 能力 | 结论 | 证据 |
| --- | --- | --- |
| `@Mod.Binding` + `RegisterSystem` | 可用；实测加载成功，类路径用**完整模块路径**（`dsh_bridge.modMain.DshBridgeServerSystem`） | `[官方]` ModAPI/接口/通用/System.md；`[示例]` QuModDocs/QuModLibs/HybridProject/NeteaseLoader.md；`[实测]` docs/NATIVE.md §4.1 |
| 玩家进游戏 / 客户端就绪 / 每帧 tick 事件 | 可用：`AddServerPlayerEvent`、`ClientLoadAddonsFinishServerEvent`、`OnScriptTickServer/Client`（30/s）、`OnLocalPlayerStopLoading`、`UiInitFinished` | `[官方]` `ModAPI/事件/世界.md`、`ModAPI/事件/UI.md`、`ModAPI/事件/事件索引表.md` |
| 定时器 | 可用：`AddTimer` / `AddRepeatedTimer` / `CancelTimer`，返回 `CallLater` | `[官方]` ModAPI/接口/通用/工具.md |
| `json` / `math` / `random` / `sys` | 官方示例中直接 import 使用；`json`/`sys` 真机可用 | `[示例]` 见 §2.1；`[实测]` docs/NATIVE.md §4.3 |
| `threading` | 可用（真机后台线程跑 socket 收包）；`threading.Event` 回传结果；**游戏 API 回主线程**（用 `AddTimer(0, task)` 投递，实测从 socket 线程调用 `AddTimer` 可行） | `[实测]` docs/NATIVE.md §4.2；`[框架]` QuModDocs/QuModLibs/Modules/Thread/Global.md |
| `socket` | **可用**：游戏内 Python 连 `127.0.0.1:<Host 端口>`，双向 JSON-lines hello/ping/exec/log 全通；断线 1s 重连 | `[实测]` docs/NATIVE.md §4.5 |
| `Queue` / `io` / `os` | `os.getpid` 实测可用；`Queue`/`io` **仍未单独验证** | `[实测]` os；`[仍未验证]` Queue/io |
| `exec` / `eval` / `traceback` | **可用**：表达式返回 3、语句可取 `_result`、异常 traceback 完整 | `[实测]` docs/NATIVE.md §4.3 |
| `print` 输出位置 | **不进官方 `Debug_Log*.txt`**（默认 stdout 不可见）；`sys.stdout/stderr` 可替换为 tee，按行经 socket 回传 | `[实测]` docs/NATIVE.md §4.4；`[官方]` NeteaseGuide/mcguide/26-联机大厅/20-联机大厅调试与多人测试文档.md（日志窗口背景） |
| 官方日志文件 | `%APPDATA%\MinecraftPE_Netease\logs\Debug_Log<YYYY-MM-DD_HH-MM-SS>.txt`，每次启动新建；行格式 `[yyyy-MM-dd HH:mm:ss:SSS LEVEL AREA tid] text`；约 600–800 行/秒 | `[实测]` docs/NATIVE.md §6 |
| `mod_log.logger` | 官方示例大量使用 `from mod_log import logger; logger.info(...)`；真机未单独验证其落点（native 走 stdout tee） | `[示例]`；`[仍未验证]` logger 落点 |
| McpModLog | 平台错误日志，默认关闭、手机端本地、最多 7 天、开发者后台查看；不是实时本地日志 | `[官方]` ModAPI/接口/通用/调试.md |
| 脚本热重载 | **不支持**（真机确认无 ReloadScript）；`addons` 可用 `clientlevel.refresh_addons()`；`clientlevel.restart_local_game()` 存在未调用 | `[官方]` 语料 + `[实测]` docs/NATIVE.md §8/§11 |
| `GetLevelId` / `GetPlayerList` / `GetLocalPlayerId` / `CreatePos().GetPos()` | 可用；注意：`GetLocalPlayerId()` 刚进世界瞬间为 `"-1"`，`GetLevelId()` 立即为 `MC_DEV_WORLD`；native 就绪条件已收紧为 `playerId != "-1"` 并**真机复验通过**（ready 18.6s） | `[官方]` 见 §6；`[实测]` docs/NATIVE.md §5 |
| 合成输入 | **官方无合成键鼠 API**（只能监听输入事件）；native 返回 unsupported，回退 MCDK `mc_input` | `[官方]` 反证见 §6；`[实测]` docs/NATIVE.md §11 |
| 截图 | ModSDK 无截图 API；Host 侧 PowerShell + Win32 `PrintWindow(PW_RENDERFULLCONTENT=2)` 实测成功（420×280 JPEG，**5.7–26KB** 随画面变化），spawn 不能 `windowsHide:true` | `[实测]` docs/NATIVE.md §7/§2 |
| UI 调试 `gui.*` | `gui.get_all_screen_fullnames` 属性存在但 3.10 返回空；`PushScreenEvent/PopScreenEvent` 会触发但启动时已有的 `hud.hud_screen` 多数收不到；`nud_*` 未测 | `[实测]` docs/NATIVE.md §11 |
| 并发多实例 | 曾实测两实例并发把开发世界搞崩（`0xC0000409`，日志尾部 `ServerPlayer not found` / `ClientLevel is empty` / `Level-...Destructed`）；**现已加世界级互斥锁并真机复验：并发 `start()` 返回可读错误，不再崩世界**（协作式；旧版本进程/第三方工具不检查该锁） | `[实测]`（bridge 2026-11-14；锁见 docs/NATIVE.md §3.4） |

## 1. 最小骨架（服务端 + 客户端）

### 1.1 `modMain.py`

官方语料**没有 modMain 模板页**，`@Mod.Binding` 仅出现在 QuMod 示例；`RegisterSystem` 的官方示例明确写在 `@Mod.InitServer()` / `@Mod.InitClient()` 内。

```python
# -*- coding: utf-8 -*-
from mod.common.mod import Mod
import mod.server.extraServerApi as serverApi
import mod.client.extraClientApi as clientApi

@Mod.Binding(name="McdNativeBridge", version="0.1.0")
class McdNativeBridge(object):
    @Mod.InitServer()
    def initServer(self):
        serverApi.RegisterSystem("McdNativeBridge", "BridgeServerSystem",
                                 "bridgeScripts.bridgeServerSystem.BridgeServerSystem")

    @Mod.InitClient()
    def initClient(self):
        clientApi.RegisterSystem("McdNativeBridge", "BridgeClientSystem",
                                 "bridgeScripts.bridgeClientSystem.BridgeClientSystem")

    @Mod.DestroyServer()
    def destroyServer(self):
        pass

    @Mod.DestroyClient()
    def destroyClient(self):
        pass
```

- `mod.common.mod` / `@Mod.Binding(name, version)` / `@Mod.InitServer` / `@Mod.InitClient` / `@Mod.DestroyServer` / `@Mod.DestroyClient` 写法：`[示例]` QuModDocs/QuModLibs/HybridProject/NeteaseLoader.md、`QuModDocs/QuModLibs/HybridProject/BlendLoader.md`（同文件可注册多个 MOD 类）。
- `RegisterSystem(nameSpace, systemName, clsPath)`，`clsPath` 从脚本第一层算起（`包.文件.类`）：`[官方]` ModAPI/接口/通用/System.md §RegisterSystem。
- `GetServerSystemCls()` / `GetClientSystemCls()` 取基类：`[官方]` ModAPI/接口/通用/System.md。
- **实测加载规则**（`[实测]` docs/NATIVE.md §4.1/§3.1）：行为包下**每个包含 `modMain.py` 的文件夹**都会被引擎当作代码模块加载（文件夹名 = Python 包名，即行为包里含 `__init__.py`/`bridgeConfig.py`/`modMain.py` 的 `dsh_bridge/`）；`RegisterSystem` 类路径用**完整模块路径**，如 `"dsh_bridge.modMain.DshBridgeServerSystem"`；bridge 实现先试完整路径、失败回退 `modMain.*` 并打印 traceback。
- **Python 版本**：语料说运行时是游戏内置 Python 2.7（QuModDocs/QuModLibs/modMain.md），但真机 `sys.version` 未打印、无法最终确认；bridge 源码同时通过 `py -3.14` 与 `python 2.7` 语法编译、运行时按 `sys.version_info` 分支执行 `exec` → 建议 native 侧代码保持**双版本可编译**，不写死 `print x` 语句（`[实测]` docs/NATIVE.md §1/§11）。

### 1.2 ServerSystem 骨架（示意：服务端系统；native 实际双端各一个）

```python
# bridgeScripts/bridgeServerSystem.py  （ModSDK Python；真实版本未最终确认，代码应双版本可编译）
# -*- coding: utf-8 -*-
import json
import Queue
import socket
import threading
import traceback

import mod.server.extraServerApi as serverApi
from mod_log import logger

ServerSystem = serverApi.GetServerSystemCls()


class BridgeServerSystem(ServerSystem):
    def __init__(self, namespace, systemName):
        ServerSystem.__init__(self, namespace, systemName)
        self._levelId = serverApi.GetLevelId()                       # [官方] 地图.md §GetLevelId
        self._game = serverApi.GetEngineCompFactory().CreateGame(self._levelId)  # [官方] Component.md
        self._tasks = Queue.Queue()
        self._lock = threading.Lock()
        self._running = True
        self._sock = None
        self._port = 0

        engine_ns = serverApi.GetEngineNamespace()
        engine_sys = serverApi.GetEngineSystemName()
        self.ListenForEvent(engine_ns, engine_sys, "AddServerPlayerEvent", self, self._onPlayerAdd)
        self.ListenForEvent(engine_ns, engine_sys, "ClientLoadAddonsFinishServerEvent", self, self._onClientReady)
        self.ListenForEvent(engine_ns, engine_sys, "OnScriptTickServer", self, self._onTick)

        # 启动 loopback 监听（实际端口要在日志/文件中暴露给 Host）
        self._start_socket("127.0.0.1", 0)

    # ---- ModSDK 事件（都在游戏主线程） ----
    def _onPlayerAdd(self, args):
        logger.info("[bridge] player add id=%s" % args.get("id"))

    def _onClientReady(self, args):
        logger.info("[bridge] client ready playerId=%s" % args.get("playerId"))

    def _onTick(self, _args=None):
        # 每 tick 泵出队列里的任务，再执行任何游戏 API —— 见 §2.2 主线程约束
        for _ in range(32):
            try:
                task = self._tasks.get_nowait()
            except Queue.Empty:
                break
            try:
                task()
            except Exception:
                logger.error("[bridge] task error: %s" % traceback.format_exc())
```

事件与参数（全部 `[官方]`）：

| 事件 | 端 | 参数 | 用途/坑 |
| --- | --- | --- | --- |
| `AddServerPlayerEvent` | 服务端 | `id`、`isTransfer/isReconnect/isPeUser/transferParam/uid/proxyId`（后 6 个仅 Apollo） | 玩家加入。**此时客户端 mod 未加载完，不能给客户端发事件**；玩家实体也未加载完，勿切维度 → 用 `ClientLoadAddonsFinishServerEvent` 做初始化下发 |
| `ClientLoadAddonsFinishServerEvent` | 服务端 | `playerId` | 客户端 mod 加载完成，适合给客户端下发初始化数据 |
| `OnScriptTickServer` | 服务端 | 无 | 服务器 tick，30/s；bridge 主循环建议挂这里 |
| `OnScriptTickClient` | 客户端 | 无 | 客户端 tick，30/s |
| `AddPlayerAOIClientEvent` | 客户端 | 视野内玩家 | 可替代过期的 `AddPlayerEvent` |
| `OnLocalPlayerStopLoading` | 客户端 | `playerId` | 进存档、出生点地形加载完成；此时可切维度 |
| `UiInitFinished` | 客户端 | 无 | UI 框架初始化完成，才能 `RegisterUI/CreateUI`；**切维度会重新初始化并再次触发** |
| `ServerChatEvent` | 服务端 | `username`、`playerId`、`message`、`cancel`、`bChatById`、`toPlayerIds`、`gameChatPrefix*` | 可拦截/改写聊天；`cancel=True` 可取消 |

来源：`ModAPI/事件/世界.md` §AddServerPlayerEvent/§ClientLoadAddonsFinishServerEvent/§OnScriptTickServer/§OnLocalPlayerStopLoading/§ServerChatEvent；`ModAPI/事件/UI.md` §UiInitFinished；`ModAPI/事件/控制.md` §OnKeyPressInGame 等；`ModAPI/事件/事件索引表.md` 总表。

监听签名：`self.ListenForEvent(namespace, systemName, eventName, self, self.handler, priority=0)`；引擎事件必须用 `GetEngineNamespace()` / `GetEngineSystemName()`；priority 0–10 越大越先；服务端监听客户端系统事件时回调自带 `__id__`；反注册用 `UnListenForEvent(...)`，`UnListenAllEvents()` 清空。`[官方] ModAPI/接口/通用/事件.md`

> 说明：上面的骨架是**示意**，不是 native 最终实现；native 不用 `Queue`（未验证），而是 socket 线程 `AddTimer(0, task)` 投主线程 + `threading.Event` 回传，见 §2.2/§2.3。

### 1.3 ClientSystem 骨架

```python
# bridgeScripts/bridgeClientSystem.py  （ModSDK Python；版本未最终确认，代码应双版本可编译）
# -*- coding: utf-8 -*-
import mod.client.extraClientApi as clientApi
from mod_log import logger

ClientSystem = clientApi.GetClientSystemCls()


class BridgeClientSystem(ClientSystem):
    def __init__(self, namespace, systemName):
        ClientSystem.__init__(self, namespace, systemName)
        self._game = clientApi.GetEngineCompFactory().CreateGame(clientApi.GetLevelId())
        engine_ns = clientApi.GetEngineNamespace()
        engine_sys = clientApi.GetEngineSystemName()
        self.ListenForEvent(engine_ns, engine_sys, "UiInitFinished", self, self._onUiInit)
        self.ListenForEvent(engine_ns, engine_sys, "OnLocalPlayerStopLoading", self, self._onStopLoading)
        self.ListenForEvent(engine_ns, engine_sys, "OnScriptTickClient", self, self._onTick)

    def _onUiInit(self, args=None):
        logger.info("[bridge] UiInitFinished localPlayer=%s" % clientApi.GetLocalPlayerId())

    def _onStopLoading(self, args):
        logger.info("[bridge] world loaded player=%s" % args.get("playerId"))

    def _onTick(self, _args=None):
        pass
```

- 客户端侧 bridge 可直接拿 `GetLocalPlayerId()`、剪贴板、UI 调试（若 `gui` 可用）——但服务端无法直接读这些，**两端职责要拆开**。
- UI 注册/创建必须在 `UiInitFinished` 之后：`[官方] NeteaseGuide/mcguide/18-界面与交互/30-UI说明文档.md §界面创建流程`、`[官方] ModAPI/接口/自定义UI/通用.md §RegisterUI/§CreateUI`。

### 1.4 定时器（正确用法）

```python
levelId = serverApi.GetLevelId()
game = serverApi.GetEngineCompFactory().CreateGame(levelId)   # 客户端把 serverApi 换 clientApi
once = game.AddTimer(1.0, self._on_once, "payload")            # 非重复，返回 CallLater
repeat = game.AddRepeatedTimer(1.0, self._on_repeat)           # 重复
game.CancelTimer(repeat)                                       # 两种返回值都可传入
```

- `AddTimer(delay, func, *args, **kwargs)`：延迟秒，非重复，返回 `CallLater`（`func` 非函数时返回 `None`）。`[官方] ModAPI/接口/通用/工具.md §AddTimer`
- `AddRepeatedTimer(delay, func, *args, **kwargs)`：重复触发，返回 `CallLater`。`[官方] §AddRepeatedTimer`
- `CancelTimer(timer)`：`timer` 为 `AddTimer`/`AddRepeatedTimer` 返回的实例。`[官方] §CancelTimer`
- 帧率：服务端引擎 20 帧/s、服务端脚本 30 帧/s，`GetServerTickTime()` 可能连续返回同一引擎帧时间。`[官方] ModAPI/接口/通用/工具.md §GetServerTickTime`
- **bridge 主循环建议用 `OnScriptTickServer`（30/s）而不是 `AddTimer(0.0, ...)` 自旋**；定时器只用于粗粒度任务（心跳、超时清理）。回调里是否可以安全调用所有游戏 API，语料未显式声明，但 QuModLibs 明确「涉及游戏 API 要回主线程」→ 定时器回调属于游戏线程，`[框架] QuModDocs/QuModLibs/Modules/Thread/Global.md`。
- 协程（可缓解卡顿）：`StartCoroutine(generator|func, callback)` / `StopCoroutine(generator)`，示例里用 `AddTimer` 1 秒后停止、5 秒后从断点继续。`[官方] ModAPI/接口/通用/工具.md §StartCoroutine/§StopCoroutine`

## 2. Python stdlib 与线程

### 2.1 语料证据表

| 模块 | 语料结论 | 证据 |
| --- | --- | --- |
| `json` | 官方示例直接 `import json` + `json.dumps(dict)` | `[示例] ModAPI/接口/实体/行为.md`（SetEntityInteractFilter 示例） |
| `math` | 官方示例 `import math` | `[示例] ModAPI/接口/物理/关节.md` |
| `random`、`sys` | 官方示例 `import random, sys` | `[示例] NeteaseGuide/mcguide/20-玩法开发/15-自定义游戏内容/4-自定义维度/1-自定义维度.md` |
| `time` | 框架示例 `from time import sleep` | `[框架] QuModDocs/QuModLibs/Modules/Thread/Global.md` |
| `threading` | 真机可用：socket 收包跑后台 `threading.Thread`，结果用 `threading.Event` 回传 | `[实测]` docs/NATIVE.md §4.2；`[框架]` QuModDocs/QuModLibs/Modules/Thread/Global.md |
| `socket` | **真机可用**：游戏内 Python 主动连 `127.0.0.1:<Host 端口>`，hello/ping/exec/log 双向 JSON-lines 全通；断线每 1s 重连 | `[实测]` docs/NATIVE.md §4.5 |
| `Queue` | 未单独验证（bridge 用 `threading.Event` + 主线程投递，未用 Queue） | `[仍未验证]` |
| `os` / `io` | `os.getpid` 真机可用；`io` 未单独验证 | `[实测]` os / `[仍未验证]` io |
| `exec` / `eval` / `traceback` | **真机可用**：表达式 `1+2→3`、语句 `_result=...` 取值、异常 traceback 完整 | `[实测]` docs/NATIVE.md §4.3 |
| sandbox/白名单 | 语料没有任何「Python 沙箱/模块白名单/禁止 import」的说明；真机未触发阻止 | 逐项实测，已知项见上 |

### 2.2 线程模型与主线程约束（对 bridge 最关键）

- `[实测]`（docs/NATIVE.md §4.2）：socket 收包放后台 `threading.Thread`；**从 socket 线程调用 `CreateGame(levelId).AddTimer(0, task)` 把任务投到主线程是可行的**；主线程执行完用 `threading.Event` 唤醒 socket 线程再回包。
- `[框架]` QuModLibs 有同语义封装：`QThreadPool` + `RUN_IN_MAIN_THREAD(fn)`（线程可起，游戏 API 回主线程）；QuModLoader 也称所有框架运行在同一线程环境。`[框架] QuModDocs/QuModLibs/HybridProject/QuModLoader.md`
- 因此确定的设计（native 已落地）：
  1. socket 收包线程只做 `recv` / `json.loads` / 投递任务，**不直接调用游戏 API**；
  2. 用 `AddTimer(0, task)` 把任务投到主线程执行（这是唯一实测过的跨线程入口）；
  3. 事件回调（如 `OnScriptTickServer/Client`）里同样不要阻塞、不要 `recv()`。
- 推论：socket 线程实测可安全调用 `AddTimer`，但**其它游戏 API（含 `clientApi` / `gui.*`）不要跨线程直接调**；bridge 已把 `ping`/`info` 改为 `AddTimer` 投主线程再取，并**真机复验通过**（ready 18.6s、exec client/server 全 ok、stop 后无残留进程）。`[实测]`
- `exec` 执行超时：native 默认 10s，Host 可传 timeout（`[实测]` docs/NATIVE.md §4.2）。

### 2.3 loopback JSON-lines 协议示例（实测形态：Host 监听、游戏出连）

```python
    # ---- 下面演示「游戏侧作 TCP server」的框架无关写法（分帧 + 主线程投递）；----
    # ---- 但 native 实测成功的是反向：Host listen(127.0.0.1:0)、游戏 create_connection 出连 ----
    # ---- 见本节末尾「实测协议」与 docs/NATIVE.md §4.5 ----
    def _start_socket(self, host, port):
        self._sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        self._sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        self._sock.bind((host, port))
        self._sock.listen(4)
        self._port = self._sock.getsockname()[1]          # port=0 时由系统分配
        logger.info("[bridge] listening 127.0.0.1:%d" % self._port)
        t = threading.Thread(target=self._accept_loop)
        t.setDaemon(True)                                  # Py2：setDaemon(True)
        t.start()

    def _accept_loop(self):
        while self._running:
            try:
                conn, _addr = self._sock.accept()
            except Exception:
                break
            t = threading.Thread(target=self._client_loop, args=(conn,))
            t.setDaemon(True)
            t.start()

    def _client_loop(self, conn):
        reader = conn.makefile("rb")
        try:
            while self._running:
                line = reader.readline()
                if not line:
                    break
                line = line.strip()
                if not line:
                    continue
                try:
                    req = json.loads(line.decode("utf-8"))
                except Exception:
                    continue
                # 只入队，立刻回到 recv；真正的处理在主线程 _onTick
                self._tasks.put(lambda req=req, conn=conn: self._handle(req, conn))
        finally:
            try:
                conn.close()
            except Exception:
                pass

    def _reply(self, conn, obj):
        # 线上统一 ASCII JSON（ensure_ascii=True），Host 侧解码，规避 Py2 unicode/bytes 混淆
        data = json.dumps(obj, ensure_ascii=True) + "\n"
        with self._lock:
            conn.sendall(data.encode("ascii"))

    def _handle(self, req, conn):
        rid = req.get("id")
        cmd = req.get("cmd")
        try:
            if cmd == "ping":
                self._reply(conn, {"id": rid, "ok": True, "result": {"levelId": self._levelId}})
            elif cmd == "players":
                self._reply(conn, {"id": rid, "ok": True, "result": serverApi.GetPlayerList()})
            elif cmd == "exec":
                self._reply(conn, {"id": rid, "ok": True, "result": run_code(req.get("code", ""))})  # run_code 见 §3
            else:
                self._reply(conn, {"id": rid, "ok": False, "error": "unknown cmd"})
        except Exception:
            self._reply(conn, {"id": rid, "ok": False, "error": traceback.format_exc()})
```

> 该示例用 `Queue` 做「线程→主线程」任务队列；**`Queue` 仍未验证**。native 实测形态用 `AddTimer(0, task)` 投主线程 + `threading.Event` 回传，不依赖 Queue。

- **实测形态（native 已落地）**：Host 先 `listen(127.0.0.1:0)` 拿到随机端口并写进游戏侧 `bridgeConfig.py`；游戏 bridge 作为 TCP **client** 主动连 Host，断线每 1s 重连；同 side 的新连接替换旧连接。协议 = UTF-8 JSON lines（每行一个 JSON）。`[实测] docs/NATIVE.md §4.5`
- 配置通道：native 直接写游戏侧 `bridgeConfig.py`（最简单）；`GetModConfigJson("modconfigs/bridge.json")` 也在语料中、可读行为包 `modconfigs/`（失败返回空 dict），但**真机未验证**，可作备选。`[官方] ModAPI/接口/通用/工具.md §GetModConfigJson`
- 实测协议消息（`[实测]` docs/NATIVE.md §4.5）：

| 方向 | 消息 | 说明 |
| --- | --- | --- |
| 游戏→Host | `{"type":"hello","side":"client|server","version":"1.0.0"}` | 连接成功立即发，Host 记录连接 |
| Host→游戏 | `{"id":n,"type":"ping"}` | 探活/就绪判定 |
| 游戏→Host | `{"id":n,"type":"pong","data":{...}}` | data 含 side/levelId/playerId/inWorld/screens/logTee 等 |
| Host→游戏 | `{"id":n,"type":"exec","code":"...","side":"client|server","timeout":10}` | 执行代码 |
| 游戏→Host | `{"id":n,"type":"result","ok":true,"returnValue":...,"returnType":...}` / `{"ok":false,"error":"traceback"}` | 执行结果 |
| Host→游戏 | `{"id":n,"type":"reload"}` | native 固定回 `ok:false, error:"unsupported"` |
| 游戏→Host | `{"type":"log","side":"client","stream":"stdout|stderr","text":"..."}` | print/stderr tee |

- 安全注意：当前协议**没有 token 鉴权**，Host 只监听 127.0.0.1 随机端口但本机任意进程可连并执行 Python → 按本机可信设计，后续应加一次性 token。`[实测] docs/NATIVE.md §11`

### 2.4 可用性实测脚本（已由 native-probe 覆盖，可复用做回归）

```python
# 在游戏内跑（MCDK execute_code，或临时 bridge 启动日志里打印）
mods = ["json", "math", "random", "sys", "time", "socket", "threading", "Queue", "io", "os", "traceback"]
ok, bad = [], []
for name in mods:
    try:
        __import__(name)
        ok.append(name)
    except Exception as e:
        bad.append("%s: %s" % (name, repr(e)))
print("BRIDGE_IMPORT_OK", ok)
print("BRIDGE_IMPORT_FAIL", bad)

# socket 功能自检（listen + 自连，跑通即证明 loopback 可用）
import socket
srv = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
srv.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
srv.bind(("127.0.0.1", 0)); srv.listen(1)
port = srv.getsockname()[1]
cli = socket.create_connection(("127.0.0.1", port), 1.0)
conn, _ = srv.accept()
cli.sendall(b'{"id":1,"cmd":"ping"}\n')
print("BRIDGE_SOCKET_ECHO", conn.recv(1024))
conn.close(); cli.close(); srv.close()
```

**实测结论（2026-11-14，ModPC 3.10.0.436581，`scripts/native-probe.mjs`，`[实测]` docs/NATIVE.md §10）**：

| 探针项 | 结果 |
| --- | --- |
| socket（连 Host 127.0.0.1 随机端口） | ✅ hello/ping/exec/log 双向通，断线 1s 重连 |
| threading / threading.Event | ✅ 后台收包线程 + 主线程投递 |
| exec 表达式 / 语句 / 异常 | ✅ `1+2→3`、`_result` 取值、traceback 完整 |
| 日志（官方 Debug_Log + print tee） | ✅ 2000 行缓冲含 `NATIVE_TEST`、含 traceback |
| 截图（Host 侧 PrintWindow） | ✅ `420x280` JPEG 5.7KB，`PrintWindow-2` |
| reload(scripts) / reload(addons) | ❌ unsupported / ✅ `clientlevel.refresh_addons()` |
| jsonui(/screens) | ⚠️ `ok:true` 但内容 best-effort（见 §7） |

## 3. `exec` / `eval` 与结果序列化

- **语料 0 处出现 `exec(` / `eval(` / `compile(` / `execfile`，但真机实测可用**：表达式 `1+2→3`、语句可设 `_result` 取值、`raise` 的 traceback 完整。`[实测] docs/NATIVE.md §4.3`
- native 实测执行语义（docs/NATIVE.md §4.3）：① 先 `compile(code, "<dsh_bridge>", "eval")`，成功即 `eval` 返回表达式值；② `SyntaxError` 则按语句 `exec`，代码可设置 `_result` 作为返回值；③ 执行环境每个 side 独立 dict，预置 `clientApi`/`serverApi`/`gui`（若可导入）与 `dsh` 辅助对象（`dsh.info()`/`dsh.in_world()`/`dsh.screens()`）。
- 建议实现（返回值约定 `_result`，兼容 Py2/Py3；native 已按此落地）：

```python
def run_code(code):
    ns = {"__name__": "__bridge__"}
    try:
        exec(compile(code, "<bridge>", "exec"), ns, ns)   # [实测] exec/compile 可用
        return {"ok": True, "result": ns.get("_result")}
    except Exception:
        try:
            import traceback
            return {"ok": False, "error": traceback.format_exc()}
        except Exception:
            return {"ok": False, "error": "exec failed"}
```

- 表达式快捷通道：`eval(code, {}, {})` 直接返回表达式值（`[实测]` 可用）。
- 序列化兜底（Py2 版 `_to_jsonable`）：

```python
def _to_jsonable(v, depth=0):
    if depth > 6:
        return u"<max-depth>"
    if v is None or isinstance(v, (bool, int, long, float)):
        return v
    if isinstance(v, unicode):
        return v
    if isinstance(v, str):
        try:
            return v.decode("utf-8")
        except Exception:
            return v.decode("utf-8", "replace")
    if isinstance(v, (list, tuple)):
        return [_to_jsonable(x, depth + 1) for x in v]
    if isinstance(v, dict):
        out = {}
        for k, val in v.items():
            if isinstance(k, (str, unicode)):
                out[_to_jsonable(k, depth + 1)] = _to_jsonable(val, depth + 1)
            else:
                out[u"<key:%s>" % type(k).__name__] = _to_jsonable(val, depth + 1)
        return out
    return u"<%s %s>" % (type(v).__name__, repr(v))


def dump_result(value):
    try:
        return json.dumps(_to_jsonable(value), ensure_ascii=True)   # 线上统一 ASCII
    except Exception:
        return json.dumps({"type": type(value).__name__, "repr": repr(value)}, ensure_ascii=True)
```

- 坑：`long`/`unicode` 是 Py2 内置，但**真机 Python 版本未最终确认**（见 §1.1）→ 序列化代码要双版本可编译（bridge 用 `sys.version_info` 分支，Py2 走 `long/unicode`、Py3 走 `int/str`）；`json.dumps` 对 utf-8 `str` 会抛 `UnicodeDecodeError`，所以先 `decode`；把结果嵌进外层 JSON 时**不要重复 dumps**（`dump_result` 返回字符串，外层协议作为字符串字段即可）。不可序列化对象降级为 `{"__type__":..., "__repr__":...}`（native 实测回包格式，`[实测]` docs/NATIVE.md §4.3）。
- `exec` 的代码可能死循环/阻塞 → ModSDK 内没有安全中断手段（语料无超时 API）→ Host 侧必须用 socket 超时 + 进程重启兜底（native 默认 exec 超时 10s，`[实测]` docs/NATIVE.md §4.2）。

## 4. 日志

- `print` 在官方示例中大量使用（`ModAPI/接口/通用/工具.md §GetServerTickTime`、`ModAPI/事件/世界.md §ServerChatEvent`、`NeteaseGuide/mcguide/20-玩法开发/15-自定义游戏内容/2-自定义方块/4-自定义方块实体.md` 等），示例全部是 Py2 的 `print x` 语句 → 文档面向的运行时是 Python 2.7；但**游戏内真实 `sys.version` 未打印确认**（见 §1.1），native 代码按双版本兼容写。`[官方示例]` + `[仍未验证]` 版本
- 官方只说明「本地测试时，日志窗口只会显示本地客户端的日志」；进入游戏后会自动拉起「脚本测试日志」，客户端/服务端两个日志窗口（服务端日志需通过多人测试/服务器日志按钮拉起）。`[官方] NeteaseGuide/mcguide/26-联机大厅/20-联机大厅调试与多人测试文档.md`
- **实测（关键）**：GUI 进程里 `print` **不会**出现在官方 `Debug_Log*.txt`（默认 stdout 不可见）；但 `sys.stdout/sys.stderr` 可被替换成 tee（保留原输出 + 按行走 socket 回传），Host 合并进日志后 `grep NATIVE_TEST` 能命中。`[实测] docs/NATIVE.md §4.4/§6`
- **官方日志文件（已确认）**：`%APPDATA%\MinecraftPE_Netease\logs\Debug_Log<YYYY-MM-DD_HH-MM-SS>.txt`（每次启动新建），行格式 `[2026-11-14 09:17:41:123 LEVEL AREA tid] text`，约 **600–800 行/秒**（25s 会话 1.1–1.6 万行）；引擎日志里没有 `[Python]` 前缀的 print（那是 MCDK debug 包自己包 stdout 才有）。`[实测] docs/NATIVE.md §6`
- `mod_log`：官方示例统一写 `from mod_log import logger as logger` + `logger.info/error(...)`（`ModAPI/接口/自定义UI/通用.md §RegisterUI`、`ModAPI/事件/世界.md §ServerChatEvent`、`ModAPI/接口/通用/调试.md §PostMcpModDump` 提及参数会传给 `logger.error`）。但**该模块的 API 文档不在语料中**，且 native 真机未单独验证其落点（bridge 用 stdout tee 替代）→ `[示例]` + `[仍未验证]`。
- McpModLog（平台日志）：`GetMcpModLogCanPostDump()` / `SetMcpModLogCanPostDump(canPost)` / `PostMcpModDump(msg, *args, **kwargs)`；内容为开发者组件错误信息（不含引擎错误），**默认关闭**、存手机端本地、最多保留 7 天、开发者后台查看；联机大厅等服务器环境无效（仅单机/本地联机房主）。不适合当 bridge 实时日志。`[官方] ModAPI/接口/通用/调试.md §GetMcpModLogCanPostDump/§PostMcpModDump/§SetMcpModLogCanPostDump`
- **bridge 日志建议（native 已落地）**：`sys.stdout/stderr` → `_LogTee`（保留原输出 + 按行 socket 上报） + Host 侧跟随官方 `Debug_Log*.txt` 增量读取（按字节偏移、处理 UTF-8 多字节边界、轮转重读）→ 合并成同一环形缓冲；`print` 单独依赖官方日志**不可行**。
- 常用入口（bridge 至少会用到）：`serverApi.GetLevelId()` / `clientApi.GetLocalPlayerId()` / `GetEngineCompFactory()` / `GetEngineNamespace()` / `GetEngineSystemName()`，签名与来源见 §6 与 §1。
- stdout tee 实测可用：system 初始化时替换 `sys.stdout`/`sys.stderr`，**保留原对象**转发，再按行走 socket；exec 里的 `print`/`traceback.print_exc()` 都能在 `/mcdev logs` 看到。`[实测] docs/NATIVE.md §4.4`
- **取日志的时序坑（实测）**：官方 Debug_Log 约 600–800 行/秒、桥接环形缓冲默认 2000 行 → exec 里的 `print` 经 tee 回传后**要尽早查 `logs()`**；若隔 3–5 秒再查，print 行可能已被官方日志挤出缓冲（**不是 tee 失效**）。探针现在在 client exec 后立即记录 `clientPrintInLogs`（已验证 true），并保留 `earlyLogHasPrint`。`[实测] docs/NATIVE.md §6`

## 5. 热重载：官方不支持，需重进存档/重启

- `ImportModule(path)`：字符串路径导入**当前已加载 mod 中的模块**，作用类似 `importlib.import_module`，不存在返回 `None`。文档参数说明写「模块的绝对路径」，但示例传的是点分模块路径（`"tutorialScripts.tutorialServerSystem"`）——以示例写法为准。它没有「重载」语义；Python import 默认走 `sys.modules` 缓存，是否强制重新执行模块**真机未验证** → `[仍未验证]`。`[官方] ModAPI/接口/通用/工具.md §ImportModule`
- 语料中**没有** `ReloadScript` / `ReloadModule` / `reload()` 之类的脚本重载接口；`ModAPI/接口/通用/调试.md` 的 `ReloadAllMaterials` / `ReloadAllShaders` / `ReloadOneShader` **只重载材质/Shader 资源**，与 Python 无关。`[官方]`
- 结论：**脚本热重载不支持（真机确认）**。`reload('scripts'|'game')` 返回 `ok:false` + 建议重启；改 Python 后的可靠路径 = 退存档重进 / 重启游戏进程（native 实测 start→进存档约 **17–18.6s**，6 次：16.9/17.1/17.9/18.0/18.0/18.6s）。MCDK 的 `reload_scripts` 是 MCDK 自身能力（`[项目上下文]`），native 路线不可依赖。`[实测] docs/NATIVE.md §5/§8/§11`
- addons 资源可热更：`clientlevel.refresh_addons()` 实测 `ok`（`[实测]` docs/NATIVE.md §8/§11）；`clientlevel.restart_local_game()` 存在但 native 未调用（`[仍未验证]`）。
- bridge 设计约束：必须可随时被杀掉重启；启动要幂等（`SO_REUSEADDR`、端口冲突回退、单实例检测），Host 侧负责「改代码 → 重启 → 重连」。`[实测] docs/NATIVE.md §11`

## 6. 世界/玩家调用（`/screens`、`/input` 最低实现）

| API | 端 | 签名/返回 | 来源 |
| --- | --- | --- | --- |
| `GetLevelId()` | 两端 | `str` 当前地图 levelId（组件创建常用） | `[官方] ModAPI/接口/世界/地图.md §GetLevelId` |
| `GetLocalPlayerId()` | 客户端 | `str` 本地玩家 id | `[官方] ModAPI/接口/世界/实体管理.md §GetLocalPlayerId` |
| `GetPlayerList()` | 两端 | `list(str)` 全维度玩家 id；**顺序无意义** | `[官方] ModAPI/接口/世界/实体管理.md §GetPlayerList` |
| `GetEngineActor()` | 两端 | `dict`：实体 id → `{dimensionId, identifier}`；**不含玩家** | `[官方] ModAPI/接口/世界/实体管理.md §GetEngineActor` |
| `CreatePos(entityId).GetPos()` | 两端 | 位置 tuple（实体坐标） | `[官方] ModAPI/接口/实体/属性.md §GetPos` |
| `GetEntitiesBySelector(selector)` | 服务端 | 目标选择器取实体 id 列表 | `[官方] ModAPI/接口/实体/属性.md §GetEntitiesBySelector` |
| `GetFps()` | 客户端 | float | `[官方] ModAPI/接口/通用/工具.md §GetFps` |
| `GetClipboardContent()` / `SetClipboardContent(text)` | 客户端 | 读/写系统剪贴板（失败返回 None/空串；返回 bool） | `[官方] ModAPI/接口/通用/工具.md §GetClipboardContent/§SetClipboardContent` |

- **实测就绪判定（native 使用，已收紧并复验）**：**不要用**「进程存在/端口可连」判定；就绪 = bridge 已 hello 且 `ping` 返回 `inWorld:true`。client 侧 `inWorld` 条件已按实测收紧为 `GetLevelId()` 非空 && `GetLocalPlayerId()` 非空 && `playerId != "-1"`（原条件漏掉 `"-1"` 也是非空会误判 ready；**已真机复验通过**）。`GetLocalPlayerId()` 稳定后是 `-8589934591` 这类实体 id；`GetLevelId()` 立即为 `MC_DEV_WORLD`。start→进存档约 **17–18.6s**（6 次采样）。`[实测] docs/NATIVE.md §5`

输入 / 截图（`/input`、`/screens`）的现实：

- 语料只有**只读输入事件**：`OnKeyPressInGame{screenName,key,isDown}`、`LeftClickBeforeClientEvent{cancel}`、`LeftClickReleaseClientEvent`、`MouseWheelClientEvent{direction}`、`OnGamepadKeyPressClientEvent` 等；**没有「合成按键/鼠标点击」的 API**。`[官方] ModAPI/事件/控制.md`
- 截图：语料只有权限开关 `SetCanScreenShot(shot)` / `IsCanScreenShot()`（控制玩家是否响应截图按钮），**没有截取画面 API**。`[官方] ModAPI/接口/控制.md §SetCanScreenShot/§IsCanScreenShot`
- 截图实测（Host 侧，native 使用）：PowerShell `Add-Type` 定义 Win32 → `EnumWindows` 按 PID 取可见顶层窗口 → `PrintWindow(hwnd, hdc, PW_RENDERFULLCONTENT=2)`（失败再试 flag=0 → `CopyFromScreen`）→ JPEG；本机实测 `420x280`、5.7KB。**坑：spawn 游戏时不能 `windowsHide:true`**，否则窗口不可见、`EnumWindows`/`MainWindowHandle` 拿不到，截图必败。`[实测] docs/NATIVE.md §7/§2`
- 因此：
  - `/input`：Host 侧注入（Windows `SendInput`/`PostMessage`；MCDK 的 `mc_input` 工具表明这条路径在 MCDK 实现里存在，`[项目上下文]`）。游戏内可选旁证通道：`SetClipboardContent` 文本粘贴、`ServerChatEvent` 拦截命令（会污染聊天，仅作 fallback）。
  - `/screens`：分「截图 + JSON UI 屏幕树」两类。截图走 Host 侧窗口捕获（实测可用，见上）；UI 树见 §7（native 为 best-effort，完整树回退 MCDK `jsonui_debugger`）。玩家/世界信息用上表 API 提供上下文（当前玩家、levelId、坐标）。
  - 若坚持进程内截图：`ctypes` + GDI `PrintWindow/BitBlt` 是理论候选，但 `ctypes` **仍未验证** → 优先 Host 侧。

## 7. UI 调试器（`gui.set_netease_ui_debugger_enable` / `gui.nud_get_control_tree`）

- **语料 0 处覆盖**：`set_netease_ui_debugger_enable`、`nud_get_control_tree`、`UIDebuggerNotifyEvent`、`import gui` 在 corpus 中均无匹配 → 这些具体接口仍 `[仍未验证]`。
- **真机部分实测（`[实测]` docs/NATIVE.md §11）**：`gui.get_all_screen_fullnames` **属性存在**（`hasattr==True`）但 ModPC 3.10 **返回空**；`PushScreenEvent/PopScreenEvent` 会触发，但启动时已存在的 `hud.hud_screen` 多数情况收不到（偶发一次）。
- **native 的 `/screens` 现实**：client system 监听 `PushScreenEvent/PopScreenEvent` 维护屏幕栈 + `gui.get_all_screen_fullnames`（若存在），实测通常返回 `[]`（`in_world` 仍准确）；完整 JSON UI 树/节点查询仍需回退 MCDK `jsonui_debugger`。另：bridge 已把 `ping`/`info` 改为 `AddTimer` 投主线程，并**去掉每次 ping 调 `gui.get_all_screen_fullnames`**（线程安全/性能，已真机复验通过）。`[实测] docs/NATIVE.md §8/§11`
- 间接证据：官方确实有「UI调试工具」页面——`NeteaseGuide/mcguide/18-界面与交互/61-原生界面修改文档.md` 指向 `../30-测试/4-UI调试工具.html`，但 `30-测试/` 章节**不在本语料**（NeteaseGuide 只收了 16-美术/18-界面与交互/20-玩法开发/26-联机大厅/9-规范开发）。`[官方链接存在，页面缺失]`
- 已知线索来自 MCDK 而非语料：MCDK 的 `jsonui_debugger` 工具封装了 UI 树查询，树数据通过事件回调返回（`UIDebuggerNotifyEvent`）——只能作为**实测假设**，不能写进依赖。
- 真机验证脚本（客户端侧跑；`nud_*` 仍未验证，可用此脚本补测）：

```python
try:
    import gui
    print("GUI_MOD_ATTRS", [a for a in dir(gui) if "debug" in a.lower() or "tree" in a.lower() or "nud" in a.lower()])
    print("ENABLE", gui.set_netease_ui_debugger_enable(True))
    # 注册监听（事件名/端仍未验证；监听 API 本身是官方 ListenForEvent）
    gui.nud_get_control_tree()
    print("NUD_SENT")
except Exception:
    import traceback
    print("GUI_FAIL", traceback.format_exc())
```

- 坑（实测确认/仍需注意）：
  1. 必须在客户端、且 `UiInitFinished` 之后；
  2. 切维度会重新初始化 UI（`[官方] ModAPI/事件/UI.md §UiInitFinished`），调试器/控件树要重新取；
  3. 树可能非常大：需要 depth/path 过滤、截断输出，否则一条消息撑爆 socket；
  4. 取树是**异步**的（靠事件回调），要配超时 + 单次请求 id；
  5. 开启调试器可能有性能/持久化副作用，用完要关闭；
  6. 若 `gui` 不可用（或 `get_all_screen_fullnames` 返回空）：降级到 MCDK `jsonui_debugger`（Host 侧已经可用）或直接读资源包 JSON UI + `PushScreenEvent` 等事件推断；native 当前即按此降级。

## 8. 真机验证清单（2026-11-14 已执行；含 ~09:30 复验）

`[实测]` 环境 ModPC 3.10.0.436581，探针 `scripts/native-probe.mjs` 连续 `ok=true`；细节见 `docs/NATIVE.md §10/§11`。

| # | 验证项 | 结果 | 备注/退路 |
| --- | --- | --- | --- |
| 1 | `socket` loopback 连接 | ✅ | 连 Host 127.0.0.1 随机端口，双向 JSON-lines |
| 2 | `threading` 线程 + 主线程投递 | ✅ | 后台收包线程；`AddTimer(0, task)` 投主线程 + `threading.Event` 回传 |
| 3 | `Queue` | ⏳ 未单独验证 | 已用 Event，Queue 非必需 |
| 4 | `exec` / `eval` / `compile` | ✅ | 表达式/语句 `_result`/异常 traceback |
| 5 | `print` 落点 | ✅ | **不进** `Debug_Log*.txt`；`sys.stdout` tee 后可回传 |
| 6 | `mod_log.logger` 输出位置 | ⏳ 未单独验证 | 用 stdout tee，不依赖 logger |
| 7 | `traceback` | ✅ | 异常时完整 traceback |
| 8 | `time.sleep` | ⏳ 未单独验证 | 线程里可用 Python 通用语义，未在游戏内单独探 |
| 9 | `gui.*` UI 调试器 | ⚠️ 部分 | `get_all_screen_fullnames` 存在但返回空；`nud_*` 未测；完整树回退 MCDK |
| 10 | 脚本热重载 | ✅ 确认不支持 | `reload(scripts/game)` 返回 unsupported；addons 走 `refresh_addons()` |
| 11 | 就绪判定（`GetLocalPlayerId`） | ✅ 已收紧并复验 | `inWorld` = `GetLevelId` 非空 && `GetLocalPlayerId` 非空 && `playerId != "-1"`；ping/info 改 `AddTimer` 投主线程；新版 ready 18,569ms |
| 12 | 真实游戏 Python 版本 | ⏳ 未打印 | 未在游戏内打印 `sys.version`；bridge 代码按双版本兼容写 |
| 13 | 截图 | ✅ | Host 侧 `PrintWindow(PW_RENDERFULLCONTENT=2)` 420×280 JPEG，**5.7–26KB** 随画面变化；spawn 不能 `windowsHide` |
| 14 | 启动进存档耗时 | ✅ | 约 17–18.6s（6 次：16.9/17.1/17.9/18.0/18.0/18.6；MCDK legacy 约 39–41s） |
| 15 | 同一开发世界并发两个 native 实例 | ✅ 已加世界锁 | 旧版曾崩（`0xC0000409`，`ServerPlayer not found`/`ClientLevel is empty`/`LevelDestructed`）；新版**协作式世界锁**：并发 `start()` 返回可读错误、不崩世界；锁路径见 §11。注意**旧版本进程/第三方工具不检查该锁** |
| 16 | ping/info 线程安全修复 | ✅ 复验通过 | `AddTimer` 投主线程 + 不再每次 ping 调 `gui.get_all_screen_fullnames`；双版本编译 + 离线自检 14/14 + 真机一次通过（stop 后 `leftoverGamePids=[]`） |

## 9. 实现路线（M0–M4 已由 native provider 落地，含世界锁）

`lib/native/**` 已实现并通过真机探针（`scripts/native-probe.mjs`）；下面是已达成的路线与剩余工作。

1. **M0 探针（已完成）**：`dsh_bridge` 行为包内 `modMain.py` + Server/ClientSystem，跑 §2.4 import/socket 自检 + exec/日志/截图；`scripts/native-probe.mjs` 连续 `ok=true`。
2. **M1 回环桥（已完成）**：Host `listen(127.0.0.1:0)` + 写 `bridgeConfig.py`；游戏侧 `socket.create_connection` + JSON-lines（§2.3 协议表）；断线 1s 重连、同 side 新连接替换旧连接。
3. **M2 执行与日志（已完成）**：exec 先 eval 后 exec（`_result`）；`sys.stdout/stderr` tee 回传；Host 跟随官方 `Debug_Log*.txt` 增量读取，合并环形缓冲（语义同 legacy 的 seq/since/next/skipped/grep）。
4. **M3 世界/UI（部分完成）**：`/screens` = `PushScreenEvent/PopScreenEvent` 屏幕栈 best-effort（完整树回退 MCDK）；`/input` 返回 unsupported（官方无合成输入，需 Host 注入）；截图走 Host `PrintWindow`。
5. **M4 韧性（已完成）**：start 幂等、断线重连、`reload('scripts')` 回 `ok:false + restartRequired`；**世界级互斥锁已实现并真机走完生命周期**（`start()` 获取 → `status.worldLock` → `stop()` 删除；锁路径见 §11；离线用例 10/10：获取/同进程重复获取/存活进程持锁拒绝/死进程锁接管/释放/不删别人的锁）。**注意：协作式锁，旧版本进程或第三方工具不检查它**。另建议 bridge 协议加一次性 token（当前无鉴权）。
6. **M5 与 Host 契约对齐（已完成）**：provider 方法与 `CONTRACT.md` 的 `/mcdev` 动作对齐（status/logs/exec/screenshot/jsonui/input），native 为默认优先 provider、MCDK 保留 legacy。

## 10. 证据索引（corpus 相对路径）

- 系统/入口：`ModAPI/接口/通用/System.md`、`ModAPI/接口/通用/Component.md`、`QuModDocs/QuModLibs/HybridProject/NeteaseLoader.md`、`QuModDocs/QuModLibs/HybridProject/BlendLoader.md`、`QuModDocs/QuModLibs/HybridProject/QuModLoader.md`
- 事件：`ModAPI/接口/通用/事件.md`、`ModAPI/事件/世界.md`、`ModAPI/事件/UI.md`、`ModAPI/事件/控制.md`、`ModAPI/事件/事件索引表.md`
- 工具/定时器/协程/模块：`ModAPI/接口/通用/工具.md`（AddTimer/AddRepeatedTimer/CancelTimer/StartCoroutine/StopCoroutine/ImportModule/GetModConfigJson/剪贴板/GetServerTickTime/GetFps）
- 调试/日志：`ModAPI/接口/通用/调试.md`；日志窗口：`NeteaseGuide/mcguide/26-联机大厅/20-联机大厅调试与多人测试文档.md`
- 世界/玩家：`ModAPI/接口/世界/地图.md`、`ModAPI/接口/世界/实体管理.md`、`ModAPI/接口/实体/属性.md`、`ModAPI/接口/控制.md`
- Python 证据：`ModAPI/接口/实体/行为.md`（json）、`ModAPI/接口/物理/关节.md`（math）、`NeteaseGuide/mcguide/20-玩法开发/15-自定义游戏内容/4-自定义维度/1-自定义维度.md`（random/sys）、`QuModDocs/QuModLibs/Modules/Thread/Global.md`（threading/线程池/主线程）、`QuModDocs/QuModLibs/modMain.md`（Py2.7 运行时说明）
- UI：`NeteaseGuide/mcguide/18-界面与交互/30-UI说明文档.md`（界面创建流程/生命周期）、`ModAPI/接口/自定义UI/通用.md`、`ModAPI/接口/自定义UI/UI界面.md`、`NeteaseGuide/mcguide/18-界面与交互/61-原生界面修改文档.md`（UI调试工具链接）
- 语料缺失（仍无文档）：`30-测试/`（UI调试工具页）、modMain 模板、`mod_log` 模块文档、`socket/threading/Queue/io/os`、`exec/eval`、`gui.*`、本地日志文件格式。
- **项目实测证据（非 corpus，2026-11-14）**：`docs/NATIVE.md`（native provider 实现与实测细节，含 §4 bridge 协议、§5 就绪、§6 日志、§7 截图、§8 能力矩阵、§11 已知限制）；`scripts/native-probe.mjs`（真机探针，连续 `ok=true`）。

## 11. 真机实测记录（2026-11-14，ModPC 3.10.0.436581）

> 详细实现见 `docs/NATIVE.md`；这里只记录与本文档结论对应的事实，避免重复。

| 事实 | 值 | 来源 |
| --- | --- | --- |
| 启动参数 | `Minecraft.Windows.exe chatExtension=false config=<world>\dev_config.cppconfig` | docs/NATIVE.md §2 |
| 开发世界 | `%APPDATA%\MinecraftPE_Netease\minecraftWorlds\<world>`（默认 `MC_DEV_WORLD`） | docs/NATIVE.md §2 |
| 启动→进入存档 | 约 17–18.6s（6 次采样：16.9/17.1/17.9/18.0/18.0/18.6） | docs/NATIVE.md §5 |
| bridge 行为包安装 | `%APPDATA%\MinecraftPE_Netease\games\com.netease\behavior_packs\<uuid去横线>\` | docs/NATIVE.md §2 |
| 代码模块加载 | 行为包下**每个含 `modMain.py` 的文件夹**都作为 Python 包加载 | docs/NATIVE.md §3.1 |
| 官方日志 | `%APPDATA%\MinecraftPE_Netease\logs\Debug_Log<启动时间>.txt`，600–800 行/秒 | docs/NATIVE.md §6 |
| 截图 | Host `PrintWindow(PW_RENDERFULLCONTENT=2)`，420×280 JPEG，**5.7–26KB** 随画面变化；spawn 不能 `windowsHide` | docs/NATIVE.md §7 |
| 日志 tee | `sys.stdout/stderr` → tee → socket `{"type":"log",...}` → Host 合并日志 | docs/NATIVE.md §4.4 |
| 探针结果 | `socket/threading/exec/traceback/print tee/截图/reload(addons)/jsonui best-effort` 全过 | docs/NATIVE.md §10/§11 |
| 并发多实例（已解决） | 曾实测同一 `MC_DEV_WORLD` 两个 native 进程并发 → 两实例几乎同时异常退出，其一 `0xC0000409`（STATUS_STACK_BUFFER_OVERRUN），日志尾部 `ServerPlayer not found` / `ClientLevel is empty` / `Level-...Destructed`。**新版已加世界级互斥锁并复验**：并发 `start()` 返回可读错误、不再崩世界。锁路径 `%APPDATA%\MinecraftPE_Netease\.dsh-mcdev\locks\<world_folder_name>.lock`，内容 `{pid,startedAt,projectDir}`；死进程锁可接管（`tookOver`），同进程重复获取幂等；`stop()` 删除锁、跑完锁目录为空。离线用例 10/10。**协作式锁：旧版本进程/第三方工具不检查它** | `[实测]`（bridge 2026-11-14 ~09:30） |
| 就绪/线程安全复验 | `inWorld` = `GetLevelId 非空 && GetLocalPlayerId 非空 && playerId != "-1"`；`ping`/`info` 改 `AddTimer` 投主线程、每次 ping 不再调 `gui.get_all_screen_fullnames`。复验：**ready 18,569ms**、exec client/server/表达式/异常全 ok、tee 正常（`clientPrintInLogs=true`）、截图 420×280 JPG、reload addons ok / scripts unsupported、stop 后 `leftoverGamePids=[]` | `[实测]`（bridge 2026-11-14） |

**复验记录（2026-11-14 ~09:30，环境空闲后一次通过）**：ready **18,569ms**；世界锁走完生命周期（`start()` 获取 → `status.worldLock={path,pid,startedAt,tookOver}` → `stop()` 删除，锁目录为空）；登录/执行/日志/截图/reload/stop 全过。另外两条容易踩的时序/体积事实：
- **print tee 要尽早查**：官方 Debug_Log 约 600–800 行/秒、桥接环形缓冲默认 2000 行；exec 后隔 3–5 秒再 `logs()`，print 行可能已被官方日志挤出缓冲（不是 tee 失效）。探针在 client exec 后立即记录 `clientPrintInLogs=true`。
- **截图大小随画面变化**：同窗口 420×280，JPG 实测 **5.7–26KB**（5.7KB 只是某一帧，别用于估算）。

**仍未验证（本次实测未覆盖，不要假定可用）**：`Queue`、`io`、`ctypes`（进程内截图/输入）、`GetModConfigJson`（native 改用自己的 `bridgeConfig.py`）、`gui.set_netease_ui_debugger_enable`/`gui.nud_get_control_tree`（`get_all_screen_fullnames` 返回空，nud 系列可能同样受限）、游戏内真实 `sys.version`、`mod_log.logger` 落点、`ImportModule` 是否强制重载。
