# 第三方内容与许可说明（NOTICE）

本仓库的**代码**以 MIT 许可发布（见 `LICENSE`）。以下内容来自第三方，版权归各自权利人，
分发时请保留对应署名与许可文本。

## dsh-mcdev / docs/corpus

离线文档语料位于 `dsh-mcdev/docs/corpus/`，来源与许可见
[`dsh-mcdev/docs/CORPUS.md`](./dsh-mcdev/docs/CORPUS.md)，摘要：

| 来源 | 内容 | 许可 / 权利 |
| --- | --- | --- |
| MCDK-ASSISTANT（GitHub-Zero123/mcdk-assistant） | 语料仓库与整理 | BSD-3-Clause，全文见 `dsh-mcdev/docs/corpus/LICENSE-mcdk-assistant.txt` |
| 网易 ModSDK 官方文档（ModAPI / mcguide）镜像 | 接口、事件、教程 | 版权归网易所有，仅作离线开发参考 |
| QuModLibs / QuModDocs | 框架文档 | 保留原作者署名 |
| BedrockWiki | 摘要（json-ui、blocks、entities、commands 等） | 上游为 CC-BY-4.0 / MIT，摘要头保留 `原文：BedrockWiki/<path>` 署名 |
| BedrockDev / SAPI | 附加包文档、Script API `.d.ts` | 版权归各自权利人；SAPI 类型声明源自 Mojang / Microsoft |
| 游戏素材 | 文档中的图片与名称 | 版权归 Mojang / 网易 |

**再分发要求**：保留 `LICENSE-mcdk-assistant.txt`、QuModLibs 作者署名与 BedrockWiki 的 CC-BY-4.0 署名；
BedrockDev / SAPI 等第三方文档请按各自上游许可确认后再对外发布。

## 其他插件

`smart-direction`、`smart-workflow`、`dsh-checkpoint` 依赖 DSH 及其官方插件包，
这些依赖遵循 DeepSeek Harness 自身仓库的许可。
