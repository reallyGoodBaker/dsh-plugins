#!/usr/bin/env node
/**
 * Tests for the pack/skin catalog and folder import (file-picker targets).
 *
 *   node scripts/test-catalog.mjs
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import {
  importPack,
  importSkins,
  importedPacksDir,
  importedSkinsDir,
  packCatalog,
  resolveSelectedPacks,
  skinFiles,
} from '../lib/native/catalog.js'

function makeProject() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'mcdev-catalog-'))
}

function writePack(dir, uuid, name) {
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(
    path.join(dir, 'manifest.json'),
    JSON.stringify({ header: { uuid, version: [1, 0, 0], name } }),
  )
  return dir
}

// 1) project packs come from <project>/bp and <project>/rp
{
  const project = makeProject()
  writePack(path.join(project, 'bp'), 'bbbbbbbb-1111-1111-1111-111111111111', 'Project BP')
  writePack(path.join(project, 'rp'), 'cccccccc-1111-1111-1111-111111111111', 'Project RP')
  const catalog = packCatalog(project)
  const bp = catalog.behavior.find((entry) => entry.uuid === 'bbbbbbbb-1111-1111-1111-111111111111')
  const rp = catalog.resource.find((entry) => entry.uuid === 'cccccccc-1111-1111-1111-111111111111')
  assert.ok(bp, 'project behavior pack catalogued')
  assert.equal(bp.source, 'project')
  assert.ok(rp, 'project resource pack catalogued')
  assert.equal(rp.source, 'project')
  console.log('ok 1 - packCatalog lists <project>/bp and <project>/rp')
}

// 2) importPack copies a folder into <project>/.mcdev/packs/<kind> and catalogues it
{
  const project = makeProject()
  const source = writePack(path.join(makeProject(), 'PickedBP'), 'dddddddd-2222-2222-2222-222222222222', 'Picked BP')
  fs.writeFileSync(path.join(source, 'extra.txt'), 'copied too')
  const result = importPack(project, 'behavior', source)
  assert.equal(result.pack.uuid, 'dddddddd-2222-2222-2222-222222222222')
  assert.equal(result.pack.source, 'imported')
  assert.ok(result.dir.startsWith(importedPacksDir(project, 'behavior')))
  assert.ok(fs.existsSync(path.join(result.dir, 'manifest.json')))
  assert.ok(fs.existsSync(path.join(result.dir, 'extra.txt')), 'folder contents are copied recursively')
  const catalog = packCatalog(project)
  const imported = catalog.behavior.find((entry) => entry.uuid === result.pack.uuid)
  assert.ok(imported, 'imported pack is catalogued')
  assert.equal(imported.source, 'imported')
  console.log('ok 2 - importPack copies the chosen folder and catalogues it')
}

// 3) importPack rejects folders without a manifest
{
  const project = makeProject()
  const source = makeProject()
  fs.writeFileSync(path.join(source, 'readme.txt'), 'not a pack')
  assert.throws(() => importPack(project, 'behavior', source), /不是有效的行为包/)
  assert.throws(() => importPack(project, 'behavior', ''), /没有选择/)
  console.log('ok 3 - importPack rejects invalid folders')
}

// 4) importSkins copies PNGs into <project>/.mcdev/skins and dedupes names
{
  const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d])
  const project = makeProject()
  const source = makeProject()
  fs.writeFileSync(path.join(source, 'hero.png'), PNG)
  fs.writeFileSync(path.join(source, 'notes.txt'), 'skip')
  fs.writeFileSync(path.join(source, 'broken.png'), 'not a png')
  const first = importSkins(project, source)
  assert.equal(first.files.length, 1)
  assert.ok(first.files[0].path.startsWith(importedSkinsDir(project)))
  const second = importSkins(project, source)
  assert.equal(second.files.length, 2, 'same file name gets a -2 suffix')
  assert.ok(second.files.some((file) => file.name === 'hero-2.png'))
  assert.equal(skinFiles(project).dir, importedSkinsDir(project))
  assert.throws(() => importSkins(project, makeProject()), /没有有效的 PNG/)
  console.log('ok 4 - importSkins copies real PNGs and rejects broken files')
}

// 5) resolveSelectedPacks: null means project packs, arrays can pick imported/global
{
  const catalog = {
    behavior: [
      { uuid: 'p1', source: 'project' },
      { uuid: 'i1', source: 'imported' },
      { uuid: 'g1', source: 'global' },
    ],
    resource: [{ uuid: 'r1', source: 'project' }],
  }
  const defaults = resolveSelectedPacks(catalog, { behaviorPacks: null, resourcePacks: null })
  assert.deepEqual(defaults.behavior.map((entry) => entry.uuid), ['p1'])
  assert.deepEqual(defaults.resource.map((entry) => entry.uuid), ['r1'])
  assert.deepEqual(defaults.missing, [])
  const picked = resolveSelectedPacks(catalog, { behaviorPacks: ['i1', 'g1', 'gone'], resourcePacks: [] })
  assert.deepEqual(picked.behavior.map((entry) => entry.uuid), ['i1', 'g1'])
  assert.deepEqual(picked.resource, [])
  assert.deepEqual(picked.missing, ['gone'])
  console.log('ok 5 - resolveSelectedPacks distinguishes default, explicit and missing')
}

// 6) imports stay inside the project
{
  const project = makeProject()
  const source = writePack(path.join(makeProject(), 'PickedRP'), 'eeeeeeee-3333-3333-3333-333333333333', 'Picked RP')
  const result = importPack(project, 'resource', source)
  assert.ok(result.dir.startsWith(path.join(project, '.mcdev')))
  assert.ok(!fs.existsSync(path.join(project, 'config.json')))
  console.log('ok 6 - imported packs live under <project>/.mcdev')
}

console.log('6 catalog tests passed')
