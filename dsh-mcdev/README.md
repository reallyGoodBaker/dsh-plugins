# dsh-mcdev · Minecraft 网易版开发伴侣（DSH 插件）

在 DeepSeek Harness（DSH）里完成网易《我的世界》开发版（ModPC）的模组开发闭环：

1. **自研官方链路**（v0.3，唯一运行方式）：自己写 `dev_config.cppconfig`、直接拉起 `Minecraft.Windows.exe` 进入开发世界，**不使用任何第三方启动器**；
2. **一整套与游戏通信的能力**：官方 `Debug_Log*.txt` 增量日志、游戏内 bridge 行为包（loopback TCP）执行 Python、资源重载、Win32 窗口截图、JSON UI 基础查询；
3. **整合官方文档**：内置网易 ModSDK / 官方教程 / QuMod / SAPI / BedrockDev 离线语料与全文检索，agent 写代码前先查文档；
4. **协助开发模组**：agent 工具 + 系统提示词 + 技能，形成「查文档 → 改代码 → 重载 → 看日志 → 真机验证」闭环，并在 Web GUI 提供**浮动可拖拽**控制台。

## 组成

| 部分 | 位置 | 说明 |
| --- | --- | --- |
| Host 插件 | `index.js`、`lib/host/` | `/mcdev` 命令、`mcdev` agent 工具、系统提示词、技能、服务 `mcdev` |
| 运行链路 | `lib/native/` | 自研启动器、官方日志跟随、游戏内 bridge 包、TCP 通道、截图、工具函数 |
| 文档 | `lib/docs/`、`docs/` | 语料 `docs/corpus/`、索引 `docs/index.json`、检索/读取、QUICKREF、实测记录 |
| Web 面板 | `lib/client.js` | `shell.overlay` 里的浮动可拖拽 Minecraft 开发控制台 |

> 旧的第三方 MCDK 集成已在 v0.3 删除；`docs/research/legacy-MCDK-PROTOCOL.md` 只保留为历史参考。

## 前置条件

- Windows + 已安装网易 MC Studio / ModPC 开发包（`C:\MCStudioDownload\game\MinecraftPE_Netease\<版本>\Minecraft.Windows.exe`，或设置 `MCDEV_GAME_DIR`）；
- 开发世界：默认 `%APPDATA%\MinecraftPE_Netease\minecraftWorlds\MC_DEV_WORLD`；不存在时 `start()` 会尝试用 `world_templates` 模板创建，仍失败则提示先用 MC Studio 创建一次；
- 工程根目录有 `.mcdev.json`（只读它来解析游戏路径、世界名与工程包目录；修改会先备份 `.bak`）。

## 安装

```bash
# 在 DSH 中（Lead 已执行）
plugin_manager install_bundle target="<本仓库路径>/dsh-mcdev"
```

本地目录安装是链接（link），修改源码后重启 DSH 或重新加载插件即可生效。

## 使用

### 命令（用户 / Web 面板 / 任何 DSH 会话）

```text
/mcdev discover                  # 游戏版本 / 开发世界 / 工程目录（provider 恒为 native）
/mcdev start                     # 启动游戏（约 17–19s 进入存档）
/mcdev wait --timeout 180        # 等待进入存档（不重新启动）
/mcdev status                    # 进程 / 是否进入存档 / 游戏内通道
/mcdev logs --since 0 --limit 80 # 官方 Debug_Log（游标增量，含游戏内 print 回传）
/mcdev game-logs --limit 120     # 同上，标记为“游戏日志”（面板用）
/mcdev exec --side server --code-b64 <base64>   # 在服务端执行 Python
/mcdev reload addons             # 重载资源包（Python 热重载官方不支持，需重启；见下）
/mcdev screenshot                # 截图并返回文件路径
/mcdev docs --query 实体伤害      # 检索官方文档
/mcdev read --path <文档路径>     # 读文档正文
/mcdev worlds                    # 列出可选世界与当前生效世界
/mcdev packs                     # 列出可选行为包 / 资源包与当前选择
/mcdev skins                     # 列出皮肤 PNG 与当前皮肤
/mcdev world-create --world-name-b64 <base64>      # 从模板/已有世界新建世界（不覆盖已有）
/mcdev presets                   # 预设集合 + 世界/包/皮肤清单（设置页用）
/mcdev preset-save --preset-b64 <base64 JSON>       # 新增/更新预设
/mcdev preset-delete <presetId>                     # 删除预设（至少保留一个）
/mcdev preset-active <presetId>                     # 设置当前激活预设
/mcdev stop
```

所有命令加 `--json` 返回纯 JSON，Web 面板即通过 `/mcdev ... --json`（Commands Remote）取数。

### 启动预设（presets）

