/** Resolved configuration for the dsh-mcdev Host half. */
import path from 'node:path'
import { fileURLToPath } from 'node:url'

/** Package root of this bundle (`dsh-plugins/dsh-mcdev`). */
export function pluginRoot() {
  return path.resolve(fileURLToPath(new URL('../../', import.meta.url)))
}

/** Default documentation corpus directory shipped with the bundle. */
export function defaultDocsDir() {
  return path.join(pluginRoot(), 'docs')
}

export const DEFAULT_CONFIG = {
  /** Explicit project directory; empty means the session working directory. */
  projectDir: '',
  /** Log ring-buffer size kept by the provider. */
  logLimit: 2000,
  /** Documentation corpus directory; empty means the bundled corpus. */
  docsDir: '',
  /** Default wait for `start` (ms) in the agent tool; 0 returns right after spawning. */
  startTimeoutMs: 180000,
}

/**
 * Merge the row config over the defaults, coercing invalid values.
 * @param {object} config - raw row config.
 * @returns {typeof DEFAULT_CONFIG}
 */
export function normalizeConfig(config) {
  const source = config !== null && typeof config === 'object' ? config : {}
  const limit = Number(source.logLimit)
  const startTimeout = Number(source.startTimeoutMs)
  return {
    projectDir: typeof source.projectDir === 'string' ? source.projectDir.trim() : DEFAULT_CONFIG.projectDir,
    logLimit: Number.isInteger(limit) && limit > 0 ? limit : DEFAULT_CONFIG.logLimit,
    docsDir: typeof source.docsDir === 'string' ? source.docsDir.trim() : DEFAULT_CONFIG.docsDir,
    startTimeoutMs:
      Number.isInteger(startTimeout) && startTimeout >= 0 ? startTimeout : DEFAULT_CONFIG.startTimeoutMs,
  }
}
