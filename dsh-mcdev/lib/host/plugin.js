/**
 * Host half of `@local/dsh-mcdev`.
 *
 * One service wraps two collaborators:
 *  - `lib/native` — the self-implemented official chain: writes
 *                  `dev_config.cppconfig`, spawns the NetEase ModPC client,
 *                  follows the official `Debug_Log*.txt`, installs an in-game
 *                  bridge behavior pack and talks to it over loopback TCP;
 *  - `lib/docs`  — searches the bundled NetEase ModSDK documentation corpus.
 *
 * The service is exposed as:
 *  - `ctx.provide('mcdev', service)` for other Host plugins,
 *  - `/mcdev ... --json` slash command (human + browser panel, through the Commands Remote),
 *  - one `mcdev` agent tool (single entry + `action`, to keep the tool list small),
 *  - a short system-prompt section and a model-invocable skill.
 */
import fs from 'node:fs'
import path from 'node:path'
import { createNativeProvider } from '../native/index.js'
import { createDocs } from '../docs/index.js'
import { DEFAULT_CONFIG, defaultDocsDir, normalizeConfig } from './config.js'
import { decodeBase64, flagOf, intOf, parseArgs } from './parse.js'

const COMMAND_NAME = 'mcdev'
const TOOL_NAME = 'mcdev'
const SECTION_NAME = 'dsh-mcdev/minecraft'
const SKILL_NAME = 'minecraft-mod-dev'
const SERVICE_KEY = 'mcdev'
/** Code version surfaced by `action: "help"`; bump with `package.json`. */
const CODE_VERSION = '0.7.0'

/** Actions shared by the command and the agent tool. */
const ACTIONS = [
  'status',
  'discover',
  'start',
  'stop',
  'logs',
  'game_logs',
  'exec',
  'reload',
  'screenshot',
  'jsonui',
  'input',
  'wait',
  'docs_search',
  'docs_read',
  'config',
  'worlds',
  'packs',
  'skins',
  'world-create',
  'presets',
  'preset-save',
  'preset-delete',
  'preset-active',
]

const ACTION_HELP = [
  'status — 当前状态（进程 / 是否进入存档 / MCP 连接 / 工程目录）',
  'start [reset] [join] [waitMs] [world|behaviorPacks|resourcePacks|skin|slim] — 启动开发客户端（native 约 17–20s 进存档）；默认等待最多 180s',
  'stop — 结束本插件启动的游戏（不会结束用户自己启动的进程）',
  'logs [since N] [limit N] [errors] [grep TEXT] — 增量读取日志（官方 Debug_Log + 游戏内 print 回传）',
  'game_logs [errors] [limit N] — 读取游戏内 Python / 引擎日志（官方日志 + print 回传）',
  'exec {code, side} — 在游戏客户端/服务端执行 Python（ModSDK 环境）',
  'reload [scripts|game|addons] — 热重载（addons 可用；scripts/game 需重启游戏）',
  'screenshot — 截取游戏窗口，返回图片文件路径',
  'jsonui {command} — 运行 JSON UI 调试子命令（/help 查看）',
  'input {steps} — 驱动游戏窗口输入（点击/按键/等待；native 暂不支持合成输入）',
  'wait [timeoutMs] — 等待游戏进入存档（start 之后用，不重新启动）',
  'docs_search {query} — 检索内置网易 ModSDK / 官方教程语料',
  'docs_read {path, offset} — 读取一篇文档正文',
  'config [patch] — 读取或合并修改 .mcdev.json（先备份）',
  'worlds — 列出可选世界与当前生效世界',
  'packs — 列出可选行为包 / 资源包与当前选择',
  'skins [skinsDir] — 列出可选皮肤 PNG 与当前皮肤',
  'world-create {worldName, worldFrom?} — 从官方模板或已有世界新建世界（不覆盖已有）',
  'presets — 预设集合（游戏路径 + host 世界/包/皮肤 + guest 皮肤）与可选清单（面板设置页用）',
  'preset-save {preset} — 新增/更新一个启动预设（按 id）',
  'preset-delete {presetId} — 删除一个启动预设（至少保留一个）',
  'preset-active {presetId} — 设置当前激活的启动预设',
].join('\n')

const SYSTEM_PROMPT = [
  'Minecraft (网易我的世界) 开发：任务涉及 Mod/Addon、ModSDK、行为包/资源包、.mcdev.json、JSON UI 或真实游戏验证时，使用 `mcdev` 工具。',
  '写 ModSDK 代码前先用 `docs_search` 查官方资料（离线语料含 ModAPI/网易教程/QuMod/SAPI），不要凭记忆猜接口；改完代码用 `reload` + `logs` 验证，日志和错误优先于截图。',
  '需要换世界/附加包/皮肤或游戏路径时：用 `presets` 读取、`preset-save` 保存启动预设（含 gameExe、host 的世界/包/皮肤、guest 皮肤；文件在 <project>/.mcdev/launch-presets.json，不改 .mcdev.json），`preset-active` 选当前预设；之后 `start` 自动沿用。',
  '`start` 可能要 1–3 分钟，`stop` 会结束游戏进程，执行前确认用户意图。',
].join('\n')

