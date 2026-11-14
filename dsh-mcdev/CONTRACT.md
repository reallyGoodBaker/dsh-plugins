# dsh-mcdev — 实现契约（v0.9.0：多游戏实例 / 日志与执行可切换机器）

> **v0.9.0 变更（功能 + UI）**：同一台机器上同时连多个游戏实例时，日志与执行代码可以按实例切换。
> - **channel**：每侧（client/server）可并存多个连接；hello 上报 `pid`/`levelId`；`clients()` 返回 `{id, side, pid, levelId, version, since, remotePort}`；同 `pid` 重连替换旧连接，不同实例并存；`ping`/`exec`/`reload` 支持按 `machine`（连接 id）路由；log 事件带连接 id/pid。
> - **native provider**：新增 `machines()`（枚举连接实例，并结合 Win32 进程命令行解析 exe / 游戏版本 / 世界目录，ping 补 `inWorld`）；每个实例独立缓存 bridge print/traceback 环形日志；`exec`/`logs`/`reload` 支持 `machine` 参数。
> - **Host**：新增 `games` 动作；`exec` / `logs` / `game_logs` / `reload` 增加 `machine` 参数（命令 `--machine-b64`）；tool schema、help、文本渲染更新（exec/game_logs 输出标注机器）。
> - **Client**：日志页（游戏日志源）与执行代码页在 **连接实例数 > 1** 时显示 M3 机器选择器（`自动（最近连接）` + 每个实例：`#序号 · 客户端/服务端 · 世界 · 版本 · 本插件启动`，复用自绘 M3 dropdown）；切换后 `game-logs` / `exec` / `reload` 自动带 `--machine-b64`；当前选择保存在会话视图 `machineId`，日志缓存按机器失效。
> - 测试：`test-native-channel` 7 项（多实例并存、按 machine 路由、同 pid 重连、未知 machine id 报错）；`test-integration` 增加 `/mcdev games` 形状断言。

> **v0.8.6 变更（UI）**：
> - **行为包/资源包选择器重做**：每项为 M3 list item（56dp）：leading 40dp 圆形图标（行为包 = puzzle `extension`、资源包 = `palette`，secondary-container 底/on-secondary-container 图标）、姓名 Body M 14/20、副标题 Body S 12/16（来源「工程/导入/全局」+ manifest 版本）、trailing M3 18dp checkbox；section 头为「标题 + 文字按钮『+ 导入包』」；去掉旧的紧凑 checkbox 行与占位徽标混排；
> - 移除主面板的「游戏未启动：点…」空闲提示行（`idleHint` 不再渲染），状态仍由标题下状态点和启动按钮表达；
> - 仅 Client 改动，Host 接口不变。

> **v0.8.5 变更（UI）**：修正文档检索搜索框，按 M3 **Docked search bar** 规范重做：
> - 56dp 高、corner-full（28dp）胶囊容器、surface-container-high 背景；
> - 左侧 leading search 图标 24dp、输入正文 Body L 16/24、占位符 on-surface-variant；
> - 右侧 trailing 图标按钮（40dp 圆形 state layer）执行检索，Enter 等效；
> - 聚焦时容器变为 surface-container-highest + elevation level 1（state layer），不再出现旧版 `outline 2px` 方框/绿色角标；
> - Python 执行编辑器改为 M3 **filled multiline text field**（56dp 起、4/4/0/0 圆角、底部 1dp 指示条、聚焦 2dp primary、surface-container-highest 容器、等宽字体）；
> - 顺带修正设置页包清单标题（行为包/资源包）与按钮重叠：包清单使用静态 section 标题，不再套用浮动字段标签。
> - 仅 Client 改动，Host 接口不变。

