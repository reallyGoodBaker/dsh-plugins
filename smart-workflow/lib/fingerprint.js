/**
 * Bounded workspace fingerprinting for checkpoints outside git.
 *
 * Only sizes and SHA-256 digests are stored (never file contents). The walk is capped by
 * file count, per-file size and total hashed bytes, reporting `partial: true` when a cap
 * was reached.
 */
import { createHash } from 'node:crypto'
import { readFile, readdir, stat } from 'node:fs/promises'
import { join } from 'node:path'

const EXCLUDED_DIRS = new Set(['.git', 'node_modules', '.dsh-checkpoints', '.iwv'])

/**
 * Fingerprint one workspace directory.
 * @param {string} root - workspace root.
 * @param {{maxFiles?: number, maxFileBytes?: number, maxTotalBytes?: number}} [limits] - caps.
 * @returns {Promise<{files: Record<string, {size: number, sha256: string}>, totalBytes: number, scanned: number, partial: boolean}>}
 */
export async function fingerprintWorkspace(root, limits = {}) {
  const maxFiles = Number.isInteger(limits.maxFiles) && limits.maxFiles > 0 ? limits.maxFiles : 2000
  const maxFileBytes = Number.isInteger(limits.maxFileBytes) && limits.maxFileBytes > 0 ? limits.maxFileBytes : 2 * 1024 * 1024
  const maxTotalBytes =
    Number.isInteger(limits.maxTotalBytes) && limits.maxTotalBytes > 0 ? limits.maxTotalBytes : 128 * 1024 * 1024
  const files = {}
  let scanned = 0
  let totalBytes = 0
  let partial = false
  const pending = [root]
  while (pending.length > 0) {
    const dir = pending.pop()
    let entries
    try {
      entries = await readdir(dir, { withFileTypes: true })
    } catch (error) {
      partial = true
      continue
    }
    for (const entry of entries) {
      if (scanned >= maxFiles) {
        partial = true
        break
      }
      const absolute = join(dir, entry.name)
      const relative = absolute.slice(root.length + 1).split('\\').join('/')
      if (entry.isDirectory()) {
        if (EXCLUDED_DIRS.has(entry.name)) continue
        pending.push(absolute)
        continue
      }
      if (!entry.isFile()) continue
      let info
      try {
        info = await stat(absolute)
      } catch (error) {
        partial = true
        continue
      }
      scanned += 1
      if (info.size > maxFileBytes || totalBytes + info.size > maxTotalBytes) {
        partial = true
        continue
      }
      try {
        const bytes = await readFile(absolute)
        totalBytes += bytes.length
        files[relative] = { size: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') }
      } catch (error) {
        partial = true
      }
    }
    if (scanned >= maxFiles) partial = true
  }
  return { files, totalBytes, scanned, partial }
}

/**
 * File-level differences between two fingerprint manifests.
 * @param {{files: Record<string, {size: number, sha256: string}>}} before - older manifest.
 * @param {{files: Record<string, {size: number, sha256: string}>}} after - newer manifest.
 * @returns {{added: string[], removed: string[], modified: string[]}} sorted path lists.
 */
export function diffFingerprints(before, after) {
  const beforeFiles = (before && before.files) || {}
  const afterFiles = (after && after.files) || {}
  const added = []
  const removed = []
  const modified = []
  for (const path of Object.keys(afterFiles)) {
    const previous = beforeFiles[path]
    if (previous === undefined) added.push(path)
    else if (previous.sha256 !== afterFiles[path].sha256 || previous.size !== afterFiles[path].size) modified.push(path)
  }
  for (const path of Object.keys(beforeFiles)) if (afterFiles[path] === undefined) removed.push(path)
  return { added: added.sort(), removed: removed.sort(), modified: modified.sort() }
}