const SKILL_BASE = `# Minecraft 网易版模组开发（dsh-mcdev）

本技能说明如何用 \`mcdev\` 工具在真实开发版客户端里完成「改代码 → 热重载 → 看日志 → 验证」闭环。

## 工具
\`mcdev\` 单入口，\`action\` 见下（也可看 \`action: "help"\`）：

${ACTION_HELP}

## 闭环
1. \`discover\` 确认游戏版本 / 开发世界 / 工程目录；\`config\` 可读改 .mcdev.json（会自动备份）。
2. \`start\`（首次会生成开发测试世界），等 \`status\` 里 ready=true。
3. 改 Mod 代码（Python 2.7 语法；服务端 \`mod.server\`、客户端 \`mod.client\`）。
4. \`reload {"kind":"scripts"}\` 或 \`reload {"kind":"game"}\`；用 \`logs\` 的游标增量看报错。
5. \`exec\` 在客户端/服务端跑一小段 Python 验证运行时行为（输出用 \`logs\` 看）。
6. 需要视觉确认时 \`screenshot\`；JSON UI 用 \`jsonui\`；纯结构/接口问题先用 \`docs_search\`。
7. 全部结束 \`stop\`。

## 启动预设（presets）
- 预设文件 \`<工程>/.mcdev/launch-presets.json\`（插件自有，不改 \`.mcdev.json\`）；每个预设 =
  \`{id, name, gameExe, host:{world,behaviorPacks,resourcePacks,skin,slim,skinsDir}, guests:[{id,name,skin,slim}]}\`。
- \`presets\` 读取全部预设 + 世界/包/皮肤清单；\`preset-save {preset}\` 新增/更新；\`preset-delete {presetId}\`；\`preset-active {presetId}\`。
- 一个预设只有一个 host：host 可选世界/行为包/资源包/皮肤；guest 只能配皮肤（世界与包由 host 决定）。
- \`gameExe\` 是该预设的 Minecraft.Windows.exe 路径（不同机器安装位置可能不同；空 = 自动探测）。
- 启动按钮 = 启动当前激活预设的 host；guest 启动项已保存但暂不自动拉起（等待联机方案）。
- 一次性覆盖仍可用：\`start {presetId, world, behaviorPacks, resourcePacks, skin, slim}\`。
- \`worlds\` / \`packs\` / \`skins\` / \`world-create\` 用于填充预设里的选项。
- 浏览器面板的动作行右侧「设置」按钮会打开预设设置页。

## 重要约束
- ModSDK 运行在 Python 2.7：不要用 f-string、type hints、pathlib、asyncio。
- 服务端/客户端模块不能互相 import；跨端用事件或 RPC（ModSDK 提供），不要把客户端 API 写到服务端。
- 热重载只重载已导入模块；改很多模块/改继承关系时用 \`reload game\`。
- 文档语料是官方与社区资料的离线索引，路径在插件 docs/corpus；引用时给出文档路径。
`

/** Truncate one string to a bounded length, marking the cut. */
function clip(text, max) {
  const value = typeof text === 'string' ? text : String(text)
  if (value.length <= max) return value
  return value.slice(0, max) + `\n…（已截断，共 ${value.length} 字符）`
}

/** Resolve the session working directory (falls back to the given override). */
function resolveProjectDir(ctx, settings, agent) {
  if (settings.projectDir !== '') return settings.projectDir
  try {
    const directory = typeof ctx.get === 'function' ? ctx.get('workingDirectory') : undefined
    if (directory !== undefined && typeof directory.get === 'function' && agent !== undefined && agent !== null) {
      const resolved = directory.get(agent.session)
      if (typeof resolved === 'string' && resolved !== '') return resolved
    }
  } catch (error) {
    // fall through to the session header
  }
  const cwd = agent !== undefined && agent !== null && agent.session !== undefined ? agent.session.header?.cwd : undefined
  if (typeof cwd === 'string' && cwd !== '') return cwd
  return process.cwd()
}

/** Session id of one agent, tolerant of test doubles. */
function sessionIdOf(agent) {
  if (agent !== undefined && agent !== null && typeof agent.id === 'string') return agent.id
  if (agent !== undefined && agent !== null && typeof agent.session?.id === 'string') return agent.session.id
  return undefined
}

/** Human-readable phase label. */
function phaseLabel(phase) {
  switch (phase) {
    case 'launching':
      return '启动中'
    case 'ready':
      return '已进入游戏'
    case 'stopped':
      return '已停止'
    case 'failed':
      return '失败'
    default:
      return '未启动'
  }
}

/** Render a Status object as compact lines. */
function formatStatus(status) {
  if (status === null || status === undefined) return '状态未知'
  const lines = [`状态: ${phaseLabel(status.phase)}${status.ready === true ? '（通信就绪）' : ''}`]
  lines.push('提供方: 自研官方链路')
  if (status.phase === 'launching' || status.phase === 'ready') {
    const pids = []
    if (status.gamePid !== undefined) pids.push(`game=${status.gamePid}`)
    if (pids.length > 0) lines.push(`进程: ${pids.join(' ')}`)
  }
  lines.push(`工程: ${status.projectDir ?? '-'}`)
  lines.push(`配置: ${status.configPath ?? '-'}`)
  if (false && status.mcp !== undefined) {
    lines.push(
      `MCP: 127.0.0.1:${status.mcp.port} ${status.mcp.connected === true ? '已连接' : '未连接'}${
        Array.isArray(status.mcp.tools) && status.mcp.tools.length > 0 ? `（${status.mcp.tools.length} 个工具）` : ''
      }`,
    )
  }
  const channel = status.channel !== null && typeof status.channel === 'object' ? status.channel : null
  if (channel !== null && typeof channel.port === 'number' && channel.port > 0) {
    lines.push(`游戏内通道: 127.0.0.1:${channel.port} ${channel.connected === true ? '已连接' : '未连接'}`)
  }
  if (typeof status.lastError === 'string' && status.lastError !== '') lines.push(`错误: ${status.lastError}`)
  return lines.join('\n')
}

/** Render a Logs object as compact numbered lines (consecutive duplicates collapsed). */
function formatLogs(logs, limit) {
  if (logs === null || logs === undefined) return '无日志'
  const lines = Array.isArray(logs.lines) ? logs.lines : []
  if (lines.length === 0) return `无新日志（next=${logs.next ?? 0}）`
  const shown = lines.slice(-Math.max(1, Math.min(limit ?? lines.length, 200)))
  const body = []
  let previous = null
  let repeats = 0
  const flush = () => {
    if (previous === null) return
    body.push(`${String(previous.seq).padStart(6, '0')} ${clip(previous.text ?? '', 600)}${repeats > 0 ? `  ×${repeats + 1}` : ''}`)
  }
  for (const line of shown) {
    if (previous !== null && line.text === previous.text) {
      repeats += 1
      continue
    }
    flush()
    previous = line
    repeats = 0
  }
  flush()
  const skipped = Number.isInteger(logs.skipped) && logs.skipped > 0 ? `，跳过 ${logs.skipped} 行` : ''
  return `${shown.length} 行（next=${logs.next ?? 0}${skipped}）\n${body.join('\n')}`
}

/** Render documentation hits. */
function formatHits(result) {
  const hits = Array.isArray(result?.hits) ? result.hits : []
  if (hits.length === 0) return '未找到匹配文档'
  return hits
    .map((hit, index) => {
      const score = typeof hit.score === 'number' ? ` (${hit.score.toFixed(1)})` : ''
      const snippet = typeof hit.snippet === 'string' ? hit.snippet.replace(/\s+/g, ' ').slice(0, 200) : ''
      return `${index + 1}. ${hit.title ?? hit.path}${score}\n   ${hit.path}\n   ${snippet}`
    })
    .join('\n')
}

/** Render a generic result object as JSON text. */
function asJsonText(value) {
  try {
    return JSON.stringify(value, null, 2)
  } catch (error) {
    return String(value)
  }
}

