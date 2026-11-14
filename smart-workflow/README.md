# Smart workflow（智能方向 + 检查点 + 上下文压缩）

一个插件安装三项能力：

- **智能方向**：改代码前的价值复核 + 方向卡片；每个选项自带补充指引输入框，选中的方向与指引写入 durable 决策记录，提交后自动继续。卡片使用 Material 3 基线配色（浅色/深色各一套，不跟随宿主皮肤）。
- **工作区检查点**：`/checkpoint` 命令、`checkpoint_inspect` 工具、git 自动提交与基线、无 git 指纹降级。
  - **每个对话独立索引与基线**：`cp-N` 编号在对话内独立，互不混排；旧的工作区级索引会自动拆分归档。
  - **dock 卡片**：M3 elevated card，图标操作（列表 / 新建 / 压缩 / 刷新 / 会话设置）；点列表在浮层里查看本对话全部检查点，点一行把 `#cp-N` 插入输入框。
  - **每次方向表单提交自动建检查点**（`/setup` 的 `checkpointOnCard`，默认开）。
- **会话设置**：居中 M3 弹窗（`shell.overlay`），保存后立即关闭；可随时从检查点卡片的设置图标重新打开。
- **上下文压缩**：`/checkpoint compress` 先写检查点锚点（备注 + 最近方向决策 + git/指纹状态），再通过 Host 压缩服务 `ctx.compaction.compactNow()` 压缩旧历史；压缩后用 `checkpoint_inspect` 的 `latest` 动作读取锚点继续。

## 命令

| 命令 | 作用 |
|---|---|
| `/checkpoint` | 创建检查点（默认自动提交 git） |
| `/checkpoint compress` | 创建锚点检查点并压缩上下文 |
| `/checkpoint list` / `list --json` | 查看本对话检查点（`--json` 供 dock 卡片使用） |
| `/checkpoint show <cp-N>` / `diff` | 查看详情与差异 |
| `/checkpoint baseline [<cp-N>]` | 查看或设置本对话基线 |
| `/checkpoint restore <cp-N> --yes` | 先建安全点再恢复工作区（破坏性，用户执行） |
| `/setup` | 本会话设置（智能方向、自动继续、自动提交、每次表单建检查点、新会话初始检查点） |

## 依赖

- `@deepseek-ai/dsh-action-cards`（方向卡片服务，bundle patch 会插入）
- 上下文压缩需要 profile 启用 `@deepseek-ai/dsh-compaction-basic`（及可选 `dsh-command-compact`）；未启用时 `/checkpoint compress` 仍会保存锚点并提示原因。

## 安装

把本目录作为 bundle 安装到 DSH profile，例如：

```
plugin_manager install_bundle target <本目录绝对路径>
```

安装后在「插件」里启用 `@local/dsh-smart-workflow`。

## 存储

- 检查点（每对话独立）：git 仓库 `<repo>/.git/dsh-checkpoints/sessions/<sessionId>/index.json`；无 git `<workspace>/.dsh-checkpoints/sessions/<sessionId>/index.json`
- 迁移归档：拆分完成后旧索引保留为 `<store>/index.legacy.json`
- 会话设置：`$DSH_HOME/checkpoint/session-setup.json`

## 注意

- 检查点索引与基线按对话隔离，但 **git 提交与 restore 仍是仓库级**：多个对话交错时它们共享同一个工作区，restore 会影响工作区本身。
