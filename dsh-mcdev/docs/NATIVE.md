  NATIVE.md — native provider（自研官方链路）

`dsh-mcdev` 的 **native provider**：不依赖 MCDK，直接按官方 ModPC 开发客户端的方式启动游戏，
并通过自建行为包 `dsh_bridge`（ModSDK Python + loopback TCP）与游戏通信。

MCDK 链路保留为 **legacy provider**（`provider: "mcdk"`，见 `docs/PROTOCOL.md`）；native 为默认优先项。

实测环境：ModPC **3.10.0.436581** + 开发世界 `MC_DEV_WORLD`（2026-11-14 本机真机验证）。

---

   1. 文件结构

```
dsh-plugins/dsh-mcdev/lib/native/
├─ index.js         createNativeProvider：provider 统一接口（与 McdkBridge 同形）
├─ launcher.js      发现游戏 exe、确保开发世界、写 dev_config.cppconfig、spawn/stop
├─ logs.js          OfficialLogFollower：跟随官方 Debug_Log*.txt（增量游标）
├─ channel.js       GameChannel：Host 侧 TCP JSON-lines 服务端（exec/ping/日志事件）
├─ bridgePack.js    生成/安装 dsh_bridge 行为包（内联 Python 源码）+ 世界清单维护
└─ screenshot.js    PowerShell + Win32 PrintWindow 截游戏窗口
scripts/native-probe.mjs   真机探针（--keep / --stop / --reset）
```

运行环境：**只依赖 Node 内置模块**，在 DSH/Electron 自带 Node 里运行，不依赖系统 Node。
游戏内 Python：ModSDK 解释器（bridge 源码同时通过 **Python 3.14 与 Python 2.7** 的 `py_compile` 语法校验，
运行时按 `sys.version_info` 选择 `exec` 兼容分支，两种解释器都能工作）。

---

   2. 官方启动链路（实测）

| 事实 | 值 |
| --- | --- |
| 可执行文件 | `C:\MCStudioDownload\game\MinecraftPE_Netease\<version>\Minecraft.Windows.exe` |
| 启动参数 | `chatExtension=false config=<world>\dev_config.cppconfig` |
| 工作目录 | 游戏 exe 所在目录 |
| 开发世界 | `%APPDATA%\MinecraftPE_Netease\minecraftWorlds\<world_folder_name>`（默认 `MC_DEV_WORLD`） |
| 行为包安装目录 | `%APPDATA%\MinecraftPE_Netease\games\com.netease\behavior_packs\<uuid去横线>\` |
| 资源包安装目录 | `%APPDATA%\MinecraftPE_Netease\games\com.netease\resource_packs\<uuid去横线>\` |
| 官方引擎日志 | `%APPDATA%\MinecraftPE_Netease\logs\Debug_Log<YYYY-MM-DD_HH-MM-SS>.txt` |
| 模板世界目录 | `%APPDATA%\MinecraftPE_Netease\games\com.netease\world_templates\`（本机为空） |

`dev_config.cppconfig` 是**纯 JSON**（实测 330B）：

```json
{
    "player_info": { "urs": "", "user_id": 0, "user_name": "developer" },
    "room_info": {},
    "skin_info": { "skin": "c:/Users/.../skin.png", "slim": false },
    "world_info": { "level_id": "MC_DEV_WORLD" }
}
```

native provider 每次 `start()` 都会重写该文件（旧文件备份为 `.bak`），`skin_info` 取 `.mcdev.json` 的 `skin_info`。

**重要坑（实测）**：spawn 时**不要**设置 `windowsHide: true`。Windows 会把它转成 `STARTF_USESHOWWINDOW / SW_HIDE`，
实测导致游戏主窗口不可见（`EnumWindows` 与 `MainWindowHandle` 都拿不到窗口，截图必然失败）。
GUI 游戏进程本身没有控制台窗口，不需要 `windowsHide`。

---

   3. 开发世界与行为包清单

    3.1 Python 代码加载规则（官方文档 + 实测）

引擎会加载行为包目录下**每个包含 `modMain.py` 的文件夹**作为代码模块（官方 ModAPI 文档对 “Mcp 模块” 的定义）。
因此行为包结构是：

```
behavior_packs/<header.uuid 去横线>/
├─ manifest.json                 format_version 1，一个 data 模块即可
└─ dsh_bridge/                   代码模块（文件夹名 = Python 包名）
   ├─ __init__.py
   ├─ bridgeConfig.py            Host 端口等（每次 start 重写）
   └─ modMain.py                 Mod.Binding + RegisterSystem + TCP 客户端
