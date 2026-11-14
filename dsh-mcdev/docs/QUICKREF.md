# 网易 ModSDK 速查（agent 用）

> 离线语料：`docs/corpus/`（669 篇，6.96 MB）。行内 `[来源: X]` 是语料相对路径，可用 `docs_read` 读全文。
> 检索入口：`docs_search("关键词")`；重建索引：`node scripts/build-docs-index.mjs`。
> 本文件只做导航与要点提炼；接口细节以对应语料页为准。

## 1. 工程结构 / modMain.py 入口

行为包脚本目录示意（脚本放在行为包内，`modMain.py` 是 MOD 入口）：

```text
behavior_packs/<bp>/
├── manifest.json
├── netease_blocks/*.json        # 自定义方块
├── netease_items_beh/*.json     # 自定义物品（行为）
├── entities/*.json              # 自定义实体
└── <脚本目录>/
    ├── modMain.py               # @Mod.Binding 入口
    ├── myServerSystem.py
    └── myClientSystem.py
```

`modMain.py` 模板（官方语料未单列 modMain 章节，模板综合 QuMod 示例与 System/Component 文档）：

```python
# -*- coding: utf-8 -*-
from mod.common.mod import Mod
import mod.server.extraServerApi as serverApi
import mod.client.extraClientApi as clientApi

@Mod.Binding(name="MyMod", version="0.0.1")
class MyMod(object):
    @Mod.InitServer()
    def initServer(self):
        serverApi.RegisterSystem("MyMod", "MyServerSystem",
                                 "MyModScripts.myServerSystem.MyServerSystem")

    @Mod.InitClient()
    def initClient(self):
        clientApi.RegisterSystem("MyMod", "MyClientSystem",
                                 "MyModScripts.myClientSystem.MyClientSystem")

    @Mod.DestroyServer()
    def destroyServer(self):
        pass

    @Mod.DestroyClient()
    def destroyClient(self):
        pass
```

- `RegisterSystem(nameSpace, systemName, clsPath)`：`clsPath` 从脚本第一层算起，点号分隔（`包.文件.类`）。
- 服务端/客户端系统分别继承 `GetServerSystemCls()` / `GetClientSystemCls()` 返回的基类。
- 系统实例由引擎创建、退出游戏回收；`GetSystem(ns, name)` 取已有系统实例。
- 自定义组件同理：`RegisterComponent(nameSpace, name, clsPath)`，之后 `CreateComponent` / `GetComponent`。

[来源: ModAPI/接口/通用/System.md] [来源: ModAPI/接口/通用/Component.md] [来源: QuModDocs/QuModLibs/HybridProject/NeteaseLoader.md]

## 2. 事件监听与通信

```python
# 监听引擎事件（服务端；客户端把 serverApi 换成 clientApi）
self.ListenForEvent(serverApi.GetEngineNamespace(), serverApi.GetEngineSystemName(),
                    'ServerChatEvent', self, self.onServerChat)
# 监听自定义/其他系统事件
self.ListenForEvent("MyMod", "MyClientSystem", "MyEvent", self, self.onMyEvent)
# 反注册
self.UnListenForEvent(serverApi.GetEngineNamespace(), serverApi.GetEngineSystemName(),
                      'ServerChatEvent', self, self.onServerChat)
```

- `ListenForEvent(namespace, systemName, eventName, instance, func, priority=0)`；priority 0–10，越大越先执行。
- 引擎事件必须用 `GetEngineNamespace()` / `GetEngineSystemName()` 作为来源；事件 data 结构见「事件」分类页。
- 服务端系统监听客户端系统事件时，回调 `args` 自带 `__id__`（对应客户端玩家 id）。
- `UnListenAllEvents()` 一次反注册全部监听。

自定义事件（Mod 事件）API：

