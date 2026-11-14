#!/usr/bin/env node
/**
 * Shape tests for the browser panel's command-payload helpers.
 *
 * `lib/client.js` is a browser module (`window.__ModuleLoader__`), so the test
 * extracts the pure helpers from its source and exercises both payload shapes:
 * the Host's uniform `{ ok, ... }` envelope and the bare documented shape.
 * This is the regression test for the earlier defect where the panel showed
 * "未知" plus a raw JSON blob because it read `data.phase` and `data.lines`
 * from the envelope instead of the unwrapped payload.
 *
 *   node scripts/test-client-shapes.mjs
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(fileURLToPath(new URL('..', import.meta.url)))
const source = fs.readFileSync(path.join(root, 'lib', 'client.js'), 'utf8')

/**
 * Extract one `function name(...) { ... }` declaration by balanced braces.
 * @param {string} name - function name.
 * @returns {string} the declaration source.
 */
function extractFunction(name) {
  const start = source.indexOf(`function ${name}(`)
  assert.ok(start >= 0, `missing function ${name} in lib/client.js`)
  let depth = 0
  let index = source.indexOf('{', start)
  assert.ok(index > start, `missing body for ${name}`)
  const bodyStart = index
  for (; index < source.length; index += 1) {
    const char = source[index]
    if (char === '{') depth += 1
    else if (char === '}') {
      depth -= 1
      if (depth === 0) return source.slice(start, index + 1)
    }
  }
  throw new Error(`unterminated function ${name} (body started at ${bodyStart})`)
}

const preamble = ['firstLine', 'statusOf', 'logDataOf', 'messageOf', 'selectMainSession']
  .map(extractFunction)
  .join('\n')
const helpers = new Function(`${preamble}\nreturn { firstLine, statusOf, logDataOf, messageOf, selectMainSession };`)()
const { statusOf, logDataOf, messageOf, selectMainSession } = helpers

let passed = 0
function test(name, fn) {
  fn()
  passed += 1
  console.log(`ok ${passed} - ${name}`)
}

test('statusOf unwraps the Host envelope', () => {
  const status = { phase: 'ready', ready: true, pid: 3036, projectDir: 'C:\\Projects\\tgw' }
  assert.equal(statusOf({ ok: true, status }).phase, 'ready')
  assert.equal(statusOf({ ok: true, status }).ready, true)
})

test('statusOf accepts a bare Status', () => {
  assert.equal(statusOf({ phase: 'launching', ready: false }).phase, 'launching')
})

test('statusOf rejects payloads without a phase', () => {
  assert.equal(statusOf(undefined), undefined)
  assert.equal(statusOf(null), undefined)
  assert.equal(statusOf({ ok: true }), undefined)
  assert.equal(statusOf({ ok: false, error: 'boom' }), undefined)
  assert.equal(statusOf('text'), undefined)
})

test('logDataOf unwraps the nested launcher log', () => {
  const logs = { lines: [{ seq: 3, text: 'x' }], next: 4, skipped: 0 }
  assert.deepEqual(logDataOf({ ok: true, source: 'launcher', logs }), logs)
  assert.deepEqual(logDataOf(logs), logs)
  assert.equal(logDataOf(undefined), undefined)
})

test('messageOf prefers the payload error over the raw JSON text', () => {
  const result = { kind: 'error', text: '{"ok":false,"error":"MCP 端口被占用"}', data: { ok: false, error: 'MCP 端口被占用' } }
  assert.equal(messageOf(result, 'fallback'), 'MCP 端口被占用')
})

test('messageOf falls back to the first line, then the fallback text', () => {
  assert.equal(messageOf({ kind: 'error', text: '\n\n第一行\n第二行', data: undefined }, 'fallback'), '第一行')
  assert.equal(messageOf({ kind: 'error', text: '', data: undefined }, 'fallback'), 'fallback')
  assert.equal(messageOf(undefined, 'fallback'), 'fallback')
})

test('selectMainSession prefers the main-view session', () => {
  const list = {
    byId: {
      a: { id: 'a', retainedBy: { mainView: 0 }, updatedAt: 900 },
      b: { id: 'b', retainedBy: { mainView: 2 }, updatedAt: 100 },
    },
  }
  assert.equal(selectMainSession(list), 'b')
})

test('selectMainSession falls back to the most recently updated session', () => {
  const list = {
    byId: {
      older: { id: 'older', retainedBy: { mainView: 0 }, updatedAt: 100 },
      newer: { id: 'newer', retainedBy: { mainView: 0 }, updatedAt: 900 },
    },
  }
  assert.equal(selectMainSession(list), 'newer', 'the floating panel must not disappear before a main view exists')
})

test('selectMainSession tolerates empty or malformed lists', () => {
  assert.equal(selectMainSession(undefined), undefined)
  assert.equal(selectMainSession(null), undefined)
  assert.equal(selectMainSession({}), undefined)
  assert.equal(selectMainSession({ byId: { x: { id: 'x' }, y: null } }), 'x')
})

console.log(`\n${passed} client shape tests passed`)
