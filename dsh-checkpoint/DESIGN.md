# 检查点（Checkpoint）功能设计规格

> 状态：**P1 + P1.5 已实现并激活（2026-11-14）**；P2/P3（检查点行/面板）待定
> 归属：新插件 `dsh-checkpoint`（独立 bundle，不改动 `smart-direction`）
> 目标工作区：任意会话 workspace；无 git 时降级

## 1. 目标

1. 用户可以随时创建一个「检查点」：记录当前工作区状态，成为后续修改的**新基线**。
2. 有 git 时：记录仓库/分支/HEAD/脏文件，并默认提交对应修改；无 git 时：记录文件指纹清单，不提交。
3. 每次创建检查点后，若没有用户明确指定旧检查点，**基线自动推进到最新检查点**（"重新基线化"）。
4. 用户在输入框里**索引某个检查点并明确要求修改**时（如 `#cp-3`、"回到检查点 cp-3 继续改"），该检查点成为本轮任务的基线；默认只做对比说明，**只有明确说"回滚/恢复"才改动代码**。
5. 最终形态：在「对话轨迹」旁/后出现检查点入口与时间线（分阶段实现，V1 先保证语义与数据正确）。

## 2. 术语

| 术语 | 含义 |
|---|---|
| checkpoint | 一次记录，id 形如 `cp-3`，包含时间、备注、git/文件指纹、创建它的 Session 与 seq |
| base（基线） | AI 进行"当前修改"对比时的参照检查点；默认是最近一次 checkpoint |
| ref（引用） | 用户输入中的检查点索引，语法见 §6 |
| restore / rollback | 把工作区代码恢复到某检查点；**只能由用户明确要求触发** |
| safety checkpoint | 执行 restore 前自动创建的、用于可回退的检查点 |

## 3. 用户入口

### 3.1 V1：斜杠命令（本轮实现）

| 命令 | 行为 |
|---|---|
| `/checkpoint [--note=...]` | 创建检查点；默认自动 commit（`--no-commit` 关闭） |
| `/checkpoint list` | 列出检查点（id、时间、备注、git commit 短哈希、是否基线） |
| `/checkpoint show <cp-N>` | 显示单个检查点详情（git/文件指纹、创建 session/seq） |
| `/checkpoint diff [<cp-A>] [<cp-B>]` | 默认：基线 vs 工作区；两参：两个检查点之间（git diff） |
| `/checkpoint baseline [<cp-N>]` | 无参：查看当前基线；有参：显式把基线设为 cp-N |
| `/checkpoint restore <cp-N> --yes` | 先建 safety checkpoint，再恢复代码到该检查点；无 `--yes` 只输出警告 |
| `/checkpoint --no-commit` | 只记录，不提交（用于想自己控制提交时） |

命令输出直接在对话中以命令结果文本呈现（`CommandResult.success.text`），包含结构化摘要（id/git hash/基线）。

### 3.2 后续阶段（不在 V1）

- 输入框旁的检查点按钮（通过 `ctx.remote.commands.execute` 触发同一命令，遵循 user-actions 约定）。
- 「对话轨迹」旁/后的检查点时间线面板 + 对话流中的检查点行（自定义 Chat node，需要事件定义 + `conversation.chat.node` 渲染 + 投影数据）。

## 4. 存储设计

### 4.1 位置

- **有 git**：`<repo>/.git/dsh-checkpoints/index.json`（仓库本地、不会被提交、不污染工作区；worktree 时使用 `.git` 文件指向的公共目录）
  - 若 `.git` 不可写：回退到 `<workspace>/.dsh-checkpoints/`
- **无 git**：`<workspace>/.dsh-checkpoints/index.json`，并建议用户把它加入 `.gitignore`（不自动修改用户 ignore 文件）

### 4.2 `index.json` 结构（版本化）

