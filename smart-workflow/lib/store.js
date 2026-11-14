/**
 * Checkpoint metadata store.
 *
 * The index is a small JSON document written atomically. Each store directory has its own
 * in-process promise queue so concurrent command invocations cannot lose updates.
 */
import { mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { randomBytes } from 'node:crypto'

const queues = new Map()

/** Serialize one operation per store directory inside this process. */
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

/** Run one store transaction under the directory queue. */
export function withStore(dir, operation) {
  return withLock(dir, operation)
}

/**
 * Choose the store directory: inside `.git` (never committed) for git repositories,
 * inside the workspace otherwise.
 * @param {string} workspaceDir - session working directory.
 * @param {string | null} repoRoot - git toplevel if any.
 * @returns {Promise<string>} absolute store directory.
 */
export async function resolveStoreDir(workspaceDir, repoRoot) {
  if (repoRoot === null || repoRoot === undefined) return join(workspaceDir, '.dsh-checkpoints')
  const dotGit = join(repoRoot, '.git')
  try {
    const info = await stat(dotGit)
    if (info.isDirectory()) return join(dotGit, 'dsh-checkpoints')
    if (info.isFile()) {
      const text = await readFile(dotGit, 'utf8')
      const match = /^gitdir:\s*(.+)$/m.exec(text)
      if (match !== null) return join(resolve(repoRoot, match[1].trim()), 'dsh-checkpoints')
    }
  } catch (error) {
    // fall through to the workspace-local store
  }
  return join(repoRoot, '.dsh-checkpoints')
}

/** A fresh empty index document. */
export function emptyIndex() {
  return { version: 1, nextId: 1, baseline: null, checkpoints: [] }
}

/** Normalize a read index, tolerating older/partial documents. */
function normalizeIndex(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return emptyIndex()
  const checkpoints = Array.isArray(value.checkpoints)
    ? value.checkpoints.filter((item) => item !== null && typeof item === 'object' && typeof item.id === 'string')
    : []
  let nextId = Number.isInteger(value.nextId) && value.nextId > 0 ? value.nextId : 1
  for (const checkpoint of checkpoints) {
    const match = /^cp-(\d+)$/.exec(checkpoint.id)
    if (match !== null) nextId = Math.max(nextId, Number(match[1]) + 1)
  }
  return {
    version: 1,
    nextId,
    baseline: typeof value.baseline === 'string' ? value.baseline : null,
    checkpoints,
  }
}

/**
 * Read the index of one store directory.
 * @param {string} dir - store directory.
 * @returns {Promise<object>} normalized index (empty when absent).
 * @throws when the file exists but cannot be parsed.
 */
export async function readIndex(dir) {
  try {
    const text = await readFile(join(dir, 'index.json'), 'utf8')
    try {
      return normalizeIndex(JSON.parse(text))
    } catch (error) {
      throw new Error(`checkpoint index is not valid JSON: ${error instanceof Error ? error.message : String(error)}`)
    }
  } catch (error) {
    if (error && error.code === 'ENOENT') return emptyIndex()
    throw error
  }
}

/**
 * Atomically replace the index of one store directory.
 * @param {string} dir - store directory.
 * @param {object} index - complete index document.
 * @returns {Promise<void>} completion after rename.
 */
export async function writeIndex(dir, index) {
  await mkdir(dir, { recursive: true })
  const target = join(dir, 'index.json')
  const temporary = join(dir, `index.json.${process.pid}.${randomBytes(4).toString('hex')}.tmp`)
  await writeFile(temporary, JSON.stringify(index, null, 2) + '\n', 'utf8')
  await rename(temporary, target)
}
