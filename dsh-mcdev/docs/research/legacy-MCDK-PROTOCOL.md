# MCDK / ModPC 桥接协议（实测记录）

本文件记录 `dsh-mcdev` 桥接层（`lib/mcdk/**`）与网易《我的世界》开发版（ModPC / MCDK）通信时**实际验证过**的行为。
所有结论来自 2026-11-14 本机真机探针（`scripts/probe-mcdk.mjs`，探针项目 `<workspace>\.dsh-tmp\mcdev-probe`），不是猜测。

实测环境：

| 项 | 值 |
| --- | --- |
| MCDK 启动器 | `%USERPROFILE%\.vscode\extensions\dofes.mcdev-tools-0.1.32\bin\native\windows\x64\mcdk.exe` |
| 游戏 | `C:\MCStudioDownload\game\MinecraftPE_Netease\3.10.0.436581\Minecraft.Windows.exe`（探针固定 436581；448891 / 3.9.0.401155 也存在） |
| MCP Server | MCDK 内置（`Minecraft(BE) MCP Server(MCDK)` v0.1.0），Streamable HTTP |
| 探针世界 | `MC_DSH_PROBE`（`%APPDATA%\MinecraftPE_Netease\minecraftWorlds\MC_DSH_PROBE`） |
| start → ready | **约 39 – 41 秒**（3 次实测：38.9s / 41.3s / ≈40s） |

---

## 1. 启动器进程（mcdk.exe）

`mcdk.exe` 是**交互式启动器**，没有 `ps/logs/call` 子命令；传未知参数会直接按 `.mcdev.json` 启动游戏并阻塞（本桥接一律不传参数）。

### 启动方式

```
cwd    = 项目目录（含 .mcdev.json，必须是项目根）
args   = []
env    = 继承父进程，另加：
         MCDEV_IS_PLUGIN_ENV=1
         MCDEV_OUTPUT_MODE=1
         MCDEV_AUTO_JOIN_GAME=1|0   （可选；桥接 start({join}) 时设置）
stdio  = ['ignore', 'pipe', 'pipe']  （stdin 必须给 ignore 或关闭；不要交互）
windowsHide = true
```

- 只要 `.mcdev.json` 里 `game_executable_path` 指向存在的 exe，**不会**再交互询问游戏版本（多版本也不问）。
- 启动约 2 秒内即输出 `[MCDK] MCP Server <ip>:<port>`、`[MCDK] IPC Bridge listening on port <port>`、`[MCDK] Safaia log receiver listening on ...`（当 `log_protocol=1`）。
- 进程树：`mcdk.exe` → `Minecraft.Windows.exe`（直接子进程）。**注意：mcdk 被强杀后游戏可能成为孤儿进程**（实测遇到），停止时必须显式结束记录到的 gamePid。
- mcdk 的 stdout/stderr 只包含启动器自身日志与 MCP Server 请求日志，**不含游戏日志**（游戏日志走 MCP 日志工具，见 §5；`log_protocol=1` 时 server 端 Python `print` 会出现在 mcdk stdout，client 端不会）。

### 启动输出样例（节选）

```
[MCDK] Addons
  Debug    UUID=c329b06f-7492-4457-9af3-b19ff29999f9
已删除旧世界数据，正在创建新世界...
[MCDK] MCP Server 127.0.0.1:19133
[MCP] [INFO] ... Starting MCP server on 127.0.0.1:19133
[MCDK] IPC Bridge listening on port 12532
[MCDK] Safaia log receiver listening on 127.0.0.1:10911
```

输出带 ANSI 颜色码（`\x1b[32m ...`），桥接层写入缓冲前会剥离。

---

## 2. `.mcdev.json` 关键字段

桥接层读取/合并的字段（默认值见 `lib/mcdk/discover.js` 的 `DEFAULT_CONFIG`）：

