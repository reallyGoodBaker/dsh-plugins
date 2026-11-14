#!/usr/bin/env node
/**
 * Tests for the plugin-owned launch profile: world / behavior pack / resource
 * pack / skin selection. Pure helpers only; no game client required.
 *
 *   node scripts/test-launch-profile.mjs
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  emptyLaunchProfile,
  launchProfilePath,
  normalizeLaunchProfile,
  packCatalog,
  readLaunchProfile,
  resolveSelectedPacks,
  skinDirsOf,
  skinFiles,
  worldNameOf,
  writeLaunchProfile,
} from '../lib/native/launchProfile.js'

const root = path.resolve(fileURLToPath(new URL('..', import.meta.url)))

function makeProject() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mcdev-launch-'))
  const bp = path.join(dir, 'bp')
  fs.mkdirSync(bp, { recursive: true })
  fs.writeFileSync(
    path.join(bp, 'manifest.json'),
    JSON.stringify({ header: { uuid: '11111111-1111-1111-1111-111111111111', version: [1, 2, 3], name: 'Test BP' } }),
  )
  const rp = path.join(dir, 'rp')
  fs.mkdirSync(rp, { recursive: true })
  fs.writeFileSync(
    path.join(rp, 'manifest.json'),
    JSON.stringify({ header: { uuid: '22222222-2222-2222-2222-222222222222', version: [0, 1, 0], name: 'Test RP' } }),
  )
  return dir
}

// 1) defaults + invalid world names
{
  const empty = normalizeLaunchProfile(null)
  assert.deepEqual(empty, emptyLaunchProfile())
  assert.equal(empty.behaviorPacks, null)
  assert.equal(empty.slim, false)
  const bad = normalizeLaunchProfile({ world: '..\\evil', behaviorPacks: 'nope', slim: 'yes' })
  assert.equal(bad.world, '..\\evil')
  assert.equal(bad.behaviorPacks, null)
  assert.equal(bad.slim, false)
  console.log('ok 1 - normalizeLaunchProfile fills defaults and rejects bad types')
}

// 2) pack whitelists are trimmed, deduped and null stays null
{
  const profile = normalizeLaunchProfile({
    behaviorPacks: [' uuid-a ', 'uuid-a', '', 'uuid-b'],
    resourcePacks: null,
    skin: '  C:\\skins\\hero.png  ',
    slim: true,
  })
  assert.deepEqual(profile.behaviorPacks, ['uuid-a', 'uuid-b'])
  assert.equal(profile.resourcePacks, null)
  assert.equal(profile.skin, 'C:\\skins\\hero.png')
  assert.equal(profile.slim, true)
  console.log('ok 2 - pack whitelists trim/dedupe, null means project default')
}

// 3) read/write round trip inside <project>/.mcdev/launch-profile.json
{
  const dir = makeProject()
  const file = launchProfilePath(dir)
  assert.equal(file, path.join(dir, '.mcdev', 'launch-profile.json'))
  assert.deepEqual(readLaunchProfile(dir), emptyLaunchProfile())
  const written = writeLaunchProfile(dir, { world: 'WORLD_A', behaviorPacks: ['x'], skin: 'C:\\s.png' })
  assert.equal(written.path, file)
  assert.equal(written.profile.world, 'WORLD_A')
  assert.ok(fs.existsSync(file))
  const modified = fs.statSync(file).mtimeMs
  const second = writeLaunchProfile(dir, { slim: true })
  assert.equal(second.profile.world, 'WORLD_A', 'merge keeps the existing world')
  assert.equal(second.profile.slim, true)
  assert.ok(fs.existsSync(file + '.bak'), 'second write keeps a .bak')
  assert.ok(fs.statSync(file).mtimeMs >= modified)
  console.log('ok 3 - launch profile read/write/merge stays inside the project')
}

// 4) resolveSelectedPacks: null selects project packs, arrays select any catalog uuid
{
  const projectBp = { uuid: 'bp-project', kind: 'behavior', source: 'project', name: 'BP' }
  const globalBp = { uuid: 'bp-global', kind: 'behavior', source: 'global', name: 'GBP' }
  const projectRp = { uuid: 'rp-project', kind: 'resource', source: 'project', name: 'RP' }
  const catalog = { behavior: [projectBp, globalBp], resource: [projectRp] }
  const defaults = resolveSelectedPacks(catalog, { behaviorPacks: null, resourcePacks: null })
  assert.deepEqual(defaults.behavior.map((entry) => entry.uuid), ['bp-project'])
  assert.deepEqual(defaults.resource.map((entry) => entry.uuid), ['rp-project'])
  assert.deepEqual(defaults.missing, [])
  const picked = resolveSelectedPacks(catalog, { behaviorPacks: ['bp-global', 'gone'], resourcePacks: [] })
  assert.deepEqual(picked.behavior.map((entry) => entry.uuid), ['bp-global'])
  assert.deepEqual(picked.resource, [])
  assert.deepEqual(picked.missing, ['gone'])
  console.log('ok 4 - resolveSelectedPacks distinguishes default, explicit and missing')
}

// 5) world name precedence: profile > .mcdev.json > default
{
  assert.equal(worldNameOf({ world_folder_name: 'FROM_CONFIG' }, { world: 'FROM_PROFILE' }), 'FROM_PROFILE')
  assert.equal(worldNameOf({ world_folder_name: 'FROM_CONFIG' }, { world: '' }), 'FROM_CONFIG')
  assert.equal(worldNameOf({}, {}), 'MC_DEV_WORLD')
  assert.equal(worldNameOf({ world_name: 'LEGACY' }, { world: '   ' }), 'LEGACY')
  console.log('ok 5 - worldNameOf prefers the launch profile')
}

// 6) packCatalog includes the project packs with source=project
{
  const dir = makeProject()
  const catalog = packCatalog(dir, {})
  const projectBp = catalog.behavior.find((entry) => entry.uuid === '11111111-1111-1111-1111-111111111111')
  const projectRp = catalog.resource.find((entry) => entry.uuid === '22222222-2222-2222-2222-222222222222')
  assert.ok(projectBp, 'project behavior pack is catalogued')
  assert.equal(projectBp.source, 'project')
  assert.equal(projectBp.name, 'Test BP')
  assert.ok(projectRp, 'project resource pack is catalogued')
  assert.equal(projectRp.source, 'project')
  console.log('ok 6 - packCatalog lists project behavior/resource packs')
}

// 7) skin files: only PNGs from the configured dir, plus skinDirsOf candidates
{
  const dir = makeProject()
  const skins = path.join(dir, 'skins')
  fs.mkdirSync(skins, { recursive: true })
  fs.writeFileSync(path.join(skins, 'hero.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47]))
  fs.writeFileSync(path.join(skins, 'notes.txt'), 'not a skin')
  const result = skinFiles(dir, { skinsDir: skins })
  const hero = result.files.find((file) => file.name === 'hero.png')
  assert.ok(hero, 'PNG from the configured directory is listed')
  assert.equal(hero.dir, skins)
  assert.ok(!result.files.some((file) => file.name === 'notes.txt'), 'non-PNG files are skipped')
  assert.ok(result.dirs.some((entry) => entry.dir === skins && entry.exists === true))
  assert.ok(skinDirsOf(dir, { skinsDir: skins }).includes(path.join(dir, '.mcdev', 'skins')))
  console.log('ok 7 - skinFiles lists PNGs from the user-selected folder')
}

// 8) the bundle still ships these helpers (guards against a wrong import path)
{
  assert.ok(fs.existsSync(path.join(root, 'lib', 'native', 'launchProfile.js')))
  assert.ok(fs.existsSync(path.join(root, 'lib', 'native', 'launcher.js')))
  console.log('ok 8 - launch profile modules resolve inside the bundle')
}

console.log('8 launch profile tests passed')