```

`manifest.json`（`bridgePack.js` 生成，uuid 固定）：

```json
{
  "format_version": 1,
  "header": {
    "description": "dsh-mcdev native bridge (auto-generated)",
    "name": "dsh_bridge",
    "uuid": "d8b5fa0e-3f2e-4c9f-9a45-1c6f0f2b7a11",
    "version": [1, 0, 0],
    "min_engine_version": [1, 18, 0]
  },
  "modules": [{ "description": "", "type": "data", "uuid": "6f1d4c2a-...", "version": [1, 0, 0] }]
}
```

    3.2 世界清单格式

`world_behavior_packs.json` / `world_resource_packs.json` 是 `[{pack_id, version}]` 数组：

```json
[
  { "pack_id": "c329b06f-7492-4457-9af3-b19ff29999f9", "version": [1, 0, 0] },
  { "pack_id": "43e1fd38-20b3-4cd1-8e28-bb8d34905ea2", "version": [1, 2, 18] },
  { "pack_id": "d8b5fa0e-3f2e-4c9f-9a45-1c6f0f2b7a11", "version": [1, 0, 0] }
]
```

`ensureWorldPackList()` 的规则：

- **保留所有已有条目**（包括 MCDK 的 debug 包 `c329…`），只追加缺失的 bridge 包与工程包（按 pack_id 去重）；
- 工程包 uuid 从 `.mcdev.json` 的 `included_mod_dirs` + 工程约定解析：
  - `included_mod_dirs` 指向的目录：目录本身视为行为包，`<dir>/bp`、`<dir>/behavior_pack` 为行为包，`<dir>/rp`、`<dir>/resource_pack` 为资源包；
  - 工程根下 `bp/manifest.json` → 行为包，`rp/manifest.json` → 资源包（不互相串）；
- 解析失败只记 warning、保留原清单，不阻断启动。

    3.3 开发世界不存在时

`ensureDevWorld()` 会尝试从世界模板复制（`games/com.netease/world_templates/<第一个含 level.dat 的目录>`），
并写 `levelname.txt`；没有模板时给出可读错误，要求先用 MC Studio/官方启动器创建一次开发世界。
`start({reset:true})` 时：只有能找到模板才会重建（旧世界改名为 `<world>.bak-<时间戳>` 保留，不直接删除），
否则保留原世界并记 warning。

    3.4 世界级互斥锁（P0，实测并发会崩世界）

**两个 native provider 同时操作同一个 `MC_DEV_WORLD` 会同时写 `dev_config.cppconfig`、共用世界 DB/世界清单，
实测两实例几乎同时退出（其一 `exit code=0xC0000409` STATUS_STACK_BUFFER_OVERRUN，日志尾部
`ServerPlayer not found` / `ClientLevel is empty` / `Level-LevelDestructed`）。**

因此 `start()` 在写任何世界文件之前先获取世界锁：

- 锁文件：`%APPDATA%\MinecraftPE_Netease\.dsh-mcdev\locks\<world_folder_name>.lock`
  （放在 `.dsh-mcdev/locks` 下，**不污染开发世界目录**）；
- 内容：`{ pid, startedAt, projectDir }`，用临时文件 + `rename` 原子写入；
- 若锁被**存活**的其他进程持有 → `start()` 抛可读错误（「已被另一个 native provider 占用」），不会碰世界；
- 若持锁进程已死 → 自动接管（`tookOver: true`，日志 warning），避免崩溃后永久卡死；
- `stop()` / `dispose()` / 启动失败清理时释放；`status()` 暴露 `worldLock: {path,pid,startedAt,tookOver}`；
- 同进程重复 `start()`（幂等）不会重新抢锁。

实测离线用例 10/10：获取/重复获取/存活进程持锁拒绝/死锁接管/释放/不删别人的锁。

---

   4. 游戏内 bridge 包（dsh_bridge）

    4.1 生命周期与注册

```python
@Mod.Binding(name="dsh_bridge", version="1.0.0")
class DshBridgeMod(object):
    @Mod.InitServer()
    def dshBridgeInitServer(self):
        serverApi.RegisterSystem("dsh_bridge", "DshBridgeServerSystem",
                                 "dsh_bridge.modMain.DshBridgeServerSystem")
    @Mod.InitClient()
    def dshBridgeInitClient(self):
        clientApi.RegisterSystem("dsh_bridge", "DshBridgeClientSystem",
                                 "dsh_bridge.modMain.DshBridgeClientSystem")