| 字段 | 说明 |
| --- | --- |
| `game_executable_path` | 游戏 exe 绝对路径；不存在会启动失败 |
| `mcp_server_config.enabled` | **必须为 true** 才有 MCP；玩家真实工程默认 false |
| `mcp_server_config.server_ip` / `server_port` | 监听地址与端口（默认 19133；桥接以 `server_port` 为准） |
| `log_protocol` | **必须为 1**，MCP 日志工具（`get_latest_logs` 等）才有内容；0 时日志工具返回空 content |
| `included_mod_dirs` | 要加载的模组目录数组（探针为 `[]`，仅加载 Debug 模组） |
| `world_name` / `world_folder_name` | 世界名 / 世界目录名；建议探针用独立名字（如 `MC_DSH_PROBE`） |
| `reset_world` | true 时每次启动删除旧世界并重建 |
| `auto_join_game` | 是否自动进入存档 |
| `include_debug_mod` | 是否注入 Debug 模组（提供 IPC / execute_code 能力，必须 true） |
| `window_style` / `debug_options` / `experiment_options` / `skin_info` | 其它原样透传字段 |

### 桥接层的 MCP 自动开启策略（`start({ensureMcp})`，默认 true）

- `mcp_server_config.enabled` 为 false 时，`start()` 会先调用 `updateConfig({mcp_server_config:{enabled:true}})`：
  - 把原文件备份为 **`.mcdev.json.bak`**（覆盖式，只保留最近一份）；
  - 只合并 patch（不会把默认值灌进玩家文件），保留其它字段原貌；
  - 返回的 `status.mcp` 带 `autoEnabled: true`，日志里也有明确记录。
- `start({ensureMcp:false})` 可关闭该行为，此时只启动游戏、只提示 MCP 不可用。
- `log_protocol` 与时区/重置世界等其它字段**只提示不修改**。

---

## 3. MCP 端点与握手（实测）

### 端点

- 主端点：`POST http://127.0.0.1:<port>/mcp`（Streamable HTTP）
- 旧式 SSE 端点也存在：`GET /sse` + `POST /message?session_id=...`（本桥接不使用）
- 服务端 CORS 允许 `GET, POST, DELETE, OPTIONS`，允许请求头 `Content-Type, Mcp-Session-Id, Last-Event-ID`。

### 握手步骤（与 MCP 规范一致）

1. `POST /mcp`，请求头：
   ```
   Content-Type: application/json
   Accept: application/json, text/event-stream
   ```
   body：
   ```json
   {"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"dsh-mcdev","version":"0.1.0"}}}
   ```
2. 响应 **HTTP 200 + `application/json`**（本机实测不是 SSE）：
   ```json
   {"jsonrpc":"2.0","id":1,"result":{"protocolVersion":"2024-11-05","capabilities":{"tools":{}},"serverInfo":{"name":"Minecraft(BE) MCP Server(MCDK)","version":"0.1.0"}}}
   ```
   会话 id 在**响应头**（小写）：`mcp-session-id: 7e80e28d-d047-7e65-d4cc-eee59872110c`。
   服务端支持协议版本 **`2024-11-05` 与 `2025-03-26`**，会协商/回显。
3. `POST /mcp`（通知）：
   ```json
   {"jsonrpc":"2.0","method":"notifications/initialized"}
   ```
   响应 **HTTP 202，空 body**。
4. 之后每个请求都必须带请求头 `Mcp-Session-Id: <id>`：
   - 缺失 → HTTP 400：`{"jsonrpc":"2.0","error":{"code":-32600,"message":"Missing Mcp-Session-Id header"}}`
   - 会话不存在/过期 → `{"jsonrpc":"2.0","error":{"code":-32600,"message":"Session not found"}}`
   桥接层遇到这两种情况会**自动重建会话并重试一次**（`lib/mcdk/mcp.js`）。
5. `tools/list` 与 `tools/call` 均为普通 JSON-RPC POST，HTTP 200 + JSON。

### 传输细节

- POST 响应可能是 `application/json`，也可能被服务端以 `text/event-stream` 返回（`data: {...}` 行）；桥接层两种都解析，并按 JSON-RPC `id` 取对应响应。
- 服务端 keep-alive：`timeout=5, max=100`；桥接层用 `http.Agent({keepAlive:true})` 复用连接。
- 工具级失败用 JSON-RPC `result.isError=true` 表达；协议级失败用 `error` 对象。
- `GET /mcp` 是 SSE 长连接（本桥接不使用，避免多流管理复杂度）。

---

## 4. 工具清单（`tools/list` 实测 9 个）