> **v0.8.4 变更（UI，binding）**：不再凭印象实现 M3，改为**以官方规范与官方 token 值为准**：
> - 参考文档：<https://m3.material.io/>（组件 specs / color roles / typescale / shape / motion）；
> - token 数值参考 Material Web 官方生成 token（`material-components/material-web`，v0.192）：
>   `_md-sys-color.scss`、`_md-sys-typescale.scss`、`_md-sys-shape.scss`、`_md-sys-motion.scss`、`_md-sys-elevation.scss`、`_md-sys-state.scss` 及各 `_md-comp-*.scss`；
> - **颜色角色**：采用完整 M3 角色集（primary/on-primary/primary-container…secondary-container、tertiary、surface 五级容器、outline、inverse-surface 等），容器色为不透明色调（不再用 color-mix 半透明近似），深浅两套主题；表面层级：面板 surface-container → 卡片 surface-container-high → 文本域 surface-container-highest；
> - **Filled text field**（`_md-comp-filled-text-field`）：56dp 高、4/4/0/0 圆角、surface-container-highest 容器、1dp on-surface-variant 底部指示条（聚焦 2dp primary）、输入正文 Body L 16/24、浮动标签 Body S 12/16；
> - **FAB**（`_md-comp-fab-primary`）：56dp、corner-large 16、primary-container/on-primary-container、elevation 3 → hover elevation 4；
> - **Icon button**：图标 24dp、40dp 圆形 state layer、未选中 on-surface-variant / 选中 primary；
> - **Button**：filled/tonal/outlined/text，40dp、corner-full、Label L 14/20、图标 18dp，hover 抬升到 elevation 1；
> - **Menu**（`_md-comp-menu`）：container 为 surface-container、corner-extra-small 4、elevation 2、item 48dp；**选中项用 secondary-container/on-secondary-container**（修正此前误用 surface-container-highest/primary）；
> - **Card**（`_md-comp-filled-card`）：surface-container-high、corner-medium 12、elevation 0 → hover 1；
> - **Switch**（`_md-comp-switch`）：52×32 轨道、选中 handle 24dp on-primary、未选中 16dp outline、按下 handle 28dp primary-container、state layer 40dp；
> - **Motion**（`_md-sys-motion`）：duration short4 200ms / medium2 300ms / long2 500ms，standard `cubic-bezier(.2,0,0,1)`、emphasized-decelerate `cubic-bezier(.05,.7,.1,1)`；state layer 200ms，菜单 300ms，ripple ~480ms；
> - **Elevation**（`_md-sys-elevation`）：1/3/6/8/12dp 对应 5 级阴影；**State layer**（`_md-sys-state`）：hover 8% / focus 12% / pressed 12%；
> - **Snackbar**：瞬态提示改用 inverse-surface/inverse-on-surface、4dp 圆角、elevation 3；
> - **Shape**（`_md-sys-shape`）：4/8/12/16/28/full 全量落地；**Typescale**：Title L 22/28、Title M 16/24、Body L 16/24、Body M 14/20、Body S 12/16、Label L 14/20、Label M 12/16。
> - 仅 Client 改动，Host 接口不变。

> **v0.8.3 变更（UI，binding）**：在 v0.8.2 全组件 M3 基础上继续收口：
> - **单一启动/停止动作改为 M3 FAB**（56dp、16dp 圆角、24dp 图标、elevation 1→3，悬停/按下 state layer + ripple）；
> - **类型尺度按 M3 typescale**：Title L 22/28（设置页 top app bar）、Title M 16/24、Body M 14/20（面板基准）、Body S 12/16（辅助文本）、Label L 14/20（按钮/tab/menu/chip）、Label M 12/16（字段标签）；
> - **禁用态按 M3 token**：内容 on-surface 38%、容器 on-surface 12%（filled/tonal），outlined 边框 outline 12%；
> - **焦点指示**改为 primary 2dp（M3 focus indicator）；outlined 字段 hover 边框 on-surface、聚焦时标签变 primary；
> - **自绘 M3 工具提示**：图标按钮不再用原生 `title`，改为 550ms 延迟的面板内 tooltip（4dp 圆角、surface-container-highest、elevation 2、fade+scale 动效），随 hover/focus 出现，点击/移出立即消失；
> - **菜单/提示动效**：M3 emphasized decelerate（300ms，scale 0.9→1，向下方展开时 origin top、向上方时 origin bottom），`prefers-reduced-motion` 下关闭；
> - switch 增加 elevation 阴影与 primary 焦点环；checkbox hover state layer。
> - 仅 Client 改动，Host 接口不变。

> **v0.8.2 变更（UI，binding）**：面板内**所有**元素按 Material 3 规范重做，不使用原生表单控件：
> - **自绘下拉菜单**：`<select>` 全部移除，改为 M3 dropdown（点击触发字段 → 面板内浮层菜单，4dp 容器、48dp 菜单项、选中态勾选 + surface-container-highest、超长名称省略、超出面板自动向上/限制高度）；触发器为 M3 outlined field（4dp 圆角 + 浮动标签 + 下拉箭头）。
> - **按钮**：filled / tonal / outlined / text 四类（高度 40dp、圆角 20dp、图标 18dp）；M3 state layer（hover 8% / pressed 12%）+ 点击 ripple 动效（`prefers-reduced-motion` 下关闭）；图标按钮 40dp 圆形。
> - **Tabs** 改为 M3 primary tabs：48dp、active 3dp 圆角指示条、图标+文字；**filter chip** 8dp 圆角、选中勾选；**checkbox** 自绘 18dp 方框；**switch** 52×32 轨道 + 24dp 选中滑块；**cards** 使用 surface-container-highest 12dp 填充卡片；**top app bar** 56dp / 18px 标题；**menu** 上述自绘下拉。
> - 文本字段统一 M3 outlined field（4dp 圆角、浮动标签、聚焦 2dp primary 边框）；所有控件聚焦环使用主题 focus 色。
> - 移除 `<select>`、`.mcd-settings-bar` 旧样式等非 M3 写法；仅 Client 改动，Host 接口不变。

