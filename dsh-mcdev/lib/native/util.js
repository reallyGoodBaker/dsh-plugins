/**
 * Shared utilities for the self-implemented (native) provider.
 *
 * The runtime provider owns them: a bounded log ring buffer with cursors,
 * game-version discovery and process helpers.
 */
import fs from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'

/** Game install root (NetEase ModPC builds). */
export function gameBaseDir() {
  return process.env.MCDEV_GAME_DIR || 'C:\\MCStudioDownload\\game\\MinecraftPE_Netease'
}

/** Plain-object test. */
export function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
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