/**
 * Shape one action's payload for `--json` consumers.
 *
 * The browser panel (and any external script) reads the documented shapes
 * directly: the Status object for status/start/stop/wait, `{lines,next,skipped}`
 * for the launcher log, and `{lines,...}` for the in-game log. The service keeps
 * its uniform `{ ok, ... }` envelope internally so the agent tool can render any
 * action the same way.
 * @param {string} action - one of ACTIONS.
 * @param {object} payload - service payload.
 * @returns {object} the JSON payload for the command text.
 */
export function jsonPayloadOf(action, payload) {
  if (payload === null || payload === undefined) return { ok: false, error: '无结果' }
  if (payload.ok === false) return { ok: false, error: payload.error ?? '未知错误' }
  switch (action) {
    case 'status':
    case 'start':
    case 'stop':
    case 'wait':
      return { ok: true, ...(payload.status ?? {}) }
    case 'logs':
      return { ok: true, source: 'launcher', ...(payload.logs ?? {}) }
    case 'game_logs':
      return {
        ok: payload.ok !== false,
        source: 'game',
        lines: Array.isArray(payload.lines) ? payload.lines : [],
        tool: payload.tool,
        error: payload.error,
      }
    default:
      return payload
  }
}

/** Collect text out of an MCP `content` array, saving images as files. */
function extractMcpContent(content, screenshotsDir) {
  const texts = []
  const files = []
  if (!Array.isArray(content)) {
    if (typeof content === 'string') texts.push(content)
    return { text: texts.join('\n'), files }
  }
  for (const item of content) {
    if (item === null || typeof item !== 'object') continue
    if (item.type === 'text' && typeof item.text === 'string') {
      texts.push(item.text)
    } else if (item.type === 'image' && typeof item.data === 'string') {
      try {
        const extension = typeof item.mimeType === 'string' && item.mimeType.includes('png') ? 'png' : 'jpg'
        fs.mkdirSync(screenshotsDir, { recursive: true })
        const file = path.join(screenshotsDir, `mcp-image-${Date.now()}.${extension}`)
        fs.writeFileSync(file, Buffer.from(item.data, 'base64'))
        files.push(file)
      } catch (error) {
        texts.push(`[图片写入失败: ${error instanceof Error ? error.message : String(error)}]`)
      }
    }
  }
  return { text: texts.join('\n'), files }
}

/**
 * The composed Host service: bridge + documentation index.
 */
class McDevService {
  /**
   * @param {object} ctx - Cordis plugin context.
   * @param {object} settings - normalized config.
   */
  constructor(ctx, settings) {
    this.ctx = ctx
    this.settings = settings
    this.bridge = null
    this.bridgeProjectDir = ''
    /** Runtime provider name; the plugin only ships the self-implemented chain. */
    this.providerName = ''
    /** Non-fatal provider note (for example a missing dev world), surfaced by `discover`. */
    this.providerWarning = ''
    this.docs = createDocs({ dir: settings.docsDir !== '' ? settings.docsDir : defaultDocsDir() })
  }

  /**
   * Select the runtime provider for one project directory.
   *
   * The plugin ships exactly one runtime: the self-implemented official
   * chain. It needs a ModPC build (Minecraft.Windows.exe); the dev world may
   * still be created from a template by `start()`.
   * @param {string} projectDir - project directory.
   * @returns {Promise<{ name: string, provider: object }>}
   */
  async selectProvider(projectDir) {
    this.providerWarning = ''
    let provider
    try {
      provider = createNativeProvider({ projectDir, logLimit: this.settings.logLimit })
    } catch (error) {
      throw new Error(`native provider 初始化失败: ${error instanceof Error ? error.message : String(error)}`)
    }
    const discovery = await provider.discover(projectDir)
    if (discovery === null || discovery === undefined || typeof discovery.gameExe !== 'string' || discovery.gameExe === '') {
      await provider.dispose?.()
      throw new Error('未找到 Minecraft.Windows.exe：请先安装网易 MC Studio / ModPC 开发包')
    }
    if (discovery.world === null || discovery.world === undefined || discovery.world.exists !== true) {
      this.providerWarning = '开发世界尚不存在：start() 会尝试用模板创建，失败时请先用 MC Studio 创建一次开发世界'
    }
    return { name: 'native', provider }
  }

  /** Lazily create the provider for one project directory. */
  async ensureBridge(projectDir) {
    if (this.bridge !== null && this.bridgeProjectDir === projectDir) return this.bridge
    if (this.bridge !== null) {
      let status
      try {
        status = await this.bridge.status()
      } catch (error) {
        status = undefined
      }
      const phase = status === undefined ? 'failed' : status.phase
      if (phase === 'idle' || phase === 'stopped' || phase === 'failed') {
        await this.disposeBridge()
      } else {
        // Another project is running; keep it rather than killing the user's game.
        return this.bridge
      }
    }
    const { name, provider } = await this.selectProvider(projectDir)
    this.providerName = name
    this.bridge = provider
    this.bridgeProjectDir = projectDir
    return this.bridge
  }

  /**
   * Wait until the running game reaches the in-world state. Prefers the
   * bridge's own `waitReady`; falls back to polling `status` when an older
   * bridge lacks it.
   * @param {object} bridge - native provider.
   * @param {number} timeoutMs - maximum wait.
   * @returns {Promise<object>} last observed Status.
   */
  async waitReady(bridge, timeoutMs) {
    if (typeof bridge.waitReady === 'function') {
      return await bridge.waitReady(timeoutMs)
    }
    const deadline = Date.now() + Math.max(0, timeoutMs)
    let status = await bridge.status()
    while (status?.ready !== true && Date.now() < deadline) {
      if (status?.phase === 'stopped' || status?.phase === 'failed') return status
      await new Promise((resolve) => setTimeout(resolve, 2000))
      status = await bridge.status()
    }
    return status
  }

  /**
   * Read in-game logs.
   *
   * The native provider exposes the official `Debug_Log*.txt` tail plus the
   * in-game bridge print tee, so this is a single incremental read.
   * @param {object} bridge - native provider.
   * @param {{errors?: boolean, limit?: number, timeoutMs?: number, quiet?: boolean}} options
   * @returns {Promise<object>} `{ ok, source, lines, next?, tool?, error? }`.
   */
  async readGameLogs(bridge, options = {}) {
    const limit = Number.isInteger(options.limit) ? Math.max(1, Math.min(options.limit, 500)) : 120
    try {
      const logs = await bridge.logs({ limit, errors: options.errors === true })
      const lines = (Array.isArray(logs?.lines) ? logs.lines : []).slice(-limit)
      return { ok: true, source: 'game', tool: 'official-debug-log', lines, next: logs?.next ?? lines.length }
    } catch (error) {
      return { ok: false, source: 'game', lines: [], error: error instanceof Error ? error.message : String(error) }
    }
  }

