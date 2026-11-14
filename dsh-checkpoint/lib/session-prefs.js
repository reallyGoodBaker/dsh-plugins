/**
 * Per-session setup preferences for the checkpoint / smart-direction wizard.
 *
 * Stored as one small JSON document under `$DSH_HOME/checkpoint/session-setup.json`
 * (falling back to `~/.dsh`). Values use `auto` for "inherit the global default":
 *
 *   global:  { smartDirection, autoContinue, checkpointAutoCommit, startupCheckpoint, autoPrompt }
 *   sessions: { [sessionId]: { smartDirection?, autoContinue?, checkpointAutoCommit?, startupCheckpoint? } }
 *   dismissed: string[]     // sessions that chose "do not auto-show again"
 *
 * The document is written atomically and per-file serialized inside the process.
 */
import { randomBytes } from 'node:crypto'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'

const queues = new Map()

/** Serialize one read-modify-write per setup file. */
function withLock(key, operation) {
  const previous = queues.get(key) ?? Promise.resolve()
  const next = previous.then(operation, operation)
  queues.set(
    key,
    next.then(
      () => {
        if (queues.get(key) === next) queues.delete(key)
      },
      () => {
        if (queues.get(key) === next) queues.delete(key)
      },
    ),
  )
  return next
}

/** Absolute path of the setup file. */
export function setupFilePath() {
  const home = typeof process.env.DSH_HOME === 'string' && process.env.DSH_HOME.trim() !== '' ? process.env.DSH_HOME.trim() : join(homedir(), '.dsh')
  return join(home, 'checkpoint', 'session-setup.json')
}

/** Defaults used when no setup document exists. */
export function emptySetup() {
  return {
    version: 1,
    global: {
      smartDirection: 'auto',
      autoContinue: 'auto',
      checkpointAutoCommit: 'auto',
      startupCheckpoint: 'off',
      autoPrompt: true,
    },
    sessions: {},
    dismissed: [],
    forceShow: {},
  }
}

const MODES = new Set(['auto', 'on', 'off'])

/** Normalize one stored document, tolerating missing/older shapes. */
function normalizeSetup(value) {
  const base = emptySetup()
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return base
  const global = value.global !== null && typeof value.global === 'object' && !Array.isArray(value.global) ? value.global : {}
  const pickMode = (candidate, fallback) => (typeof candidate === 'string' && MODES.has(candidate) ? candidate : fallback)
  base.global.smartDirection = pickMode(global.smartDirection, 'auto')
  base.global.autoContinue = pickMode(global.autoContinue, 'auto')
  base.global.checkpointAutoCommit = pickMode(global.checkpointAutoCommit, 'auto')
  base.global.startupCheckpoint = global.startupCheckpoint === 'on' ? 'on' : 'off'
  base.global.autoPrompt = global.autoPrompt !== false
  if (value.sessions !== null && typeof value.sessions === 'object' && !Array.isArray(value.sessions)) {
    for (const [sessionId, raw] of Object.entries(value.sessions)) {
      if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) continue
      const entry = {}
      for (const key of ['smartDirection', 'autoContinue', 'checkpointAutoCommit']) if (MODES.has(raw[key])) entry[key] = raw[key]
      if (raw.startupCheckpoint === 'on' || raw.startupCheckpoint === 'off') entry.startupCheckpoint = raw.startupCheckpoint
      base.sessions[sessionId] = entry
    }
  }
  if (Array.isArray(value.dismissed)) base.dismissed = [...new Set(value.dismissed.filter((item) => typeof item === 'string'))]
  if (value.forceShow !== null && typeof value.forceShow === 'object' && !Array.isArray(value.forceShow)) {
    for (const [sessionId, force] of Object.entries(value.forceShow)) if (force === true) base.forceShow[sessionId] = true
  }
  return base
}

/** Read the setup document (fresh empty document when absent). */
export async function readSetup() {
  try {
    const text = await readFile(setupFilePath(), 'utf8')
    try {
      return normalizeSetup(JSON.parse(text))
    } catch (error) {
      throw new Error(`session setup file is not valid JSON: ${error instanceof Error ? error.message : String(error)}`)
    }
  } catch (error) {
    if (error && error.code === 'ENOENT') return emptySetup()
    throw error
  }
}

/** Atomically replace the setup document. */
export async function writeSetup(document) {
  const file = setupFilePath()
  await mkdir(join(file, '..'), { recursive: true })
  const temporary = `${file}.${process.pid}.${randomBytes(4).toString('hex')}.tmp`
  await writeFile(temporary, JSON.stringify(document, null, 2) + '\n', 'utf8')
  await rename(temporary, file)
}

/**
 * Read-modify-write the setup document under a lock.
 * @param {(draft: object) => unknown} mutator - mutate the draft in place; return value is forwarded.
 * @returns {Promise<{document: object, result: unknown}>} the committed document and the mutator result.
 */
export async function mutateSetup(mutator) {
  return withLock(setupFilePath(), async () => {
    const current = await readSetup()
    const draft = structuredClone(current)
    const result = await mutator(draft)
    await writeSetup(draft)
    return { document: draft, result }
  })
}

/** Merge global defaults with one session's overrides. */
export function effectiveOf(setup, sessionId) {
  const session = setup !== null && setup.sessions !== null ? setup.sessions[sessionId] ?? {} : {}
  const global = setup !== null && setup.global !== null ? setup.global : emptySetup().global
  const mode = (key) => session[key] ?? global[key] ?? 'auto'
  return {
    smartDirection: mode('smartDirection') === 'off' ? 'off' : 'on',
    autoContinue: mode('autoContinue') !== 'off',
    checkpointAutoCommit: mode('checkpointAutoCommit') !== 'off',
    startupCheckpoint: (session.startupCheckpoint ?? global.startupCheckpoint) === 'on',
  }
}

/** Whether the first-turn wizard should be offered for one blank session (or one explicitly asked to show it). */
export function needsSetupOf(setup, sessionId, blank) {
  if (setup.forceShow !== undefined && setup.forceShow[sessionId] === true) return true
  if (blank !== true) return false
  if (setup.global.autoPrompt === false) return false
  if (setup.dismissed.includes(sessionId)) return false
  return setup.sessions[sessionId] === undefined
}
