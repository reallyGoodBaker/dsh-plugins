#!/usr/bin/env node
/**
 * Keep the browser panel's inline locale dictionaries and the bundle's
 * `locale/*.json` display resources in sync.
 *
 * The Client half cannot import JSON through the module loader's `require`
 * face, so it inlines `en`/`zh`; `locale/*.json` is what Plugin Manager reads
 * for display metadata and doubles as the documented dictionary copy. This
 * test extracts the inline literals from `lib/client.js` and compares them with
 * `locale/en.json` / `locale/zh.json` (`panel` object).
 *
 *   node scripts/test-locale-parity.mjs
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(fileURLToPath(new URL('..', import.meta.url)))
const clientSource = fs.readFileSync(path.join(root, 'lib', 'client.js'), 'utf8')

/**
 * Extract one `const <name> = { ... };` object literal from the client source.
 * @param {string} name - dictionary variable name (`en` or `zh`).
 * @returns {Record<string, string>}
 */
function extractDictionary(name) {
  const marker = `const ${name} = {`
  const start = clientSource.indexOf(marker)
  assert.ok(start >= 0, `missing ${name} dictionary in lib/client.js`)
  let index = start + marker.length - 1
  let depth = 0
  let quote = ''
  let end = -1
  for (; index < clientSource.length; index += 1) {
    const char = clientSource[index]
    if (quote !== '') {
      if (char === '\\') {
        index += 1
        continue
      }
      if (char === quote) quote = ''
      continue
    }
    if (char === '"' || char === "'" || char === '`') {
      quote = char
      continue
    }
    if (char === '{') depth += 1
    else if (char === '}') {
      depth -= 1
      if (depth === 0) {
        end = index + 1
        break
      }
    }
  }
  assert.ok(end > start, `unterminated ${name} dictionary`)
  const literal = clientSource.slice(start + marker.length - 1, end)
  // The literal only contains string keys and string values; Function keeps the
  // evaluation local and throws on anything unexpected instead of running code.
  return new Function(`return (${literal})`)()
}

/** Read one locale resource's panel dictionary. */
function readLocale(name) {
  const file = path.join(root, 'locale', `${name}.json`)
  const parsed = JSON.parse(fs.readFileSync(file, 'utf8'))
  assert.ok(parsed.meta && typeof parsed.meta.title === 'string' && parsed.meta.title !== '', `${name}.json needs meta.title`)
  assert.ok(
    parsed.meta && typeof parsed.meta.description === 'string' && parsed.meta.description !== '',
    `${name}.json needs meta.description`,
  )
  assert.ok(parsed.panel && typeof parsed.panel === 'object', `${name}.json needs a panel dictionary`)
  return parsed
}

const clientEn = extractDictionary('en')
const clientZh = extractDictionary('zh')
const fileEn = readLocale('en')
const fileZh = readLocale('zh')

const clientKeys = Object.keys(clientEn).sort()
const zhKeys = Object.keys(clientZh).sort()
assert.deepEqual(zhKeys, clientKeys, 'inline en/zh key sets must match')
assert.deepEqual(Object.keys(fileEn.panel).sort(), clientKeys, 'locale/en.json panel must match lib/client.js en keys')
assert.deepEqual(Object.keys(fileZh.panel).sort(), clientKeys, 'locale/zh.json panel must match lib/client.js zh keys')

for (const key of clientKeys) {
  assert.equal(typeof clientEn[key], 'string', `en.${key} must be a string`)
  assert.equal(typeof clientZh[key], 'string', `zh.${key} must be a string`)
  assert.equal(fileEn.panel[key], clientEn[key], `locale/en.json ${key} differs from lib/client.js`)
  assert.equal(fileZh.panel[key], clientZh[key], `locale/zh.json ${key} differs from lib/client.js`)
  const enPlaceholders = (clientEn[key].match(/\{\w+\}/g) ?? []).sort()
  const zhPlaceholders = (clientZh[key].match(/\{\w+\}/g) ?? []).sort()
  assert.deepEqual(zhPlaceholders, enPlaceholders, `placeholder mismatch for ${key}`)
}

console.log(`ok - ${clientKeys.length} panel keys match in lib/client.js, locale/en.json and locale/zh.json`)
console.log('locale parity passed')