  /** Dispose the current provider without throwing. */
  async disposeBridge() {
    const bridge = this.bridge
    this.bridge = null
    this.bridgeProjectDir = ''
    if (bridge === null) return
    try {
      await bridge.dispose()
    } catch (error) {
      // disposal is best-effort
    }
  }

  /** Full teardown used by plugin unload. */
  async dispose() {
    await this.disposeBridge()
  }

  /**
   * Execute one action and return its JSON payload.
   * @param {string} action - one of ACTIONS.
   * @param {object} args - parsed arguments.
   * @param {object} [agent] - initiating agent (for the project directory and session).
   * @returns {Promise<object>} payload; failures carry `{ ok: false, error }`.
   */
  async run(action, args, agent) {
    const settings = this.settings
    const projectDir = resolveProjectDir(this.ctx, settings, agent)
    const timeoutMs = intOf(args.timeoutMs, 60000)
    try {
      if (action === 'discover' || action === 'config') {
        const bridge = await this.ensureBridge(projectDir)
        if (action === 'discover') {
          const discovery = await bridge.discover(projectDir)
          return {
            ok: true,
            provider: this.providerName,
            providerWarning: this.providerWarning !== '' ? this.providerWarning : undefined,
            ...discovery,
          }
        }
        if (args.patch !== undefined && args.patch !== null) {
          const next = await bridge.updateConfig(args.patch, projectDir)
          return { ok: true, configPath: path.join(projectDir, '.mcdev.json'), config: next }
        }
        const config = await bridge.readConfig(projectDir)
        return { ok: true, configPath: path.join(projectDir, '.mcdev.json'), config }
      }

      const bridge = await this.ensureBridge(projectDir)

      if (action === 'worlds') {
        return { ok: true, ...(await bridge.listWorlds(projectDir)) }
      }
      if (action === 'packs') {
        return { ok: true, ...(await bridge.packCatalog(projectDir)) }
      }
      if (action === 'skins') {
        const skinsDir = typeof args.skinsDir === 'string' ? args.skinsDir : ''
        return { ok: true, ...(await bridge.skins(projectDir, skinsDir)) }
      }
      if (action === 'world-create') {
        const worldName = typeof args.worldName === 'string' && args.worldName.trim() !== ''
          ? args.worldName
          : typeof args.world === 'string'
            ? args.world
            : ''
        if (worldName.trim() === '') return { ok: false, error: '缺少 worldName：请输入新世界名' }
        const created = await bridge.createWorld(worldName, typeof args.worldFrom === 'string' ? args.worldFrom : undefined)
        const worlds = await bridge.listWorlds(projectDir)
        return { ok: true, created, ...worlds }
      }
      if (action === 'presets') {
        const skinsDir = typeof args.skinsDir === 'string' ? args.skinsDir : ''
        const data = await bridge.presets(projectDir)
        const worlds = await bridge.listWorlds(projectDir)
        const catalog = await bridge.packCatalog(projectDir)
        const skins = await bridge.skins(projectDir, skinsDir)
        return {
          ok: true,
          path: data.path,
          state: data.state,
          detectedGameExe: data.detectedGameExe,
          versions: data.versions,
          current: worlds.current,
          worlds: worlds.worlds,
          behavior: catalog.behavior,
          resource: catalog.resource,
          warnings: catalog.warnings,
          skinsDirs: skins.dirs,
          skins: skins.files,
        }
      }
      if (action === 'preset-save') {
        const preset = args.preset
        if (preset === null || typeof preset !== 'object' || Array.isArray(preset)) {
          return { ok: false, error: '缺少 preset：请提供一个预设对象' }
        }
        const result = await bridge.savePreset(preset, projectDir)
        return { ok: true, ...result }
      }
      if (action === 'preset-delete') {
        const presetId = typeof args.presetId === 'string' ? args.presetId.trim() : ''
        if (presetId === '') return { ok: false, error: '缺少 presetId：请提供要删除的预设 id' }
        return { ok: true, ...(await bridge.deletePreset(presetId, projectDir)) }
      }
      if (action === 'preset-active') {
        const presetId = typeof args.presetId === 'string' ? args.presetId.trim() : ''
        if (presetId === '') return { ok: false, error: '缺少 presetId：请提供要激活的预设 id' }
        return { ok: true, ...(await bridge.setActivePreset(presetId, projectDir)) }
      }

      if (action === 'status') {
        const status = await bridge.status()
        return { ok: true, status: { ...status, provider: this.providerName } }
      }
      if (action === 'start') {
        const waitMs = intOf(args.waitMs, settings.startTimeoutMs)
        const status = await bridge.start({
          reset: flagOf(args.reset),
          join: args.join === undefined ? true : flagOf(args.join),
          waitMs,
          presetId: typeof args.presetId === 'string' && args.presetId.trim() !== '' ? args.presetId.trim() : undefined,
          world: typeof args.world === 'string' && args.world.trim() !== '' ? args.world.trim() : undefined,
          behaviorPacks: Array.isArray(args.behaviorPacks) ? args.behaviorPacks.map((item) => String(item)) : undefined,
          resourcePacks: Array.isArray(args.resourcePacks) ? args.resourcePacks.map((item) => String(item)) : undefined,
          skin: typeof args.skin === 'string' ? args.skin : undefined,
          slim: args.slim === undefined ? undefined : flagOf(args.slim),
        })
        return { ok: true, status: { ...status, provider: this.providerName } }
      }
      if (action === 'stop') {
        const status = await bridge.stop()
        return { ok: true, status: { ...status, provider: this.providerName } }
      }
      if (action === 'logs') {
        const logs = await bridge.logs({
          since: intOf(args.since, undefined),
          limit: intOf(args.limit, 120),
          errors: flagOf(args.errors),
          grep: typeof args.grep === 'string' ? args.grep : '',
        })
        return { ok: true, source: this.providerName === 'native' ? 'official' : 'launcher', logs }
      }
      if (action === 'game_logs') {
        return await this.readGameLogs(bridge, {
          errors: flagOf(args.errors),
          limit: intOf(args.limit, 120),
          timeoutMs,
        })
      }
      if (action === 'exec') {
        const code = typeof args.code === 'string' ? args.code : ''
        if (code.trim() === '') return { ok: false, error: '缺少 code：请在客户端/服务端执行一段 Python' }
        const side = args.side === 'server' ? 'server' : 'client'
        const before = await bridge.logs({ limit: 1 })
        const result = await bridge.exec(code, side, { timeoutMs })
        const after = await bridge.logs({ since: before.next, limit: 80 })
        const game = await this.readGameLogs(bridge, { limit: 40, timeoutMs, quiet: true })
        return { ...result, side, logs: after, gameLogs: game.ok ? game : undefined }
      }
      if (action === 'reload') {
        const kind = ['scripts', 'game', 'addons'].includes(args.kind) ? args.kind : 'scripts'
        const before = await bridge.logs({ limit: 1 })
        const result = await bridge.reload(kind, { timeoutMs })
        const after = await bridge.logs({ since: before.next, limit: 120 })
        const game = await this.readGameLogs(bridge, { limit: 60, timeoutMs, quiet: true })
        return { ...result, kind, logs: after, gameLogs: game.ok ? game : undefined }
      }
      if (action === 'screenshot') {
        return await bridge.screenshot({ timeoutMs })
      }
      if (action === 'jsonui') {
        const command = typeof args.command === 'string' && args.command.trim() !== '' ? args.command : '/help'
        return await bridge.jsonui(command, { timeoutMs })
      }
      if (action === 'input') {
        const steps = args.steps !== undefined ? args.steps : args.command
        return await bridge.input(steps, { timeoutMs })
      }
      if (action === 'wait') {
        const timeout = intOf(args.timeoutMs, 180000)
        const status = await this.waitReady(bridge, timeout)
        return { ok: status.ready === true, status }
      }
      if (action === 'docs_search') {
        const query = typeof args.query === 'string' ? args.query : ''
        if (query.trim() === '') return { ok: false, error: '缺少 query：请输入要检索的接口、事件或主题' }
        const raw = await this.docs.search(query, intOf(args.limit, 8))
        const hits = Array.isArray(raw) ? raw : Array.isArray(raw?.hits) ? raw.hits : []
        return { ok: true, query, hits }
      }
      if (action === 'docs_read') {
        const documentPath = typeof args.path === 'string' ? args.path : ''
        if (documentPath.trim() === '') return { ok: false, error: '缺少 path：可先用 docs_search 找到文档路径' }
        const document = await this.docs.read(documentPath, intOf(args.offset, 0), intOf(args.maxChars, 6000))
        return { ok: true, ...document }
      }
      if (action === 'help') {
        return { ok: true, version: CODE_VERSION, actions: ACTIONS, help: ACTION_HELP }
      }
      return { ok: false, error: `未知操作 ${action}；可用: ${ACTIONS.join(', ')}` }
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) }
    }
  }
}

