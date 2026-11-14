# DSH Plugins

[![CI](https://github.com/reallyGoodBaker/dsh-plugins/actions/workflows/ci.yml/badge.svg)](https://github.com/reallyGoodBaker/dsh-plugins/actions/workflows/ci.yml)

DeepSeek Harness（DSH）插件集合：把 Minecraft 网易版开发、智能方向选择、工作区检查点与多智能体工作流做成可直接安装的 DSH bundle。

> 这些插件最初开发于一个游戏项目仓库，现已独立维护。每个子目录都是**独立的 DSH bundle 包**，可以单独安装、单独发布。

## 插件列表

| 插件 | 目录 | 版本 | 说明 |
| --- | --- | --- | --- |
| Minecraft 开发伴侣 | [`dsh-mcdev`](./dsh-mcdev) | 0.6.0 | 在 DSH 内启动网易《我的世界》ModPC 开发客户端；官方日志跟随、游戏内 Python 执行、资源重载、截图、JSON UI、世界/行为包/资源包/皮肤启动配置，以及内置的网易 ModSDK 离线文档检索 |
| 智能方向 | [`smart-direction`](./smart-direction) | 0.1.0 | 非平凡改动前的价值检查，以及带每个选项收益/风险说明的「方向卡片」 |
| 智能方向 + 工作流 | [`smart-workflow`](./smart-workflow) | 0.4.0 | 上面两者合体：方向卡片 + 工作区检查点 + 多智能体工作流 |
| 工作区检查点 | [`dsh-checkpoint`](./dsh-checkpoint) | 0.2.0 | `/checkpoint` 命令、git 提交与基线语义、`#cp-N` 引用、会话压缩锚点 |

每个插件目录里都有自己的 `README.md`（使用说明）、`package.json`（bundle 定义）与测试脚本。

## 安装

在 DSH 里用插件管理器安装（本地链接安装，改代码后重启/重载即可生效）：

```text
plugin_manager install_bundle target="<本仓库路径>/dsh-mcdev"
plugin_manager install_bundle target="<本仓库路径>/smart-direction"
plugin_manager install_bundle target="<本仓库路径>/smart-workflow"
plugin_manager install_bundle target="<本仓库路径>/dsh-checkpoint"
```

安装后在 `插件` 设置页确认对应 bundle 处于启用状态；`dsh-mcdev` 还需要本机装有网易 MC Studio / ModPC 开发包（详见其 README 的前置条件）。

## 开发与测试

```bash
# 各插件的离线测试（无需启动游戏）
cd dsh-mcdev        && node scripts/test-host.mjs && node scripts/test-native-util.mjs \
                    && node scripts/test-native-channel.mjs && node scripts/test-client-shapes.mjs \
                    && node scripts/test-locale-parity.mjs && node scripts/test-docs-search.mjs
cd smart-direction  && node scripts/test-*.mjs
cd smart-workflow   && node scripts/test-*.mjs
cd dsh-checkpoint   && node scripts/test-*.mjs
```

`dsh-mcdev` 的文档语料构建：

```bash
cd dsh-mcdev && node scripts/build-docs-index.mjs
```

## 目录约定

每个插件包遵循 DSH bundle 约定：

```text
<plugin>/
├── package.json        # name/version + dsh.bundle.patch + dsh.client（如有浏览器端）
├── cordis.patch.yml    # bundle 的 Host 行配置
├── index.js            # Host half 入口
├── lib/                # Host / Client 实现
├── locale/             # 浏览器端语言包（如有）
├── docs/               # 插件文档（dsh-mcdev 含离线语料）
└── scripts/            # 测试与构建脚本
```

## 许可证与第三方内容

- 本仓库代码：MIT（见 [`LICENSE`](./LICENSE)）。
- `dsh-mcdev/docs/corpus/` 内含第三方文档语料（网易 ModSDK 官方文档镜像、MCDK-ASSISTANT 整理的资料、BedrockWiki 摘要、SAPI/BedrockDev 文档、QuModLibs 文档等），版权归各自权利人，来源与许可说明见 [`NOTICE.md`](./NOTICE.md) 与 `dsh-mcdev/docs/CORPUS.md`；对外再分发时请保留对应署名与许可文本。

## 相关链接

- DeepSeek Harness: <https://github.com/deepseek-ai/deepseek-harness>
