/**
 * dsh-checkpoint — Host plugin body.
 *
 * Provides:
 *  - the user command `/checkpoint` (create / list / show / diff / baseline / restore),
 *  - the model tool `checkpoint_inspect` (read-only list / show / diff),
 *  - a `checkpoints` runtime skill and a system-prompt policy section.
 *
 * A checkpoint records the workspace state: in git repositories it stores the branch/HEAD,
 * the dirty list and (by default) commits the pending changes; outside git it stores a
 * bounded size+sha256 fingerprint manifest. The newest checkpoint becomes the comparison
 * baseline unless the user keeps the previous one.
 */
import {
  commitAll,
  detectRepoIfAny,
  diffNames,
  diffStat,
  isDirty,
  readRepoState,
  resetHard,
} from './git.js'
import { existsSync } from 'node:fs'
import { rename } from 'node:fs/promises'
import { join } from 'node:path'
import { readIndex, resolveStoreDir, withStore, writeIndex } from './store.js'
import { diffFingerprints, fingerprintWorkspace } from './fingerprint.js'
import {
  effectiveOf,
  emptySetup,
  mutateSetup,
  needsSetupOf,
  readSetup,
  writeSetup,
} from './session-prefs.js'

export const inject = ['commands', 'tools', 'systemPrompt', 'skills']

const COMMAND_NAME = 'checkpoint'
const SETUP_COMMAND_NAME = 'setup'
const TOOL_NAME = 'checkpoint_inspect'
const SKILL_NAME = 'checkpoints'
const SECTION_NAME = 'checkpoint:policy'

const DEFAULT_CONFIG = {
  autoCommit: true,
  commitMessage: 'checkpoint {id}: {note}',
  keepBaselineByDefault: false,
  maxFingerprintFiles: 2000,
  maxFingerprintBytes: 2 * 1024 * 1024,
}

const USAGE =
  '用法: /checkpoint [--note=备注] [--no-commit] [--keep-baseline] | compress | list | show <cp-N> | diff [<cp-A> [cp-B]] | baseline [<cp-N>] | restore <cp-N> --yes [--force]'

const POLICY_TEXT =
  'Workspace checkpoints. Each conversation keeps its own checkpoint index and baseline (ids such as "#cp-3" are local to the conversation), while the recorded workspace state and any git commit are repository-wide. A checkpoint records the workspace state and, in git repositories, normally commits the pending changes; the newest checkpoint of this conversation becomes its comparison baseline. When the user references a checkpoint (for example "#cp-3" or "检查点 cp-3"), treat that checkpoint as the baseline for this task, echo which checkpoint you use, and inspect it with the `checkpoint_inspect` tool before editing. Never create, commit, roll back or restore automatically: creating is the user command `/checkpoint`, and restoring requires the user to run `/checkpoint restore <cp-N> --yes`. When the user explicitly asks to roll back, tell them to run that command; do not simulate a rollback. After edits, describe changes relative to the stated baseline. Per-session preferences chosen through `/setup` (or its panel) override the plugin defaults; respect a session that turns off automatic commits. Every direction-card form submission records a checkpoint automatically (per-session `/setup` key `checkpointOnCard`, default on); outside that automatic form-checkpoint, creating stays the user command `/checkpoint`, and restoring stays user-only. The user can condense long conversations with `/checkpoint compress`: it records a checkpoint anchor and then compacts older history through the Host compaction service. After any compaction, or when you resume a long session, call `checkpoint_inspect` with action `latest` first and continue from that anchor instead of re-reading the older conversation.'

const SKILL_CONTENT = `# Checkpoints

A checkpoint is a recorded workspace state with an id such as \`cp-3\`.

## What a checkpoint records

- git repository: branch, HEAD before/after, dirty files, and (by default) one automatic commit of all pending changes.
- no git: a bounded fingerprint manifest (relative path, size, sha256), never file contents.

The newest checkpoint becomes the baseline. The user can keep an older baseline with \`--keep-baseline\` or set one with \`/checkpoint baseline cp-N\`.

## User commands

- \`/checkpoint [--note=...] [--no-commit] [--keep-baseline]\` creates a checkpoint.
- \`/checkpoint compress\` creates a checkpoint anchor and condenses older conversation through the Host compaction service.
- \`/checkpoint list\` / \`show <cp-N>\` / \`diff [<cp-A> [cp-B]]\` / \`baseline [<cp-N>]\` inspect state.
- \`/checkpoint restore <cp-N> --yes\` creates a safety checkpoint and resets the worktree; it is destructive and user-only.

## Automatic checkpoints

- Every direction-card form submission records a checkpoint with source \`direction-card\` (note = the card title plus "方向表单"). This is on by default; the user can turn it off per session with \`/setup set checkpointOnCard=off\`.
- Each conversation has its own index and baseline; \`#cp-N\` ids are local to the conversation, so never assume another conversation's checkpoint exists here.
- The checkpoint strip above the composer lists this conversation's newest checkpoint and offers create/compress/list actions.

## Context compression

- Each checkpoint stores a compact anchor: the note, the latest chosen direction cards (selected ids, custom direction, per-option guidance), and the git/fingerprint state. The tool action \`latest\` returns the newest checkpoint with that anchor.
- After a compaction, or when resuming a long session, read the anchor with \`checkpoint_inspect\` action \`latest\` before asking the user to repeat background or re-reading old messages.
- Compression itself is the user's command (\`/checkpoint compress\` or \`/compact\`); never trigger compaction on your own.

## How the agent should behave

- The user may reference a checkpoint as \`#cp-N\`, \`@cp-N\` or \`检查点 cp-N\` in any message. Use the referenced checkpoint as the diff baseline for that task and say so.
- Call \`checkpoint_inspect\` (actions: list / show / diff / latest) when you need metadata; never run \`/checkpoint\` on the user's behalf.
- Never roll back automatically. If the user wants a rollback, tell them to run \`/checkpoint restore <cp-N> --yes\` (a safety checkpoint is created first).
- When comparing an old checkpoint with the current tree, explain file-level changes before editing.`

/** Normalize row config; unknown values fall back to safe defaults. */
function normalizeConfig(config) {
  const source = config !== null && typeof config === 'object' ? config : {}
  return {
    autoCommit: source.autoCommit !== false,
    commitMessage: typeof source.commitMessage === 'string' && source.commitMessage.trim() !== '' ? source.commitMessage : DEFAULT_CONFIG.commitMessage,
    keepBaselineByDefault: source.keepBaselineByDefault === true,
    maxFingerprintFiles:
      Number.isInteger(source.maxFingerprintFiles) && source.maxFingerprintFiles > 0
        ? source.maxFingerprintFiles
        : DEFAULT_CONFIG.maxFingerprintFiles,
    maxFingerprintBytes:
      Number.isInteger(source.maxFingerprintBytes) && source.maxFingerprintBytes > 0
        ? source.maxFingerprintBytes
        : DEFAULT_CONFIG.maxFingerprintBytes,
  }
}

