# dsh-mcdev 离线文档语料（CORPUS）

本目录（`docs/corpus/`）是 dsh-mcdev 内置的网易《我的世界》开发版（ModPC）ModSDK 离线文档语料，
配套索引为 `docs/index.json`，检索模块为 `lib/docs/index.js`，构建脚本为 `scripts/build-docs-index.mjs`。

## 1. 来源与许可证

| 项目 | 内容 |
| --- | --- |
| 上游仓库 | MCDK-ASSISTANT（`GitHub-Zero123/mcdk-assistant`），BSD-3-Clause |
| 上游 LICENSE | 已复制到 [`LICENSE-mcdk-assistant.txt`](./corpus/LICENSE-mcdk-assistant.txt)（BSD 3-Clause, Copyright (c) 2026, Zero123） |
| 本机取用位置 | `<workspace>\.dsh-tmp\mcdk-assistant\mcdk-assistant-main\knowledge\`（该仓库解压副本） |
| NetEase 官方文档 | ModAPI / NeteaseGuide 为网易 ModSDK 官方文档（mcdocs）在其仓库中的镜像，版权归网易所有 |
| QuModLibs 文档 | QuModDocs 为 QuModLibs 框架文档；其仓库要求摘录源码时保留原作者署名（见 `QuModDocs/QuModLibs/modMain.md`） |
| BedrockWiki | 内容来自 BedrockWiki，其原仓库 `licenses/` 声明 CC-BY-4.0 与 MIT；本包**只保存摘要**，上游署名信息保留在摘要头（`原文：BedrockWiki/<path>`） |
| BedrockDev / SAPI | 分别源自基岩版附加包文档与 Mojang/Microsoft 的 Script API 类型声明，版权归各自权利人，遵循其各自许可 |
| Minecraft 素材 | 文档中的图片、名称与游戏内容版权归 Mojang / 网易所有，本包仅作开发参考 |

**分发注意**：`LICENSE-mcdk-assistant.txt` 与本文档的归属说明必须随语料一起分发；如需再分发或修改语料，
请保留上游仓库、QuModLibs 作者署名与 BedrockWiki 的 CC-BY-4.0 署名要求；BedrockDev/SAPI 属于第三方文档，
对外发布前请按各自上游许可确认。

## 2. 目录结构与规模

`docs/corpus/<source>/...`，保留上游原有中文子目录与文件名（便于溯源到原仓库），`source` ∈：

| source | 文件数 | 体积 | 内容 | 是否全文 |
| --- | ---: | ---: | --- | --- |
| `ModAPI` | 194 | 2.12 MB | 网易 ModAPI 事件 / 接口 / 枚举值（`事件/`、`接口/`、`枚举值/`） | 全文 |
| `NeteaseGuide` | 116 | 1.34 MB | 官方教程 mcguide（界面与交互、玩法开发、自定义内容、美术、联机大厅、规范开发） | 全文 |
| `QuModDocs` | 32 | 0.12 MB | QuModLibs 框架文档（modMain、服务端/客户端、UI、事件池、Promise 等） | 全文 |
| `BedrockDev` | 17 | 1.55 MB | 基岩版附加包开发文档（blocks/entities/items/molang/particles…） | 全文 |
| `ShaderSDK` | 9 | 0.03 MB | 网易 ShaderSDK（材质/着色器入口函数与内置属性） | 全文 |
| `SAPI` | 27 | 1.73 MB | 基岩版 Script API `.d.ts` 类型声明 + `vanilla-data` | 全文 |
| `BedrockWiki` | 274 | 0.07 MB | BedrockWiki（json-ui、blocks、entities、commands…） | **仅摘要** |
| **合计** | **669** | **6.96 MB** | （另有 LICENSE 文本 1 个文件） | |

- 语料体积上限约定 `~12 MB`，当前 6.96 MB，**未触发按来源裁剪**。
- 索引 `docs/index.json` 约 **680 KB**。
- 文件格式：`.md` 667 个 + `.ts`（SAPI）27 个 → 索引收录 `.md` 与 `.ts`。

## 3. 裁剪说明

1. **BedrockWiki 只做索引摘要**：上游 297 个文件 / 5.47 MB。本包对其中 274 个 `.md`
   只保留「标题 + 首段（≤420 字符）+ 原文路径与字符数」，写入
   `docs/corpus/BedrockWiki/<原相对路径>`；正文中的图片、表格、代码全部省略。
   - 摘要文件正文不复制原文段落，仅用于检索与导航；精读请回上游仓库。
   - 上游 `BedrockWiki/` 下的非 md 文件（1 个 `.js`、20 个 `.json`、1 个 `.material`、1 个 `.txt`）未收录。
2. **GameAssets 未收录**：上游 `knowledge/GameAssets`（7419 个文件 / 83.67 MB）是资源包内容，
   与 ModSDK 文档无关，体积也远超预算，明确排除。
3. 其余六个来源均为全文复制，未做删减；未复制上游仓库中的 `docs/`、`plans/`、`sites/` 等其他目录。
4. 语料中的相对图片链接（`./picture/...`、`./images/...`）**未复制图片**，图片链接会失效；
   需要看图时请到上游仓库对应路径查看。文本内容不影响检索。

## 4. 索引格式（`docs/index.json`）

```json
{
  "version": 1,
  "builtAt": "2026-11-14T00:24:33.696Z",
  "stats": {
    "files": 669,
    "totalChars": 5998116,
    "totalBytes": 7293408,
    "bySource": {
      "ModAPI": { "files": 194, "chars": 1504226, "bytes": 2220220 },
      "NeteaseGuide": { "files": 116, "chars": 941862, "bytes": 1407789 }
    }
  },
  "docs": [
    {
      "path": "ModAPI/接口/通用/事件.md",
      "source": "ModAPI",
      "title": "事件",
      "headings": ["事件", "BroadcastEvent", "CreateEventData"],
      "chars": 8731,
      "keywords": ["broadcastevent", "createeventdata", "事件", "监听", "..."]
    }
  ]
}
```

- `path`：相对 `docs/corpus` 的 POSIX 路径（`/` 分隔），用于 `docs_read`。
- `title`：首个 H1；无 H1 时取文件名。索引页（如 `ModAPI/接口/通用/索引.md`）的 H1 往往是「索引」，属正常现象。
- `headings`：H1–H6 文本（去重、去 HTML、每篇最多 60 个）。
- `chars`：原文正文字符数。
- `keywords`：标题 / 小标题 / 文件名词优先 + 正文高频英文 token（最多 120）+ 中文 2-gram（最多 80），
  合计最多 200；停用词、2 字母噪声词、中文功能字组合已过滤。

检索权重（`lib/docs/index.js`）：title 8 > headings 4 > keywords 1.5，配合 idf 加权；
候选文档再读正文校验命中次数并截取 snippet（≤200 字符）。

## 5. 构建与自测

```bash
# 在插件目录 dsh-plugins/dsh-mcdev 下执行
node scripts/build-docs-index.mjs          # 重建 docs/index.json（可重复执行，原子写入）
node scripts/build-docs-index.mjs --quiet  # 只打印一行统计
node scripts/test-docs-search.mjs          # 检索/读取/路径安全自测（全绿才退出 0）
```

构建脚本输出示例：

```
文件数    669
语料体积  6.96 MB
索引体积  0.66 MB
耗时      <500 ms
```

索引缺失时 `createDocs()` / `/mcdev docs` 会报错并提示运行构建脚本。

## 6. 已知限制

- BedrockWiki 条目是摘要而非全文，`docs_read` 读到的是摘要（含原文路径，便于回源）。
- SAPI 条目是 TypeScript 类型声明，无 H1，`title` 为文件名（如 `server`），检索以英文 token 为主。
- 中文检索为 2-gram 方案：单字查询、生僻组合可能触发一次全语料兜底扫描（首次约 200–300 ms，之后走缓存）。
- 语料更新（上游变更）需要重新复制语料并重建索引；摘要生成工具为一次性脚本，未随包发布，
  生成规则见第 3 节（标题 + 首段 ≤420 字符 + 原文路径）。