| 工具 | 参数（inputSchema 要点） | 返回要点 |
| --- | --- | --- |
| `execute_code` | `{code:string, is_client?:boolean, direct_return?:boolean}`，必填 code | content 文本：成功/失败 + `Return type/Return repr/Return value JSON` |
| `get_latest_logs` | `{max_count?:number, order?:'asc'\|'desc'}` | content 文本：游戏日志行（纯文本拼接） |
| `get_latest_error_logs` | `{max_count?:number, order?:'asc'\|'desc'}` | stderr 错误日志；可能为空 |
| `get_log_range` | `{start_index:number, end_index:number, order?}`（必填前两个） | 指定区间的游戏日志 |
| `reload_game` | `{reload_addons?:boolean}` | 重载游戏环境（addons=true 时更完整） |
| `capture_game_window` | `{}` | content：`{type:'image', data:'<base64 jpeg>', mimeType:'image/jpeg'}`（480p） |
| `jsonui_debugger` | `{cmd:string}`，必填 | content 文本：JSON（`/help`、`/screens`、`/tree`…） |
| `mc_input` | `{op:string, args?:object}`，必填 op | content 文本 + `structuredContent` |
| `mc_profiler` | `{op:string, args?:object}` | 性能分析（本桥接仅透传，未在高层 API 暴露） |

> **重要修正**：CONTRACT 里提到的 `reload_scripts`、`click_game_window` **不存在**。
> 重载只有 `reload_game`；点击由 `mc_input` 的 `/click` 等操作覆盖。
> 桥接层 `reload(kind)` 映射：`scripts`/`game` → `reload_game{reload_addons:false}`；`addons` → `reload_game{reload_addons:true}`。

### `execute_code` 返回结构（实测）

请求（client 侧）：
```json
{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"execute_code","arguments":{"code":"_result = {\"answer\": 42, \"tag\": \"[MCDK_TEST] client\"}\nprint(\"[MCDK_TEST] client print line\")","is_client":true,"direct_return":true}}}
```

响应（HTTP 200，result **无 structuredContent**）：
```json
{"jsonrpc":"2.0","id":2,"result":{"isError":false,"content":[{"type":"text","text":"Code executed successfully on client.\nReturn type: dict\nReturn repr: {'answer': 42, 'tag': '[MCDK_TEST] client'}\nReturn value JSON: {\n  \"answer\": 42,\n  \"side\": \"client\",\n  \"tag\": \"[MCDK_TEST] client\"\n}"}]}}
```

解析规则（`lib/mcdk/index.js:parseReturnValueJson`）：
- 成功：`result.isError === false`，`content[0].text` 以 `Code executed successfully on <client|server>.` 开头；
- 返回值：取 `"Return value JSON: "` 之后的 JSON 解析（多行 pretty JSON 也支持）；失败则回退 `"Return repr: "` / 返回 `undefined`；
- 代码里给 `_result` 赋值可定义返回值；表达式代码返回表达式值；`return type` 为 `NoneType` 时 JSON 为 `null`。
- client / server 两侧行为一致，只是文本里的 `on client` / `on server` 不同。

### 工具级错误（实测补充）

- 工具失败时返回 `result.isError: true`，错误详情在 `content[0].text`（HTTP 仍是 200）。
- **实测样例**：游戏尚未进入世界时调用 `jsonui_debugger` →
  `{"isError":true,"content":[{"text":"Code execution failed. The player may not be in the game or the target is unavailable.","type":"text"}]}`
- `execute_code` 未进世界/目标不可用时同样可能返回 `GAME_WORLD_NOT_READY` / `GAME_EXECUTION_FAILED` 类文本；
  桥接层 `exec()` 统一返回 `{ok:false, error, text}`，不会抛出（协议级错误/网络错误才会 throw）。
- 参数校验失败（例如 `mc_input` 结构不对）返回 `INVALID_ARGUMENT` 等文本，`isError:true`。

### 日志工具返回形态（实测）

`get_latest_logs {max_count:100, order:'asc'}` → HTTP 200：
```json
{"jsonrpc":"2.0","id":3,"result":{"isError":false,"content":[{"type":"text","text":"[2026-11-14 08:28:22,592] [INFO] SERVER addon list: [...]\n...\n[MCDK_TEST] client print line"}]}}
```
- `content[0].text` 是**多个日志行用 `\n` 拼接的纯文本**（不是 JSON 数组）。
- 每行形如 `[2026-11-14 08:28:22,592] [INFO] ...`，也有不带时间戳的 Python `print` 输出。
- **`log_protocol=0` 时 content 为空**（实测 `content:[]`），必须 `log_protocol=1`（Safaia 接收器）。
- `get_latest_error_logs` 无错误时同样返回空 content 或空文本。