/** Append MCP game log lines to a rendered block, if present. */
function appendGameLogs(lines, gameLogs, limit) {
  if (gameLogs === undefined || gameLogs === null) return
  if (Array.isArray(gameLogs.lines) && gameLogs.lines.length > 0) {
    lines.push('--- 之后的游戏日志 ---')
    lines.push(gameLogs.lines.slice(-limit).map((line) => clip(line.text ?? '', 400)).join('\n'))
  } else if (gameLogs.ok === false && typeof gameLogs.error === 'string') {
    lines.push(`游戏日志不可用: ${gameLogs.error}`)
  }
}

/** Render the payload of one action as readable text for the model/console. */
function renderPayload(action, payload) {
  if (payload === null || payload === undefined) return '无结果'
  if (payload.ok === false) return `操作失败: ${payload.error ?? '未知错误'}`
  switch (action) {
    case 'status':
    case 'wait':
      return formatStatus(payload.status)
    case 'start':
    case 'stop': {
      const status = payload.status
      return `${action === 'start' ? '启动' : '停止'}结果:\n${formatStatus(status)}${
        action === 'start' && status !== undefined && status.ready !== true
          ? '\n提示: 尚未进入存档；用 status/logs 继续观察，或稍后重试。'
          : ''
      }`
    }
    case 'logs':
      return formatLogs(payload.logs, 200)
    case 'game_logs': {
      if (payload.ok === false && Array.isArray(payload.lines) && payload.lines.length === 0) {
        return `游戏日志不可用: ${payload.error ?? 'MCP 未连接'}`
      }
      const lines = Array.isArray(payload.lines) ? payload.lines : []
      if (lines.length === 0) return '游戏日志为空（可能尚未进入存档，或 log_protocol 不是 1）'
      return `${lines.length} 行（游戏日志${payload.tool !== undefined ? ' · ' + payload.tool : ''}）\n${lines
        .map((line) => clip(line.text ?? '', 600))
        .join('\n')}`
    }
    case 'exec': {
      const lines = [payload.ok === true ? `执行成功（${payload.side ?? ''}）` : `执行失败${payload.error ? ': ' + payload.error : ''}`]
      if (payload.returnValue !== undefined) lines.push('返回值: ' + clip(asJsonText(payload.returnValue), 2000))
      if (payload.error !== undefined) lines.push('错误: ' + clip(String(payload.error), 2000))
      if (payload.logs !== undefined) lines.push('--- 之后的启动器日志 ---', formatLogs(payload.logs, 120))
      appendGameLogs(lines, payload.gameLogs, 20)
      return lines.join('\n')
    }
    case 'reload': {
      const lines = [`重载(${payload.kind ?? 'scripts'}): ${payload.ok === true ? '成功' : '失败'}`]
      if (payload.detail !== undefined) lines.push(clip(asJsonText(payload.detail), 2000))
      if (payload.error !== undefined) lines.push('错误: ' + clip(String(payload.error), 2000))
      if (payload.logs !== undefined) lines.push('--- 之后的启动器日志 ---', formatLogs(payload.logs, 120))
      appendGameLogs(lines, payload.gameLogs, 40)
      return lines.join('\n')
    }
    case 'screenshot':
      return payload.file !== undefined
        ? `截图已保存: ${payload.file}\n（可用 read_image 查看）`
        : `截图失败: ${payload.error ?? '未知错误'}`
    case 'jsonui':
    case 'input':
      return clip(payload.text ?? payload.error ?? '无输出', 8000)
    case 'docs_search':
      return `检索「${payload.query ?? ''}」:\n${formatHits(payload)}`
    case 'docs_read':
      return [`# ${payload.title ?? payload.path}`, `路径: ${payload.path}`, clip(payload.text ?? '', 8000), payload.more === true ? '…（还有更多，用 docs_read offset 继续）' : '']
        .filter((line) => line !== '')
        .join('\n')
    case 'discover':
      return asJsonText(payload)
    case 'config':
      return asJsonText(payload.config)
    case 'worlds': {
      const worlds = Array.isArray(payload.worlds) ? payload.worlds : []
      if (worlds.length === 0) return '没有找到现有世界；用 world-create 新建，或先用 MC Studio 创建一次。'
      const lines = worlds.map((world) => {
        const current = world.name === payload.current ? '*' : ' '
        const label = world.levelName !== world.name ? ` · ${world.levelName}` : ''
        return `${current} ${world.name}${label}  (行为包 ${world.behaviorPacks} / 资源包 ${world.resourcePacks})`
      })
      return `世界（* = 当前生效）：\n${lines.join('\n')}\n\n切换：start world=<world 名>，或 launch-profile {"world":"<名字>"}`
    }
    case 'packs': {
      const format = (list, selected) => {
        const entries = Array.isArray(list) ? list : []
        if (entries.length === 0) return '（无）'
        const picked = new Set(Array.isArray(selected) ? selected : [])
        return entries
          .map((entry) => `${picked.has(entry.uuid) ? '*' : ' '} ${entry.name || entry.uuid}  [${entry.source}]  ${entry.uuid}`)
          .join('\n')
      }
      const selected = payload.selected || {}
      return `行为包（* = 启动时附加）：\n${format(payload.behavior, selected.behavior)}\n\n资源包：\n${format(payload.resource, selected.resource)}`
    }
    case 'skins': {
      const files = Array.isArray(payload.files) ? payload.files : []
      const dirs = Array.isArray(payload.dirs) ? payload.dirs : []
      const dirLines = dirs.map((item) => `${item.exists ? '' : '(不存在) '}${item.dir}`)
      const fileLines = files.map((file) => `${file.path}`)
      return `皮肤目录：\n${dirLines.join('\n') || '（无）'}\n\n可选皮肤 PNG：\n${fileLines.join('\n') || '（无）'}\n\n当前：${payload.profile && payload.profile.skin ? payload.profile.skin : '默认皮肤'}`
    }
    case 'presets': {
      const state = payload.state || {}
      const presets = Array.isArray(state.presets) ? state.presets : []
      const lines = presets.map((preset) => {
        const host = preset.host || {}
        const guests = Array.isArray(preset.guests) ? preset.guests.length : 0
        const active = preset.id === state.activeId ? '*' : ' '
        return `${active} ${preset.name}  [${preset.id}]  exe=${preset.gameExe || '(自动探测)'}  world=${host.world || '(跟随 .mcdev.json)'}  guests=${guests}`
      })
      return `启动预设（* = 当前激活）：\n${lines.join('\n') || '（无）'}\n\n游戏路径（探测到）：${payload.detectedGameExe || '(未找到)'}`
    }
    case 'preset-save': {
      const preset = payload.preset || {}
      return `${payload.created === true ? '已新增' : '已保存'}预设：${preset.name || ''}  [${preset.id || ''}]`
    }
    case 'preset-delete': {
      const state = payload.state || {}
      return `已删除预设；当前激活：${state.activeId || ''}（共 ${Array.isArray(state.presets) ? state.presets.length : 0} 个）`
    }
    case 'preset-active': {
      const state = payload.state || {}
      const active = Array.isArray(state.presets) ? state.presets.find((preset) => preset.id === state.activeId) : undefined
      return `当前激活预设：${active !== undefined ? active.name : state.activeId || ''}`
    }
    case 'world-create': {
      const created = payload.created || {}
      const from = created.copiedFrom !== undefined ? `（复制自 ${created.copiedFrom}）` : ''
      return `已新建世界：${created.worldName || ''}${from}\n${created.worldDir || ''}`
    }
    case 'help':
      return `${ACTION_HELP}\n\n可用 action: ${ACTIONS.join(', ')}\n版本: ${payload.version ?? '-'}`
    default:
      return clip(asJsonText(payload), 8000)
  }
}