/** Resolve the working directory for one command/tool invocation. */
function workspaceOf(ctx, agent) {
  try {
    const directory = ctx.get ? ctx.get('workingDirectory') : undefined
    if (directory !== undefined && typeof directory.get === 'function') {
      const resolved = directory.get(agent.session)
      if (typeof resolved === 'string' && resolved !== '') return resolved
    }
  } catch (error) {
    // fall through to the session header
  }
  const cwd = agent !== undefined && agent !== null && agent.session !== undefined ? agent.session.header.cwd : undefined
  if (typeof cwd === 'string' && cwd !== '') return cwd
  return process.cwd()
}

/** Session id of one agent (`Agent.id` is the SessionId); tolerate test doubles with session.id. */
function sessionIdOf(agent) {
  if (agent !== undefined && agent !== null && typeof agent.id === 'string') return agent.id
  if (agent !== undefined && agent !== null && agent.session !== undefined && typeof agent.session.id === 'string') return agent.session.id
  return undefined
}

/**
 * Directory holding one conversation's checkpoint index inside the workspace store.
 * @param {string} baseDir - workspace store directory.
 * @param {string | undefined} sessionId - owning conversation.
 * @returns {string} per-conversation store directory.
 */
function sessionStoreDir(baseDir, sessionId) {
  return join(baseDir, 'sessions', typeof sessionId === 'string' && sessionId !== '' ? sessionId : 'unknown')
}

/** Per-base migration guard: the legacy single index is split once per process. */
const legacyMigrations = new Map()

/**
 * Split the legacy workspace-wide index into per-conversation stores.
 *
 * Existing ids and the owning conversation's baseline are preserved so old `#cp-N` references
 * keep resolving. The legacy file is renamed, never deleted.
 * @param {string} baseDir - workspace store directory.
 * @returns {Promise<void>} completion after the split.
 */
async function migrateLegacyStore(baseDir) {
  if (legacyMigrations.has(baseDir)) return legacyMigrations.get(baseDir)
  const task = (async () => {
    const legacyFile = join(baseDir, 'index.json')
    if (!existsSync(legacyFile)) return
    const legacy = await readIndex(baseDir)
    const groups = new Map()
    for (const checkpoint of legacy.checkpoints) {
      const owner = typeof checkpoint.sessionId === 'string' && checkpoint.sessionId !== '' ? checkpoint.sessionId : 'unknown'
      if (!groups.has(owner)) groups.set(owner, [])
      groups.get(owner).push(checkpoint)
    }
    for (const [owner, checkpoints] of groups) {
      const dir = sessionStoreDir(baseDir, owner)
      const existing = await readIndex(dir)
      if (existing.checkpoints.length > 0) continue
      let nextId = 1
      for (const checkpoint of checkpoints) {
        const match = /^cp-(\d+)$/.exec(checkpoint.id)
        if (match !== null) nextId = Math.max(nextId, Number(match[1]) + 1)
      }
      const baseline = legacy.baseline !== null && checkpoints.some((item) => item.id === legacy.baseline) ? legacy.baseline : checkpoints[checkpoints.length - 1].id
      await writeIndex(dir, { version: 1, nextId, baseline, checkpoints })
    }
    await rename(legacyFile, join(baseDir, 'index.legacy.json'))
  })()
  const guarded = task.catch((error) => {
    // Leave the legacy index untouched if the split fails; a later access retries.
    legacyMigrations.delete(baseDir)
    throw error
  })
  legacyMigrations.set(baseDir, guarded)
  return guarded
}

/** Contained plugin warning: logging must never fail the plugin. */
function warn(ctx, message, ...args) {
  try {
    if (ctx !== undefined && ctx.logger !== undefined && typeof ctx.logger.warn === 'function') ctx.logger.warn(message, ...args)
    else console.warn(message, ...args)
  } catch (error) {
    // ignore logging failures
  }
}

/** Short git hash for output. */
function shortHash(hash) {
  return typeof hash === 'string' && hash.length > 0 ? hash.slice(0, 7) : '-'
}

/** Resolve one checkpoint id to its record. */
function findCheckpoint(index, id) {
  return index.checkpoints.find((checkpoint) => checkpoint.id === id) ?? undefined
}

/** Revision of a checkpoint in git (commit or recorded HEAD). */
function revisionOf(checkpoint) {
  if (checkpoint.git === null || checkpoint.git === undefined) return null
  return checkpoint.git.headAfter ?? checkpoint.git.commit ?? checkpoint.git.headBefore ?? null
}

/** Human-readable one-line git description. */
function gitLine(git) {
  if (git === null || git === undefined) return '无 git'
  const branch = typeof git.branch === 'string' && git.branch !== '' ? git.branch : '(detached)'
  return `${branch} @ ${shortHash(revisionOf({ git }))}`
}

/** Cap long output for command feedback. */
function capText(text, limit = 4000) {
  const value = String(text ?? '')
  return value.length > limit ? `${value.slice(0, limit)}\n…（已截断）` : value
}

/** Replace message templates for one checkpoint. */
function commitMessageFor(settings, id, note) {
  const message = settings.commitMessage.replaceAll('{id}', id).replaceAll('{note}', note).trim()
  const cleaned = message.replace(/[\s:：\-–—]+$/u, '').trim()
  return cleaned === '' ? `checkpoint ${id}` : cleaned
}

/**
 * Collect the most recent chosen direction cards so a checkpoint can carry them as its anchor.
 * The action-cards service is optional: this half works without it.
 * @param {object} ctx - plugin context.
 * @param {object} agent - live agent owning the session.
 * @returns {Array<{title: string, selected: string[], custom: string, notes: string[]}>} compact directions.
 */
function collectDirectionAnchors(ctx, agent) {
  try {
    const service = typeof ctx.get === 'function' ? ctx.get('actionCards') : undefined
    const cards = service !== undefined && typeof service.view === 'function' ? service.view(agent.session) : undefined
    const decisions = cards !== undefined && Array.isArray(cards.decisions) ? cards.decisions : []
    const chosen = decisions.filter(
      (decision) => decision !== null && typeof decision === 'object' && decision.action === 'smart_direction' && decision.phase === 'chosen',
    )
    return chosen.slice(-3).map((decision) => {
      const data = decision.data !== null && typeof decision.data === 'object' ? decision.data : {}
      const selected = Array.isArray(data.selected) ? data.selected.filter((id) => typeof id === 'string') : []
      const custom = typeof data.custom === 'string' ? capText(data.custom.trim(), 800) : ''
      const guidance = data.guidance !== null && typeof data.guidance === 'object' && !Array.isArray(data.guidance) ? data.guidance : {}
      const notes = []
      for (const [id, text] of Object.entries(guidance)) {
        if (typeof text === 'string' && text.trim() !== '') notes.push(`${id}: ${capText(text.trim(), 600)}`)
      }
      return { title: typeof decision.title === 'string' ? capText(decision.title, 200) : '', selected, custom, notes }
    })
  } catch (error) {
    return []
  }
}