| 方法 | 端 | 用途 |
| --- | --- | --- |
| `DefineEvent(name)` / `UnDefineEvent(name)` | 两端 | 定义/取消自定义事件 |
| `BroadcastEvent(name, data)` | 两端 | 本端广播（客户端事件只能客户端系统监听，服务端同理） |
| `NotifyToClient(playerId, name, data)` | 服务端 | 发给指定客户端 |
| `NotifyToMultiClients(ids, name, data)` | 服务端 | 批量发给客户端（优于 for 循环） |
| `NotifyToServer(name, data)` | 客户端 | 发给服务端 |
| `BroadcastToAllClient(name, data)` | 服务端 | 广播给所有客户端 |
| `CreateEventData()` | 两端 | 创建事件 dict（可嵌套 dict/list，不支持 tuple） |

[来源: ModAPI/接口/通用/事件.md]

事件索引与分类：`ModAPI/事件/事件索引表.md`（全量）＋ `事件/玩家.md`、`实体.md`、`方块.md`、`物品.md`、`UI.md`、`世界.md`、`控制.md`…

## 3. 计时器 / 协程

```python
comp = serverApi.GetEngineCompFactory().CreateGame(serverApi.GetLevelId())
timer = comp.AddTimer(3.0, self.onTimeout, arg1)       # 一次性，返回 CallLater
comp.AddRepeatedTimer(3.0, self.onRepeat)              # 重复执行
comp.CancelTimer(timer)                                # 取消定时器
```

- 客户端把 `serverApi` 换成 `clientApi`（`clientApi.GetLevelId()`）。
- 协程：`StartCoroutine` / `StopCoroutine`；`AddTimer` 也可用来延迟启动/停止协程。
- 帧率：服务端引擎 20 帧/s、服务端脚本 30 帧/s，`GetServerTickTime()` 可能连续返回同一引擎帧时间。

[来源: ModAPI/接口/通用/工具.md]

## 4. UI / JSON UI

### 4.1 JSON UI（资源包，数据驱动）

- UI 文件放资源包 `ui/` 下，必须在 `ui/_ui_defs.json` 的 `ui_defs` 列表中登记，否则不加载。
- `_global_variables.json` 定义全局变量（如 `$info_text_color`），控件用 `"$变量"` 引用；所有资源包的变量自动合并。
- 每个界面文件有 `"namespace"`（全局唯一，建议=文件名），跨文件继承格式：`控件@namespace.控件`，如 `mybutton@common.button`。
- 常用控件 `type`：`screen`、`panel`、`label`、`image`、`stack_panel`、`grid`、`collection_panel`、`scroll_view`、`edit_box`、`input_panel`、`custom`。
- 常用属性：`size`、`offset`、`anchor_from`/`anchor_to`、`controls`（子节点）、`variables`、`bindings`（数据绑定）、`layer`。
- 按钮/界面一般继承原版模板：`common.button`、`common.base_screen`（继承后控件根路径会变化，写 UI API 路径时注意）。
- 修改原生界面：资源包 `ui/` 下放同名同路径文件并加入 `_ui_defs.json`。

[来源: NeteaseGuide/mcguide/18-界面与交互/30-UI说明文档.md（91K 字，JSON UI 必读）]
细分：`18-界面与交互/10-控件和控件属性.md`、`13-继承和自定义控件.md`、`19-控件属性动画.md`、`70-UI数据绑定.md`、`61-原生界面修改文档.md`。

### 4.2 脚本创建 UI

```python
# 必须等 UiInitFinished 之后才能注册/创建 UI
self.ListenForEvent(clientApi.GetEngineNamespace(), clientApi.GetEngineSystemName(),
                    'UiInitFinished', self, self.onUiInit)

def onUiInit(self, args):
    clientApi.RegisterUI("MyMod", "MyHUD", "MyModScripts.myUi.MyHUD", "myui.main")
    clientApi.CreateUI("MyMod", "MyHUD", {"isHud": 1})    # 或 clientApi.PushScreen("MyMod", "MyHUD", {...})
    node = clientApi.GetUI("MyMod", "MyHUD")
```