```jsonc
{
  "version": 1,
  "nextId": 4,
  "baseline": "cp-3",
  "checkpoints": [
    {
      "id": "cp-3",
      "createdAt": "2026-11-14T08:00:00.000Z",
      "note": "重构前",
      "sessionId": "...",       // 创建它的会话
      "sessionSeq": 123,        // 创建时的 session seq（关联轨迹）
      "source": "command",      // command | restore-safety | manual
      "git": {
        "repoRoot": "<workspace>",
        "branch": "master",
        "headBefore": "1ee111a...",
        "headAfter": "9f2c1ab...",   // 无提交时等于 headBefore
        "commit": "9f2c1ab...",      // 本次创建的 commit（无则 null）
        "commitMessage": "checkpoint cp-3: 重构前",
        "dirtyFiles": [" M README.md", "?? new.txt"],
        "untrackedCount": 1,
        "committed": true
      },
      "fingerprints": null,      // 无 git 时：{ files: { path: { size, sha256 } }, totalBytes }
      "parentId": "cp-2"         // 上一个检查点，便于线性回溯
    }
  ]
}
```

- 写入使用"读改写 + 原子替换（临时文件 rename）"；同一 workspace 的并发命令以进程内串行化。
- 快照（无 git）：V1 只存指纹清单，不复制文件内容（避免体积膨胀）；`restore` 在无 git 下不支持，明确报错。

## 5. 基线语义

- 创建 checkpoint 后，`baseline` 自动指向新 checkpoint（"每次固定的 checkpoint 都重新基线化"）。
- `--keep-baseline` 可用于"只记录、不推进基线"（可选参数）。
- `/checkpoint baseline cp-N` 显式设置基线。
- **用户引用优先级**：用户输入提到 `#cp-N`/「检查点 cp-N」并要求修改时，本轮以 cp-N 为对比基线（写进给模型的任务上下文），不改变持久基线，除非用户说「把基线设为 cp-N」。
- AI 默认行为（由插件注入的系统提示段 + 技能描述保证）：
  1. 编辑前：`git diff <baseline>` / 指纹 diff，说明即将改什么；
  2. 编辑后：汇报相对基线的变更；
  3. 用户引用旧检查点时：以该点做 diff 说明；**不得自动回滚**；
  4. 用户明确要求回滚：先建 safety checkpoint，再执行 restore 命令。

## 6. 引用语法

- 输入框（任意位置）：`#cp-3`、`@cp-3`、`cp-3`（需带"检查点/checkpoint"字样避免误识别）、中文「检查点 cp-3」。
- 解析规则（Host 侧）：正则 `(?:#|@)\s*(cp-\d+)` 优先；`检查点\s*(cp-\d+)` 次之；取本轮用户消息中**最后出现**的引用作为当前基线。
- AI 在回复中应回显识别到的 ref（"以 cp-3 为基线"），避免误解。

## 7. git 细节

- 创建：
  1. `git rev-parse --show-toplevel` 确定仓库根；`git status --porcelain` 取脏文件。
  2. 默认（非 `--no-commit`）：若工作区有变更 → `git add -A` → `git commit -m "checkpoint cp-N: <note>"`。尊重用户 git 配置（hooks、签名）；提交失败（hook 拒绝/无身份）时**仍记录检查点**，标记 `committed:false` 并输出失败原因。
  3. 工作区干净：不产生空提交，`commit:null`。
  4. commit 成功后 `headAfter` 为新 HEAD。
- `restore`（危险操作）：
  1. 先创建 safety checkpoint（source=`restore-safety`）；
  2. 要求工作区干净（或用户显式 `--force`）；
  3. `git reset --hard <目标 headAfter>`（文件回到检查点状态；不重写历史之外的内容）；
  4. 输出「可从 safety checkpoint 回退」的提示。
- 不修改用户 git config；不自动推送（`--push` 不提供，避免远端副作用）。
- `diff` 使用 `git diff [<base>]` 或 `git diff <A> <B> --stat` 摘要输出（大 diff 截断并附完整命令）。

## 8. 无 git 降级