/** Build the compact anchor stored on every checkpoint (note + direction decisions). */
function buildAnchor(ctx, agent, note) {
  return { note: typeof note === 'string' ? capText(note, 500) : '', directions: collectDirectionAnchors(ctx, agent) }
}

/**
 * Condense older history through the Host compaction service after a checkpoint was recorded.
 * @param {object} ctx - plugin context with the optional `compaction` service.
 * @param {object} agent - live agent owning the session.
 * @param {object} invocation - command invocation carrying the cancellation signal.
 * @returns {Promise<string[]>} compaction report lines.
 */
async function compactAfterCheckpoint(ctx, agent, invocation) {
  const compaction = typeof ctx.get === 'function' ? ctx.get('compaction') : undefined
  if (compaction === undefined || typeof compaction.compactNow !== 'function') {
    return [
      '上下文压缩不可用：本 profile 未启用 compaction 后端（dsh-compaction-basic）与 /compact 命令。',
      '提示: 检查点锚点已保存，可用 checkpoint_inspect（action=latest）读取。',
    ]
  }
  try {
    const signal = invocation !== undefined && invocation.signal !== undefined ? invocation.signal : new AbortController().signal
    const result = await compaction.compactNow(agent, signal)
    if (result === null || result === undefined) return ['上下文压缩: 没有可压缩的旧历史（跳过）']
    return [
      `上下文压缩: 已替换 ${result.shadowedSeqs.length} 条历史节点，释放约 ${result.shadowedTokenCount} tokens；摘要节点 seq ${result.summarySeq}`,
      '提示: 压缩后请用 checkpoint_inspect（action=latest）读取锚点再继续。',
    ]
  } catch (error) {
    return [`上下文压缩失败: ${capText(error instanceof Error ? error.message : String(error), 500)}（检查点已保存）`]
  }
}

/**
 * Create one checkpoint and persist it.
 * @param {object} ctx - plugin context.
 * @param {object} settings - normalized config.
 * @param {object} agent - live agent owning the session.
 * @param {{note?: string, commit?: boolean, keepBaseline?: boolean, source?: string}} options - creation options.
 * @returns {Promise<{checkpoint: object, index: object, storeDir: string, git: object | null}>} created data.
 */
async function createCheckpoint(ctx, settings, agent, options = {}) {
  const workspace = workspaceOf(ctx, agent)
  const repoRoot = await detectRepoIfAny(workspace)
  const baseDir = await resolveStoreDir(workspace, repoRoot)
  await migrateLegacyStore(baseDir)
  const storeDir = sessionStoreDir(baseDir, sessionIdOf(agent))
  return withStore(storeDir, async () => {
    const index = await readIndex(storeDir)
    const id = `cp-${index.nextId}`
    const note = typeof options.note === 'string' ? options.note.trim().slice(0, 500) : ''
    let git = null
    let fingerprints = null
    if (repoRoot !== null) {
      const state = await readRepoState(repoRoot)
      const headBefore = state.head
      let committed = false
      let commitHash = null
      let commitError = null
      let message = null
      if (options.commit !== false) {
        if (state.dirty !== null && state.dirty.length > 0) {
          message = commitMessageFor(settings, id, note)
          const result = await commitAll(repoRoot, message)
          if (result.ok) {
            committed = true
            commitHash = result.commit
          } else {
            commitError = result.stderr.trim()
          }
        }
      }
      git = {
        repoRoot,
        branch: state.branch,
        headBefore,
        headAfter: committed ? commitHash : headBefore,
        commit: commitHash,
        commitMessage: committed ? message : null,
        committed,
        dirtyFiles: state.dirty ?? [],
        untrackedCount: (state.dirty ?? []).filter((line) => line.startsWith('??')).length,
      }
      if (commitError !== null) git.commitError = capText(commitError, 2000)
    } else {
      fingerprints = await fingerprintWorkspace(workspace, {
        maxFiles: settings.maxFingerprintFiles,
        maxFileBytes: settings.maxFingerprintBytes,
      })
    }
    const previous = index.checkpoints.length > 0 ? index.checkpoints[index.checkpoints.length - 1] : null
    const checkpoint = {
      id,
      createdAt: new Date().toISOString(),
      note,
      sessionId: sessionIdOf(agent),
      sessionSeq: agent.session.seq,
      source: typeof options.source === 'string' ? options.source : 'command',
      anchor: buildAnchor(ctx, agent, note),
      git,
      fingerprints,
      parentId: previous === null ? null : previous.id,
    }
    index.checkpoints.push(checkpoint)
    index.nextId += 1
    if (options.keepBaseline === true || settings.keepBaselineByDefault) {
      if (index.baseline === null) index.baseline = id
    } else {
      index.baseline = id
    }
    await writeIndex(storeDir, index)
    return { checkpoint, index, storeDir, git }
  })
}

/** Load workspace + repo + store + index without writing. */
async function loadState(ctx, agent) {
  const workspace = workspaceOf(ctx, agent)
  const repoRoot = await detectRepoIfAny(workspace)
  const baseDir = await resolveStoreDir(workspace, repoRoot)
  await migrateLegacyStore(baseDir)
  const storeDir = sessionStoreDir(baseDir, sessionIdOf(agent))
  const index = await readIndex(storeDir)
  return { workspace, repoRoot, baseDir, storeDir, index }
}

/** Format one created checkpoint for command feedback. */
function formatCreated(settings, result) {
  const { checkpoint, index, storeDir } = result
  const lines = [`检查点 ${checkpoint.id} 已创建（${checkpoint.git === null ? '无 git' : 'git'}）`]
  if (checkpoint.note !== '') lines.push(`- 备注: ${checkpoint.note}`)
  if (checkpoint.git !== null && checkpoint.git !== undefined) {
    const git = checkpoint.git
    lines.push(`- 仓库: ${gitLine(git)}`)
    if (git.committed) lines.push(`- 提交: ${shortHash(git.commit)}（已自动提交）`)
    else if (git.commitError !== undefined) lines.push(`- 提交失败: ${capText(git.commitError, 400)}（检查点已记录）`)
    else if (git.dirtyFiles !== undefined && git.dirtyFiles.length > 0) lines.push('- 提交: 已跳过（--no-commit）')
    else lines.push('- 提交: 工作区干净，无空提交')
    lines.push(`- 变更文件: ${git.dirtyFiles === undefined ? 0 : git.dirtyFiles.length}（未跟踪 ${git.untrackedCount ?? 0}）`)
  } else if (checkpoint.fingerprints !== null && checkpoint.fingerprints !== undefined) {
    const manifest = checkpoint.fingerprints
    lines.push(`- 文件指纹: ${Object.keys(manifest.files).length} 个文件，${Math.round(manifest.totalBytes / 1024)} KB${manifest.partial ? '（达到扫描上限，partial）' : ''}`)
    lines.push('- 提示: 无 git 时不支持 restore；diff 仅输出文件级差异')
  }
  lines.push(`- 基线: ${index.baseline === checkpoint.id ? `${checkpoint.id}（已推进）` : index.baseline ?? '(无)'}`)
  lines.push(`- 存储: ${storeDir}（本对话独立索引与基线）`)
  lines.push(`- 会话: ${checkpoint.sessionId} seq ${checkpoint.sessionSeq}`)
  return lines.join('\n')
}