/**
 * Build the model-invocable skill text: the base workflow plus the generated
 * ModSDK quick reference when the documentation half shipped it.
 * @param {object} settings - normalized config.
 */
function skillText(settings) {
  const docsDir = settings.docsDir !== '' ? settings.docsDir : defaultDocsDir()
  try {
    const quickref = fs.readFileSync(path.join(docsDir, 'QUICKREF.md'), 'utf8')
    if (quickref.trim() !== '') return SKILL_BASE + '\n\n---\n\n' + quickref
  } catch (error) {
    // the quick reference is optional
  }
  return SKILL_BASE
}

/**
 * Register the Host half.
 * @param {object} ctx - Cordis plugin context.
 * @param {object} config - raw row config.
 */
export function applyMcdev(ctx, config) {
  const settings = normalizeConfig(config)
  const service = new McDevService(ctx, settings)

  try {
    ctx.provide(SERVICE_KEY, service)
  } catch (error) {
    // older Harness builds may not expose provide(); the tool still works
  }

  ctx.effect(() => () => service.dispose(), 'dsh-mcdev: dispose service')

  ctx.effect(
    () =>
      ctx.commands.register({
        name: COMMAND_NAME,
        description:
          'Drive the NetEase Minecraft (网易我的世界) ModPC dev client: launch/stop it, read logs, execute Python in the game, reload scripts, screenshot, inspect JSON UI, and search the bundled NetEase ModSDK documentation.',
        input: {
          hint: '[--json] <status|discover|start|stop|logs|exec|reload|screenshot|jsonui|input|docs|read|config|worlds|packs|skins|world-create|presets|preset-save|preset-delete|preset-active|help> [options]',
        },
        handler: async (invocation) => {
          const agent = invocation?.agent
          const parsed = parseArgs(typeof invocation?.rawInput === 'string' ? invocation.rawInput : '')
          const args = optionsToArgs(parsed)
          const action = commandVerbToAction(parsed.verb, parsed.positionals, args)
          const payload = await service.run(action, args, agent)
          if (parsed.json) {
            const shaped = jsonPayloadOf(action, payload)
            return { kind: payload.ok === false ? 'error' : 'success', text: JSON.stringify(shaped) }
          }
          const text = renderPayload(action, payload)
          return { kind: payload.ok === false ? 'error' : 'success', text }
        },
      }),
    'dsh-mcdev: command',
  )

  ctx.effect(
    () =>
      ctx.tools.register({
        name: TOOL_NAME,
        description: [
          'Drive the NetEase Minecraft (网易我的世界) ModPC dev client from DSH and search the bundled NetEase ModSDK docs.',
          'The plugin launches the client itself (native provider: writes dev_config.cppconfig, spawns Minecraft.Windows.exe, follows the official Debug_Log, and talks to an in-game bridge behavior pack over TCP), so no third-party launcher is required.',
          'Use `discover` first, `start` to launch (native reaches the world in about 20 seconds), `logs`/`exec`/`reload` for the code-run-read loop, and `docs_search` before writing ModSDK code. Start with `action: "help"` for the action list and constraints.',
        ].join(' '),
        parameters: {
          type: 'object',
          additionalProperties: false,
          properties: {
            action: {
              type: 'string',
              enum: [...ACTIONS, 'help'],
              description: 'Operation to run. `help` prints the action list.',
            },
            waitMs: {
              type: 'number',
              description: 'start: how long to wait for the game to reach the in-world state (ms). Default 180000.',
            },
            reset: { type: 'boolean', description: 'start: regenerate the dev test world before launching.' },
            join: { type: 'boolean', description: 'start: join the world automatically (default true).' },
            side: {
              type: 'string',
              enum: ['client', 'server'],
              description: 'exec: which ModSDK side executes the Python. Default client.',
            },
            kind: {
              type: 'string',
              enum: ['scripts', 'game', 'addons'],
              description: 'reload: scripts (Python modules) or game/addons (resources). Default scripts.',
            },
            code: { type: 'string', description: 'exec: Python source to run in the game.' },
            command: {
              type: 'string',
              description: 'jsonui: JSON UI debug subcommand (e.g. "/tree <screen> <path>"). input: ignored when steps is set.',
            },
        steps: { type: 'array', description: 'input: window input steps (native provider does not synthesize input yet).', items: { type: 'object' } },
            query: { type: 'string', description: 'docs_search: interface/event/topic to search.' },
            path: { type: 'string', description: 'docs_read: document path returned by docs_search.' },
            offset: { type: 'number', description: 'docs_read: character offset to continue from.' },
            since: { type: 'number', description: 'logs: cursor returned as `next` by the previous read.' },
            limit: { type: 'number', description: 'logs/docs_search: maximum entries to return.' },
            errors: { type: 'boolean', description: 'logs: only stderr-style error lines.' },
            grep: { type: 'string', description: 'logs: plain-text filter.' },
            patch: {
              type: 'object',
              description: 'config: partial .mcdev.json merged and written back (a .bak is kept).',
            },
            world: {
              type: 'string',
              description: 'start: world folder name to launch (defaults to the active preset).',
            },
            presetId: {
              type: 'string',
              description: 'start/preset-delete/preset-active: preset id; start falls back to the active preset.',
            },
            preset: {
              type: 'object',
              description: 'preset-save: preset object {id?, name, gameExe, host:{world,behaviorPacks,resourcePacks,skin,slim,skinsDir}, guests:[{id?,name?,skin,slim}]}.',
            },
            worldName: {
              type: 'string',
              description: 'world-create: name of the new world (created from the official template, never overwrites).',
            },
            worldFrom: {
              type: 'string',
              description: 'world-create: copy from this existing world folder instead of the official template.',
            },
            behaviorPacks: {
              type: 'array',
              items: { type: 'string' },
              description: 'start: behavior pack uuids to attach (one-shot override of the preset).',
            },
            resourcePacks: {
              type: 'array',
              items: { type: 'string' },
              description: 'start: resource pack uuids to attach (one-shot override of the preset).',
            },
            skin: { type: 'string', description: 'start: absolute path of a skin PNG (empty = default skin).' },
            slim: { type: 'boolean', description: 'start: use the slim (3-pixel) player model.' },
            skinsDir: { type: 'string', description: 'skins/presets: extra directory to scan for skin PNG files.' },
            timeoutMs: { type: 'number', description: 'exec/reload/screenshot/jsonui/input/mcp: operation timeout.' },
          },
          required: ['action'],
        },
        output: {
          schema: {
            type: 'object',
            additionalProperties: false,
            properties: { text: { type: 'string' } },
            required: ['text'],
          },
          render: (_args, value) => [{ type: 'text', text: String(value?.text ?? '') }],
        },
        async execute(args, exec) {
          const agent = exec?.agent
          const action = typeof args.action === 'string' ? args.action : 'help'
          const payload = await service.run(action, args, agent)
          return { text: clip(renderPayload(action, payload), 20000) }
        },
      }),
    'dsh-mcdev: agent tool',
  )

  ctx.effect(
    () => ctx.systemPrompt.section({ name: SECTION_NAME, order: 780, text: SYSTEM_PROMPT }),
    'dsh-mcdev: system prompt',
  )

  ctx.effect(
    () =>
      ctx.skills.register({
        name: SKILL_NAME,
        description:
          'NetEase Minecraft (网易我的世界) mod development with the dsh-mcdev plugin: launch the ModPC dev client, execute Python in the game, reload scripts, read logs, screenshot, inspect JSON UI, and search the bundled ModSDK docs.',
        whenToUse:
          'Load when the task touches a NetEase Minecraft Mod/Addon, ModSDK Python code, behavior/resource packs, .mcdev.json, JSON UI, or real in-game verification on this machine.',
        content: skillText(settings),
        invocation: { modelInvocable: true, userInvocable: false },
        source: 'runtime',
        provider: 'dsh-mcdev',
      }),
    'dsh-mcdev: skill',
  )
}