- 检查点只记录指纹：遍历工作区文件（排除 `.git`、`.dsh-checkpoints`、`node_modules`、≥ `config.maxFiles` 或二进制大文件按策略跳过），保存 `{size, sha256}`。
- `diff`：比较两个指纹清单，输出新增/删除/修改文件列表（不含内容 diff）。
- `restore`：**不支持**，输出明确原因与建议（初始化 git 或手动备份）。
- 指纹计算上限：默认最多 5000 个文件、单文件 ≤ 2MB 参与哈希；超限标记 `partial:true` 并在输出中说明。

## 9. 插件结构与配置

```
dsh-plugins/dsh-checkpoint/
  package.json            # bundle manifest + dsh.bundle.patch
  cordis.patch.yml
  index.js                # Host：commands 注册、系统提示段、技能
  lib/checkpoint-store.js # 存储读写（原子写、串行化）
  lib/git.js              # git 探测与命令封装（走 ctx.subprocess）
  lib/fingerprint.js      # 无 git 指纹
  lib/commands.js         # 命令定义与输出格式化
  locale/{en,zh}.json     # 插件管理页展示
  icon.svg
  DESIGN.md               # 本文件
```

Config（`cordis.patch.yml`）：

```yaml
- id: dsh-checkpoint
  name: '@local/dsh-checkpoint'
  config:
    autoCommit: true              # 默认自动提交
    commitMessage: 'checkpoint {id}: {note}'
    keepBaselineByDefault: false  # true = 新检查点不推进基线
    storeDir: null                # 自定义存储目录（默认按 §4.1）
    maxFingerprintFiles: 5000
    maxFingerprintBytes: 2097152
```

系统提示段（新插件注入，~500 字符）：
- 存在检查点时，改代码前简述当前基线；
- 用户引用 `#cp-N` 时以该点为基线并回显；
- 不得自动回滚；回滚必须走 `/checkpoint restore --yes`。

## 10. 验收标准（V1）

- [ ] 无 git 目录：`/checkpoint` 成功记录指纹；`list/show` 正常；`diff` 输出文件级差异；`restore` 明确不支持。
- [ ] git 干净仓库：`/checkpoint` 不产生空提交，记录 headBefore=headAfter，baseline 推进。
- [ ] git 脏仓库：默认生成 commit，哈希写入记录；`--no-commit` 不提交。
- [ ] commit 失败（如 hook 拒绝）：记录仍写入、`committed:false`、输出失败原因，不中断会话。
- [ ] `/checkpoint baseline cp-1` 后，新检查点仍按 `keepBaselineByDefault` 语义推进/保持。
- [ ] 用户在输入框写 `#cp-2` 并修改：AI 以 cp-2 为基线做 diff 说明，不回滚；说「回滚到 cp-2」时先建 safety checkpoint 再恢复。
- [ ] 存储文件原子写、跨会话共享、损坏时给出可读错误而不是崩溃。
- [ ] `node --check`、单元测试（临时 git 仓库 + 临时无 git 目录）通过。

## 11. 分阶段计划

| 阶段 | 内容 | 风险 |
|---|---|---|
| **P1** | 命令 + git/指纹存储 + 基线语义 + 系统提示段 + 技能 | 低：只新增命令与提示；不改 UI |
| **P1.5** | 新会话 Setup Wizard（dock 面板）+ 会话偏好存储 + Host 门控（smart-direction / 方向卡片 / 检查点自动提交开关） | 中：需要 Client 面板 + 会话偏好读写 + 按会话门控；见 §13 |
| P2 | 对话内检查点行（自定义 Chat node） | 中：需要事件定义/投影；与内置行样式兼容 |
| P3 | 轨迹旁检查点面板（列表/详情/对比/恢复按钮） | 高：面板 + 数据通道 + 交互；与内置轨迹布局协调 |

## 12. 待确认问题（确认后即实现 P1）

1. 默认是否自动 `git add -A && git commit`？（默认建议：是，可 `--no-commit`）
2. 引用语法 `#cp-3` / `@cp-3` / 「检查点 cp-3」是否都可以？（默认建议：都识别）
3. 引用旧检查点默认只对比、不自动回滚，是否符合预期？
4. 检查点元数据放 `<repo>/.git/dsh-checkpoints/`（不入库）是否可接受？
5. V1 是否就按 P1 范围（命令层，不改 UI）？

