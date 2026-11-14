# 后续方向 backlog（V1 持续迭代中）

> 更新时间：2026-11-14（Asia/Hong_Kong）
> 最近验收卡片：callId `call_00_ET_mY2pNj9hSgIcOqGdhgRD7937`（单选控件修复：正常）

## 已完成

- **价值复核协议**：改代码前的 keep / refactor / stop / revert 检查（常驻提示 + `smart-directions` 技能）
- **结构化回复协议**：结论先行、小节 + 列表、每项收益/风险单行、机器可读摘要才用 ```yaml
- **方向卡片**：每项自带补充指引输入框；支持多选/单选；提交后记录持久决策并 `autoContinue` 自动继续
- **结构化唤醒记录**：Host 输出 `Direction card recorded` 标记 + `card:` JSON；浏览器注册 userText 规则 + `conversation.user.text.node` 渲染器，在用户气泡内渲染成收据（旧纯文字记录兼容）
- **Material 3 独立样式表**：不继承 DSH 主题 token；明暗色跟随 `data-ds-dark-theme`；严格 M3 类型阶梯、4dp 网格、40dp 全圆角按钮、outlined 文本框（fieldset/legend 浮动标签）、40dp 状态层、1dp 分割线
- **卡片内容结构化**：方向选项 / 自定义方向分区；收益/风险双列对齐标签
- **控件修复**：`:checked~` 通用兄弟选择器 + 控件显式点击（preventDefault + 单次状态切换），修复单选/多选“点不动”

## 已完成（低成本路径）

- **多轮追问（refinement round）**：提示与技能新增规则——收到 `chosen` 记录后按记录继续；仅当指引引出新的实质子选择时，允许在当轮再出一张精简 refinement 卡片，最多一张，从不重复原选项。

## 仍待定（未实现）

1. **当轮阻塞式提问（blocking-question）**：继续暂缓。理由：`autoContinue` 已让提交后几乎即时继续，而抢占内置 `user-questions` 答题器/重写提问 UI 的风险高、公开 API 不稳定。复访条件：实际使用中「换轮」造成明显困扰，或 DSH 开放答题器注册顺序。
2. **卡片内第二阶段「再补充一轮」**：高成本路径（新增 verb + 决策数据 + 客户端状态机 + 回执 UI）。当前先用提示层低成本方案观察效果。
3. **yaml 块 → 可视化列表**：答复中的 ```yaml 机器摘要目前仍渲染为代码块；改成卡片/列表需要拦截助手消息渲染（`conversation.chat.node` / assistant 渲染层），风险中高，此前未选中。
4. **用户气泡内提交记录的进一步 M3 化**：当前记录使用 `currentColor` 的轻量结构样式，未套完整 M3 surface/状态层；此前未选中。

## 复访信号

1. 连续使用 5–10 次真实编码任务后，若「价值复核」仍被忽略 → 考虑 `enforce-gate`（改代码前强制 value_check 门禁）。
2. 多次需要手动补发消息才能继续 → 优先做「卡片内第二阶段再补充一轮」。
3. DSH 升级导致 action-cards / userText 节点 API 变化 → 先修兼容再谈新能力。