```

- `RegisterSystem` 的类路径是完整模块路径（从代码包第一层算起），bridge 会先试 `dsh_bridge.modMain.*`，失败回退 `modMain.*` 并打印 traceback；
- client/server 两个 system 各自建立 TCP 连接（`hello.side` 区分），Host 按 side 路由 `exec`；
- `ClientSystem.__init__` 里监听 `PushScreenEvent` / `PopScreenEvent` 维护屏幕栈（`jsonui /screens` 的数据来源之一）。

    4.2 线程模型（关键）

- socket 收包线程：只做 `recv` / `json.loads` / 分发，**不直接调游戏 API**；
- 游戏 API 只能在主线程调用 → 用 `clientApi.GetEngineCompFactory().CreateGame(levelId).AddTimer(0, task)` 把任务投到主线程；
- 主线程执行完通过 `threading.Event` 唤醒 socket 线程，再回包；`exec` 默认 10s 超时（Host 可传 timeout）。
- `ping`/`info` 也走 `AddTimer` 投主线程（不再从 socket 线程直调 `clientApi.GetLevelId/GetLocalPlayerId` 或 `gui.*`），
  避免跨线程访问引擎对象；该风险是并发崩溃后排查时加固的项。

    4.3 exec 语义

```json
{"id": 3, "type": "exec", "code": "...", "side": "client", "timeout": 10}
```

执行规则（与 MCDK 的 `execute_code` 一致）：

1. 先尝试 `compile(code, "<dsh_bridge>", "eval")` → 表达式直接 `eval` 返回其值；
2. 失败（SyntaxError）则按语句 `exec`，约定代码可设置 `_result` 作为返回值；
3. 执行环境是每个 side 独立的 dict，预置 `clientApi`、`serverApi`、`gui`（若可导入）与 `dsh` 辅助对象
   （`dsh.info()` / `dsh.in_world()` / `dsh.screens()`）。

回包：

```json
{"id": 3, "type": "result", "ok": true,
 "returnValue": {...}, "returnType": "dict", "returnRepr": "{...}"}