/** Split a comma/space separated pack uuid list; empty text means "no packs". */
function splitPackList(value) {
  if (typeof value !== 'string') return undefined
  const items = value
    .split(/[,\s]+/)
    .map((item) => item.trim())
    .filter((item) => item !== '')
  return items
}

/** Translate parsed command options into service arguments. */
function optionsToArgs(parsed) {
  const options = parsed.options
  const args = {}
  const push = (key, value) => {
    if (value !== undefined) args[key] = value
  }
  // The command path must not block the conversation: `/mcdev start` returns
  // right after spawning, and `/mcdev wait` is the explicit blocking step.
  args.waitMs = options.wait !== undefined ? intOf(options.wait, 0) * 1000 : 0
  if (options.reset !== undefined) args.reset = flagOf(options.reset)
  if (options.join !== undefined) args.join = flagOf(options.join)
  push('side', typeof options.side === 'string' ? options.side : undefined)
  push('kind', typeof options.kind === 'string' ? options.kind : undefined)
  push('since', options.since !== undefined ? intOf(options.since, undefined) : undefined)
  push('limit', options.limit !== undefined ? intOf(options.limit, undefined) : undefined)
  push('offset', options.offset !== undefined ? intOf(options.offset, 0) : undefined)
  push('timeoutMs', options.timeout !== undefined ? intOf(options.timeout, 60) * 1000 : undefined)
  if (options.errors !== undefined) args.errors = flagOf(options.errors)
  push('grep', typeof options.grep === 'string' ? options.grep : undefined)
  push('query', typeof options.query === 'string' ? options.query : undefined)
  push('path', typeof options.path === 'string' ? options.path : undefined)
  push('command', typeof options.cmd === 'string' ? options.cmd : undefined)
  push('tool', typeof options.tool === 'string' ? options.tool : undefined)
  if (typeof options['code-b64'] === 'string') args.code = decodeBase64(options['code-b64'])
  else push('code', typeof options.code === 'string' ? options.code : undefined)
  if (typeof options.steps === 'string') {
    try {
      args.steps = JSON.parse(options.steps)
    } catch (error) {
      args.steps = options.steps
    }
  }
  if (typeof options.patch === 'string') {
    try {
      args.patch = JSON.parse(options.patch)
    } catch (error) {
      args.patch = options.patch
    }
  }
  if (typeof options.args === 'string') {
    try {
      args.args = JSON.parse(options.args)
    } catch (error) {
      args.args = options.args
    }
  }
  // Launch selection: world / packs / skin (also available as --<name>-b64).
  push('world', typeof options.world === 'string' ? options.world : undefined)
  if (typeof options['world-name'] === 'string') args.worldName = options['world-name']
  else if (typeof options.worldName === 'string') args.worldName = options.worldName
  if (typeof options['world-from'] === 'string') args.worldFrom = options['world-from']
  else if (typeof options.worldFrom === 'string') args.worldFrom = options.worldFrom
  const behaviorPacks = splitPackList(options['behavior-packs'] !== undefined ? options['behavior-packs'] : options.behaviorPacks)
  if (behaviorPacks !== undefined) args.behaviorPacks = behaviorPacks
  const resourcePacks = splitPackList(options['resource-packs'] !== undefined ? options['resource-packs'] : options.resourcePacks)
  if (resourcePacks !== undefined) args.resourcePacks = resourcePacks
  push('skin', typeof options.skin === 'string' ? options.skin : undefined)
  push('skinsDir', typeof options['skins-dir'] === 'string' ? options['skins-dir'] : undefined)
  if (options.slim !== undefined) args.slim = flagOf(options.slim)
  // Presets: id selection plus an inline preset JSON object.
  if (typeof options['preset-id'] === 'string') args.presetId = options['preset-id']
  else if (typeof options.presetId === 'string') args.presetId = options.presetId
  if (typeof options.preset === 'string') {
    try {
      args.preset = JSON.parse(options.preset)
    } catch (error) {
      args.preset = options.preset
    }
  }
  // Generic base64url variants: `--<name>-b64=<base64url>` decodes to `<name>`.
  // The browser panel uses these for Python code and free text so quotes,
  // newlines and backslashes never pass through command-line tokenization.
  for (const [key, value] of Object.entries(options)) {
    if (!key.endsWith('-b64') || typeof value !== 'string') continue
    const target = key.slice(0, -4)
    if (target === '') continue
    const decoded = decodeBase64(value)
    if (target === 'steps' || target === 'patch' || target === 'args') {
      try {
        args[target] = JSON.parse(decoded)
      } catch (error) {
        args[target] = decoded
      }
    } else {
      args[target] = decoded
    }
  }
  if (args.cmd !== undefined && args.command === undefined) args.command = args.cmd
  // Dashed variants decoded by the generic --<name>-b64 loop.
  if (args['world-name'] !== undefined && args.worldName === undefined) args.worldName = args['world-name']
  if (args['world-from'] !== undefined && args.worldFrom === undefined) args.worldFrom = args['world-from']
  if (args['behavior-packs'] !== undefined && args.behaviorPacks === undefined) args.behaviorPacks = splitPackList(args['behavior-packs'])
  if (args['resource-packs'] !== undefined && args.resourcePacks === undefined) args.resourcePacks = splitPackList(args['resource-packs'])
  if (args['skins-dir'] !== undefined && args.skinsDir === undefined) args.skinsDir = args['skins-dir']
  if (args['preset-id'] !== undefined && args.presetId === undefined) args.presetId = args['preset-id']
  if (typeof args.preset === 'string' && args.preset !== '') {
    try {
      args.preset = JSON.parse(args.preset)
    } catch (error) {
      args.preset = undefined
    }
  }
  delete args['world-name']
  delete args['world-from']
  delete args['behavior-packs']
  delete args['resource-packs']
  delete args['skins-dir']
  delete args['preset-id']
  return args
}

