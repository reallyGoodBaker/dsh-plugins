/**
 * `/mcdev` command-line parsing.
 *
 * Grammar: `[--json] <verb> [positional...] [--key value | --key=value | --flag]`
 * Values may be double- or single-quoted; `--code-b64=<urlsafe base64>` exists
 * because Python snippets are impractical to quote through a command line.
 */

/**
 * Split one command input into whitespace-separated tokens, honouring quotes.
 * @param {string} input - raw command input (without the leading `/mcdev`).
 * @returns {string[]}
 */
export function tokenize(input) {
  const text = typeof input === 'string' ? input : ''
  const tokens = []
  let current = ''
  let quote = ''
  let started = false
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]
    if (quote !== '') {
      if (char === quote) {
        quote = ''
      } else if (char === '\\' && quote === '"' && index + 1 < text.length) {
        index += 1
        current += text[index]
      } else {
        current += char
      }
      continue
    }
    if (char === '"' || char === "'") {
      quote = char
      started = true
      continue
    }
    if (/\s/.test(char)) {
      if (started || current.length > 0) {
        tokens.push(current)
        current = ''
        started = false
      }
      continue
    }
    current += char
    started = true
  }
  if (started || current.length > 0) tokens.push(current)
  return tokens
}

/**
 * Parse one `/mcdev` input into a verb, positional arguments and option values.
 * Option values are strings; repeated options keep the last value; a bare flag
 * becomes `true`.
 * @param {string} input - raw command input.
 * @returns {{ verb: string, positionals: string[], options: Record<string, string|boolean>, json: boolean }}
 */
export function parseArgs(input) {
  const tokens = tokenize(input)
  const options = {}
  const positionals = []
  let json = false
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index]
    if (token === '--json') {
      json = true
      continue
    }
    if (token.startsWith('--')) {
      const body = token.slice(2)
      if (body.length === 0) continue
      const equals = body.indexOf('=')
      if (equals > 0) {
        options[body.slice(0, equals)] = body.slice(equals + 1)
        continue
      }
      const next = tokens[index + 1]
      if (next !== undefined && !next.startsWith('--')) {
        options[body] = next
        index += 1
      } else {
        options[body] = true
      }
      continue
    }
    positionals.push(token)
  }
  const verb = positionals.length > 0 ? positionals[0].toLowerCase() : 'help'
  return { verb, positionals: positionals.slice(1), options, json }
}

/** Interpret an option as a boolean flag. */
export function flagOf(value) {
  if (value === true) return true
  if (typeof value !== 'string') return false
  return value === '' || value === '1' || value === 'true' || value === 'yes' || value === 'on'
}

/** Interpret an option as an integer, or `fallback`. */
export function intOf(value, fallback) {
  const parsed = typeof value === 'string' ? Number.parseInt(value, 10) : Number.NaN
  return Number.isInteger(parsed) ? parsed : fallback
}

/** Decode a base64 (or base64url) UTF-8 payload. */
export function decodeBase64(value) {
  if (typeof value !== 'string' || value.length === 0) return ''
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/')
  return Buffer.from(normalized, 'base64').toString('utf8')
}

/** Encode a UTF-8 payload as base64url (used by tests and the panel). */
export function encodeBase64(value) {
  return Buffer.from(String(value), 'utf8').toString('base64url')
}