> **v0.8.1 变更（UI）**：设置页拆成两级，避免"预设下拉 + 编辑表单"混在一起：
> - 一级「启动预设」= 预设卡片列表：每张卡片显示序号/名称/世界·访客/exe/当前激活徽标，卡片上「设为当前 / 编辑 / 删除」，底部「＋ 新增预设」；
> - 二级编辑页：点卡片编辑按钮进入，顶部返回按钮回到列表（`backToPresets`），顶部 ✔ 保存后返回列表；页内为预设信息 / 主机 / 访客三张卡片；
> - 客户端状态 `launch.page`：`main` → `presets` → `preset`；新增 `openPresetEditor` / `backToPresetList`，`removePreset(id)` 支持按卡片删除，新建预设自动带一个可用皮肤。
> - 仅 Client 改动，Host 接口不变。

> **v0.8 变更（binding）**：
> - **设置页重做为 Material 3**：outlined 字段、filled/tonal/outlined 按钮、M3 switch、list item、卡片分区；设置仍通过动作行最右侧齿轮在面板内打开；
> - **移除 `.mcdev.json` 兼容**：启动不再读取 `.mcdev.json`（世界/包/皮肤/游戏路径全部来自预设）；删除 `lib/native/launchProfile.js` 与旧 `launch-profile.json` 迁移，`test-launch-profile.mjs` 删除；
> - **文件夹导入**：`pack-import`（行为包/资源包，复制到 `<工程>/.mcdev/packs/<kind>`）与 `skin-import`（复制 PNG 到 `<工程>/.mcdev/skins`）；面板用系统文件夹选择器（`ctx.uiWorkspace.pickDirectory`）选择，**不再让用户输入任何路径**；游戏路径通过「选择游戏文件夹」或「使用探测路径」获得；
> - 新增 `lib/native/catalog.js`（工程/导入/全局包目录、皮肤目录、导入逻辑）与 `scripts/test-catalog.mjs`（6 项）；`test-presets.mjs` 改为 8 项（含"不再读取 .mcdev.json"断言）。

> **v0.7.1 变更（性能）**：面板根节点 `.mcd-root` 增加 `contain: content`（layout/style/paint 隔离），拖拽/缩放/日志刷新只影响面板子树；无 Host 接口变化，仅 Bump 版本。

> **v0.7 变更（启动预设）**：把 v0.6 的单份 launch-profile 升级为**预设集合**：
> - 插件自有文件 `<工程>/.mcdev/launch-presets.json`：`{version, activeId, presets:[{id,name,gameExe,host:{world,behaviorPacks,resourcePacks,skin,slim,skinsDir},guests:[{id,name,skin,slim}]}]}`，**不修改 `.mcdev.json`**；
> - 一个预设 = 游戏路径 + 1 个 host（世界/包/皮肤）+ 若干 guest（只能皮肤）；旧 `launch-profile.json` 自动迁移为默认预设；
> - 新 action：`presets` / `preset-save` / `preset-delete` / `preset-active`；移除 `launch-config` / `launch-profile`；`start` 支持 `presetId`（默认当前激活预设），host 的 `gameExe` 优先于 `.mcdev.json`；
> - 启动按钮 = 启动当前激活预设的 host；guest 启动项目前只保存、不自动拉起（联机方案待定，按用户决定 A 分步交付）；
> - 面板：动作行最右侧新增齿轮按钮，在面板内切换到「启动预设」设置页（不再是 tab）；新增预设/删除预设/编辑名称与游戏路径/host 配置/guest 皮肤列表；
> - 新增 `lib/native/presets.js` 与 `scripts/test-presets.mjs`（8 项）。

> **v0.6 变更（启动配置）**：新增「世界 / 行为包 / 资源包 / 皮肤」选择。
> - 插件自有配置 `<工程>/.mcdev/launch-profile.json`（`world` / `behaviorPacks` / `resourcePacks` / `skin` / `slim` / `skinsDir`），**不修改 `.mcdev.json`**；
> - 新 action：`worlds` / `packs` / `skins` / `launch-config` / `launch-profile` / `world-create`；`start` 支持一次性覆盖 `world` / `behaviorPacks` / `resourcePacks` / `skin` / `slim`；
> - native provider：`listWorlds()` / `packCatalog()` / `skins()` / `updateLaunchProfile()` / `createWorld()`；`packCatalog` 汇总工程包与全局包（排除 bridge 包），启动时按白名单**追加**（不删除已有包）；
> - 面板 full 模式新增第 4 个分段页「配置」；
> - 新增 `scripts/test-launch-profile.mjs`（8 项）。

