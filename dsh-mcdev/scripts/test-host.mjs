#!/usr/bin/env node
/**
 * Host-half unit tests for @local/dsh-mcdev: command parsing, config coercion
 * and base64 bootstrap. Runs without a Harness, the game or the docs corpus.
 *
 *   node scripts/test-host.mjs
 */
import assert from 'node:assert/strict'
import path from 'node:path'
import { DEFAULT_CONFIG, defaultDocsDir, normalizeConfig, pluginRoot } from '../lib/host/config.js'
import { decodeBase64, encodeBase64, flagOf, intOf, parseArgs, tokenize } from '../lib/host/parse.js'

let passed = 0
function test(name, fn) {
  fn()
  passed += 1
  console.log(`ok ${passed} - ${name}`)
}

test('tokenize honours quotes and whitespace', () => {
  assert.deepEqual(tokenize('docs --query "实体 伤害" --limit 5'), ['docs', '--query', '实体 伤害', '--limit', '5'])
  assert.deepEqual(tokenize("exec --code 'print(1)'"), ['exec', '--code', 'print(1)'])
  assert.deepEqual(tokenize('  status   '), ['status'])
})

test('parseArgs separates verb, positionals, options and --json', () => {
  const parsed = parseArgs('--json start --wait 120 --reset --join false')
  assert.equal(parsed.verb, 'start')
  assert.equal(parsed.json, true)
  assert.equal(parsed.options.wait, '120')
  assert.equal(parsed.options.reset, true)
  assert.equal(parsed.options.join, 'false')
  assert.deepEqual(parsed.positionals, [])

  const docs = parseArgs('docs 实体伤害 --limit 5')
  assert.equal(docs.verb, 'docs')
  assert.deepEqual(docs.positionals, ['实体伤害'])
  assert.equal(docs.options.limit, '5')
})

test('flagOf and intOf coerce options', () => {
  assert.equal(flagOf(true), true)
  assert.equal(flagOf('true'), true)
  assert.equal(flagOf('1'), true)
  assert.equal(flagOf('false'), false)
  assert.equal(flagOf(undefined), false)
  assert.equal(intOf('12', 0), 12)
  assert.equal(intOf('nope', 7), 7)
  assert.equal(intOf(undefined, 3), 3)
})

test('base64 round-trips Python snippets with newlines', () => {
  const code = 'import mod.server.extraServerApi as s\nprint("ok")\n'
  assert.equal(decodeBase64(encodeBase64(code)), code)
  assert.equal(decodeBase64(''), '')
})

test('normalizeConfig fills defaults and rejects invalid values', () => {
  const empty = normalizeConfig(undefined)
  assert.deepEqual(empty, DEFAULT_CONFIG)
  const coerced = normalizeConfig({ logLimit: -1, startTimeoutMs: 'x', projectDir: '  C:\\Projects\\tgw ' })
  assert.equal(coerced.logLimit, DEFAULT_CONFIG.logLimit)
  assert.equal(coerced.startTimeoutMs, DEFAULT_CONFIG.startTimeoutMs)
  assert.equal(coerced.projectDir, 'C:\\Projects\\tgw')
  assert.equal(normalizeConfig({ logLimit: 500, startTimeoutMs: 0 }).logLimit, 500)
  assert.equal(normalizeConfig({ startTimeoutMs: 0 }).startTimeoutMs, 0)
})

test('package paths resolve inside the bundle', () => {
  assert.ok(pluginRoot().endsWith(path.join('dsh-plugins', 'dsh-mcdev')))
  assert.equal(defaultDocsDir(), path.join(pluginRoot(), 'docs'))
})

console.log(`\n${passed} host tests passed`)
