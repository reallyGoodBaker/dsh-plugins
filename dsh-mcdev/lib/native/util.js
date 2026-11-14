/**
 * Shared utilities for the self-implemented (native) provider.
 *
 * The runtime provider owns them: `.mcdev.json` handling, a bounded log ring
 * buffer with cursors, game-version discovery and process helpers.
 */
import fs from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'

/** Game install root (NetEase ModPC builds). */
export function gameBaseDir() {
  return process.env.MCDEV_GAME_DIR || 'C:\\MCStudioDownload\\game\\MinecraftPE_Netease'
}

/** Default `.mcdev.json` values used when the project file omits a key. */
export const CONFIG_DEFAULTS = {
  game_executable_path: '',
  included_mod_dirs: [{ path: './', hot_reload: false }],
  world_name: 'MC_DEV_WORLD',
  world_folder_name: 'MC_DEV_WORLD',
  world_seed: null,
  reset_world: false,
  auto_join_game: true,
  include_debug_mod: true,
  log_protocol: 0,
  game_mode: 1,
  world_type: 1,
  enable_cheats: true,
  keep_inventory: true,
  do_weather_cycle: true,
  do_daylight_cycle: true,
  experiment_options: {
    data_driven_biomes: false,
    data_driven_items: false,
    experimental_molang_features: false,
  },
  debug_options: {
    reload_addon_key: '',
    reload_key: '',
    reload_key_global: false,
    reload_shaders_key: '46',
    reload_world_key: '45',
  },
  mcp_server_config: { enabled: false, server_ip: 'localhost', server_port: 19133 },
  skin_info: { skin: '', slim: false },
  window_style: {
    always_on_top: false,
    fixed_position: null,
    fixed_size: null,
    hide_title_bar: false,
    hide_taskbar_icon: false,
    lock_corner: null,
    title_bar_color: null,
  },
  mcdev_tools: { game_debugger: { enabled: false } },
}

/** Plain-object test used by config patching. */
export function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

/** Path of the project's `.mcdev.json`. */
export function configPathOf(projectDir) {
  return path.join(path.resolve(projectDir), '.mcdev.json')
}

/** Deep merge two plain objects; arrays and scalars from `over` win. */
function mergeDeep(base, over) {
  if (!isPlainObject(base) || !isPlainObject(over)) return over === undefined ? base : over
  const out = { ...base }
  for (const [key, value] of Object.entries(over)) {
    out[key] = isPlainObject(value) && isPlainObject(base[key]) ? mergeDeep(base[key], value) : value
  }
  return out
}

/** Read and parse one JSON file, tolerating a UTF-8 BOM. */
function readJsonFile(file) {
  const text = fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '')
  return JSON.parse(text)
}

/**
 * Read the project config merged over `CONFIG_DEFAULTS`.
 *
 * A missing file yields the defaults (nothing is created on disk).
 * @param {string} projectDir - project directory.
 * @returns {object} effective config.
 */
export function readConfigWithDefaults(projectDir) {
  const file = configPathOf(projectDir)
  if (!fs.existsSync(file)) return mergeDeep(CONFIG_DEFAULTS, {})
  let parsed
  try {
    parsed = readJsonFile(file)
  } catch (error) {
    throw new Error(`解析 .mcdev.json 失败（${file}）：${error instanceof Error ? error.message : String(error)}`)
  }
  if (!isPlainObject(parsed)) throw new Error(`.mcdev.json 根节点必须是 JSON 对象（${file}）`)
  return mergeDeep(CONFIG_DEFAULTS, parsed)
}

/**
 * Merge `patch` into the project config and write it back, keeping a `.bak`.
 * @param {string} projectDir - project directory.
 * @param {object} patch - partial config.
 * @returns {{ config: object, backupPath: string }}
 */
export function writeMergedConfig(projectDir, patch) {
  if (!isPlainObject(patch)) throw new Error('updateConfig(patch) 需要一个普通对象')
  const file = configPathOf(projectDir)
  const current = readConfigWithDefaults(projectDir)
  const next = mergeDeep(current, patch)
  let backupPath = ''
  if (fs.existsSync(file)) {
    backupPath = `${file}.bak`
    fs.copyFileSync(file, backupPath)
  }
  fs.writeFileSync(file, `${JSON.stringify(next, null, 4)}\n`, 'utf8')
  return { config: next, backupPath }
}

/** Compare two dotted numeric versions (newer first when used with sort). */
function compareVersions(a, b) {
  const left = String(a).split('.').map((part) => Number.parseInt(part, 10) || 0)
  const right = String(b).split('.').map((part) => Number.parseInt(part, 10) || 0)
  const length = Math.max(left.length, right.length)
  for (let index = 0; index < length; index += 1) {
    const diff = (right[index] ?? 0) - (left[index] ?? 0)
    if (diff !== 0) return diff
  }
  return 0
}