### 截图返回形态（实测）

```json
{"jsonrpc":"2.0","id":4,"result":{"isError":false,"content":[{"type":"image","data":"/9j/4AAQSkZJRg...","mimeType":"image/jpeg"}]}}
```
- 480p JPEG，本次 29,280 字节（base64 后约 39KB；另一轮 89KB JSON ≈ 66KB 图）。
- 服务端禁用直接返回 SVG 图像内容（jsonui_debugger 的 `--image` 会降级为文本），截图是本机验证 UI 的唯一图像通道。
- 窗口最小化 / Windows Graphics Capture 不可用时返回 `isError:true` + 文本错误。

### JSON UI / 输入返回形态（实测）

`jsonui_debugger {cmd:'/screens'}` → content[0].text 是 JSON 字符串：
```json
{"cmd":"/screens","data":{"screens":["hud.hud_screen"],"top_screen":"hud_screen","top_screen_fullname":"hud.hud_screen","ui_size":[507.0,303.0],"window_size":[507.0,303.0]},"ok":true}
```
`mc_input {op:'/state'}` → content 文本 `Game window 507x303, background, pointer free (absolute coordinates apply).`
+ `structuredContent.data.window = {width,height,foreground,pointer_locked,ime_open}`。
输入坐标默认是 **0.0–1.0 百分比空间**（与 `capture_game_window` 一致）；`/help`、`/click`、`/drag`、`/key`、`/run`、`/wait` 等操作详见工具内 `/help`。

---

## 5. 就绪判定（关键坑）

- **`MCP 端口可连` 不能作为「进入存档」信号**：实测 mcdk 启动后约 2 秒 MCP 端口就通了，此时游戏还在加载。
- 可靠判定：`tools/call jsonui_debugger {"cmd":"/screens"}` → 解析 `content[0].text` JSON，`data.screens` **包含 `hud.hud_screen`** 才算进入存档。
  - 加载过程中返回 `screens: []`（JSON UI 已可用但还没进世界）；
  - 进世界后返回 `screens: ["hud.hud_screen"]`。
- 就绪轮询间隔 1 秒；实测 start → ready **38.9s / 41.3s**（游戏窗口正常时）；超时建议 180s。
- 桥接层 `waitReady(timeoutMs)` 不启动新进程，只等待；超时不抛错，返回当前 Status 并把原因写进 `lastError`。
- 游戏进程 PID 通过「mcdk 的子进程 `Minecraft.Windows.exe`」识别（`Get-CimInstance Win32_Process`），用于停止时只杀自己启动的游戏。

---

## 6. 停止顺序与孤儿进程

正确顺序（`stop()` 实现）：

1. 先快照 `mcdk` 的子游戏进程 PID（此时父进程还活着才能可靠查到）；
2. `taskkill /PID <mcdkPid> /T /F` 结束 mcdk 及其进程树；
3. 显式 `taskkill` 记录到的 `gamePid` / 子进程（**mcdk 被杀后游戏可能变成孤儿进程**，只靠 `/T` 不可靠）；
4. 兜底再查一次 mcdk 的子进程并清理；
5. `phase='stopped'`，清空 `pid/gamePid`，断开 MCP。

实测结果：停止后 `leftoverGamePids: []`，用户自己的 `Minecraft.Windows.exe`（不同 `config=...MCStudio...`、父进程是 MC Studio）**不受影响**。

必须遵守：

- 只结束**自己启动的** PID：mcdk PID（spawn 返回值）+ 它的子游戏进程；
- 用户已有的 ModPC 进程不要动（可能来自 MC Studio / VSCode 插件）；
- 同一 MCP 端口只允许一个实例：启动前探测端口，占用则拒绝启动（否则会连到别人的游戏）。

---

## 7. 桥接层 API 语义（对 Host 的契约）

`lib/mcdk/index.js` 导出 `createMcdkBridge(options)`：

```js
const bridge = createMcdkBridge({ projectDir, mcdkPath, mcpPort, logLimit, pluginDir, startTimeoutMs });
```