- `RegisterUI(nameSpace, uiKey, clsPath, uiScreenDef)`，`uiScreenDef = "namespace.screenName"`，同一 UI 只注册一次。
- `CreateUI(nameSpace, uiKey, createParams)`：`isHud=1` 为 HUD（从层级 0 生成）；`isHud=0`/未绑实体时层级比当前 UI 大 1000，可能遮挡（可把 main 的 `type` 从 `screen` 改 `panel`）。
- 绑定实体/世界坐标用 `bindEntityId` / `bindWorldPosition` 等 createParams。
- `PushScreen` / `PopScreen` 走 UI 堆栈（原生界面也走堆栈），多 Mod 共存优先用堆栈；`GetTopUI` / `GetTopUINode` 取栈顶。

[来源: ModAPI/接口/自定义UI/通用.md]

### 4.3 ScreenNode 生命周期与控件

| 生命周期 | 触发时机 |
| --- | --- |
| `Create` | UI 创建成功 |
| `OnActive` | UI 重新回到栈顶 |
| `OnDeactive` | 有新的 UI 入栈 |
| `Update` | 客户端每帧（30 帧/s） |
| `Destroy` | UI 销毁 |

- 销毁：`node.SetRemove()`；用 PushScreen 创建的 UI 用 `PopScreen`。
- 取控件：`GetBaseUIControl(path)`、`GetChildByName`、`GetChildByPath`；控件对象是 `BaseUIControl`。
- 控件操作（`UI控件.md`）：`SetVisible`、`SetText`、`SetTextColor`、`SetAlpha`、`SetSprite`、`SetUiItem`、`SetTouchEnable`、`SetButtonTouchUpCallback` 等。
- 按钮触摸：`AddTouchEventHandler("/panel/btn", self.onTouch, {"isSwallow": True})`，回调里用 `TouchEvent` 枚举区分按下/抬起。
- 大量 `CreateChildControl` 时 `forceUpdate=False`，最后 `UpdateScreen(True|False)` 统一刷新（同帧多次 True 不推荐）。
- 不建议在 `OnDeactive` 里 `SetScreenVisible(False)` 隐藏旧界面（不改栈，多 Mod 易冲突），用 Push/Pop 代替。

[来源: ModAPI/接口/自定义UI/UI界面.md、UI控件.md、事件/控制.md]

## 5. 自定义方块 / 物品 / 实体要点

| 内容 | 行为包 | 资源包 | 语言文件键 |
| --- | --- | --- | --- |
| 方块 | `netease_blocks/<name>.json` | `textures/terrain_texture.json`、`blocks.json`、`textures/blocks/` | `tile.<identifier>.name` |
| 物品 | `netease_items_beh/<name>.json` | `netease_items_res/<name>.json`、`textures/item_texture.json`、`textures/items/` | `item.<identifier>.name` |
| 实体 | `entities/<name>.json` | `entity/<name>.json` + 模型/动画/渲染控制器/材质 | 见 `01-自定义基础生物.md` |

- `identifier` 格式 `命名空间:名称`，全局唯一（推荐命名空间=mod 名）；物品 identifier 只用小写字母+下划线。
- JSON 至少一个 component；物品 `category` 在行为包/资源包要一致（或不填），否则出错。
- 自定义方块注册后即可使用 ModAPI 方块事件/接口：`ServerBlockUseEvent`、`ClientBlockUseEvent`、`BlockRemoveServerEvent` 等（`ModAPI/事件/方块.md`）。
- 自定义物品相关事件：`ServerItemUseOnEvent`、`ItemUseAfterServerEvent`、`ActorUseItemServerEvent`、`ClientItemTryUseEvent` 等（`ModAPI/事件/物品.md`）。
- 自定义组件（挂到实体上跑逻辑）：`RegisterComponent` → `CreateComponent(entityId, ns, name)` / `GetComponent`；引擎组件用 `GetEngineCompFactory().CreateXxx(entityId)`。
- 自定义方块实体：`ModAPI/接口/方块/方块实体.md` + `NeteaseGuide/.../2-自定义方块/4-自定义方块实体.md`。