## 13. 新会话 Setup Wizard（新增需求，2026-11-14）

> 用户要求：新 Session 打开时，弹出一个「当前 Session 的 smart-direction setup wizard」，包含「是否每次对话都用这个插件」「是否自动提交」等选项。

### 13.1 触发与时机

- **触发**：打开/新建一个**空白 Session**（无用户消息、无历史）且该 Session 还没有 setup 记录时，显示向导。
- **不阻塞输入**：优先采用输入框上方的 dock 面板（`conversation.composer.dock`）或右侧面板；可「跳过/稍后」。
- **已有内容的 Session 不自动弹**；用户可用 `/setup` 命令重新打开向导。
- 多端一致：同一 Session 在另一客户端打开时，不重复弹（偏好已保存）。

### 13.2 选项（初版）

| 分组 | 选项 | 说明 |
|---|---|---|
| smart-direction | 跟随全局 / 本会话启用 / 本会话关闭 | 关闭 = 本会话不注入价值复核与结构化回复提示、不提供方向卡片（Host 侧门控） |
| 方向卡片 | 提交后自动继续（开/关） | 覆盖 `autoContinue` |
| 检查点（装 dsh-checkpoint 时） | 本会话自动 git commit（开/关） | 覆盖检查点 `autoCommit` |
| 检查点 | 新会话开始时自动建初始检查点（开/关） | 可选，默认关 |
| 记忆范围 | 仅本会话 / 同时设为全局默认 | 全局默认影响之后新建的 Session |
| 其他 | 「以后不再自动弹」| 记住后，仅 `/setup` 可再次打开 |

### 13.3 优先级与持久化

- 优先级：**本会话覆盖 > 全局默认 > 插件默认**。
- 全局默认：写入插件自有存储（推荐，即时生效、无需重启）；不直接改 profile 的 `cordis.patch.yml`。
- 本会话覆盖：Host 侧插件存储，按 SessionId 键控（JSON 文件/domain 存储），随会话恢复保留；fork 默认继承、resume 保留。
- 契约：向导保存后写一条**可读的确认输出**（不伪造用户消息）；后续 Host 读取偏好用于门控。

### 13.4 形式选项（实现时二选一）

| 形式 | 收益 | 风险 |
|---|---|---|
| **A. dock 面板（推荐 V1.5）** | 不遮挡对话、实现简单、可用纯 Client slot 渲染 | 不够「弹窗」感 |
| B. 模态向导（`shell.overlay`） | 更接近用户说的「弹出」 | 焦点/遮罩/Esc/无障碍处理，风险中 |
| C. 复用方向卡片机制 | —— | 不可行：新会话尚无模型轮次，无法主动 `propose_action` |

### 13.5 Host 门控（关键设计）

Host 需要按 Session 偏好决定是否生效：

- `systemPrompt.section`：文本改为函数；当前 `AssembleContext` 只有 `scope`，没有会话信息 → **改为 agent 级注册**（`agent/created` 时按会话偏好注册/不注册该段），并随 agent 释放清理。
- 方向卡片：`actionCards.register` 是全局的；按会话关闭时，在 `act` 层拒绝 + 技能目录对会话不可见（或提示段不再引导使用）。`propose_action` 本身是共享服务，V1 接受「提示层关闭 + act 拒绝」的组合，不劫持全局工具注册。
- 检查点：命令 handler 读取会话偏好决定是否自动 commit。

### 13.6 风险

- 新会话打扰：首次多一次交互；用「跳过/不再自动弹」缓解。
- 存储一致性：多客户端、fork/resume 语义；采用 Host 存储 + SessionId 键控避免浏览器本地存储丢失。
- 全局默认的即时生效：存插件自有存储而非 profile Config，避免重启语义。
- 门控复杂度：agent 级提示注册 + act 层拒绝；需要在插件卸载/agent 释放时正确清理。

### 13.7 分阶段