> **v0.5 变更（UI）**：面板改为三种**点击切换**的形态，始终只有一个图标、无悬停弹层：
> `icon`（仅图标）→ 点图标 → `compact`（图标 + 标题/状态 + 启动停止/刷新/重载）→ 点「放大」→ `full`（完整控制台）；
> `full` 点缩小 → `compact`；`compact`/`full` 点图标 → `icon`。启动/停止合并为一个按钮，其余动作为图标按钮；
> 几何信息 storage key 为 `dsh.mcdev.panel.v4`，每次页面加载从 `icon` 模式开始；新增客户端渲染错误边界（出错时显示原因而不是静默消失）。Host 接口无变化。


> **v0.4 变更（UI）**：浏览器面板改为 Material 3 设计。收起态是**单图标 FAB**（Minecraft 方块图标 + 状态点）；**悬停只展开一个 peek 浮层**（图标/标题/状态/展开 + 启动停止/刷新/重载），不展示日志等其余区域；**点击图标**打开完整面板；**启动/停止合并为一个按钮**；其余动作全部为**图标按钮**（tooltip + aria-label），日志/执行/文档用分段按钮；几何信息 storage key 升级为 `dsh.mcdev.panel.v3`（旧位置不再复用）。Host 接口无变化。
>
> **v0.3.1 变更**：① bridge TCP 握手要求一次性 token；② 启动前检查外部客户端是否已打开同一世界；③ 截图空白检测 + 前台锁定绕开。
>
> **v0.3 变更（binding）**：按用户决定 **删除 legacy MCDK 代码**。
> - `lib/mcdk/**` 与 `scripts/probe-mcdk.mjs` 已删除；`docs/PROTOCOL.md` 移入 `docs/research/legacy-MCDK-PROTOCOL.md` 仅作历史参考。
> - `provider` 配置项、`mcp_tools` / `mcp` 动作、`mcdkPath` / `mcpPort` 配置均已移除。
> - `lib/native/util.js` 承接原先复用的工具（LogBuffer 游标、`.mcdev.json` 读写、游戏版本发现、进程工具）。
> - 运行期唯一链路：自己写 `dev_config.cppconfig` → spawn `Minecraft.Windows.exe` → 跟随官方 `Debug_Log*.txt` → 游戏内 `dsh_bridge` 行为包（loopback TCP）执行/重载 → Win32 截图。
> - 世界级互斥锁：`%APPDATA%\MinecraftPE_Netease\.dsh-mcdev\locks\<world>.lock`（`{pid,startedAt,projectDir}`，死进程可接管）；同一开发世界并发 `start()` 会返回可读错误。
> - 已知限制：脚本热重载官方不支持（`reload scripts/game` 返回 `restartRequired`，`reload addons` 可用）；合成键鼠输入不支持；完整 JSON UI 树暂不支持。

本文件是并行开发的唯一接口契约。文件所有权互斥；改接口先改本文件并在 team 任务里说明。

## 目标

在 DSH 内完成网易《我的世界》开发版（ModPC）的闭环开发：

1. 启动 / 停止 ModPC 开发客户端（v0.3：**自研官方链路**，无第三方启动器）；
2. 与运行中的游戏通信（官方日志、执行 Python、资源重载、截图、JSON UI 基础查询）；
3. 检索内置的网易 ModSDK 官方文档（离线语料 + 搜索）；
4. 为模组开发提供工具与提示词（agent tool + system prompt + skill）。

## 已确认的官方可复用事实（本机实测）

| 事实 | 证据 |
| --- | --- |
| `dev_config.cppconfig` 是**纯 JSON**（player_info / room_info / skin_info / world_info） | `%APPDATA%\MinecraftPE_Netease\minecraftWorlds\MC_DEV_WORLD\dev_config.cppconfig` 330B |
| 游戏启动参数只需 `chatExtension=false` + `config=<cppconfig 绝对路径>` | 之前 MCDK 启动的游戏进程命令行 |
| 开发世界 = 普通存档目录 + `world_behavior_packs.json` / `world_resource_packs.json` 清单 | `MC_DEV_WORLD` 目录；清单为 pack_id + version 数组 |
| 官方客户端写完整引擎日志：`%APPDATA%\MinecraftPE_Netease\logs\Debug_Log<ts>.txt` | 8 分钟运行约 10MB，含 `[时间 INFO area tid]` 行 |
| 行为包 Python 可用（ModSDK，Python 2.7）；MCDK 的调试包用 **loopback socket IPC** 与启动器通信 | `DEBUG_ENV_SCRIPT/IPCSystem.py`（`[IPCSystem] 已连接到调试服务器，端口：5379`） |
| 官方 UI 调试器接口在 ModSDK `gui.set_netease_ui_debugger_enable` / `gui.nud_*` | ModAPI 语料 |
| 官方 Safaia 日志通道（MC Studio 启动时）：`MCSafaiaServer\log_storages\*.txt` | MC Studio 那次运行 |

## v0.2 架构

