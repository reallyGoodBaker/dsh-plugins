#!/usr/bin/env node
/**
 * Unit tests for the native provider's shared utilities: the log ring buffer
 * (cursor semantics the panel and the agent both rely on), `.mcdev.json`
 * merging/backup and game-version discovery.
 *
 *   node scripts/test-native-util.mjs
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  CONFIG_DEFAULTS,
  LogBuffer,
  configPathOf,
  findGameVersions,
  findProcessUsingWorld,
  isPlainObject,
  readConfigWithDefaults,
  writeMergedConfig,
} from '../lib/native/util.js'

let passed = 0
function test(name, fn) {
  fn()
  passed += 1
  console.log(`ok ${passed} - ${name}`)
}

test('LogBuffer assigns increasing seq and returns the latest window', () => {
  const buffer = new LogBuffer(100)
  for (let index = 1; index <= 5; index += 1) buffer.pushLine(`line ${index}`)
  const result = buffer.query({ limit: 2 })
  assert.deepEqual(result.lines.map((line) => line.text), ['line 4', 'line 5'])
  assert.equal(result.next, 6)
  assert.equal(result.skipped, 0)
})

test('LogBuffer `since` is strict and reports skipped lines after eviction', () => {
  const buffer = new LogBuffer(50)
  for (let index = 1; index <= 10; index += 1) buffer.pushLine(`line ${index}`)
  const tail = buffer.query({ since: 8 })
  assert.deepEqual(tail.lines.map((line) => line.seq), [9, 10])
  const beyond = buffer.query({ since: 10 })
  assert.equal(beyond.lines.length, 0)
  assert.equal(beyond.next, 11)
  // Force eviction of the first lines, then ask from a stale cursor.
  for (let index = 11; index <= 80; index += 1) buffer.pushLine(`line ${index}`)
  const stale = buffer.query({ since: 1 })
  assert.ok(stale.skipped > 0, 'skipped must report evicted lines')
})

test('LogBuffer strips ANSI, tags stderr and filters errors/grep', () => {
  const buffer = new LogBuffer(100)
  buffer.pushLine('\u001b[31m[ERROR] boom\u001b[0m')
  buffer.pushLine('hello world', 'stdout')
  buffer.pushLine('Traceback (most recent call last):', 'stderr')
  const errors = buffer.query({ errors: true })
  assert.equal(errors.lines.length, 2)
  assert.ok(errors.lines.every((line) => !line.text.includes('\u001b')))
  const grepped = buffer.query({ grep: 'HELLO' })
  assert.deepEqual(grepped.lines.map((line) => line.text), ['hello world'])
})

test('LogBuffer onLine notifies and unsubscribes', () => {
  const buffer = new LogBuffer(10)
  const seen = []
  const off = buffer.onLine((line) => seen.push(line.text))
  buffer.pushLine('a')
  off()
  buffer.pushLine('b')
  assert.deepEqual(seen, ['a'])
})

test('.mcdev.json defaults apply when the file is missing (and nothing is written)', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mcdev-cfg-'))
  try {
    const config = readConfigWithDefaults(dir)
    assert.equal(config.world_folder_name, CONFIG_DEFAULTS.world_folder_name)
    assert.equal(fs.existsSync(configPathOf(dir)), false, 'read must not create the file')
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('.mcdev.json merge keeps unknown keys and backs up before writing', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mcdev-cfg-'))
  try {
    const file = configPathOf(dir)
    fs.writeFileSync(file, JSON.stringify({ world_folder_name: 'CUSTOM', custom_key: 7, skin_info: { slim: true } }), 'utf8')
    const merged = readConfigWithDefaults(dir)
    assert.equal(merged.world_folder_name, 'CUSTOM')
    assert.equal(merged.custom_key, 7)
    assert.equal(merged.skin_info.slim, true)
    assert.equal(merged.skin_info.skin, '', 'defaults fill missing nested keys')
    const { config, backupPath } = writeMergedConfig(dir, { world_folder_name: 'NEXT', skin_info: { skin: 'x.png' } })
    assert.equal(config.world_folder_name, 'NEXT')
    assert.equal(config.skin_info.skin, 'x.png')
    assert.equal(config.skin_info.slim, true, 'deep merge preserves the other nested key')
    assert.equal(config.custom_key, 7, 'unknown keys survive a write')
    assert.ok(fs.existsSync(backupPath), 'backup file exists')
    const onDisk = JSON.parse(fs.readFileSync(file, 'utf8'))
    assert.equal(onDisk.world_folder_name, 'NEXT')
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('isPlainObject rejects arrays and null', () => {
  assert.equal(isPlainObject({}), true)
  assert.equal(isPlainObject([]), false)
  assert.equal(isPlainObject(null), false)
})

test('findGameVersions returns newest first and tolerates a missing root', () => {
  const result = findGameVersions()
  assert.ok(typeof result.baseDir === 'string' && result.baseDir.length > 0)
  assert.ok(Array.isArray(result.versions))
  const parts = (value) => String(value).split('.').map((part) => Number.parseInt(part, 10) || 0)
  for (let index = 1; index < result.versions.length; index += 1) {
    const previous = parts(result.versions[index - 1].version)
    const current = parts(result.versions[index].version)
    let comparison = 0
    for (let part = 0; part < Math.max(previous.length, current.length); part += 1) {
      const diff = (previous[part] ?? 0) - (current[part] ?? 0)
      if (diff !== 0) {
        comparison = diff
        break
      }
    }
    assert.ok(comparison > 0, `versions must be newest first: ${result.versions[index - 1].version} before ${result.versions[index].version}`)
  }
  const original = process.env.MCDEV_GAME_DIR
  process.env.MCDEV_GAME_DIR = path.join(os.tmpdir(), 'mcdev-no-such-game-dir')
  try {
    const empty = findGameVersions()
    assert.deepEqual(empty.versions, [])
  } finally {
    if (original === undefined) delete process.env.MCDEV_GAME_DIR
    else process.env.MCDEV_GAME_DIR = original
  }
})

test('findProcessUsingWorld matches the world directory and skips our own pid', () => {
  const world = 'C:\\Users\\tester\\AppData\\Roaming\\MinecraftPE_Netease\\minecraftWorlds\\MC_DEV_WORLD'
  const processes = [
    {
      pid: 10,
      commandLine:
        '"C:\\MCStudioDownload\\game\\MinecraftPE_Netease\\3.10.0.436581\\Minecraft.Windows.exe" chatExtension=false config="C:/Users/tester/AppData/Roaming/MinecraftPE_Netease/minecraftWorlds/MC_DEV_WORLD/dev_config.cppconfig"',
    },
    {
      pid: 20,
      commandLine:
        '"C:\\MCStudioDownload\\game\\MinecraftPE_Netease\\3.10.0.448891\\Minecraft.Windows.exe" config="C:/MCStudioDownload/game/config/x/Cpp/MC_GAME/abc.cppconfig"',
    },
  ]
  assert.equal(findProcessUsingWorld(processes, world, 0)?.pid, 10)
  assert.equal(findProcessUsingWorld(processes, world, 10), undefined, 'our own client is ignored')
  assert.equal(findProcessUsingWorld(processes, 'D:\\other\\world', 0), undefined)
  assert.equal(findProcessUsingWorld([], world, 0), undefined)
  assert.equal(findProcessUsingWorld(processes, '', 0), undefined)
})

console.log(`\n${passed} native util tests passed`)