```

失败时 `ok:false`，`error` 为完整 traceback（同时 traceback 会打到 stderr 经日志 tee 进 Host 日志）。
`returnValue` 会做 JSON 安全化（不可序列化对象降级为 `{"__type__":..., "__repr__":...}`）。

    4.4 stdout/stderr 捕获（日志 tee）

GUI 游戏进程里的 Python `print` 通常看不到。bridge 在 system 初始化时把 `sys.stdout` / `sys.stderr`
换成 `_LogTee`：**保留原输出**，同时按行通过 socket 发送：

```json
{"type": "log", "side": "client", "stream": "stdout", "text": "[NATIVE_TEST] client print"}
```

Host 侧 `GameChannel` 触发 `log` 事件，provider 把它追加进日志缓冲（`logs()` 可见，`errors` 过滤对 stderr 生效）。
这样 `exec` 里的 `print`/`traceback.print_exc()` 都能在 `/mcdev logs` 中看到。

    4.5 协议总表（TCP JSON lines，UTF-8，每行一个 JSON）

| 方向 | 消息 | 说明 |
| --- | --- | --- |
| 游戏→Host | `{"type":"hello","side":"client\|server","version":"1.0.0"}` | 连接成功后立即发送；Host 记录连接 |
| Host→游戏 | `{"id":n,"type":"ping"}` | 探活/就绪判定 |
| 游戏→Host | `{"id":n,"type":"pong","data":{...}}` | `data` 含 `side/levelId/playerId/inWorld/screens/logTee/guiScreenApi` 等 |
| Host→游戏 | `{"id":n,"type":"exec","code":"...","side":"client\|server","timeout":10}` | 执行代码 |
| 游戏→Host | `{"id":n,"type":"result","ok":true,...}` / `{"...","ok":false,"error":"traceback"}` | 执行结果 |
| Host→游戏 | `{"id":n,"type":"reload"}` | 当前 bridge 固定回 `ok:false, error:"unsupported: ..."`（热重载不支持的兜底） |
| 游戏→Host | `{"type":"log","side":"client","stream":"stdout\|stderr","text":"..."}` | 日志 tee |

- Host 监听 `127.0.0.1:0`（随机端口），启动前写入 `bridgeConfig.py`；每次 `start()` 端口都会变；
- bridge 断线后每 1s 重连；`start()` 幂等（同 provider 实例重复 start 直接返回当前状态）；
- 同一 side 的新连接会替换旧连接（重连场景）。

---

   5. 就绪判定

- **不使用**“进程存在/端口可连”判定；
- 就绪 = bridge client 已 hello + `ping` 返回 `inWorld: true`：
  - client 侧：`clientApi.GetLevelId()` 非空、`clientApi.GetLocalPlayerId()` 非空**且不等于占位值 `"-1"`**
    （刚进世界瞬间 `GetLocalPlayerId()` 会短暂返回 `"-1"`，非空但还不能算真正就绪）；
  - 同时尝试 ping 一次 server（`GetPlayerList()` 非空），仅用于日志，不阻塞就绪。
- `start({waitMs:0})` 立即返回 `phase:'launching'`；`waitReady(ms)` 轮询（500ms）直到 ready 或超时；
- 超时不抛错：返回当前 Status，`lastError` 提示 + 日志里记录。

**实测耗时**（3.10.0.436581，本机）：

| 阶段 | 耗时 |
| --- | --- |
| spawn（含写配置/装包/清单） | ~0.3 – 0.5s |
| start → 进入存档（ready） | **约 17 – 19s**（6 次：16.9 / 17.1 / 17.9 / 18.0 / 18.0 / 18.6s；最后 18.6s 是含「ping 主线程化 + 世界锁」的复验版本） |
| 对比 MCDK legacy | 约 39 – 41s（native 快一半） |

桥接提示：`readyInfo.playerId` 在刚进世界时可能短暂为 `"-1"`（占位值，非空），真正的实体 id 是 `-8589934591` 这类；
bridge 的 `inWorld` 已显式排除 `"-1"`，不会把 ready 判早。

---

   6. 官方日志跟随

`OfficialLogFollower` 跟随 `%APPDATA%\MinecraftPE_Netease\logs\Debug_Log*.txt`：

- 启动时记录已存在文件的当前大小（旧文件只跟随新增内容，不把历史日志塞进缓冲）；
- 启动后**新建**的日志文件（每次启动都会新建 `Debug_Log<启动时间>.txt`）从 0 读取，拿到完整启动/进世界日志；
- 按字节偏移增量读取，按 `0x0A` 切行并处理 UTF-8 多字节边界；文件被截断/轮转时从头再读；
- 行格式：`[2026-11-14 09:16:49:123 INFO PLATFORM 1620 21496] ...`；
- `errors=true` 返回“错误类”行（含 `[ERROR]/[WARN]/[FATAL]`、`Traceback`、`File "...", line N` 特征，标记为 stderr 来源）；
- 日志缓冲复用 `lib/mcdk/logbuffer.js`（seq 游标、ANSI 剥离、since/next/skipped/grep 与 legacy provider 完全一致）；
- 游戏内 `print/traceback` 经 socket log 事件合并进同一缓冲（见 §4.4）。

实测：一次 25s 会话读到约 **1.1 – 1.6 万行**官方日志；`print` 与 traceback 均可检索
（`logs({grep:'NATIVE_TEST'})`，异常一次 exec 后 `hasTraceback=true`）。

> 注意：`.mcdev.json` 的 `log_protocol` 只影响 MCDK 的 Safaia 通道；native 完全走官方 Debug_Log，**不依赖**该字段。

---

   7. 截图（Win32 窗口捕获）

`captureGameWindow()`：

1. `Add-Type` 定义 `DshWin32`：`EnumWindows` 按 PID 枚举**可见顶层窗口**，取面积最大者（`MainWindowHandle` 在部分时机为 0，不可靠）；
2. 依次尝试 `PrintWindow(hwnd, hdc, PW_RENDERFULLCONTENT=2)` 与 `flag=0`；用**客户区**采样判定是否空白（近白比例 > 0.55 或亮度标准差 < 10 视为空白，因为 RenderDragon 的 D3D 画面不会被窗口消息复制）；
3. 空白时：仅当游戏窗口当前就在前台才 `CopyFromScreen`；否则依次
   `SetForegroundWindow` → `AttachThreadInput` 挂当前前台线程后 `SetForegroundWindow`（绕开前台锁定）→ `SwitchToThisWindow` → `WScript.Shell.AppActivate`，
   每 220ms 重试最多 6 次，截完把前台还给原窗口；
4. 保存 JPEG（质量 85）；最小化窗口直接返回可读错误；
5. 输出 `{ok,file,width,height,bytes,method,title}`。

实测：游戏窗口标题 `(507, 303) Minecraft`，截图 `420x280`；**游戏真正渲染后**的 `method` 为 `CopyFromScreen-foreground`（有画面内容），
DirectX 窗口在后台时 `PrintWindow` 只得到白屏（会被空白检测拒绝）。文件保存到 `<projectDir>/.mcdev/screenshots/native-<ts>.jpg`。

已知限制：截 DirectX 画面会**短暂把游戏窗口切到前台**（约 300–800ms）再还原；远程桌面/独占全屏/最小化时可能失败。

---

   8. 通道安全与外部实例保护（v0.3.1）

- **一次性 token**：每次 `start()` 用 `randomBytes(16)` 生成 token，写进 bridge 行为包的 `bridgeConfig.py`；
  游戏侧 `hello` 必须携带该 token，Host 不匹配就直接断开（`unauthorized` 事件），hello 之前的任何消息都被忽略。
- **外部实例保护**：启动前用 WMI 枚举 `Minecraft.Windows.exe` 的命令行，若已有**别的进程**打开了本开发世界的
  `dev_config.cppconfig`，`start()` 直接报错（世界锁只约束本插件，外部客户端不检查它；两个客户端写同一世界会崩）。


---

   8. 能力矩阵（native vs MCDK legacy）

| 能力 | native | MCDK legacy |
| --- | --- | --- |
| 启动/停止 | ✅ 直接 spawn 官方客户端（17–18s 进存档） | ✅ mcdk.exe（39–41s） |
| 执行 Python（client/server） | ✅ socket + 主线程 AddTimer | ✅ MCP execute_code |
| 游戏日志 | ✅ 官方 `Debug_Log*.txt` + 游戏内 print tee | ✅ MCP get_latest_logs（需 log_protocol=1） |
| 截图 | ✅ PrintWindow（`420x280` JPEG 实测） | ✅ MCP capture_game_window（480p） |
| JSON UI | ⚠️ 仅 `/help`、`/screens`（best-effort 屏幕栈；实测 `gui.get_all_screen_fullnames` 存在但本版本返回空，`PushScreenEvent` 也拿不到启动时已存在的 hud 屏） | ✅ jsonui_debugger（完整树/节点查询） |
| 屏幕输入 | ❌ 官方 ModSDK 无合成输入 API | ✅ mc_input |
| 热重载 scripts/game | ❌ 官方无 ReloadScript（需 stop→start） | ✅ reload_game |
| 热重载 addons | ✅ `clientlevel.refresh_addons()`（实测 ok） | ✅ reload_game{reload_addons:true} |
| MCP | ❌ `mcp*` 返回空/抛错 | ✅ |

---

   9. Provider 接口（与 McdkBridge 同形）

`lib/native/index.js` 导出 `createNativeProvider(options)`，方法签名与 `createMcdkBridge` 一致：

```js
const provider = createNativeProvider({ projectDir, pluginDir, logLimit, startTimeoutMs });