/** Format the checkpoint list. */
function formatList(index) {
  if (index.checkpoints.length === 0) return '还没有检查点。使用 /checkpoint 创建第一个检查点。'
  const lines = [`检查点（本对话，共 ${index.checkpoints.length} 个，当前基线 ${index.baseline ?? '(无)'}）`]
  for (const checkpoint of index.checkpoints.slice().reverse()) {
    const parts = [checkpoint.id, checkpoint.createdAt, checkpoint.note === '' ? '(无备注)' : checkpoint.note]
    if (checkpoint.git !== null && checkpoint.git !== undefined) parts.push(gitLine(checkpoint.git))
    else if (checkpoint.fingerprints !== null && checkpoint.fingerprints !== undefined) parts.push(`${Object.keys(checkpoint.fingerprints.files).length} files`)
    if (index.baseline === checkpoint.id) parts.push('基线')
    lines.push(`- ${parts.join('  |  ')}`)
  }
  return lines.join('\n')
}

/** Format one checkpoint's details. */
function formatShow(index, checkpoint) {
  const lines = [`检查点 ${checkpoint.id}`]
  if (checkpoint.note !== '') lines.push(`- 备注: ${checkpoint.note}`)
  lines.push(`- 创建时间: ${checkpoint.createdAt}`)
  lines.push(`- 来源: ${checkpoint.source}`)
  lines.push(`- 会话: ${checkpoint.sessionId} seq ${checkpoint.sessionSeq}`)
  if (checkpoint.git !== null && checkpoint.git !== undefined) {
    const git = checkpoint.git
    lines.push(`- 仓库: ${git.repoRoot}`)
    lines.push(`- 分支: ${git.branch ?? '(detached)'}`)
    lines.push(`- HEAD 前: ${shortHash(git.headBefore)}`)
    lines.push(`- HEAD 后: ${shortHash(git.headAfter)}`)
    lines.push(`- 提交: ${git.commit === null ? '无' : `${git.commit}${git.committed ? '' : '（未提交）'}`}${git.commitMessage === null ? '' : ` — ${git.commitMessage}`}`)
    if (git.commitError !== undefined) lines.push(`- 提交错误: ${capText(git.commitError, 600)}`)
    lines.push(`- 变更文件: ${git.dirtyFiles.length}（未跟踪 ${git.untrackedCount ?? 0}）`)
    if (git.dirtyFiles.length > 0) {
      for (const line of git.dirtyFiles.slice(0, 20)) lines.push(`  - ${line}`)
      if (git.dirtyFiles.length > 20) lines.push(`  - …还有 ${git.dirtyFiles.length - 20} 个`)
    }
  } else if (checkpoint.fingerprints !== null && checkpoint.fingerprints !== undefined) {
    const manifest = checkpoint.fingerprints
    lines.push(`- 文件指纹: ${Object.keys(manifest.files).length} 个文件，${Math.round(manifest.totalBytes / 1024)} KB${manifest.partial ? '（partial）' : ''}`)
    lines.push('- 提示: 无 git，restore 不可用')
  }
  lines.push(`- 基线: ${index.baseline === checkpoint.id ? '是' : '否（当前基线 ' + (index.baseline ?? '无') + '）'}`)
  if (checkpoint.parentId !== null && checkpoint.parentId !== undefined) lines.push(`- 上一个检查点: ${checkpoint.parentId}`)
  const anchor = checkpoint.anchor
  if (anchor !== null && anchor !== undefined) {
    lines.push('- 锚点:')
    if (anchor.note !== undefined && anchor.note !== '') lines.push(`  - 备注: ${anchor.note}`)
    const directions = Array.isArray(anchor.directions) ? anchor.directions : []
    if (directions.length === 0) lines.push('  - 方向决策: 无')
    else {
      for (const direction of directions) {
        const parts = []
        if (direction.title !== '') parts.push(direction.title)
        if (Array.isArray(direction.selected) && direction.selected.length > 0) parts.push(`选择 ${direction.selected.join(', ')}`)
        if (typeof direction.custom === 'string' && direction.custom !== '') parts.push(`自定义 ${direction.custom}`)
        lines.push(`  - 方向决策: ${parts.join(' | ') || '(空)'}`)
        for (const note of Array.isArray(direction.notes) ? direction.notes : []) lines.push(`    - 指引 ${note}`)
      }
    }
  }
  return lines.join('\n')
}

/** Format git diff output for a checkpoint pair (or baseline → worktree). */
async function formatGitDiff(repoRoot, fromCheckpoint, toCheckpoint) {
  const base = revisionOf(fromCheckpoint)
  if (base === null) return `检查点 ${fromCheckpoint.id} 没有可用的 git 版本。`
  const target = toCheckpoint === null || toCheckpoint === undefined ? undefined : revisionOf(toCheckpoint)
  const stat = await diffStat(repoRoot, base, target ?? undefined)
  const names = await diffNames(repoRoot, base, target ?? undefined)
  const header = `检查点差异 ${fromCheckpoint.id} → ${toCheckpoint === null || toCheckpoint === undefined ? '工作区' : toCheckpoint.id}`
  const lines = [header, `- 基线版本: ${shortHash(base)}`]
  if (!stat.ok) lines.push(`- git diff 失败: ${capText(stat.stderr, 600)}`)
  if (names.lines.length === 0) lines.push('- 无文件级差异')
  else {
    lines.push(`- 变更文件: ${names.lines.length}`)
    for (const line of names.lines.slice(0, 30)) lines.push(`  - ${line}`)
    if (names.lines.length > 30) lines.push(`  - …还有 ${names.lines.length - 30} 个`)
  }
  if (stat.text !== '') lines.push('', capText(stat.text, 2500))
  return lines.join('\n')
}