```
DSH Host（Electron 的 Node 运行时）
├─ lib/host/plugin.js        命令/工具/技能/provider 选择
├─ lib/native/               native provider（自研官方链路）
│   ├─ launcher.js           发现游戏 exe、确保开发世界、写 cppconfig、spawn/stop 游戏
│   ├─ logs.js               跟随官方 Debug_Log*.txt（增量游标）+ errorlog
│   ├─ channel.js            TCP JSON-lines 服务端：与游戏内 bridge 包通信
│   ├─ bridgePack.js         生成/安装 dsh_bridge 行为包（含绝对路径与端口）
│   ├─ screenshot.js         Win32 窗口截图（PowerShell helper，返回 jpg 路径）
│   └─ index.js              createNativeProvider()，与 McdkBridge 同形接口
├─ lib/mcdk/                 legacy provider（保留，provider: "mcdk"）
└─ lib/client.js             浮动可拖拽面板（shell.overlay）
```

### Provider 统一接口

`lib/native/index.js` 导出 `createNativeProvider(options)`，**方法签名与 `createMcdkBridge` 一致**（Host 只依赖这些）：

```
discover(projectDir?) -> { provider:'native', gameExe, versions, configPath, projectDir, world?, bridgePack? }
readConfig(projectDir?) / updateConfig(patch, projectDir?)
status() -> Status            // phase/pid/gamePid/ready/projectDir/configPath/provider/lastError
start({reset?, join?, waitMs?}) -> Status
waitReady(timeoutMs) -> Status
stop() -> Status
logs({since, limit, errors, grep}) -> { lines:[{seq,text}], next, skipped }
exec(code, side, opts) -> { ok, returnValue?, error?, text? }
reload(kind, opts) -> { ok, detail?, error? }
screenshot(opts) -> { ok, file?, error? }
jsonui(command, opts) -> { ok, text, error? }
input(steps, opts) -> { ok, text, error? }
mcpConnected() -> false        // native 无 MCP
mcpConnect() -> undefined
mcpTools() -> []
mcpCall(name, args) -> 抛错：native provider 请用 exec/jsonui
dispose()
```

### 游戏内 bridge 包协议（TCP JSON lines）

- Host 在 `127.0.0.1:0` 起 TCP 服务，写入 bridge 包配置（绝对路径 + 端口）。
- bridge 包（行为包，`@Mod.Binding('dsh_bridge')`）客户端 + 服务端系统：
  - 启动后连接 Host，发送 `{"type":"hello","side":"client|server","version":"1.0.0"}`；
  - 收到 `{"id":"<n>","type":"exec","code":"...","side":"client|server"}` 时 `exec` 并回 `{"id","type":"result","ok":true,"returnValue":...}` 或 `{"id","type":"result","ok":false,"error":"traceback"}`；
  - 收到 `{"type":"reload"}` 时尽量重载（实现不了就返回 `{"ok":false,"error":"unsupported"}`，由 Host 降级为提示重启）；
  - 收到 `{"type":"ping"}` 回 `{"type":"pong","inWorld":true}`；
  - 每行一个 JSON，UTF-8，换行结尾；任何异常必须回包而不是崩。
- Python 2.7 语法；socket 用 stdlib；`exec` 用 `exec(code, globals_dict)` 捕获返回值（约定：代码可设置 `_result`，或表达式值）。

### 浮动窗口要求（ui）

- 注册槽位：`shell.overlay`（`{ name:'shell.overlay', id:'dsh-mcdev', order: 20, locale:'mcdev' }`）；
- 浮动卡片：`position: fixed`，初始靠右下；**标题栏可拖拽**（pointerdown/move/up + `setPointerCapture`），位置与折叠状态持久化到 `localStorage`（键含 session 无关的全局位置）；
- 边界约束：不出视口，窗口 resize 后仍可见；`z-index` 高于内容但低于模态；不使用 `document.body` 直接追加；
- 其余数据流与现有面板一致（`props.remote.commands.execute`，`/mcdev ... --json`）。

## 文件所有权（v0.2）

| 范围 | 所有者 |
| --- | --- |
| `index.js`、`lib/host/**`、`package.json`、`cordis.patch.yml`、`locale/*`、`icon.svg`、`CONTRACT.md`、`README.md` | Lead |
| `lib/native/**`、`scripts/native-probe.mjs`、`docs/NATIVE.md` | bridge |
| `docs/corpus/**`、`docs/index.json`、`lib/docs/**`、`scripts/build-docs-index.mjs` | docs |
| `lib/client.js` | ui |

## 目标

在 DSH 内完成网易《我的世界》开发版（ModPC）的闭环开发：

1. 启动 / 停止 ModPC 开发客户端（v0.2：**自研官方链路**，MCDK 仅回退）；
2. 与运行中的游戏通信（日志、执行 Python、重载、截图、JSON UI、输入）；
3. 检索内置的网易 ModSDK 官方文档（离线语料 + 搜索）；
4. 为模组开发提供工具与提示词（agent tool + system prompt + skill）。