一个预设 = **游戏路径 + 1 个 host + 若干 guest**，保存在 **`<工程>/.mcdev/launch-presets.json`**（插件自有状态，**不修改 `.mcdev.json`**）：

```json
{
  "version": 1,
  "activeId": "p-xxxxxxxx",
  "presets": [
    {
      "id": "p-xxxxxxxx",
      "name": "默认预设",
      "gameExe": "D:/MCStudio/MinecraftPE_Netease/3.10.0.436581/Minecraft.Windows.exe",
      "host": {
        "world": "MC_DEV_WORLD",
        "behaviorPacks": ["<uuid>"],
        "resourcePacks": ["<uuid>"],
        "skin": "C:/skins/hero.png",
        "slim": false,
        "skinsDir": "C:/skins"
      },
      "guests": [{ "id": "g-xxxxxxxx", "name": "Guest 1", "skin": "C:/skins/guest.png", "slim": false }]
    }
  ]
}
```

- **启动按钮 = 启动当前激活预设的 host**；`gameExe` 为空时自动探测（不同机器安装位置可能不同）；
- host 可选世界 / 行为包 / 资源包 / 皮肤 / 纤细模型；**guest 只能选皮肤**（世界与包由 host 决定）；
- guest 启动项目前**只保存、不自动拉起**（等待联机方案；面板上有说明）；
- `world` 为空 = 跟随 `.mcdev.json`；`behaviorPacks`/`resourcePacks` 为 `null` = 工程解析出的全部包；启动时按选择**追加**包（不删除世界里已有的包）；
- 首次使用自动创建**默认预设**：世界/包/皮肤/gameExe 取自当前工程能检索到的内容；
- 面板 full 模式动作行**最右侧的齿轮**打开「启动预设」设置页：可新增/删除预设、编辑名称与游戏路径、选择 host 配置、添加/删除 guest。

### Agent 工具 `mcdev`

单入口 + `action`（`status/discover/start/stop/logs/exec/reload/screenshot/jsonui/input/wait/docs_search/docs_read/config/worlds/packs/skins/world-create/presets/preset-save/preset-delete/preset-active/help`），参数说明见工具 schema。为了少占用上下文，动作细节用 `action: "help"` 按需展开。

### Web 面板

## Web 面板（Material 3）

面板是一个 **Material 3 浮动组件**（`shell.overlay`，root scope），有三种形态、始终只有一个图标：

- **icon 模式**：只显示一个 56dp 圆角图标（Minecraft 方块 + 状态点：绿=已进入游戏 / 黄=启动中 / 红=失败），**没有任何弹层/文字**；
- **compact 模式**：点击图标进入——图标 + 标题 + 状态 + 「放大」按钮，以及启动/停止、刷新、重载三个动作；不展示日志等其余内容；
- **full 模式**：compact 点「放大」进入——完整 M3 卡片（拖拽条、标题栏、动作行、日志/执行代码/文档三个分段页）；动作行**最右侧的齿轮**在面板内打开「启动预设」设置页（预设列表、游戏路径、host 世界/包/皮肤、guest 皮肤），设置页用返回按钮回到主界面；
- **切换规则**：icon 点图标 → compact；compact 点图标 → icon；compact 点放大 → full；full 点缩小 → compact；full 点图标 → icon；
- **启动/停止合并为一个按钮**（▶ / ■ / ✕），其余动作全部是带 tooltip 与 aria-label 的图标按钮；
- 全部颜色/圆角/字体走 M3 token（Minecraft 绿主色、surface-container 系列、state layer、深浅主题 fallback、`prefers-reduced-motion`）；
- 键盘：图标 Enter/Space 进入 compact，`Esc` 逐级后退（full → compact → icon），方向键移动，tab 左右切换；几何信息记忆在 `localStorage`（v4），**每次页面加载都从 icon 模式开始**。

## 配置（bundle row config）

| 键 | 默认 | 说明 |
| --- | --- | --- |
| `projectDir` | `''` | 工程目录（含 `.mcdev.json`）；空 = 会话工作目录 |
| `logLimit` | `2000` | 日志环形缓冲行数 |
| `docsDir` | `''` | 文档目录；空 = 插件内置 `docs/` |
| `startTimeoutMs` | `180000` | agent `start` 默认等待进入存档的时间 |

**注意**：插件会**读取**工程 `.mcdev.json`（游戏路径 / 世界名 / 包含目录）；`config` 动作写回前会备份 `.mcdev.json.bak`。

## 验证记录（2026-11-14，本机真机）

### 自研链路（v0.2–v0.3）