/** Format the fingerprint diff for stores without git. */
async function formatFingerprintDiff(settings, workspace, fromCheckpoint) {
  const before = fromCheckpoint.fingerprints
  if (before === null || before === undefined) return `检查点 ${fromCheckpoint.id} 没有文件指纹。`
  const after = await fingerprintWorkspace(workspace, {
    maxFiles: settings.maxFingerprintFiles,
    maxFileBytes: settings.maxFingerprintBytes,
  })
  const diff = diffFingerprints(before, after)
  const lines = [`检查点差异 ${fromCheckpoint.id} → 当前工作区（无 git，仅文件级）`]
  const groups = [
    ['新增', diff.added],
    ['修改', diff.modified],
    ['删除', diff.removed],
  ]
  let any = false
  for (const [label, list] of groups) {
    if (list.length === 0) continue
    any = true
    lines.push(`- ${label}: ${list.length}`)
    for (const path of list.slice(0, 30)) lines.push(`  - ${path}`)
    if (list.length > 30) lines.push(`  - …还有 ${list.length - 30} 个`)
  }
  if (!any) lines.push('- 无文件级差异')
  if (after.partial || before.partial === true) lines.push('- 注意: 指纹扫描达到上限，结果可能不完整')
  return lines.join('\n')
}

/** Tokenize one command input, honoring simple quotes. */
function tokenize(text) {
  const tokens = []
  const pattern = /--[a-z][a-z0-9-]*(?:=(?:"[^"]*"|'[^']*'|\S+))?|"[^"]*"|'[^']*'|\S+/gi
  const matches = String(text ?? '').match(pattern)
  if (matches === null) return tokens
  for (const token of matches) tokens.push(token)
  return tokens
}

/** Parse the command line into an action and options. */
function parseCommandInput(rawInput) {
  const tokens = tokenize(rawInput)
  const result = { action: 'create', note: '', commit: true, keepBaseline: false, yes: false, force: false, json: false, ids: [] }
  let index = 0
  while (index < tokens.length) {
    const token = tokens[index]
    if (token === '--json') result.json = true
    else if (token === '--no-commit') result.commit = false
    else if (token === '--keep-baseline') result.keepBaseline = true
    else if (token === '--yes') result.yes = true
    else if (token === '--force') result.force = true
    else if (token.startsWith('--note=')) result.note = unquote(token.slice('--note='.length))
    else if (token === '--note') {
      index += 1
      if (index < tokens.length) result.note = unquote(tokens[index])
    } else if (/^cp-\d+$/.test(token)) result.ids.push(token)
    else if (['create', 'compress', 'list', 'show', 'diff', 'baseline', 'restore'].includes(token)) result.action = token
    else if (result.note === '') result.note = unquote(token)
    index += 1
  }
  if (result.note === '' && typeof rawInput === 'string') {
    const trimmed = rawInput.trim()
    if (trimmed !== '' && !trimmed.startsWith('--') && !['compress', 'list', 'show', 'diff', 'baseline', 'restore'].includes(trimmed.split(/\s+/)[0])) {
      result.note = trimmed
    }
  }
  return result
}

/** Strip one layer of matching quotes. */
function unquote(value) {
  const text = String(value ?? '')
  if (text.length >= 2 && ((text.startsWith('"') && text.endsWith('"')) || (text.startsWith("'") && text.endsWith("'")))) {
    return text.slice(1, -1)
  }
  return text
}

/**
 * Build the compact JSON payload the dock strip consumes.
 * @param {object} index - checkpoint index.
 * @param {string | null} repoRoot - git root, or null for the fingerprint store.
 * @returns {object} JSON-safe summary.
 */
function summaryOf(index, repoRoot) {
  const latest = index.checkpoints.length > 0 ? index.checkpoints[index.checkpoints.length - 1] : null
  const gitOf = (checkpoint) => (checkpoint.git !== null && checkpoint.git !== undefined ? checkpoint.git : null)
  return {
    store: repoRoot === null ? 'fingerprint' : 'git',
    baseline: index.baseline,
    count: index.checkpoints.length,
    latest:
      latest === null
        ? null
        : { id: latest.id, note: latest.note, createdAt: latest.createdAt, committed: gitOf(latest) === null ? null : gitOf(latest).committed },
    checkpoints: index.checkpoints.map((checkpoint) => {
      const git = gitOf(checkpoint)
      return {
        id: checkpoint.id,
        note: checkpoint.note,
        createdAt: checkpoint.createdAt,
        baseline: index.baseline === checkpoint.id,
        sessionId: checkpoint.sessionId,
        source: checkpoint.source,
        committed: git === null ? null : git.committed,
        files: git === null || !Array.isArray(git.dirtyFiles) ? null : git.dirtyFiles.length,
      }
    }),
  }
}

/** Summarize one created checkpoint for the JSON payload. */
function createdOf(result) {
  return {
    id: result.checkpoint.id,
    note: result.checkpoint.note,
    committed: result.git !== null && result.git !== undefined ? result.git.committed : null,
    ...summaryOf(result.index, result.git === null ? null : result.git.repoRoot),
    session: result.checkpoint.sessionId,
  }
}

/**
 * Execute one `/checkpoint` invocation.
 * @param {object} ctx - plugin context.
 * @param {object} settings - normalized config.
 * @param {object} invocation - command invocation.
 * @returns {Promise<{kind: 'success'|'error', text: string}>} command result.
 */
async function handleCommand(ctx, settings, invocation, prefs) {
  const agent = invocation.agent
  const parsed = parseCommandInput(invocation.rawInput)
  try {
    switch (parsed.action) {
      case 'create': {
        const sessionPrefs = prefs.effectiveFor(sessionIdOf(agent))
        const result = await createCheckpoint(ctx, settings, agent, {
          note: parsed.note,
          commit: parsed.commit !== false && sessionPrefs.checkpointAutoCommit,
          keepBaseline: parsed.keepBaseline,
        })
        // `--json` lets the dock strip update from this one response instead of
        // executing a second `/checkpoint list --json` after every click.
        if (parsed.json) return { kind: 'success', text: JSON.stringify(createdOf(result)) }
        return { kind: 'success', text: formatCreated(settings, result) }
      }
      case 'compress': {
        const sessionPrefs = prefs.effectiveFor(sessionIdOf(agent))
        const result = await createCheckpoint(ctx, settings, agent, {
          note: parsed.note !== '' ? parsed.note : '上下文压缩锚点',
          source: 'compress',
          commit: parsed.commit !== false && sessionPrefs.checkpointAutoCommit,
          keepBaseline: parsed.keepBaseline,
        })
        const lines = [formatCreated(settings, result), '', ...(await compactAfterCheckpoint(ctx, agent, invocation))]
        if (parsed.json) {
          return { kind: 'success', text: JSON.stringify({ ...createdOf(result), report: lines }) }
        }
        return { kind: 'success', text: lines.join('\n') }
      }
      case 'list': {
        const state = await loadState(ctx, agent)
        if (parsed.json) return { kind: 'success', text: JSON.stringify({ ...summaryOf(state.index, state.repoRoot), session: sessionIdOf(agent) }) }
        return { kind: 'success', text: formatList(state.index) }
      }
      case 'show': {
        if (parsed.ids.length === 0) return { kind: 'error', text: `缺少检查点 id。\n${USAGE}` }
        const state = await loadState(ctx, agent)
        const checkpoint = findCheckpoint(state.index, parsed.ids[0])
        if (checkpoint === undefined) return { kind: 'error', text: `未知检查点 ${parsed.ids[0]}。使用 /checkpoint list 查看。` }
        return { kind: 'success', text: formatShow(state.index, checkpoint) }
      }
      case 'diff': {
        const state = await loadState(ctx, agent)
        const fromId = parsed.ids.length > 0 ? parsed.ids[0] : state.index.baseline
        if (fromId === null || fromId === undefined) return { kind: 'error', text: '还没有基线。先创建检查点或 /checkpoint baseline <cp-N>。' }
        const from = findCheckpoint(state.index, fromId)
        if (from === undefined) return { kind: 'error', text: `未知检查点 ${fromId}。` }
        if (state.repoRoot !== null) {
          const to = parsed.ids.length > 1 ? findCheckpoint(state.index, parsed.ids[1]) : undefined
          if (parsed.ids.length > 1 && to === undefined) return { kind: 'error', text: `未知检查点 ${parsed.ids[1]}。` }
          return { kind: 'success', text: await formatGitDiff(state.repoRoot, from, to ?? null) }
        }
        return { kind: 'success', text: await formatFingerprintDiff(settings, state.workspace, from) }
      }
      case 'baseline': {
        const state = await loadState(ctx, agent)
        if (parsed.ids.length === 0) {
          const current = state.index.baseline
          return {
            kind: 'success',
            text: current === null ? '当前没有基线。' : `当前基线: ${current}\n${state.index.checkpoints.some((item) => item.id === current) ? '' : '（该检查点已不在索引中）'}`,
          }
        }
        if (findCheckpoint(state.index, parsed.ids[0]) === undefined) return { kind: 'error', text: `未知检查点 ${parsed.ids[0]}。` }
        return withStore(state.storeDir, async () => {
          const latest = await readIndex(state.storeDir)
          if (findCheckpoint(latest, parsed.ids[0]) === undefined) return { kind: 'error', text: `未知检查点 ${parsed.ids[0]}。` }
          latest.baseline = parsed.ids[0]
          await writeIndex(state.storeDir, latest)
          return { kind: 'success', text: `基线已设为 ${parsed.ids[0]}。` }
        })
      }
      case 'restore': {
        if (!parsed.yes) return { kind: 'error', text: `恢复代码是破坏性操作，需要 --yes。\n${USAGE}` }
        if (parsed.ids.length === 0) return { kind: 'error', text: `缺少检查点 id。\n${USAGE}` }
        const state = await loadState(ctx, agent)
        const target = findCheckpoint(state.index, parsed.ids[0])
        if (target === undefined) return { kind: 'error', text: `未知检查点 ${parsed.ids[0]}。` }
        if (state.repoRoot === null) return { kind: 'error', text: '当前工作区不是 git 仓库，无法恢复（无 git 模式仅记录指纹）。' }
        const revision = revisionOf(target)
        if (revision === null) return { kind: 'error', text: `检查点 ${target.id} 没有可恢复的 git 版本。` }
        if (!parsed.force) {
          const dirty = await isDirty(state.repoRoot)
          if (dirty) return { kind: 'error', text: '工作区有未提交修改。先提交或创建检查点，或加 --force 强制恢复。' }
        }
        const safety = await createCheckpoint(ctx, settings, agent, {
          note: `restore ${target.id} 前的安全回退点`,
          source: 'restore-safety',
          commit: prefs.effectiveFor(sessionIdOf(agent)).checkpointAutoCommit,
        })
        const reset = await resetHard(state.repoRoot, revision)
        if (!reset.ok) return { kind: 'error', text: `恢复失败: ${capText(reset.stderr, 800)}` }
        return withStore(safety.storeDir, async () => {
          const latest = await readIndex(safety.storeDir)
          latest.baseline = target.id
          await writeIndex(safety.storeDir, latest)
          return {
            kind: 'success',
            text: [
              `已恢复到检查点 ${target.id}（${shortHash(revision)}）`,
              `- 安全回退点: ${safety.checkpoint.id}（${shortHash(revisionOf(safety.checkpoint))}）`,
              `- 基线: ${target.id}`,
              '- 如需撤销本次恢复: /checkpoint restore ' + safety.checkpoint.id + ' --yes',
            ].join('\n'),
          }
        })
      }
      default:
        return { kind: 'error', text: USAGE }
    }
  } catch (error) {
    return { kind: 'error', text: `检查点操作失败: ${error instanceof Error ? error.message : String(error)}` }
  }
}

/** Execute one `checkpoint_inspect` tool call. */
async function handleInspectTool(ctx, settings, args, exec) {
  const agent = exec.agent
  if (agent === undefined) throw new Error('checkpoint_inspect requires a live agent')
  const action = typeof args.action === 'string' ? args.action : 'list'
  if (action === 'latest') {
    const state = await loadState(ctx, agent)
    if (state.index.checkpoints.length === 0) throw new Error('no checkpoint yet; the user can create one with /checkpoint')
    return { text: formatShow(state.index, state.index.checkpoints[state.index.checkpoints.length - 1]) }
  }
  if (action === 'list') {
    const state = await loadState(ctx, agent)
    return { text: formatList(state.index) }
  }
  if (action === 'show') {
    if (typeof args.id !== 'string' || args.id.trim() === '') throw new Error('checkpoint_inspect show requires id')
    const state = await loadState(ctx, agent)
    const checkpoint = findCheckpoint(state.index, args.id.trim())
    if (checkpoint === undefined) throw new Error(`unknown checkpoint ${args.id.trim()}`)
    return { text: formatShow(state.index, checkpoint) }
  }
  if (action === 'diff') {
    const state = await loadState(ctx, agent)
    const fromId = typeof args.from === 'string' && args.from.trim() !== '' ? args.from.trim() : state.index.baseline
    if (fromId === null || fromId === undefined) throw new Error('no baseline checkpoint to diff from')
    const from = findCheckpoint(state.index, fromId)
    if (from === undefined) throw new Error(`unknown checkpoint ${fromId}`)
    if (state.repoRoot !== null) {
      const to = typeof args.to === 'string' && args.to.trim() !== '' ? findCheckpoint(state.index, args.to.trim()) : undefined
      if (typeof args.to === 'string' && args.to.trim() !== '' && to === undefined) throw new Error(`unknown checkpoint ${args.to.trim()}`)
      return { text: await formatGitDiff(state.repoRoot, from, to ?? null) }
    }
    return { text: await formatFingerprintDiff(settings, state.workspace, from) }
  }
  throw new Error(`unknown action ${action}`)
}

/** Setup keys accepted by `/setup set` and the wizard. */
const SETUP_KEYS = new Set(['smartDirection', 'autoContinue', 'checkpointAutoCommit', 'checkpointOnCard', 'startupCheckpoint'])
const SETUP_MODES = new Set(['auto', 'on', 'off'])

/** Parse one `/setup` input line. */
function parseSetupInput(rawInput) {
  const tokens = tokenize(rawInput)
  const result = { action: 'status', json: false, global: false, assignments: [] }
  for (const token of tokens) {
    if (token === '--json') result.json = true
    else if (token === '--global') result.global = true
    else if (['status', 'set', 'dismiss', 'reset', 'show'].includes(token)) result.action = token
    else if (token.includes('=')) result.assignments.push(token)
  }
  return result
}

/** Build the JSON payload consumed by the setup wizard. */
function setupJson(document, sessionId, blank) {
  return {
    blank,
    needsSetup: needsSetupOf(document, sessionId, blank),
    global: document.global,
    session: document.sessions[sessionId] ?? null,
    effective: effectiveOf(document, sessionId),
    dismissed: document.dismissed.includes(sessionId),
  }
}

/** Human-readable setup status for the command output. */
function formatSetupStatus(document, sessionId, blank) {
  const effective = effectiveOf(document, sessionId)
  const session = document.sessions[sessionId] ?? null
  const sessionValue = (key) => (session !== null && session[key] !== undefined ? session[key] : '跟随全局')
  return [
    `本会话设置（${sessionId}，${blank ? '新会话' : '已有内容'}）`,
    `- smart-direction: 生效 ${effective.smartDirection === 'off' ? '关闭' : '启用'}（本会话 ${sessionValue('smartDirection')}）`,
    `- 方向卡片自动继续: ${effective.autoContinue ? '开' : '关'}（本会话 ${sessionValue('autoContinue')}）`,
    `- 检查点自动提交: ${effective.checkpointAutoCommit ? '开' : '关'}（本会话 ${sessionValue('checkpointAutoCommit')}）`,
    `- 每次表单自动建检查点: ${effective.checkpointOnCard ? '开' : '关'}（本会话 ${sessionValue('checkpointOnCard')}）`,
    `- 新会话初始检查点: ${effective.startupCheckpoint ? '开' : '关'}`,
    `- 向导自动弹出: ${document.global.autoPrompt === false ? '否' : document.dismissed.includes(sessionId) ? '本会话已跳过' : '是'}`,
    '修改: /setup set smartDirection=on|off|auto autoContinue=on|off|auto checkpointAutoCommit=on|off|auto startupCheckpoint=on|off [--global]',
  ].join('\n')
}

/**
 * Execute one `/setup` invocation (session setup wizard data channel).
 * @param {object} ctx - plugin context.
 * @param {object} invocation - command invocation.
 * @param {object} prefs - prefs accessor bound to the plugin cache.
 * @returns {Promise<{kind: 'success'|'error', text: string}>} command result.
 */
async function handleSetupCommand(ctx, invocation, prefs) {
  const agent = invocation.agent
  const sessionId = sessionIdOf(agent)
  const blank = agent.session.seq === 0
  const parsed = parseSetupInput(invocation.rawInput)
  try {
    if (parsed.action === 'set') {
      const patch = {}
      for (const assignment of parsed.assignments) {
        const equals = assignment.indexOf('=')
        if (equals <= 0) return { kind: 'error', text: `无效赋值 ${assignment}` }
        const key = assignment.slice(0, equals)
        const value = assignment.slice(equals + 1).toLowerCase()
        if (!SETUP_KEYS.has(key)) return { kind: 'error', text: `未知设置项 ${key}` }
        if (key === 'startupCheckpoint') {
          if (value !== 'on' && value !== 'off') return { kind: 'error', text: 'startupCheckpoint 只接受 on/off' }
        } else if (!SETUP_MODES.has(value)) {
          return { kind: 'error', text: `${key} 只接受 auto/on/off` }
        }
        patch[key] = value
      }
      if (Object.keys(patch).length === 0) return { kind: 'error', text: '没有可保存的设置，例如: /setup set smartDirection=off' }
      const { document } = await mutateSetup((draft) => {
        if (parsed.global) Object.assign(draft.global, patch)
        else draft.sessions[sessionId] = { ...(draft.sessions[sessionId] ?? {}), ...patch }
        if (draft.forceShow !== undefined) delete draft.forceShow[sessionId]
        return draft
      })
      prefs.setCached(document)
      if (parsed.json) return { kind: 'success', text: JSON.stringify(setupJson(document, sessionId, blank)) }
      return {
        kind: 'success',
        text: (parsed.global ? '已设为全局默认。' : '已保存到本会话设置。') + '\n' + formatSetupStatus(document, sessionId, blank),
      }
    }
    if (parsed.action === 'show') {
      const { document } = await mutateSetup((draft) => {
        if (draft.forceShow === undefined) draft.forceShow = {}
        draft.forceShow[sessionId] = true
        return draft
      })
      prefs.setCached(document)
      if (parsed.json) return { kind: 'success', text: JSON.stringify(setupJson(document, sessionId, blank)) }
      return { kind: 'success', text: '已请求显示设置向导；面板会在当前会话出现。' }
    }
    if (parsed.action === 'dismiss') {
      const { document } = await mutateSetup((draft) => {
        if (parsed.global) draft.global.autoPrompt = false
        else if (!draft.dismissed.includes(sessionId)) draft.dismissed.push(sessionId)
        if (draft.forceShow !== undefined) delete draft.forceShow[sessionId]
        return draft
      })
      prefs.setCached(document)
      if (parsed.json) return { kind: 'success', text: JSON.stringify(setupJson(document, sessionId, blank)) }
      return { kind: 'success', text: parsed.global ? '已关闭所有会话的自动向导。' : '本会话不再自动弹出设置向导。' }
    }
    if (parsed.action === 'reset') {
      const { document } = await mutateSetup((draft) => {
        delete draft.sessions[sessionId]
        draft.dismissed = draft.dismissed.filter((id) => id !== sessionId)
        if (draft.forceShow !== undefined) delete draft.forceShow[sessionId]
        return draft
      })
      prefs.setCached(document)
      if (parsed.json) return { kind: 'success', text: JSON.stringify(setupJson(document, sessionId, blank)) }
      return { kind: 'success', text: '已清除本会话设置。' + '\n' + formatSetupStatus(document, sessionId, blank) }
    }
    const document = await readSetup()
    prefs.setCached(document)
    if (parsed.json) return { kind: 'success', text: JSON.stringify(setupJson(document, sessionId, blank)) }
    return { kind: 'success', text: formatSetupStatus(document, sessionId, blank) }
  } catch (error) {
    return { kind: 'error', text: `会话设置失败: ${error instanceof Error ? error.message : String(error)}` }
  }
}

/**
 * Plugin body.
 * @param {object} ctx - Cordis plugin context.
 * @param {object} [config] - row config.
 */
export function applyCheckpoint(ctx, config = {}) {
  const settings = normalizeConfig(config)

  /** Last loaded setup document; the wizard and `/setup` keep it fresh. */
  let setupCache = null
  const prefs = {
    effectiveFor(sessionId) {
      return effectiveOf(setupCache ?? emptySetup(), sessionId)
    },
    getSnapshot() {
      return setupCache ?? emptySetup()
    },
    setCached(document) {
      setupCache = document
    },
  }
  /**
   * Create one checkpoint for a direction-card submission.
   * @param {object} agent - live agent owning the session.
   * @param {{title?: string}} record - the submitted card record.
   * @returns {Promise<object | null>} created checkpoint data, or null when disabled.
   */
  async function createAutoCheckpoint(agent, record = {}) {
    const effective = prefs.effectiveFor(sessionIdOf(agent))
    if (effective.checkpointOnCard !== true) return null
    const noteParts = ['方向表单']
    if (typeof record.title === 'string' && record.title.trim() !== '') noteParts.push(record.title.trim())
    const result = await createCheckpoint(ctx, settings, agent, {
      note: noteParts.join(': ').slice(0, 500),
      source: 'direction-card',
      commit: effective.checkpointAutoCommit,
    })
    return result
  }
  const ready = readSetup()
    .then((document) => {
      setupCache = document
    })
    .catch((error) => {
      warn(ctx, 'dsh-checkpoint: cannot read session setup: %s', error)
    })

  try {
    ctx.provide('sessionSetup', {
      effectiveFor: prefs.effectiveFor,
      getSnapshot: prefs.getSnapshot,
      ready,
    })
  } catch (error) {
    warn(ctx, 'dsh-checkpoint: cannot provide sessionSetup service: %s', error)
  }

  ctx.effect(
    () => ctx.commands.register({
      name: COMMAND_NAME,
      description:
        'Create or inspect workspace checkpoints. A checkpoint records the workspace state, commits pending git changes by default, and becomes the new comparison baseline.',
      input: {
        hint: '[--note=备注] [--no-commit] [--keep-baseline] | list | show <cp-N> | diff [<cp-A> [cp-B]] | baseline [<cp-N>] | restore <cp-N> --yes [--force]',
      },
      handler: (invocation) => handleCommand(ctx, settings, invocation, prefs),
    }),
    'dsh-checkpoint: command',
  )

  ctx.effect(
    () =>
      ctx.commands.register({
        name: SETUP_COMMAND_NAME,
        description:
          'Per-session setup for smart directions and checkpoints: show or set whether smart directions are enabled, whether direction cards auto-continue, whether checkpoints auto-commit, and whether a new session starts with a checkpoint.',
        input: { hint: '[--json] [--global] | set smartDirection=on|off|auto autoContinue=on|off|auto checkpointAutoCommit=on|off|auto startupCheckpoint=on|off | show | dismiss | reset' },
        handler: (invocation) => handleSetupCommand(ctx, invocation, prefs),
      }),
    'dsh-checkpoint: setup command',
  )

  ctx.effect(
    () =>
      ctx.tools.register({
        name: TOOL_NAME,
        description:
          'Inspect workspace checkpoints. Actions: list (all checkpoints), latest (newest checkpoint with its direction/note anchor), show (one checkpoint by id), diff (baseline or a given checkpoint versus the current worktree, or two checkpoints). Read-only.',
        parameters: {
          type: 'object',
          additionalProperties: false,
          properties: {
            action: {
              type: 'string',
              enum: ['list', 'latest', 'show', 'diff'],
              description: 'list | latest | show | diff',
            },
            id: {
              type: 'string',
              description: 'Checkpoint id such as cp-3 (for show).',
            },
            from: {
              type: 'string',
              description: 'Checkpoint id to diff from (defaults to the current baseline).',
            },
            to: {
              type: 'string',
              description: 'Optional checkpoint id to diff to (defaults to the current worktree).',
            },
          },
          required: ['action'],
        },
        output: {
          schema: {
            type: 'object',
            additionalProperties: false,
            properties: {
              text: { type: 'string' },
            },
            required: ['text'],
          },
          render: (_args, value) => [{ type: 'text', text: String(value && value.text !== undefined ? value.text : '') }],
        },
        async execute(args, exec) {
          const result = await handleInspectTool(ctx, settings, args, exec)
          return { text: result.text }
        },
      }),
    'dsh-checkpoint: inspect tool',
  )

  ctx.effect(
    () => ctx.systemPrompt.section({ name: SECTION_NAME, order: 750, text: POLICY_TEXT }),
    'dsh-checkpoint: policy section',
  )

  ctx.effect(
    () =>
      ctx.skills.register({
        name: SKILL_NAME,
        description:
          'Workspace checkpoints: how to interpret #cp-N references, compare against the baseline, and never roll back without the user command.',
        whenToUse:
          'Load when the user mentions a checkpoint id (#cp-N / 检查点 cp-N), asks to compare or roll back to a checkpoint, or asks how checkpoints work.',
        content: SKILL_CONTENT,
        invocation: { modelInvocable: true, userInvocable: false },
        source: 'runtime',
        provider: 'dsh-checkpoint',
      }),
    'dsh-checkpoint: skill',
  )

  // Optional per-session start checkpoint (off by default; the wizard can enable it).
  ctx.on('agent/created', ({ agent }) => {
    void (async () => {
      try {
        if (agent === undefined || agent === null || agent.session.seq !== 0) return
        const effective = prefs.effectiveFor(sessionIdOf(agent))
        if (effective.startupCheckpoint !== true) return
        const agentsService = typeof ctx.get === 'function' ? ctx.get('agents') : undefined
        if (agentsService !== undefined && typeof agentsService.roots === 'function') {
          let roots
          try {
            roots = agentsService.roots()
          } catch (error) {
            roots = undefined
          }
          if (Array.isArray(roots) && !roots.includes(agent)) return
        }
        await createCheckpoint(ctx, settings, agent, {
          note: '会话开始',
          source: 'session-start',
          commit: effective.checkpointAutoCommit,
        })
      } catch (error) {
        warn(ctx, 'dsh-checkpoint: startup checkpoint failed: %s', error)
      }
    })()
  })

  return { createAutoCheckpoint }
}