## 运行环境事实（已确认）

- MCDK 可执行文件（本机）：`%USERPROFILE%\.vscode\extensions\dofes.mcdev-tools-0.1.32\bin\native\windows\x64\mcdk.exe`
  - 这是**交互式启动器**（无 `ps/logs/call` 子命令；传未知参数会直接启动游戏并阻塞）。
  - 启动游戏时读取项目目录的 `.mcdev.json`。
  - 支持从 `.mcdev.json` 的 `mcp_server_config` 启停内置 MCP Server（streamable HTTP，默认 `http://localhost:19133/mcp`，也有 `/sse`）。
  - 输出：stdout/stderr 实时日志（`MCDEV_OUTPUT_MODE=1`、`MCDEV_IS_PLUGIN_ENV=1` 由 VSCode 插件使用，沿用）。
- 游戏版本目录：`C:\MCStudioDownload\game\MinecraftPE_Netease\<version>\Minecraft.Windows.exe`。
- 项目 `.mcdev.json` 在 `<workspace>\.mcdev.json`（玩家真实工程配置，**不得改坏**；写回前备份）。
- MCP 工具名（由 mcdk.exe 字符串确认）：`get_latest_logs`、`get_log_range`、`get_latest_error_logs`、`execute_code`、`reload_scripts`、`reload_game`、`capture_game_window`、`click_game_window`、`jsonui_debugger`、`mc_input`。
- 文档语料来源：`<workspace>\.dsh-tmp\mcdk-assistant\mcdk-assistant-main\knowledge\`（BSD-3，MCDK-ASSISTANT 仓库；含 NetEase 官方 md）。

## 文件所有权

| 范围 | 所有者 |
| --- | --- |
| `index.js`、`lib/host/*`、`package.json`、`cordis.patch.yml`、`locale/*`、`icon.svg`、`CONTRACT.md` | Lead |
| `lib/mcdk/*`、`scripts/probe-mcdk.mjs`、`docs/PROTOCOL.md` | bridge |
| `docs/corpus/**`、`docs/index.json`、`lib/docs/*`、`scripts/build-docs-index.mjs` | docs |
| `lib/client.js` | ui |

## Host 服务契约

`index.js` 内 `apply(ctx, config)` 创建 `McDevService` 并 `ctx.provide('mcdev', service)`（可选，供其他插件用）。所有方法必须可失败：抛 Error 且 message 可读（中文/英文均可），不得中断 plugin。

```ts
type Status = {
  phase: 'idle' | 'launching' | 'ready' | 'stopped' | 'failed'
  pid?: number          // mcdk 进程
  gamePid?: number      // 游戏进程
  since?: number        // 启动时间戳 ms
  ready?: boolean       // MCP 可用（进入存档）
  mcp?: { port: number, connected: boolean, tools: string[] }
  projectDir: string
  configPath: string
  mcdkPath?: string
  lastError?: string
}

type Logs = { lines: { seq: number, text: string }[], next: number, skipped: number }

interface McDevService {
  status(): Promise<Status>
  start(opts?: { reset?: boolean, join?: boolean, timeoutMs?: number }): Promise<Status>
  stop(): Promise<Status>
  logs(args?: { since?: number, limit?: number, errors?: boolean, grep?: string }): Promise<Logs>
  exec(code: string, side?: 'client' | 'server'): Promise<{ ok: boolean, returnValue?: unknown, error?: string, logs?: Logs }>
  reload(kind?: 'scripts' | 'game' | 'addons'): Promise<{ ok: boolean, detail?: unknown, logs?: Logs }>
  screenshot(): Promise<{ ok: boolean, file?: string, error?: string }>
  jsonui(command: string): Promise<{ ok: boolean, text: string }>
  input(steps: unknown[] | string): Promise<{ ok: boolean, text: string }>
  docsSearch(query: string, limit?: number): Promise<{ hits: { path: string, title: string, snippet: string, score: number }[] }>
  docsRead(path: string, offset?: number, maxChars?: number): Promise<{ path: string, title: string, text: string, more: boolean, total: number }>
  discover(): Promise<{ mcdkPath?: string, mcdkSource?: string, gameExe?: string, versions: string[], configPath: string, projectDir: string }>
  readConfig(): Promise<object>
  updateConfig(patch: object): Promise<object>   // 写回前备份 .mcdev.json.bak
  dispose(): Promise<void>
}
```

`lib/mcdk/index.js` 导出 `createMcdkBridge(options)`，实现上述 `status/start/stop/logs/exec/reload/screenshot/jsonui/input/discover/readConfig/updateConfig/dispose`。

`lib/docs/index.js` 导出 `createDocs(options)`，实现 `docsSearch/docsRead`（加载 `docs/index.json`）。

## Slash 命令 `/mcdev`（客户端与用户共用）

输入（`input.hint` 同步）：`[--json] <status|discover|start|stop|wait|logs|game-logs|exec|reload|screenshot|jsonui|input|docs|read|config|mcp-tools|mcp|help> [args...]`

所有自由文本参数支持 base64url 变体：`--code-b64`、`--query-b64`、`--path-b64`、`--cmd-b64`、`--steps-b64`、`--tool-b64`、`--args-b64`（Host 解码为对应参数），用于面板传递含引号/换行的内容。

返回 `{ kind: 'success' | 'error', text }`；`--json` 时 `text` 是**纯 JSON 字符串**。`--json` 的形状由 `jsonPayloadOf()` 统一成面板/脚本直接可读的文档形状（Host 内部仍保留 `{ ok, ... }` 信封给 agent 工具渲染）：

- `/mcdev status --json` → `{ ok, phase, ready, pid?, gamePid?, projectDir, configPath, mcp:{...}, lastError? }`（**Status 字段在根上**）
- `/mcdev start --json` → 同上，**立即返回 `phase:'launching'`**（不等进入存档）
- `/mcdev wait --timeout 180 --json` → 同上（等到进入存档或超时）
- `/mcdev stop --json` → 同上（`phase:'stopped'`）
- `/mcdev logs --since N --limit N [--errors] [--grep X] --json` → `{ ok, source:'launcher', lines:[{seq,text}], next, skipped }`
- `/mcdev game-logs [--errors] [--limit N] --json` → `{ ok, source:'game', lines:[{seq,text}], tool?, error? }`
- `/mcdev exec --side client|server --code-b64 <b64> --json` → `{ ok, returnValue?, error?, side, logs?, gameLogs? }`
- `/mcdev reload [scripts|game|addons] --json` → `{ ok, kind, detail?, error?, logs?, gameLogs? }`
- `/mcdev docs --query-b64 X [--limit N] --json` → `{ ok, query, hits:[{path,title,snippet,score}] }`
- `/mcdev read --path-b64 <b64> [--offset N] --json` → `{ ok, path, title, text, more, total }`
- 失败时：`{ ok: false, error: '可读原因' }`，命令 `kind` 为 `error`。

命令执行**会向会话追加命令行事件**：客户端不得轮询（只在首次挂载、用户动作时调用，并按 sessionId 缓存快照）；展开控制台也算用户动作，会触发一次状态刷新。

## Agent 工具 `mcdev`

单入口 + `action` 枚举（MCDK 风格，减少 tools/list 上下文）：

```json
{ "action": "status|discover|start|stop|wait|logs|game_logs|exec|reload|screenshot|jsonui|input|docs_search|docs_read|config|mcp_tools|mcp|help",
  "query": "docs_search 关键词", "path": "docs_read 文档路径", "offset": 0,
  "code": "exec 的 Python 代码", "side": "client|server", "kind": "scripts|game|addons",
  "command": "jsonui 子命令（如 /tree ...）", "steps": "input 的步骤数组",
  "since": 0, "limit": 50, "errors": false, "grep": "", "reset": false,
  "tool": "mcp 工具名", "args": {}, "patch": {}, "timeoutMs": 0, "waitMs": 180000 }
```

返回 `output.schema = { text: string }`，`text` 为紧凑中文/JSON 报文（有界：日志最多 `limit` 行并显式标注截断；文档片段 ≤ 1500 字符）。

## MCP 客端契约（bridge 实现，已真机验证）

实测环境：MCDK 0.1.32（MCDevTools 内置）+ ModPC 3.10.0.436581。

- 端点：`POST http://127.0.0.1:<port>/mcp`；`initialize` 请求头 `Accept: application/json, text/event-stream`，响应 200 `application/json`，会话 id 在**小写响应头 `mcp-session-id`**；之后所有请求必须带 `Mcp-Session-Id`，否则 400 `Missing Mcp-Session-Id header`（会话丢失同样形状 → 客户端重建会话重试一次）。`notifications/initialized` 返回 202 空 body。
- 启动后约 2s MCP 端口即可用，**不能用端口可连判断“进入存档”**；可靠就绪信号：`tools/call jsonui_debugger {"cmd":"/screens"}` 的 `data.screens` 含 `hud.hud_screen`（加载中为 `[]`）。实测 start→ready 约 39–40s。
- 实际工具 9 个：`capture_game_window`、`execute_code`、`get_latest_error_logs`、`get_latest_logs`、`get_log_range`、`jsonui_debugger`、`mc_input`、`mc_profiler`、`reload_game`。**没有** `reload_scripts` / `click_game_window`；`reload` 映射：`scripts`/`game` → `reload_game{reload_addons:false}`，`addons` → `reload_game{reload_addons:true}`；点击用 `mc_input {op:'/click'}`。
- `execute_code` 返回 `{isError, content:[{type:'text',text}]}`；返回值需从 text 的 `Return value JSON: ` 段解析（失败回退 `Return repr: `）。`capture_game_window` 返回 `{type:'image',data:<base64 jpeg>,mimeType:'image/jpeg'}`（480p）。
- 游戏日志走 MCP `get_latest_logs` / `get_latest_error_logs`，需要 `.mcdev.json` 的 **`log_protocol: 1`**（Safaia）；mcdk 自身 stdout 只有启动/MCP 日志，不含游戏日志。
- 玩家真实配置 `mcp_server_config.enabled` 为 `false` → `start()` 默认 `ensureMcp:true`：备份 `.mcdev.json.bak` 后置 `true`（只改这一项，`log_protocol` 只提示不改），status.mcp 暴露 `{port,connected,enabled,tools,autoEnabled?}`。
- 停止顺序：先 `taskkill` mcdk 进程树，再显式结束记录的 `gamePid`（mcdk 被杀后游戏可能变孤儿）；只杀本桥接启动的 PID。

桥接接口（`lib/mcdk/index.js` 的 `createMcdkBridge(options)`）：

```js
discover(projectDir?) -> { mcdkPath?, mcdkSource?, gameExe?, versions, configPath, projectDir, config }
readConfig(projectDir?) / updateConfig(patch, projectDir?)   // 写回前 .mcdev.json.bak
status() -> Status
start({ reset?, join?, waitMs?, ensureMcp? }) -> Status      // waitMs=0 立即返回 launching
waitReady(timeoutMs) -> Status
stop() -> Status
logs({ since?, limit?, errors?, grep? }) -> { lines:[{seq,text}], next, skipped }  // since 严格 >
exec(code, side, {timeoutMs}) -> { ok, returnValue?, error?, text? }
reload(kind, {timeoutMs}) / screenshot({timeoutMs}) / jsonui(command, {timeoutMs}) / input(steps, {timeoutMs})
mcpConnected() -> boolean（同步，不触发连接）
mcpConnect() -> Promise<mcp|undefined>（惰性、2s 快速失败）
mcpTools() -> [{name,description,inputSchema}]
mcpCall(name, args, {timeoutMs}) -> { isError, content }   // 会话丢失自动重连一次
dispose() -> Promise<void>
```


## 文档语料契约（docs 实现）

- 输出目录：`dsh-plugins/dsh-mcdev/docs/corpus/<source>/<...>.md`，`source` ∈ `ModAPI`、`NeteaseGuide`、`QuModDocs`、`BedrockDev`、`ShaderSDK`、`SAPI`（必要时 `BedrockWiki` 仅索引摘要，不复制正文）。
- `docs/index.json`：`{ version: 1, builtAt: ISO, docs: [{ path, source, title, headings: string[], chars, keywords: string[] }] }`；`path` 为相对 `docs/corpus` 的 POSIX 路径。
- `search(query, limit)`：中文按 2-gram + 英文 token；title/headings 权重 > 正文；返回 `snippet`（命中词上下文 ≤ 200 字符）。
- `read(path, offset, maxChars)`：返回原文，`more` 表示未读完。
- 语料来源与许可证写入 `docs/CORPUS.md`。

## 客户端面板契约（ui 实现）

- 槽位：`conversation.input.dock`（`id: 'dsh-mcdev'`，`order: 100`），session 作用域；无 sessionId 返回 null。
- 注册方式对齐 `dsh-plugins/dsh-checkpoint/lib/client.js`：`window.__ModuleLoader__.load({ id: '@local/dsh-mcdev', factory(require) {...} })`，在 `apply(ctx)` 内 `ctx.slots.inject(...)` + `ctx.slots.register(...)`。
- 数据：`props.remote.commands.execute(props.sessionId, '/mcdev ... --json', [])`，解析 `outcome`（参考 dsh-checkpoint 的 `commandResultOf`）。
- 展示：状态 chip（未启动/启动中/已进入游戏/已停止）、启动/停止/重载按钮、最近日志（N 行、等宽、可展开）、执行代码（textarea + 端侧选择）、文档搜索（输入 + 结果列表 + 正文预览）。
- 样式：仅用主题 token（`--dsw-alias-*`）或自带完整配色（跟随 `body[data-ds-dark-theme]`），文案走 `props.t`（locale 由 Host `ctx.locale.register('mcdev', {en,zh})` 提供；客户端在 factory 内用 `ctx.locale.register` 注册同名 NS）。

## 安装与验证

- `plugin_manager install_bundle` target = `<本仓库路径>/dsh-mcdev`（Lead 执行）。
- 验证：`/mcdev discover --json`、`/mcdev start`（真机启动，可接受 1–3 分钟）、`get_latest_logs`、`execute_code`、`capture_game_window`、`docs --query`。
- 不修改玩家真实工程文件（`.mcdev.json` 可写但必须备份；默认只读）。