/** Map a command verb plus positional text to a service action. */
function commandVerbToAction(verb, positionals, args) {
  const rest = positionals.join(' ').trim()
  switch (verb) {
    case 'docs':
    case 'search':
      if (rest !== '' && args.query === undefined) args.query = rest
      return 'docs_search'
    case 'read':
      if (rest !== '' && args.path === undefined) args.path = rest
      return 'docs_read'
    case 'exec':
      if (rest !== '' && args.code === undefined) args.code = rest
      return 'exec'
    case 'jsonui':
      if (rest !== '' && args.command === undefined) args.command = rest
      return 'jsonui'
    case 'input':
      if (rest !== '' && args.steps === undefined) args.steps = rest
      return 'input'
    case 'wait':
      return 'wait'
    case 'config':
      return 'config'
    case 'discover':
      return 'discover'
    case 'status':
      return 'status'
    case 'start':
      return 'start'
    case 'stop':
      return 'stop'
    case 'logs':
      return 'logs'
    case 'worlds':
      return 'worlds'
    case 'packs':
      return 'packs'
    case 'skins':
      if (rest !== '' && args.skinsDir === undefined) args.skinsDir = rest
      return 'skins'
    case 'presets':
      return 'presets'
    case 'preset-save':
      return 'preset-save'
    case 'preset-delete':
      if (rest !== '' && args.presetId === undefined) args.presetId = rest
      return 'preset-delete'
    case 'preset-active':
      if (rest !== '' && args.presetId === undefined) args.presetId = rest
      return 'preset-active'
    case 'world-create':
    case 'new-world':
      if (rest !== '' && args.worldName === undefined) args.worldName = rest
      return 'world-create'
    case 'game-logs':
    case 'game_logs':
      return 'game_logs'
    case 'reload':
      return 'reload'
    case 'screenshot':
      return 'screenshot'
    default:
      return 'help'
  }
}