[来源: NeteaseGuide/.../14-配置与JSON文件关系.md、2-自定义方块/0-自定义方块概述.md、1-自定义物品/1-自定义基础物品.md、3-自定义生物/01-自定义基础生物.md] [来源: ModAPI/接口/通用/Component.md]

## 6. Py2 与热更新常见坑

- 运行时是游戏内置 **Python 2.7**，不是本机解释器；装 Py3 补全库（`mc-netease-sdk-nyrev`）只服务编辑器分析，**不代表能写 Py3 语法**。
- 脚本建议首行 `# -*- coding: utf-8 -*-`；文档示例是 Py2 风格（`print x`，而非 `print(x)`）。
- 改脚本后需要重载游戏/重进存档（MCDK 侧对应 `reload_scripts` / `reload_game`）；编辑器里的「重载材质」「热更新」按钮只针对材质/特效配置，不是脚本热更。
- 卸载或重新加载 mod 的存档影响：
  - 自定义方块变未知方块；subchunk 若做过方块更新，即使重载 mod 也会**永久消失**；
  - 已放置的自定义物品/容器内容、掉落物按「是否登录过/是否探索过」部分丢失。
  做长期存档要留迁移/兜底逻辑。
- 方块/物品 JSON 报错先查逗号、括号、`identifier` 唯一性与资源名对应关系（`2-自定义方块/8-常见报错.md`）。
- `ActorUseItemClientEvent` 与 `ClientItemTryUseEvent` 的先后顺序随物品不同，别写死顺序假设。
- 服务端引擎 20 帧 vs 服务端脚本 30 帧（`GetServerTickTime`）；UI `Update` 是 30 帧/s。
- `CreateUI` 的 `isHud` 与层级、`SetScreenVisible` 的栈副作用（见 4.2/4.3）。

[来源: QuModDocs/QuModLibs/modMain.md] [来源: NeteaseGuide/.../2-自定义方块/0-自定义方块概述.md] [来源: NeteaseGuide/.../1-自定义物品/1-自定义基础物品.md] [来源: NeteaseGuide/.../3-自定义生物/05-使用API自定义坐骑.md]

## 7. 语料导航（按需求找文档）

| 想要 | 读 |
| --- | --- |
| 全部事件（按端/触发时机） | `ModAPI/事件/事件索引表.md` |
| 全部接口 | `ModAPI/接口/Api索引表.md` |
| System / Component / 事件 / 工具 | `ModAPI/接口/通用/{System,Component,事件,工具}.md` |
| 玩家/实体/方块/物品/世界接口 | `ModAPI/接口/{玩家,实体,方块,物品,世界}/` |
| UI 脚本接口 | `ModAPI/接口/自定义UI/{通用,UI界面,UI控件}.md` |
| 枚举值（ActorDamageCause 等） | `ModAPI/枚举值/` |
| JSON UI 完整教程 | `NeteaseGuide/mcguide/18-界面与交互/30-UI说明文档.md` |
| 玩法开发 / 自定义内容 | `NeteaseGuide/mcguide/20-玩法开发/` |
| 组件/属性/事件参考表 | `NeteaseGuide/mcguide/20-玩法开发/100-参考资料/` |
| 国际版附加包 | `BedrockDev/`（全文）、`BedrockWiki/`（仅摘要）、`SAPI/*.d.ts` |
| QuModLibs 框架用法 | `QuModDocs/QuModLibs/`（modMain、Server/Client、UI、EventsPool…） |
| 着色器/材质 | `ShaderSDK/`、`NeteaseGuide/.../16-美术/7-材质与着色器/` |