await provider.discover(projectDir?)   // { provider:'native', gameExe, gameVersion, versions, world, bridgePack, logsDir, ... }
await provider.readConfig(dir?)        // 读 .mcdev.json（合并默认值，不写文件）
await provider.updateConfig(patch, dir?) // 写回前备份 .mcdev.json.bak
provider.status()                      // { provider:'native', phase, ready, gamePid, pid, world, bridge:{port,connected,clients}, worldLock?, logs, mcp:{...空}, ... }
await provider.start({ reset?, join?, waitMs? }) // waitMs=0 立即返回 launching
await provider.waitReady(timeoutMs?)
await provider.stop()
provider.logs({ since?, limit?, errors?, grep? })   // 官方日志跟随（语义同 legacy）
provider.onLog(listener)
await provider.exec(code, side, { timeoutMs })      // { ok, returnValue?, returnType?, returnRepr?, text?, error? }
await provider.reload(kind, { timeoutMs })          // scripts/game: unsupported；addons: 尝试 refresh_addons
await provider.screenshot({ timeoutMs })            // { ok, file?, width?, height?, bytes?, method?, error? }
await provider.jsonui('/help' | '/screens')         // 其它命令返回 unsupported 错误
await provider.input(stepsOrString)                 // 仅 '/state'，其余 unsupported
provider.mcpConnected() -> false
await provider.mcpConnect() -> undefined
await provider.mcpTools() -> []
await provider.mcpCall(name) -> 抛错「native provider 没有 MCP」
await provider.dispose()
```

`setProjectDir(dir)` / `onLog` / `configPath` / `projectDirPath` 也与 legacy 保持一致，Host 可无感切换 provider。

---

   10. 真机探针

```powershell
  完整验证（结束后自动停止游戏）