- **启动**：`mcdev start` 自己写 `dev_config.cppconfig` 并拉起 ModPC 3.10.0.436581，**17–18.6s 进入存档**（6 次采样；第三方启动器为 39–41s）；`status` 返回 `已进入游戏` + `提供方: 自研官方链路`。
- **通信**（经安装后的插件工具验证）：
  - `logs` / `game_logs`：跟随官方 `Debug_Log*.txt`，25s 读到 1.1–1.6 万行，包含工程自身的 Python traceback；
  - `exec`（client/server）：游戏内 `dsh_bridge` 行为包经 loopback TCP 执行，返回 `{ok:true, side, level:'MC_DEV_WORLD'}`；异常返回完整 traceback；
  - `jsonui /screens`：`in_world=true`，返回 `hud.hud_screen`（完整 UI 树暂不可用）；
  - `screenshot`：Win32 截图 420×280 JPEG；游戏是 DirectX 画面，PrintWindow 拿不到内容时会短暂切前台再截屏；
  - `reload addons`：返回 `{refreshed:true}`；`reload scripts/game` 返回 `restartRequired`（官方无脚本热重载 API）。
- **世界锁（P0）**：同一开发世界只允许一个 native 会话，并发 `start()` 返回可读错误而不是把世界写坏；`stop` 后无残留进程、锁文件自动清理。
- **外部实例保护（v0.3.1）**：启动前枚举 `Minecraft.Windows.exe` 命令行，若别的进程已打开同一 `dev_config.cppconfig`，直接报错而不是冒险并发写世界。
- **通道安全（v0.3.1）**：游戏内 bridge 的 `hello` 必须携带每次启动随机生成的一次性 token，不匹配立即断开；hello 之前的消息全部忽略。
- **截图（v0.3.1）**：RenderDragon 的 DirectX 画面无法被 `PrintWindow` 复制，已实现「空白检测 + 前台锁定绕开（`AttachThreadInput`/`SwitchToThisWindow`/`AppActivate`）+ 截完还原前台」，实拍能拿到真实游戏画面。
- **停止**：`mcdev stop` → `phase=stopped`，游戏进程结束、锁与端口释放；未触碰用户自己的 MC Studio 进程。
- **退出码 3221226505**：早期并发实例把世界 DB 写坏导致，已由世界锁 + 外部实例保护 + 主线程 ping 加固修复。

### Web 面板

- 面板在桌面客户端中**真实渲染**，并已从输入区固定条改为**浮动可拖拽窗口**（`shell.overlay`）；
- 修复过 Host `--json` 信封与面板读取形状不一致的缺陷（曾显示「未知」+ 原始 JSON），现在 chip 状态、日志、执行代码、文档检索均正常。

### 离线测试（全绿）

| 脚本 | 条数 | 覆盖 |
| --- | --- | --- |
| `scripts/test-host.mjs` | 6 | 命令解析、配置归一、base64 |
| `scripts/test-integration.mjs` | 10 | 假 Cordis 上下文下的命令/工具注册、docs 检索、discover（provider=native）、`--json` 文档形状 |
| `scripts/test-native-util.mjs` | 9 | 日志环形缓冲游标/ANSI/错误过滤、`.mcdev.json` 合并与备份、游戏版本发现、世界占用进程识别 |
| `scripts/test-native-channel.mjs` | 5 | bridge TCP 握手：token 缺失/错误被拒、hello 前消息忽略、重连替换 |
| `scripts/test-client-shapes.mjs` | 6 | 面板 payload 解包与错误文案（回归测试） |
| `scripts/test-locale-parity.mjs` | 59 | `lib/client.js` 内联 en/zh 与 `locale/*.json` 逐键一致 |
| `scripts/test-docs-search.mjs` | 28 | 检索/读取/路径穿越/幂等构建 |

### 未验证 / 已知限制

- 完整 JSON UI 树查询、合成键鼠输入暂不可用（官方 ModSDK 只提供只读事件；`gui.nud_*` 读取路径未稳定）。
- 面板真实浏览器行为（拖拽手感、明暗主题、剪贴板）仅经自测覆盖，需在客户端目检。
- 截图会短暂切换焦点；远程桌面/独占全屏/最小化时可能失败。
- 外部实例保护依赖 WMI 查询命令行，Windows 权限受限的环境可能拿不到命令行（届时退化为仅世界锁保护）。

## 文档来源与许可

- 语料来自 [MCDK-ASSISTANT](https://github.com/GitHub-Zero123/mcdk-assistant)（BSD-3-Clause）整理的网易 ModAPI、官方教程（mcguide）、QuMod、SAPI、BedrockDev 等文档，详见 `docs/CORPUS.md`；该仓库仅提供资料，不参与运行。
- 运行链路全部本插件自研（启动/日志/通道/截图），不依赖第三方启动器。
- 本插件自身 MIT。

## 已知限制

- 只在 Windows / 网易 ModPC 上验证；国际版 Bedrock 不适用。
- 截图/输入需要游戏窗口存在且未最小化。
- 文档语料为离线快照，官方文档更新后需重新构建索引（`node scripts/build-docs-index.mjs`）。