| 方法 | 语义 |
| --- | --- |
| `setProjectDir(dir)` | 同步；未启动时可切换，返回 boolean |
| `readConfig(dir?)` | 读 `.mcdev.json` 并与默认值合并；文件不存在返回默认值，**不写文件** |
| `updateConfig(patch, dir?)` | 备份 `.mcdev.json.bak` 后合并写回；返回有效配置 |
| `discover(dir?)` | `{mcdkPath, mcdkSource, gameExe, versions[], configPath, projectDir, config}` |
| `status()` | 同步 Status；`mcp:{port,connected,enabled,tools,autoEnabled?}`、`readyCount`、`elapsedMs` |
| `start({reset,join,waitMs,ensureMcp,projectDir})` | 启动；`waitMs=0`（默认）立即返回 `launching`，>0 等就绪 |
| `waitReady(timeoutMs=180000)` | 不启动新进程，仅等待 ready；超时返回 Status + lastError |
| `stop()` | 按 §6 顺序停止；phase=`stopped`，清 gamePid |
| `logs({since,limit,errors,grep})` | **仅 mcdk 启动器 stdout/stderr 环形缓冲**；`since` 严格 `>`；省略 since 返回最新 limit 行；`next`=末行 seq+1（无行=当前最大 seq+1）；`skipped`=游标后因环形淘汰丢失的行数；ANSI 已剥离 |
| `exec(code, side, {timeoutMs})` | `{ok, returnValue?, error?, text?}`；side 默认 client |
| `reload(kind, {timeoutMs})` | `scripts`/`game`/`addons` 映射见 §4；`{ok, detail?, error?, text?}` |
| `screenshot({timeoutMs})` | 保存到 `<projectDir>/.mcdev/screenshots/shot-<ts>.jpg`，返回 `{ok, file?, error?}` |
| `jsonui(command, {timeoutMs})` | `{ok, text, error?}` |
| `input(stepsOrString, {timeoutMs})` | 数组→`/run{steps}`；字符串`/op`→`{op,args:{}}`；`{op,args}` 透传 |
| `mcpConnected()` | 同步 boolean，不触发连接 |
| `mcpConnect()` | 惰性握手；失败返回 `undefined`（不抛） |
| `mcpTools()` | `Promise<Array<{name,description,inputSchema}>>` |
| `mcpCall(name,args,{timeoutMs,requireReady?})` | 原始 `{ok,isError,content,structuredContent,raw}`；Host 用它对 `get_latest_logs` 等做通用调用；会话丢失自动重建重试一次 |
| `onLog(listener)` | 订阅新日志行，返回取消函数 |
| `dispose()` | 停止进程 + 断开 MCP（不抛异常） |

游戏日志不混入 `logs()`：Host 自己用 `mcpCall('get_latest_logs'|'get_latest_error_logs', {max_count, order:'asc'})` 取并解析 `content[0].text`。

---

## 8. 已知限制与坑

1. **端口冲突**：`19133` 被别的实例占用时 mcdk 会启动失败或桥接连到别人游戏；启动前必须探端口，占用时拒绝启动并提示。
2. **`log_protocol=0`**：MCP 日志工具返回空（`content:[]`）。桥接层只提示，不自动改玩家配置。
3. **MCP 未启用**：玩家真实工程默认 `enabled:false`；不开启则 `exec/jsonui/screenshot/游戏日志` 全部不可用。桥接层默认自动开启（备份 `.bak` 并标记 `autoEnabled`）。
4. **孤儿游戏进程**：mcdk 异常退出/被强杀后游戏可能继续运行；`stop()` 必须显式结束 gamePid，`status()` 在进程退出后仍保留 gamePid 供清理。
5. **没有 `reload_scripts` / `click_game_window` 工具**：按 §4 映射；不能用不存在的工具名调用（`mcpCall` 会得到 `Tool not found`）。
6. **server 端 `print` 出现在 mcdk stdout，client 端 `print` 进游戏日志**：排查时两边都要看。
7. **截图依赖窗口可捕获**：最小化 / 远程桌面 / Windows Graphics Capture 被禁时截图会失败（返回可读错误）。
8. **多实例**：MCDK 启动器没有实例互斥；同时启动多个游戏会争用 MCP 端口/账号，桥接层不做全局锁（Host 负责单实例）。
9. **多版本**：`discover()` 返回新到旧版本列表；`start()` 使用 `.mcdev.json` 的 `game_executable_path`（不会自动改版本）。探针固定使用 3.10.0.436581。
10. **探针世界残留**：`reset_world=true` 会重建 `%APPDATA%\MinecraftPE_Netease\minecraftWorlds\MC_DSH_PROBE`；探针默认保留该目录（不删，避免误删玩家数据）。
11. **并发多实例会偶发卡加载（实测 1 次）**：本机同时开着 2 个用户自己的 ModPC 实例时，再启动第 3 个实例，曾出现「游戏进程正常、CPU 占用正常、MCP 正常，但 180s 内 `jsonui /screens` 一直是 `[]`、日志工具为空」的情况；判断为账号/实例争用导致的偶发假死，不是协议问题。处理建议：`waitReady` 超时后 `stop()` 清理，再重试一次；MCP 端口/进程状态正常不代表进入了存档。
12. **`--keep` 失败必须自停**：探针脚本在 `--keep` 且未就绪时会自动 `stop()` 并删除 `state.json`（早期版本不会，会留下孤儿进程；已修复）。手动停止用 `--stop`。