node dsh-plugins/dsh-mcdev/scripts/native-probe.mjs --timeout 240000

  保留游戏运行（写 state.json，之后可 --no-launch? 暂不支持；用 --stop 结束）
node dsh-plugins/dsh-mcdev/scripts/native-probe.mjs --keep

  结束 --keep 留下的进程
node dsh-plugins/dsh-mcdev/scripts/native-probe.mjs --stop

  尝试重建开发世界（无模板时保留原世界）
node dsh-plugins/dsh-mcdev/scripts/native-probe.mjs --reset
```

探针覆盖：discover → 确保世界 → 写 cppconfig → 装包/清单 → spawn → 等 hello+进入存档 →
exec(client/server/表达式/异常) → 日志（官方日志 + print tee）→ 截图 → reload(scripts/addons) → jsonui → stop → 残留进程检查。

实测通过（`ok: true`，退出码 0，2026-11-14 09:17 本机）：

```
[probe] 已启动：phase=launching gamePid=11320 bridge.port=9049
[probe] 就绪：phase=ready ready=true 耗时=17138ms
[probe] exec(client) ok=true returnValue={"answer":42,"tag":"[NATIVE_TEST] client",...}
[probe] exec(server) ok=true returnValue={"answer":7,"tag":"[NATIVE_TEST] server",...}
[probe] exec(expression) ok=true value=3；exec(失败用例) ok=false
[probe] 自检：tee 状态=true；print 回传=true
[probe] 日志：缓冲 2000 行，含 NATIVE_TEST=true，含 traceback=true
[probe] 截图：ok=true ...\native-....jpg 420x280 5681B (PrintWindow-2)
[probe] reload(scripts) ok=false（预期 false/unsupported）；reload(addons) ok=true
[probe] jsonui(/screens) ok=true
[probe] 已停止：phase=stopped
[probe] 已确认没有本次启动的 Minecraft.Windows 残留进程
```

---

   11. 已知限制与风险

1. **热重载不支持**：官方 ModSDK 没有 ReloadScript；`reload('scripts'|'game')` 返回 `ok:false` + `restartRequired:true`，Host 应提示「重启游戏」。`addons` 走 `clientlevel.refresh_addons()`（实测可用）。
2. **屏幕输入不支持**：官方只能监听输入事件，没有合成键鼠 API；需要点击/拖拽回退 MCDK provider。
3. **JSON UI 不完整**：native 只有 `/screens`（基于 `PushScreenEvent/PopScreenEvent` 屏幕栈 + `gui.get_all_screen_fullnames` 若存在）。
   实测本机 ModPC 3.10 上 `gui.get_all_screen_fullnames` **属性存在但返回空**，且启动时已创建的 `hud.hud_screen` 不会触发 `PushScreenEvent`，
   所以 `/screens` 通常返回 `[]`（`in_world` 仍准确）。完整树/节点查询请回退 MCDK provider。
4. **bridge 无鉴权**：Host 只监听 `127.0.0.1` 随机端口，但协议无 token；本机任意进程理论上可连接并执行任意 Python。当前按“本机可信”设计，后续可加一次性 token。
5. **多实例**：native provider 现在有**世界级互斥锁**（见 §3.4）：同一 `%APPDATA%` 下同一开发世界只允许一个 provider 会话，
   并发 `start()` 会收到可读错误而不是把世界写坏。注意：锁是**协作式**的——旧版本进程/别的工具不会检查它；
   跨机器/跨用户不适用。Host 仍建议保持单实例调用习惯。
6. **窗口必须可见**：截图依赖窗口非最小化；spawn 时**不能** `windowsHide`（见 §2 坑）。
7. **世界模板**：开发世界不存在且无模板时无法自动创建；需 MC Studio 先创建一次。`reset` 依赖模板，无模板时保留原世界。
8. **bridge 包常驻**：`dsh_bridge` 行为包会一直留在 `behavior_packs` 并被写入世界清单；它只在游戏启动时连接 Host 端口（Host 未运行时每秒重连失败，开销可忽略，日志会打印连接失败）。如需彻底移除需手动删目录 + 世界清单条目。
9. **MCDK debug 包仍在清单里**：native 不删除任何已有包（包括 MCDK 的 `c329…` debug 包），它会照常加载但因为没有 `MCDEV_DEBUG_IPC_PORT` 不会连 IPC，属无害常驻。
10. **首次/多实例启动时窗口就绪时间波动**：就绪判定与截图都做了等待/重试；若窗口迟迟不出现，截图会返回可读错误而不是静默失败。
11. **日志量**：官方 Debug_Log 约 600–800 行/秒（8 分钟 10MB 量级），环形缓冲默认 2000 行；探针/UI 用 `since/next` 增量读取，避免一次拉全量。

---

   12. 验证命令

```powershell
  Node 语法检查（Electron 自带 Node 也能跑）
node --check dsh-plugins/dsh-mcdev/lib/native/index.js
node --check dsh-plugins/dsh-mcdev/lib/native/launcher.js
node --check dsh-plugins/dsh-mcdev/lib/native/logs.js
node --check dsh-plugins/dsh-mcdev/lib/native/channel.js
node --check dsh-plugins/dsh-mcdev/lib/native/bridgePack.js
node --check dsh-plugins/dsh-mcdev/lib/native/screenshot.js
node --check dsh-plugins/dsh-mcdev/scripts/native-probe.mjs

  bridge 行为包安装结果
dir %APPDATA%\MinecraftPE_Netease\games\com.netease\behavior_packs\d8b5fa0e3f2e4c9f9a451c6f0f2b7a11

  Python 语法（两种解释器都通过）
py -3 -m py_compile <...>\dsh_bridge\modMain.py
python  -m py_compile <...>\dsh_bridge\modMain.py

  真机
node dsh-plugins/dsh-mcdev/scripts/native-probe.mjs --timeout 240000
```
