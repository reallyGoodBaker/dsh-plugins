#!/usr/bin/env node
/**
 * Tests for launch presets (game path + host world/packs/skin + guests).
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
  presetFromLegacyProfile,
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
  const preset = normalizePreset({ name: '  ', host: { world: ' W ', behaviorPacks: [' a ', 'a', 'b'], resourcePacks: null, slim: 'yes' } })
  assert.ok(preset.id.startsWith('p-'))
  assert.equal(preset.name, '默认预设')
  assert.equal(preset.gameExe, '')
  assert.equal(preset.host.world, 'W')
  assert.deepEqual(preset.host.behaviorPacks, ['a', 'b'])
  assert.equal(preset.host.resourcePacks, null)
  assert.equal(preset.host.slim, false)
  console.log('ok 1 - normalizePreset fills defaults and normalizes the host')
}

// 2) guests: only skin/slim kept, names/ids normalized, extra fields dropped
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

// 5) default preset seeds from the current project discovery
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

// 6) legacy launch-profile migrates into a default preset
{
  const preset = presetFromLegacyProfile(
    { world: 'OLD_WORLD', behaviorPacks: ['uuid-1'], resourcePacks: [], skin: 'C:/old.png', slim: true },
    { gameExe: 'F:/MC/Minecraft.Windows.exe' },
  )
  assert.equal(preset.host.world, 'OLD_WORLD')
  assert.deepEqual(preset.host.behaviorPacks, ['uuid-1'])
  assert.deepEqual(preset.host.resourcePacks, [])
  assert.equal(preset.host.skin, 'C:/old.png')
  assert.equal(preset.gameExe, 'F:/MC/Minecraft.Windows.exe')
  console.log('ok 6 - legacy profile seeds the default preset')
}

// 7) resolveHostLaunch falls back to .mcdev.json for empty fields
{
  const preset = normalizePreset({ host: { world: '', skin: '', slim: true } })
  const launch = resolveHostLaunch(preset, {
    world_folder_name: 'CONFIG_WORLD',
    skin_info: { skin: 'C:/config-skin.png', slim: false },
  })
  assert.equal(launch.world, 'CONFIG_WORLD')
  assert.equal(launch.skin, 'C:/config-skin.png')
  assert.equal(launch.slim, true, 'an explicit slim flag wins over the config')
  const plain = resolveHostLaunch(normalizePreset({ host: { world: '', skin: '', slim: false } }), {
    world_folder_name: 'CONFIG_WORLD',
    skin_info: { skin: 'C:/config-skin.png', slim: true },
  })
  assert.equal(plain.slim, true, 'an inherited skin keeps the config slim flag')
  const explicit = resolveHostLaunch(normalizePreset({ host: { world: 'P_WORLD', skin: 'C:/p.png', slim: true } }), {
    world_folder_name: 'CONFIG_WORLD',
    skin_info: { skin: 'C:/config-skin.png', slim: false },
  })
  assert.equal(explicit.world, 'P_WORLD')
  assert.equal(explicit.skin, 'C:/p.png')
  assert.equal(explicit.slim, true)
  console.log('ok 7 - resolveHostLaunch prefers the preset and falls back to the config')
}

// 8) activeId fallback when the stored id is unknown
{
  const preset = normalizePreset({ name: 'Only' })
  const state = normalizePresets({ activeId: 'missing-id', presets: [preset] })
  assert.equal(state.activeId, preset.id)
  const empty = normalizePresets({ presets: [] })
  assert.deepEqual(empty.presets, [])
  assert.equal(empty.activeId, '')
  console.log('ok 8 - activeId falls back to the first preset')
}

console.log('8 preset tests passed')