---

## 9. 探针脚本（`scripts/probe-mcdk.mjs`）

可重复运行的真机验证脚本（默认项目 `<workspace>\.dsh-tmp\mcdev-probe`，默认固定 3.10.0.436581、`log_protocol=1`、独立世界 `MC_DSH_PROBE`）：

```powershell
# 完整验证（结束后自动停止 mcdk + 游戏）
node dsh-plugins/dsh-mcdev/scripts/probe-mcdk.mjs --timeout 180000

# 保留游戏运行（写 state.json；之后可 --no-launch 复用；若未就绪会自动停止并清 state）
node dsh-plugins/dsh-mcdev/scripts/probe-mcdk.mjs --keep

# 结束 --keep 留下的进程
node dsh-plugins/dsh-mcdev/scripts/probe-mcdk.mjs --stop

# 只验证已运行实例的 MCP（不启动新进程）
node dsh-plugins/dsh-mcdev/scripts/probe-mcdk.mjs --no-launch

# 额外验证 reload_game
node dsh-plugins/dsh-mcdev/scripts/probe-mcdk.mjs --reload
```

验证覆盖：`initialize` → `notifications/initialized` → `tools/list` → `execute_code`（client/server 各一次，打印 `[MCDK_TEST]`）→ `get_latest_logs` / `get_latest_error_logs` → `capture_game_window`（落盘）→ `jsonui_debugger /screens` → `mc_input /state` → 桥接层高层封装冒烟 → 停止并检查无残留。

实测通过输出（节选）：

```
[probe] 就绪：phase=ready ready=true 耗时=41330ms gamePid=21160
[mcp] tools/list -> 9 个：capture_game_window, execute_code, get_latest_error_logs, get_latest_logs, get_log_range, jsonui_debugger, mc_input, mc_profiler, reload_game
[mcp] execute_code(client) ok=true
[mcp] execute_code(server) ok=true
[mcp] get_latest_logs ok=true 空=false 字符=3302
[mcp] capture_game_window ok 已保存 ...\probe-...jpg（29280 字节）
[mcp] jsonui_debugger /screens ok=true inWorld=true
[mcp] mc_input /state ok=true
[probe] bridge.exec() ok=true returnValue={"tag":"[MCDK_TEST] bridge exec","via":"bridge"}
[probe] bridge.logs() -> 20 行（缓冲共 310 行）
[probe] 已停止：phase=stopped
[probe] 已确认没有本次启动的 Minecraft.Windows 残留进程
```

---

## 10. 验证命令速查

```powershell
# 语法检查
node --check dsh-plugins/dsh-mcdev/lib/mcdk/logbuffer.js
node --check dsh-plugins/dsh-mcdev/lib/mcdk/mcp.js
node --check dsh-plugins/dsh-mcdev/lib/mcdk/discover.js
node --check dsh-plugins/dsh-mcdev/lib/mcdk/process.js
node --check dsh-plugins/dsh-mcdev/lib/mcdk/index.js
node --check dsh-plugins/dsh-mcdev/scripts/probe-mcdk.mjs

# 协议手动探测（探针目录里的临时脚本，仓库不包含）
# node .dsh-tmp/mcdev-probe/mcp-raw.mjs all
```
