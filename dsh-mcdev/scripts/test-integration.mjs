#!/usr/bin/env node
/**
 * Headless integration test for the dsh-mcdev Host half.
 *
 * Builds a fake Cordis context, applies the plugin, then exercises the
 * registered `/mcdev` command and `mcdev` tool without a Harness or a running
 * game (documentation search, discovery, presets and help are all safe).
 *
 *   node scripts/test-integration.mjs
 */
import assert from 'node:assert/strict'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { applyMcdev, jsonPayloadOf } from '../lib/host/plugin.js'

const bundleRoot = path.resolve(fileURLToPath(new URL('..', import.meta.url)))

/** Minimal Cordis context double. */
function createContext() {
  const state = { commands: new Map(), tools: new Map(), skills: new Map(), sections: [], cleanups: [], services: new Map() }
  const ctx = {
    effect(fn) {
      const cleanup = fn()
      state.cleanups.push(cleanup)
      return () => {}
    },
    provide(name, service) {
      state.services.set(name, service)
    },
    get(name) {
      return state.services.get(name)
    },
    on() {
      return () => {}
    },
    commands: {
      register(definition) {
        state.commands.set(definition.name, definition)
        return () => {}
      },
    },
    tools: {
      register(definition) {
        state.tools.set(definition.name, definition)
        return () => {}
      },
    },
    skills: {
      register(definition) {
        state.skills.set(definition.name, definition)
        return () => {}
      },
    },
    systemPrompt: {
      section(section) {
        state.sections.push(section)
        return () => {}
      },
    },
  }
  return { ctx, state }
}

const fakeAgent = { id: 'session-test', session: { id: 'session-test', header: { cwd: 'C:\\Projects\\tgw' } } }

const { ctx, state } = createContext()
applyMcdev(ctx, { docsDir: path.join(bundleRoot, 'docs') })

assert.ok(state.services.has('mcdev'), 'mcdev service is provided')
assert.ok(state.commands.has('mcdev'), '/mcdev command registered')
assert.ok(state.tools.has('mcdev'), 'mcdev tool registered')
assert.ok(state.skills.has('minecraft-mod-dev'), 'skill registered')
assert.equal(state.sections.length, 1, 'system prompt section registered')
console.log('ok 1 - registrations: service, command, tool, skill, prompt section')

const command = state.commands.get('mcdev')
const tool = state.tools.get('mcdev')

async function runCommand(rawInput) {
  const result = await command.handler({ rawInput, agent: fakeAgent })
  assert.equal(typeof result.text, 'string')
  return result
}

// 1. /mcdev help --json
{
  const result = await runCommand('--json help')
  const payload = JSON.parse(result.text)
  assert.equal(payload.ok, true)
  assert.ok(Array.isArray(payload.actions) && payload.actions.includes('docs_search'))
  console.log('ok 2 - /mcdev help --json')
}

// 2. /mcdev docs --query 实体伤害 --json
{
  const result = await runCommand('--json docs --query 实体伤害 --limit 3')
  const payload = JSON.parse(result.text)
  assert.equal(payload.ok, true)
  assert.ok(Array.isArray(payload.hits) && payload.hits.length > 0, 'docs search hit')
  assert.ok(typeof payload.hits[0].path === 'string' && payload.hits[0].path.length > 0)
  console.log('ok 3 - /mcdev docs search ->', payload.hits[0].path)

  // 3. /mcdev read --path-b64 <base64url>
  const encoded = Buffer.from(payload.hits[0].path, 'utf8').toString('base64url')
  const readResult = await runCommand(`--json read --path-b64=${encoded} --max-chars 300`)
  const readPayload = JSON.parse(readResult.text)
  assert.equal(readPayload.ok, true)
  assert.equal(readPayload.path, payload.hits[0].path)
  assert.ok(readPayload.text.length > 0)
  console.log('ok 4 - /mcdev read --path-b64 -> chars', readPayload.text.length)
}

// 4. tool: docs_search
{
  const value = await tool.execute({ action: 'docs_search', query: 'json ui', limit: 2 }, { agent: fakeAgent })
  assert.equal(typeof value.text, 'string')
  assert.ok(value.text.includes('json'), 'tool renders docs hits')
  console.log('ok 5 - tool docs_search')
}

// 5. tool: help + unknown action
{
  const help = await tool.execute({ action: 'help' }, { agent: fakeAgent })
  assert.ok(help.text.includes('start'))
  const unknown = await tool.execute({ action: 'nope' }, { agent: fakeAgent })
  assert.ok(unknown.text.includes('未知操作'))
  console.log('ok 6 - tool help / unknown action')
}

