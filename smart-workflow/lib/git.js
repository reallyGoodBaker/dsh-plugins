/**
 * Git probing and operations for the checkpoint plugin.
 *
 * Every call uses `execFile` with an argument array (never a shell string) so user
 * content such as a note cannot inject commands. Non-zero git exits are returned as
 * data, not thrown: a failed commit must still produce a checkpoint.
 */
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const runFile = promisify(execFile)
const GIT_ENV = { ...process.env, GIT_TERMINAL_PROMPT: '0', GIT_OPTIONAL_LOCKS: '0' }
const MAX_BUFFER = 8 * 1024 * 1024

/**
 * Run one git command.
 * @param {string} cwd - working directory.
 * @param {string[]} args - git arguments.
 * @param {{timeout?: number}} [options] - timeout override.
 * @returns {Promise<{ok: boolean, stdout: string, stderr: string, code: number}>} result, never throwing for a git failure.
 */
export async function git(cwd, args, options = {}) {
  const timeout = typeof options.timeout === 'number' ? options.timeout : 30_000
  try {
    const { stdout, stderr } = await runFile('git', args, {
      cwd,
      env: GIT_ENV,
      timeout,
      maxBuffer: MAX_BUFFER,
      windowsHide: true,
    })
    return { ok: true, stdout: String(stdout), stderr: String(stderr), code: 0 }
  } catch (error) {
    return {
      ok: false,
      stdout: String(error && error.stdout ? error.stdout : ''),
      stderr: String(error && error.stderr ? error.stderr : (error && error.message) || 'git failed'),
      code: typeof (error && error.code) === 'number' ? error.code : 1,
      timedOut: Boolean(error && error.killed),
    }
  }
}

/** Resolve the repository root of one directory, or null outside git. */
export async function detectRepoIfAny(cwd) {
  const top = await git(cwd, ['rev-parse', '--show-toplevel'])
  if (!top.ok) return null
  const root = top.stdout.trim()
  return root === '' ? null : root
}

/** Read branch, HEAD and porcelain status of one repository root. */
export async function readRepoState(root) {
  const branch = await git(root, ['rev-parse', '--abbrev-ref', 'HEAD'])
  const head = await git(root, ['rev-parse', 'HEAD'])
  const status = await git(root, ['status', '--porcelain'])
  return {
    root,
    branch: branch.ok ? branch.stdout.trim() || null : null,
    head: head.ok ? head.stdout.trim() || null : null,
    dirty: status.ok
      ? status.stdout
          .split('\n')
          .map((line) => line.replace(/\r$/, ''))
          .filter((line) => line.trim() !== '')
      : null,
    statusError: status.ok ? null : status.stderr,
  }
}

/** Whether the worktree currently has any staged, unstaged or untracked change. */
export async function isDirty(root) {
  const status = await git(root, ['status', '--porcelain'])
  return status.ok ? status.stdout.trim() !== '' : false
}

/**
 * Stage every change and commit it.
 * @param {string} root - repository root.
 * @param {string} message - commit message.
 * @returns {Promise<{ok: boolean, commit: string | null, stderr: string}>} commit result.
 */
export async function commitAll(root, message) {
  const add = await git(root, ['add', '-A'])
  if (!add.ok) return { ok: false, commit: null, stderr: add.stderr }
  const commit = await git(root, ['commit', '-m', message])
  if (!commit.ok) return { ok: false, commit: null, stderr: commit.stderr || commit.stdout }
  const head = await git(root, ['rev-parse', 'HEAD'])
  return { ok: true, commit: head.ok ? head.stdout.trim() : null, stderr: '' }
}

/** Short diff stat between two revisions (or the worktree when target is undefined). */
export async function diffStat(root, base, target) {
  const args = ['diff', '--stat', '--no-color', base]
  if (target !== undefined && target !== null) args.push(target)
  const result = await git(root, args)
  return { ok: result.ok, text: result.stdout.trim(), stderr: result.stderr }
}

/** File-level name/status diff between two revisions. */
export async function diffNames(root, base, target) {
  const args = ['diff', '--name-status', '--no-color', base]
  if (target !== undefined && target !== null) args.push(target)
  const result = await git(root, args)
  return { ok: result.ok, lines: result.stdout.split('\n').map((line) => line.trim()).filter(Boolean), stderr: result.stderr }
}

/** Hard reset one repository to a revision. */
export async function resetHard(root, revision) {
  const result = await git(root, ['reset', '--hard', revision])
  return { ok: result.ok, stdout: result.stdout.trim(), stderr: result.stderr }
}

/** Resolve a revision to a full commit hash. */
export async function revParse(root, revision) {
  const result = await git(root, ['rev-parse', revision])
  return result.ok ? result.stdout.trim() : null
}