- **P1**：命令层（§3.1），不含 wizard。
- **P1.5**：Setup Wizard（dock 面板）+ 会话偏好存储 + Host 门控（smart-direction 行为、autoContinue、checkpoint autoCommit）。
- P2/P3：检查点行/面板；向导可扩展更多选项。

### 13.8 新增待确认问题

6. Wizard 形式：dock 面板（推荐）还是模态弹窗？
7. Wizard 作用域：只控制 smart-direction，还是同时控制检查点自动提交（推荐：同时）？
8. 全局默认的存储方式：插件自有存储（推荐、即时生效）还是写 profile Config（需重启语义）？

## 14. P1 实现记录（2026-11-14）

已交付并激活：

- 命令 `/checkpoint`：创建 / list / show / diff / baseline / restore（`--yes`、`--force`、`--no-commit`、`--keep-baseline`、`--note`）
- 模型工具 `checkpoint_inspect`：只读 list / show / diff
- 技能 `checkpoints` + 常驻提示段 `checkpoint:policy`（引用语义、只对比不回滚、不自动创建）
- 存储：git 仓库 `<repo>/.git/dsh-checkpoints/index.json`（worktree 解析 gitdir），无 git `<workspace>/.dsh-checkpoints/`；原子写 + 目录级串行化
- git：自动提交（可关）、提交失败仍记录并标记 `committed:false`、restore 先建 safety checkpoint 再 `reset --hard`
- 无 git：有界 sha256 指纹清单，diff 文件级，restore 明确不支持
- 安装修正：直接 `tools.register` 的 `parameters` 与 `output.schema` 必须是**原生 JSON Schema**（`required: []` 数组），不能使用 per-property `required: true`
- 本地测试：临时 git 仓库 + 无 git 目录覆盖创建/列表/展示/diff/基线/restore/safety/commit 失败/工具调用，全部通过
- 实机验证：插件行 active、技能目录出现 `checkpoints`、系统提示段生效、`checkpoint_inspect` 工具可调用

下一阶段：P1.5 Setup Wizard（§13）。

## 15. P1.5 实现记录（2026-11-14）

- **`/setup` 命令**（Host）：`--json` / `set k=v` / `dismiss` / `reset` / `--global`；JSON 返回 `{blank, needsSetup, global, session, effective, dismissed}`，作为向导的数据通道。
- **`sessionSetup` Host 服务**：`ctx.provide` 一个同步 `effectiveFor(sessionId)`，供 `dsh-smart-direction` 按会话门控。
- **偏好存储**：`$DSH_HOME/checkpoint/session-setup.json`（原子写 + 进程内锁），全局默认 + 会话覆盖 + dismissed 列表。
- **向导 UI（dsh-checkpoint/client.js）**：注册 `conversation.composer.dock`（id `checkpoint-setup`，order 5）的 M3 面板；空白新会话且未配置时出现，含三档切换（跟随全局/开/关：smart-direction、自动继续、自动提交）、初始检查点复选框、同时设为全局、保存/跳过；浏览器 localStorage 记完成标记；若会话尚无 live agent，命令失败会重试同步。
- **Host 门控**：
  - `dsh-smart-direction`：提示段文本按会话返回 `''`（关闭时）；`act` 对关闭会话返回 refused；`autoContinue` 按会话覆盖。
  - `dsh-checkpoint`：`/checkpoint` 自动提交按 `checkpointAutoCommit` 生效；新会话初始检查点按 `startupCheckpoint`（默认关，agent/created 钩子）。
- **修复**：会话键必须用 `agent.id`（SessionId），此前误用 `agent.session.id` 导致偏好写到 `undefined` 键。
- **测试**：checkpoint 套件新增 setup JSON/set/global/reset/dismiss、自动提交会话覆盖、服务 `effectiveFor`；smart-direction 套件新增会话门控与 prompt 段函数断言，全部通过。实机：插件重载 applied，`conversation.composer.dock` 出现 `checkpoint-setup` 注册项（当前会话非空白，故为 inactive）。

下一阶段：P2/P3（对话内检查点行、轨迹旁面板）。