// 6. discover (safe: locates binaries and the active preset, never launches the game)
{
  const result = await runCommand('--json discover')
  const payload = JSON.parse(result.text)
  assert.equal(payload.ok, true, payload.error ?? 'discover failed')
  assert.equal(payload.provider, 'native', 'the self-implemented provider is the only runtime')
  assert.ok(typeof payload.projectDir === 'string' && payload.projectDir.length > 0)
  assert.ok(Array.isArray(payload.versions))
  console.log('ok 7 - discover ->', payload.gameExe ?? '(no game build)', '| versions:', payload.versions.length)
}

// 7. Documented `--json` shapes (the panel consumes these directly).
{
  const statusResult = await runCommand('--json status')
  const status = JSON.parse(statusResult.text)
  assert.equal(typeof status.phase, 'string', 'status --json exposes phase at the root')
  assert.equal(typeof status.projectDir, 'string')
  assert.equal(status.ok, true)
  console.log('ok 8 - /mcdev status --json -> phase', status.phase)

  const logsResult = await runCommand('--json logs --limit 3')
  const logs = JSON.parse(logsResult.text)
  assert.ok(Array.isArray(logs.lines), 'logs --json exposes lines at the root')
  assert.equal(typeof logs.next, 'number')
  assert.equal(logs.source, 'launcher')
  console.log('ok 9 - /mcdev logs --json -> lines', logs.lines.length, 'next', logs.next)

  // jsonPayloadOf is the single shaping point; verify every branch without the game.
  const panelled = jsonPayloadOf('start', { ok: true, status: { phase: 'launching', ready: false } })
  assert.equal(panelled.phase, 'launching')
  assert.equal(panelled.ok, true)
  const failure = jsonPayloadOf('stop', { ok: false, error: '端口被占用' })
  assert.deepEqual(failure, { ok: false, error: '端口被占用' })
  const gameLogs = jsonPayloadOf('game_logs', { ok: true, lines: [{ seq: 1, text: 'a' }], tool: 'get_latest_logs' })
  assert.ok(Array.isArray(gameLogs.lines) && gameLogs.lines.length === 1)
  const passthrough = jsonPayloadOf('docs_search', { ok: true, hits: [] })
  assert.ok(Array.isArray(passthrough.hits))
  console.log('ok 10 - jsonPayloadOf shapes for start/failure/game_logs/docs')
}

// 7. presets (plugin-owned, no .mcdev.json involved)
{
  const result = await runCommand('--json presets')
  const payload = JSON.parse(result.text)
  assert.equal(payload.ok, true, payload.error ?? 'presets read failed')
  assert.equal(typeof payload.state, 'object')
  assert.ok(Array.isArray(payload.state.presets) && payload.state.presets.length > 0, 'default preset exists')
  assert.ok(Array.isArray(payload.worlds), 'worlds are returned')
  assert.ok(Array.isArray(payload.skins), 'skins are returned')
  assert.equal(typeof payload.path, 'string', 'presets file path is returned')
  assert.ok(!('config' in payload), 'presets do not expose .mcdev.json')
  console.log('ok 11 - /mcdev presets --json ->', payload.state.presets.length, 'presets,', payload.worlds.length, 'worlds')
}

// 7b. machines: the logs/exec selector can list game instances even when none is connected
{
  const result = await runCommand('--json games')
  const payload = JSON.parse(result.text)
  assert.equal(payload.ok, true, payload.error ?? 'games read failed')
  assert.ok(Array.isArray(payload.machines), 'machines is an array')
  console.log('ok 12 - /mcdev games --json ->', payload.machines.length, 'connected instances')
}

// 8. .mcdev.json compatibility removed: the old config action is gone
{
  const result = await runCommand('--json config')
  const payload = JSON.parse(result.text)
  assert.equal(payload.ok, true, 'an unknown verb falls back to help')
  assert.ok(Array.isArray(payload.actions), 'help lists the available actions')
  assert.ok(!payload.actions.includes('config'), 'config action removed from ACTIONS')
  assert.ok(!('config' in payload), 'no .mcdev.json payload is returned')
  console.log('ok 12 - .mcdev.json config action removed')
}

// 8. cleanup order: disposers run without throwing
for (const cleanup of state.cleanups.reverse()) {
  if (typeof cleanup === 'function') cleanup()
}
console.log('ok 9 - disposers run cleanly')

console.log('\nhost integration tests passed')
