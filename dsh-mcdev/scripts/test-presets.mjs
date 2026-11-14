#!/usr/bin/env node
/**
 * Tests for launch presets: game path + host world/packs/skin + guests.
 * Presets are self-contained.
 *
 *   node scripts/test-presets.mjs
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import {
  defaultPreset,
  findPreset,
  normalizePreset,
  normalizePresets,
  presetsPath,
  readPresets,
  removePreset,
  resolveHostLaunch,
  setActivePreset,
  upsertPreset,
  writePresets,
} from '../lib/native/presets.js'

function makeProject() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'mcdev-presets-'))
}

// 1) normalizePreset: defaults, name fallback, host normalization
{
  const preset = normalizePreset({ name: '  ', host: { world: ' W ', behaviorPacks: [' a ', 'a', 'b'], resourcePacks: null, slim: 'yes', playerName: '  DSH_Tester  ' } })
  assert.ok(preset.id.startsWith('p-'))
  assert.equal(preset.name, '默认预设')
  assert.equal(preset.gameExe, '')
  assert.equal(preset.host.world, 'W')
  assert.deepEqual(preset.host.behaviorPacks, ['a', 'b'])
  assert.equal(preset.host.resourcePacks, null)
  assert.equal(preset.host.slim, false)
  assert.equal(preset.host.playerName, 'DSH_Tester', 'host username is stored for the cppconfig player_info')
  assert.equal(normalizePreset({}).host.playerName, 'developer', 'host username defaults to developer')
  assert.equal(normalizePreset({ host: { playerName: '   ' } }).host.playerName, 'developer', 'blank username falls back to developer')
  assert.equal(preset.host.skinsDir, undefined, 'skins are project-managed, not per preset')
  console.log('ok 1 - normalizePreset fills defaults and normalizes the host')
}

// 2) guests: only skin/slim kept, names/ids normalized
{
  const preset = normalizePreset({
    name: 'Multi',
    guests: [{ skin: ' a.png ', slim: true, world: 'ignored', behaviorPacks: ['x'] }, {}],
  })
  assert.equal(preset.guests.length, 2)
  assert.equal(preset.guests[0].skin, 'a.png')
  assert.equal(preset.guests[0].slim, true)
  assert.equal(preset.guests[0].world, undefined)
  assert.equal(preset.guests[0].behaviorPacks, undefined)
  assert.equal(preset.guests[1].name, 'Guest 2')
  assert.ok(preset.guests[1].id.startsWith('g-'))
  console.log('ok 2 - guests keep only skin/slim and get stable ids')
}

// 3) upsert / setActive / remove keep at least one preset
{
  let state = normalizePresets({ presets: [{ name: 'A' }] })
  const first = state.presets[0]
  assert.equal(state.activeId, first.id)
  state = upsertPreset(state, { ...first, name: 'A renamed' }).state
  assert.equal(state.presets.length, 1)
  assert.equal(state.presets[0].name, 'A renamed')
  const added = upsertPreset(state, { name: 'B' })
  assert.equal(added.created, true)
  state = added.state
  assert.equal(state.presets.length, 2)
  const second = state.presets[1]
  state = setActivePreset(state, second.id)
  assert.equal(state.activeId, second.id)
  assert.equal(findPreset(state, '').id, second.id)
  state = removePreset(state, second.id)
  assert.equal(state.presets.length, 1)
  assert.notEqual(state.activeId, second.id)
  assert.throws(() => removePreset(state, state.presets[0].id), /至少保留一个/)
  console.log('ok 3 - upsert/setActive/remove maintain a usable preset list')
}

// 4) read/write round trip inside <project>/.mcdev/launch-presets.json (+ .bak)
{
  const dir = makeProject()
  assert.equal(readPresets(dir), null)
  const file = presetsPath(dir)
  assert.equal(file, path.join(dir, '.mcdev', 'launch-presets.json'))
  const preset = normalizePreset({ name: 'Saved', gameExe: 'D:/MC/Minecraft.Windows.exe' })
  const state = normalizePresets({ activeId: preset.id, presets: [preset] })
  writePresets(dir, state)
  assert.ok(fs.existsSync(file))
  const loaded = readPresets(dir)
  assert.equal(loaded.presets[0].name, 'Saved')
  assert.equal(loaded.presets[0].gameExe, 'D:/MC/Minecraft.Windows.exe')
  writePresets(dir, upsertPreset(loaded, { name: 'Second' }).state)
  assert.ok(fs.existsSync(file + '.bak'))
  console.log('ok 4 - presets persist inside the project and keep a .bak')
}

// 5) default preset seeds from the current discovery (game path/world/skin)
{
  const preset = defaultPreset({ gameExe: 'E:/Minecraft.Windows.exe', world: 'WORLD_A', skin: 'C:/s.png', slim: true })
  assert.equal(preset.name, '默认预设')
  assert.equal(preset.gameExe, 'E:/Minecraft.Windows.exe')
  assert.equal(preset.host.world, 'WORLD_A')
  assert.equal(preset.host.skin, 'C:/s.png')
  assert.equal(preset.host.slim, true)
  assert.equal(preset.host.behaviorPacks, null)
  assert.deepEqual(preset.guests, [])
  console.log('ok 5 - defaultPreset carries the discovered world/skin/game path')
}

// 6) resolveHostLaunch is explicit-only
{
  const explicit = resolveHostLaunch(
    normalizePreset({ host: { world: 'P_WORLD', skin: 'C:/p.png', slim: true, playerName: 'P_User' } }),
  )
  assert.equal(explicit.world, 'P_WORLD')
  assert.equal(explicit.skin, 'C:/p.png')
  assert.equal(explicit.slim, true)
  assert.equal(explicit.playerName, 'P_User')
  const empty = resolveHostLaunch(normalizePreset({}), 'FALLBACK_WORLD')
  assert.equal(empty.world, 'FALLBACK_WORLD')
  assert.equal(empty.skin, '')
  assert.equal(empty.slim, false)
  assert.equal(empty.playerName, 'developer')
  assert.equal(empty.behaviorPacks, null)
  console.log('ok 6 - resolveHostLaunch is explicit-only')
}

// 7) activeId fallback when the stored id is unknown
{
  const preset = normalizePreset({ name: 'Only' })
  const state = normalizePresets({ activeId: 'missing-id', presets: [preset] })
  assert.equal(state.activeId, preset.id)
  const empty = normalizePresets({ presets: [] })
  assert.deepEqual(empty.presets, [])
  assert.equal(empty.activeId, '')
  console.log('ok 7 - activeId falls back to the first preset')
}

// 8) legacy globals are gone: the preset module carries no project-config helpers
{
  const source = fs.readFileSync(new URL('../lib/native/presets.js', import.meta.url), 'utf8')
  assert.ok(!source.includes('readConfigWithDefaults'), 'presets must not read a project config')
  assert.ok(!source.includes('presetFromLegacyProfile'), 'legacy migration was removed')
  assert.ok(!fs.existsSync(new URL('../lib/native/launchProfile.js', import.meta.url)), 'launch-profile.js was removed')
  console.log('ok 8 - legacy launch-profile compatibility removed')
}

console.log('8 preset tests passed')