/**
 * Discover installed ModPC builds.
 * @returns {{ baseDir: string, versions: Array<{ version: string, exe: string }> }} newest first.
 */
export function findGameVersions() {
  const baseDir = gameBaseDir()
  const versions = []
  try {
    for (const entry of fs.readdirSync(baseDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue
      const exe = path.join(baseDir, entry.name, 'Minecraft.Windows.exe')
      if (fs.existsSync(exe)) versions.push({ version: entry.name, exe })
    }
  } catch {
    // a missing game root simply yields no versions
  }
  versions.sort((a, b) => compareVersions(a.version, b.version))
  return { baseDir, versions }
}

/** Whether a process id is alive (EPERM counts as alive). */
export function isProcessAlive(pid) {
  const value = Number(pid)
  if (!Number.isInteger(value) || value <= 0) return false
  try {
    process.kill(value, 0)
    return true
  } catch (error) {
    return error !== null && typeof error === 'object' && error.code === 'EPERM'
  }
}

/**
 * Kill a process and its children (Windows: taskkill /T /F).
 * @param {number} pid - process id.
 * @returns {Promise<boolean>} whether the process is gone afterwards.
 */
export function killProcessTree(pid) {
  const value = Number(pid)
  if (!Number.isInteger(value) || value <= 0) return Promise.resolve(false)
  return new Promise((resolve) => {
    let child
    try {
      child = spawn('taskkill', ['/PID', String(value), '/T', '/F'], { windowsHide: true, stdio: 'ignore' })
    } catch {
      resolve(false)
      return
    }
    const timer = setTimeout(() => {
      try {
        child.kill()
      } catch {
        // ignore
      }
      resolve(!isProcessAlive(value))
    }, 15000)
    child.once('error', () => {
      clearTimeout(timer)
      try {
        process.kill(value)
      } catch {
        // ignore
      }
      resolve(!isProcessAlive(value))
    })
    child.once('exit', () => {
      clearTimeout(timer)
      resolve(!isProcessAlive(value))
    })
  })
}

/**
 * Poll `predicate` until it returns true or the timeout elapses.
 * @param {() => boolean} predicate - condition.
 * @param {number} timeoutMs - maximum wait.
 * @param {number} intervalMs - poll interval.
 * @returns {Promise<boolean>} whether the predicate became true.
 */
export async function waitFor(predicate, timeoutMs = 10000, intervalMs = 100) {
  const deadline = Date.now() + Math.max(0, timeoutMs)
  for (;;) {
    try {
      if (predicate()) return true
    } catch {
      // keep polling
    }
    if (Date.now() >= deadline) return false
    await new Promise((resolve) => setTimeout(resolve, Math.max(20, intervalMs)))
  }
}

/**
 * List running NetEase client process ids (used by the probe and diagnostics).
 * @returns {Promise<number[]>} process ids.
 */
export function listGamePids() {
  return new Promise((resolve) => {
    let child
    try {
      child = spawn(
        'powershell.exe',
        [
          '-NoProfile',
          '-NonInteractive',
          '-Command',
          "Get-Process -Name 'Minecraft.Windows' -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Id",
        ],
        { windowsHide: true },
      )
    } catch {
      resolve([])
      return
    }
    let out = ''
    child.stdout?.on('data', (chunk) => {
      out += String(chunk)
    })
    child.once('error', () => resolve([]))
    child.once('exit', () => {
      resolve(
        out
          .split(/\s+/)
          .map((part) => Number.parseInt(part, 10))
          .filter((value) => Number.isInteger(value) && value > 0),
      )
    })
  })
}

/**
 * List running NetEase client processes with their command lines.
 * @returns {Promise<Array<{ pid: number, commandLine: string }>>}
 */
export function listGameProcesses() {
  return new Promise((resolve) => {
    let child
    try {
      child = spawn(
        'powershell.exe',
        [
          '-NoProfile',
          '-NonInteractive',
          '-Command',
          "Get-CimInstance Win32_Process -Filter \"Name='Minecraft.Windows.exe'\" | Select-Object ProcessId,CommandLine | ConvertTo-Json -Compress",
        ],
        { windowsHide: true },
      )
    } catch {
      resolve([])
      return
    }
    let out = ''
    child.stdout?.on('data', (chunk) => {
      out += String(chunk)
    })
    child.once('error', () => resolve([]))
    child.once('exit', () => {
      const text = out.trim()
      if (text === '') {
        resolve([])
        return
      }
      try {
        const parsed = JSON.parse(text)
        const list = Array.isArray(parsed) ? parsed : [parsed]
        resolve(
          list
            .map((item) => ({
              pid: Number(item?.ProcessId) || 0,
              commandLine: String(item?.CommandLine || ''),
            }))
            .filter((item) => item.pid > 0),
        )
      } catch {
        resolve([])
      }
    })
  })
}

/**
 * Find a running client process that already has our dev world open.
 *
 * `.cppconfig` files live inside the world directory, so a command line that
 * mentions it (or the world directory) belongs to a client that is using the
 * same save. Two clients writing one world DB corrupts it, so `start()` refuses
 * in that case even when the other instance is not ours.
 * @param {Array<{ pid: number, commandLine: string }>} processes - process list.
 * @param {string} worldDir - dev world directory.
 * @param {number} [ownPid] - pid to ignore (the client we already own).
 * @returns {{ pid: number, commandLine: string }|undefined} the conflicting process.
 */
export function findProcessUsingWorld(processes, worldDir, ownPid) {
  const target = path.resolve(String(worldDir || '')).toLowerCase().replace(/\\/g, '/')
  if (target === '' || target === '/') return undefined
  const own = Number(ownPid) || 0
  for (const item of Array.isArray(processes) ? processes : []) {
    if (!item || typeof item.commandLine !== 'string') continue
    if (own > 0 && item.pid === own) continue
    const line = item.commandLine.toLowerCase().replace(/\\/g, '/')
    if (line.includes(target)) return item
  }
  return undefined
}

/** Strip ANSI colour/control sequences from one log line. */
function stripAnsi(text) {
  // eslint-disable-next-line no-control-regex
  return text.replace(/\u001b\[[0-9;?]*[ -/]*[@-~]/g, '')
}

/**
 * Bounded log ring buffer with incremental cursor semantics.
 *
 * `seq` increases by one per accepted line, `since` is strict (`seq > since`),
 * `next` is the last returned `seq + 1`, and `skipped` counts lines the cursor
 * fell behind because the ring buffer had already dropped them.
 */
export class LogBuffer {
  /** @param {number} [limit] - maximum retained lines. */
  constructor(limit = 2000) {
    const size = Number(limit)
    this.limit = Number.isInteger(size) && size >= 50 ? size : 2000
    this._lines = []
    this._seq = 0
    this._dropped = 0
    this._listeners = new Set()
  }

  /** Number of retained lines. */
  get size() {
    return this._lines.length
  }

  /**
   * Append one line.
   * @param {string} text - line text (ANSI is stripped, trailing CR dropped).
   * @param {'stdout'|'stderr'} [source] - origin tag, used by `errors` filtering.
   * @returns {object|undefined} the stored line, or undefined for blank input.
   */
  pushLine(text, source = 'stdout') {
    const clean = stripAnsi(String(text ?? '')).replace(/\r$/, '')
    if (clean.trim() === '') return undefined
    const line = { seq: ++this._seq, text: clean, source: source === 'stderr' ? 'stderr' : 'stdout' }
    this._lines.push(line)
    const overflow = this._lines.length - this.limit
    if (overflow > 0) {
      this._lines.splice(0, overflow)
      this._dropped += overflow
    }
    for (const listener of this._listeners) {
      try {
        listener(line)
      } catch {
        // a listener must not break log ingestion
      }
    }
    return line
  }

  /**
   * Read a window of lines.
   * @param {{since?: number, limit?: number, errors?: boolean, grep?: string}} [args]
   * @returns {{ lines: object[], next: number, skipped: number }}
   */
  query(args = {}) {
    const since = Number.isInteger(args.since) ? args.since : undefined
    const limit = Number.isInteger(args.limit) && args.limit > 0 ? args.limit : 120
    const errors = args.errors === true
    const grep = typeof args.grep === 'string' && args.grep !== '' ? args.grep.toLowerCase() : ''
    let pool = this._lines
    let skipped = 0
    if (since !== undefined) {
      const oldest = this._lines.length > 0 ? this._lines[0].seq : this._seq + 1
      if (since + 1 < oldest) skipped = Math.max(0, oldest - 1 - since)
      pool = pool.filter((line) => line.seq > since)
    }
    if (errors) {
      pool = pool.filter((line) => line.source === 'stderr' || /\bERROR\b|Traceback \(most recent call last\)/.test(line.text))
    }
    if (grep) pool = pool.filter((line) => line.text.toLowerCase().includes(grep))
    const lines = pool.slice(-limit)
    const next = lines.length > 0 ? lines[lines.length - 1].seq + 1 : this._seq + 1
    return { lines, next, skipped }
  }

  /**
   * Subscribe to every appended line.
   * @param {(line: object) => void} listener - callback.
   * @returns {() => void} unsubscribe.
   */
  onLine(listener) {
    if (typeof listener !== 'function') return () => {}
    this._listeners.add(listener)
    return () => this._listeners.delete(listener)
  }

  /** Snapshot of retained lines. */
  all() {
    return [...this._lines]
  }
}
