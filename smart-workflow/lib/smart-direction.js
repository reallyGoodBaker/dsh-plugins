/**
 * Smart direction — Host half of the `@local/dsh-smart-direction` bundle.
 *
 * Registers three contributions on the Host:
 *  1. the `smart-directions` runtime skill: pre-edit value check plus the direction-card protocol;
 *  2. the always-on `smart-direction:protocol` system-prompt section (order 700);
 *  3. the `smart_direction` action-card kind: a duck-typed `details` validator and a `choose` handler.
 *
 * Plain ESM with zero imports (workspace bundles cannot resolve bare imports), so this file only
 * uses the injected `ctx` services and runtime globals (`crypto`).
 */

export const inject = ['skills', 'systemPrompt', 'actionCards']

/** Card action name, hardcoded by the contract. */
const ACTION = 'smart_direction'
/** Skill that carries the model-facing protocol for this action. */
const SKILL = 'smart-directions'
/** Always-on prompt section name and order. */
const SECTION_NAME = 'smart-direction:protocol'
const SECTION_ORDER = 700

/** Field limits shared by the details validator and the choice payload validator. */
const LIMITS = {
  question: 300,
  label: 120,
  benefit: 300,
  risk: 300,
  hint: 120,
  context: 600,
  options: 8,
  guidance: 2000,
  custom: 4000,
}

/** Option ids are short slugs; anything else is rejected so ids stay addressable in payloads. */
const OPTION_ID = /^[a-z][a-z0-9-]{0,31}$/

/** Pasted-image policy for one card submission (bytes are decoded and committed by the Host). */
const IMAGE_LIMITS = {
  maxCount: 3,
  maxBase64Chars: 2_600_000,
  mediaTypes: ['image/png', 'image/jpeg', 'image/webp', 'image/gif'],
}

/** Cap collected validation issues: enough to correct a proposal, bounded for the error message. */
const MAX_ISSUES = 24

const SKILL_DESCRIPTION =
  'Pre-edit value check before non-trivial code changes, plus a direction card when the user must choose between 2+ viable directions. Load before a non-trivial edit, when resuming a long change, or when the user preference changes the outcome; after loading, the card flow and its propose_action details schema are mandatory.'

const SKILL_WHEN_TO_USE =
  "Use before a non-trivial code change, when resuming a long change, or when 2+ viable directions or the user's preference decide the outcome."

const SKILL_CONTENT = `# Smart directions

Before a non-trivial code change, and when resuming a long change, run a value check. When the user must pick a direction, offer a direction card.

## Value check

Do this before editing files:

1. Restate the goal and the current state of the code.
2. State what already works, with the evidence for it (tests, reads, run output).
3. Estimate the marginal benefit of the next edit against its cost and risk: added complexity, regression surface, review load. If the benefit is low, unproven, or already achieved, do not pile on patches.
4. Decide: keep (the edit is worth it), refactor instead, stop and report, or revert.

Prefer refactoring the affected part over another patch on top. Say in one or two sentences which choice you made.

## Response format

Structure substantive replies instead of writing prose walls:

- Start with a one-line bottom line, then use short \`##\` sections.
- Use bullet lists for enumerations; use a small table only when comparing 3+ items on the same fields.
- Put each option's trade-off on its own labeled line (e.g. \`- 收益: …\` / \`- 风险: …\`) instead of burying it in a paragraph.
- Use a fenced \`yaml block only for a compact machine-readable key/value summary (status, ids, paths, next actions); never wrap the whole reply in YAML.
- The GUI renders headings, lists, tables and code fences as real structures, so prefer them over plain paragraphs whenever information has structure.

## Direction card

When there are 2+ viable directions, or the user's preference changes the outcome, write each direction's benefit and risk plus your recommendation in the answer. Then:

- Call \`skill\` with \`name: "smart-directions"\` in this turn. This is mandatory: \`propose_action\` is refused unless this skill was loaded in the same turn.
- Call \`propose_action\` exactly once with \`action: "smart_direction"\`, a \`title\` and one-sentence \`brief\` in the user's language, and \`details\` in exactly this shape:

\`\`\`json
{
  "question": "Decision question (≤ 300 characters)",
  "options": [
    {
      "id": "slug-id",
      "label": "Option label (≤ 120 characters)",
      "benefit": "One sentence of upside (≤ 300 characters).",
      "risk": "One sentence of downside (≤ 300 characters).",
      "hint": "Optional guidance placeholder (≤ 120 characters)."
    }
  ],
  "allow_multiple": false,
  "allow_custom": true,
  "context": "Optional framing (≤ 600 characters)."
}
\`\`\`

Rules: 1–8 options; each \`id\` is a unique slug matching \`/^[a-z][a-z0-9-]{0,31}$/\`; \`label\`, \`benefit\` and \`risk\` are required; \`allow_multiple\` defaults to false, \`allow_custom\` to true.

- End with at most one short sentence in the user's language inviting the user to choose on the card below and type extra guidance. Do not restate the options.

## Binding rule

The user may select several options and type extra guidance for each option. Treat their selections, guidance and custom direction as binding instructions: never invent or claim a choice the user did not make. If the user dismisses the card, do not offer the same card again.

## Refinement round

After a \`chosen\` record, continue the work with the recorded selections and guidance. Only when that guidance opens a new material sub-choice — for example the chosen direction still needs one concrete decision before editing — offer exactly one refinement card in the same turn: write the sub-choice analysis, load this skill again, and call \`propose_action\` once with a smaller \`smart_direction\` card. Never offer a refinement when the recorded choice is already clear, never chain more than one refinement per user submission, and never re-offer the original options.

## Delegation

\`propose_action\` is refused for subagents. A subagent must put unresolved direction choices in its final result text instead of offering a card.`

const PROTOCOL_TEXT =
  'Smart direction protocol. Before a non-trivial code change, and when resuming a long change, restate the goal and current state, say what already works, and weigh the marginal benefit of the next edit against its cost and risk (complexity, regressions, review load). If the marginal value is low, do not pile on patches: stop and report, or refactor the affected part instead. When a direction choice matters (2+ viable directions, or the user preference changes the outcome), write each direction\'s benefit and risk plus your recommendation in the answer, then load the `smart-directions` skill and call `propose_action` once with `action: "smart_direction"` and that skill\'s details schema, and end with at most one short invitation; do not restate the options. Treat the user selections and per-option guidance as binding, never claim a choice the user did not make, and do not re-offer a dismissed card. After a chosen record, continue with the recorded choices; only if the guidance opens a material sub-choice, offer at most one smaller refinement card in that turn. Subagents cannot call `propose_action`: they report unresolved direction choices in their final result text. Reply format: start with a one-line conclusion, then short sections and bullet lists; give each option a labeled benefit line and risk line; use a fenced ```yaml block only for a compact machine-readable key/value summary; avoid long prose paragraphs because the GUI renders headings, lists and tables as real structures.'

const INVITATION =
  "End with at most one short sentence in the user's language inviting them to choose a direction and type any extra guidance on the card below; do not restate the options."

const STATUS_GUIDANCE =
  'Direction cards: chosen carries data.selected (the option ids the user selected), data.guidance (option id -> the user extra guidance text for that option) and data.custom (a free-form direction the user typed); selections, guidance and custom text are binding instructions for the work. dismissed means the user declined this card: do not offer the same card again in this conversation.'

// ---------------------------------------------------------------------------
// Small shared helpers (no imports: plain runtime values only)
// ---------------------------------------------------------------------------

/** A plain JSON-like object: not null and not an array. */
function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Whether an own property exists (browser-supplied keys such as `toString` stay off inherited members). */
function ownEntry(record, key) {
  return record !== undefined && record !== null && Object.hasOwn(record, key) ? record[key] : undefined
}

/** The refusal every invalid card payload receives. */
function invalidSelection() {
  return { status: 'refused', reason: 'invalid-selection' }
}

/** The settled receipt for one recorded decision. */
function settled(decision) {
  return { status: 'settled', decision }
}

/** Read a required or optional trimmed string field, collecting one issue per violation. */
function readText(value, path, label, max, required, issues) {
  if (value === undefined || value === null) {
    if (required) issues.push({ path, message: `${label} is required` })
    return undefined
  }
  if (typeof value !== 'string') {
    issues.push({ path, message: `${label} must be a string` })
    return undefined
  }
  const text = value.trim()
  if (text.length === 0) {
    if (required) issues.push({ path, message: `${label} must not be empty` })
    return undefined
  }
  if (text.length > max) {
    issues.push({ path, message: `${label} must be at most ${max} characters` })
    return undefined
  }
  return text
}

/**
 * Validate and normalize the model-facing `details` object of a `smart_direction` proposal.
 * @param value - raw details from the `propose_action` arguments.
 * @returns `{success: true, data}` with trimmed strings and explicit defaults, or
 *   `{success: false, error: {issues: [{path, message}]}}` naming the violations.
 */
function parseDetails(value) {
  const issues = []
  if (!isPlainObject(value)) {
    return { success: false, error: { issues: [{ path: [], message: 'details must be an object' }] } }
  }

  const question = readText(value.question, ['question'], 'question', LIMITS.question, true, issues)

  let allowMultiple = false
  if (value.allow_multiple !== undefined && value.allow_multiple !== null) {
    if (typeof value.allow_multiple !== 'boolean') {
      issues.push({ path: ['allow_multiple'], message: 'allow_multiple must be a boolean' })
    } else {
      allowMultiple = value.allow_multiple
    }
  }

  let allowCustom = true
  if (value.allow_custom !== undefined && value.allow_custom !== null) {
    if (typeof value.allow_custom !== 'boolean') {
      issues.push({ path: ['allow_custom'], message: 'allow_custom must be a boolean' })
    } else {
      allowCustom = value.allow_custom
    }
  }

  const context = readText(value.context, ['context'], 'context', LIMITS.context, false, issues)

  const options = []
  if (!Array.isArray(value.options)) {
    issues.push({ path: ['options'], message: 'options must be an array' })
  } else if (value.options.length === 0 || value.options.length > LIMITS.options) {
    issues.push({ path: ['options'], message: `options must contain 1 to ${LIMITS.options} entries` })
  } else {
    const seen = new Set()
    for (let index = 0; index < value.options.length && issues.length < MAX_ISSUES; index += 1) {
      const raw = value.options[index]
      const path = ['options', index]
      if (!isPlainObject(raw)) {
        issues.push({ path, message: 'option must be an object' })
        continue
      }
      const id = readText(raw.id, [...path, 'id'], 'option id', 32, true, issues)
      if (id !== undefined) {
        if (!OPTION_ID.test(id)) {
          issues.push({ path: [...path, 'id'], message: 'option id must be a slug matching /^[a-z][a-z0-9-]{0,31}$/' })
        } else if (seen.has(id)) {
          issues.push({ path: [...path, 'id'], message: `duplicate option id "${id}"` })
        } else {
          seen.add(id)
        }
      }
      const label = readText(raw.label, [...path, 'label'], 'option label', LIMITS.label, true, issues)
      const benefit = readText(raw.benefit, [...path, 'benefit'], 'option benefit', LIMITS.benefit, true, issues)
      const risk = readText(raw.risk, [...path, 'risk'], 'option risk', LIMITS.risk, true, issues)
      const hint = readText(raw.hint, [...path, 'hint'], 'option hint', LIMITS.hint, false, issues)
      if (id !== undefined && label !== undefined && benefit !== undefined && risk !== undefined) {
        options.push(hint === undefined ? { id, label, benefit, risk } : { id, label, benefit, risk, hint })
      }
    }
  }

  if (issues.length > 0) return { success: false, error: { issues } }
  return {
    success: true,
    data: {
      question,
      options,
      allow_multiple: allowMultiple,
      allow_custom: allowCustom,
      ...(context === undefined ? {} : { context }),
    },
  }
}

/** The duck-typed details validator the action-cards service calls (`safeParse` only). */
const DETAILS_SCHEMA = {
  safeParse(value) {
    try {
      return parseDetails(value)
    } catch {
      return { success: false, error: { issues: [{ path: [], message: 'details could not be validated' }] } }
    }
  },
}

/**
 * Validate one `choose` payload against the normalized proposal details.
 * Selections must name known option ids; guidance for unknown options and non-string
 * guidance values are dropped; oversized essential fields invalidate the whole payload.
 * Optional pasted images travel as base64 payloads and are returned separately so they never
 * enter the durable decision data.
 * @param payload - raw browser payload.
 * @param details - normalized details of the card's proposal.
 * @returns `{ok: true, data, images}` with only non-empty fields, or `{ok: false}`.
 */
function parseChoice(payload, details) {
  if (!isPlainObject(payload)) return { ok: false }
  const known = new Set(details.options.map((option) => option.id))
  const data = {}

  if (payload.selected !== undefined) {
    if (!Array.isArray(payload.selected)) return { ok: false }
    const selected = []
    for (const raw of payload.selected) {
      if (typeof raw !== 'string') return { ok: false }
      const id = raw.trim()
      if (!known.has(id)) return { ok: false }
      if (!selected.includes(id)) selected.push(id)
    }
    if (selected.length > 0) data.selected = selected
  }

  if (payload.guidance !== undefined && payload.guidance !== null) {
    if (!isPlainObject(payload.guidance)) return { ok: false }
    const guidance = {}
    for (const key of Object.keys(payload.guidance)) {
      if (!known.has(key)) continue
      const value = payload.guidance[key]
      if (typeof value !== 'string') continue
      const text = value.trim()
      if (text.length === 0) continue
      if (text.length > LIMITS.guidance) return { ok: false }
      guidance[key] = text
    }
    if (Object.keys(guidance).length > 0) data.guidance = guidance
  }

  if (payload.custom !== undefined && payload.custom !== null) {
    if (typeof payload.custom !== 'string') return { ok: false }
    const custom = payload.custom.trim()
    if (custom.length > LIMITS.custom) return { ok: false }
    if (custom.length > 0) data.custom = custom
  }

  const images = []
  if (payload.images !== undefined && payload.images !== null) {
    if (!Array.isArray(payload.images)) return { ok: false }
    if (payload.images.length > IMAGE_LIMITS.maxCount) return { ok: false }
    const knownTargets = new Set([...details.options.map((option) => option.id), 'custom'])
    for (const raw of payload.images) {
      if (!isPlainObject(raw)) return { ok: false }
      const mediaType = typeof raw.mediaType === 'string' ? raw.mediaType : ''
      const encoded = typeof raw.data === 'string' ? raw.data : ''
      if (!IMAGE_LIMITS.mediaTypes.includes(mediaType)) return { ok: false }
      if (encoded.length === 0 || encoded.length > IMAGE_LIMITS.maxBase64Chars) return { ok: false }
      if (!/^[A-Za-z0-9+/=\r\n]+$/.test(encoded)) return { ok: false }
      const target = typeof raw.target === 'string' && knownTargets.has(raw.target) ? raw.target : 'custom'
      const name = typeof raw.name === 'string' && raw.name.trim() !== '' ? raw.name.trim().slice(0, 120) : undefined
      images.push(name === undefined ? { mediaType, data: encoded, target } : { mediaType, data: encoded, target, name })
    }
  }

  // A choice must bind at least one direction: a selection or a custom direction.
  if (data.selected === undefined && data.custom === undefined) return { ok: false }
  return images.length === 0 ? { ok: true, data } : { ok: true, data, images }
}

/**
 * Render the structured record of a card choice for the woken conversation.
 * The first line is a stable marker that the browser half recognizes; the `card:` line is
 * machine-readable JSON; the last line tells the model how to continue. Plain-text renderers
 * that do not know the marker still show a readable, structured record.
 */
function choiceSummary(title, details, data) {
  const labels = new Map(details.options.map((option) => [option.id, option.label]))
  const labelOf = (id) => (labels.has(id) ? labels.get(id) : id)
  const record = {
    status: 'chosen',
    selected: data.selected === undefined ? [] : data.selected.map((id) => ({ id, label: labelOf(id) })),
    guidance:
      data.guidance === undefined
        ? []
        : Object.keys(data.guidance).map((id) => ({ id, label: labelOf(id), text: data.guidance[id] })),
    custom: data.custom === undefined ? '' : data.custom,
  }
  if (typeof title === 'string' && title.length > 0) record.title = title
  if (Array.isArray(data.images) && data.images.length > 0) record.images = data.images
  return ['Direction card recorded', 'card: ' + JSON.stringify(record), 'next: continue the task using these choices'].join(
    '\n',
  )
}

/** Stable message id; the runtime provides `crypto.randomUUID`, the fallback keeps us alive without it. */
function newMessageId() {
  try {
    if (typeof globalThis.crypto?.randomUUID === 'function') return globalThis.crypto.randomUUID()
  } catch {
    // fall through to the local generator
  }
  const hex = () => Math.floor(Math.random() * 0x100000000).toString(16).padStart(8, '0')
  return `${hex()}-${hex().slice(0, 4)}-4${hex().slice(1, 4)}-a${hex().slice(1, 4)}-${hex()}${hex().slice(0, 4)}`
}

/** Author one user-role message that wakes the conversation after a card choice. */
function continuationMessage(text, imageBlocks = []) {
  return {
    id: newMessageId(),
    role: 'user',
    content: [{ type: 'text', text }, ...imageBlocks],
    source: { kind: 'user' },
  }
}

/**
 * Resolve pasted base64 images through the Host attachment service so they become durable,
 * model-visible image blocks. Never throws: a failure is reported to the caller.
 * @param ctx - plugin context carrying the optional `attachments` service.
 * @param images - validated base64 images from the card payload.
 * @returns `{blocks, failure}` with image content blocks, or a failure string.
 */
async function saveCardImages(ctx, images) {
  const service = typeof ctx.get === 'function' ? ctx.get('attachments') : undefined
  if (service === undefined || typeof service.saveImages !== 'function') {
    return { blocks: [], failure: 'attachments-unavailable' }
  }
  try {
    const inputs = images.map((image) => ({
      data: new Uint8Array(Buffer.from(image.data, 'base64')),
      mediaType: image.mediaType,
      ...(image.name === undefined ? {} : { name: image.name }),
    }))
    const refs = await service.saveImages(inputs)
    return { blocks: refs.map((ref) => ({ type: 'image', attachment: ref })), failure: undefined }
  } catch (error) {
    return { blocks: [], failure: String((error && error.message) || error) }
  }
}

/** Session id of one agent (`Agent.id` is the SessionId); tolerate test doubles with session.id. */
function sessionIdOf(agent) {
  if (agent !== undefined && agent !== null && typeof agent.id === 'string') return agent.id
  if (agent !== undefined && agent !== null && agent.session !== undefined && typeof agent.session.id === 'string') return agent.session.id
  return undefined
}

/** Log through the plugin logger when the Host provides one; never let logging break a card action. */
function warn(ctx, message, ...args) {
  try {
    ctx.logger?.warn(message, ...args.map((value) => String(value)))
  } catch {
    // logging is best effort
  }
}

/**
 * Read the optional per-session setup preferences published by the checkpoint plugin.
 * Missing service means "no per-session overrides", which keeps this plugin standalone.
 * @param ctx - plugin context.
 * @param sessionId - owning session id.
 * @returns `{smartDirection, autoContinue}` or undefined when unavailable.
 */
function sessionSetupEffective(ctx, sessionId) {
  try {
    const service = typeof ctx.get === 'function' ? ctx.get('sessionSetup') : undefined
    if (service !== undefined && typeof service.effectiveFor === 'function') return service.effectiveFor(sessionId)
  } catch (error) {
    return undefined
  }
  return undefined
}

// ---------------------------------------------------------------------------
// Plugin
// ---------------------------------------------------------------------------

/**
 * Register the skill, the prompt section and the action-card kind.
 * @param ctx - owning plugin context with `skills`, `systemPrompt` and `actionCards`.
 * @param config - row config: `protocol` toggles the prompt section, `autoContinue` wakes the agent.
 */
export function applySmartDirection(ctx, config = {}, options = {}) {
  const protocol = config.protocol !== false
  const autoContinue = config.autoContinue !== false

  ctx.effect(
    () =>
      ctx.skills.register({
        name: SKILL,
        description: SKILL_DESCRIPTION,
        whenToUse: SKILL_WHEN_TO_USE,
        content: SKILL_CONTENT,
        invocation: { modelInvocable: true, userInvocable: false },
        source: 'runtime',
        provider: 'smart-direction',
      }),
    'smart-direction: skill',
  )

  if (protocol) {
    ctx.effect(
      () =>
        ctx.systemPrompt.section({
          name: SECTION_NAME,
          order: SECTION_ORDER,
          // Per-session setup (checkpoint plugin) can disable the protocol for one session.
          text: (context) => {
            if (context === undefined || context.agent === undefined) return PROTOCOL_TEXT
            const effective = sessionSetupEffective(ctx, sessionIdOf(context.agent))
            if (effective !== undefined && effective.smartDirection === 'off') return ''
            return PROTOCOL_TEXT
          },
        }),
      'smart-direction: protocol',
    )
  }

  const kind = {
    action: ACTION,
    skill: SKILL,
    details: DETAILS_SCHEMA,
    invitation: INVITATION,
    verbs: { choose: {} },
    openPhases: [],
    statusGuidance: STATUS_GUIDANCE,
    statusFields: ['selected', 'guidance', 'custom'],
    async act(agent, proposal, verb, payload) {
      if (verb !== 'choose') return { status: 'refused', reason: 'unavailable' }
      let recorded
      try {
        const decisions = ctx.actionCards.view(agent.session).decisions
        const previous = ownEntry(decisions, proposal.callId)
        // Idempotent: a card records one decision; a repeated submission returns the first one.
        if (previous !== undefined) return settled(previous)

        const sessionPrefs = sessionSetupEffective(ctx, sessionIdOf(agent))
        if (sessionPrefs !== undefined && sessionPrefs.smartDirection === 'off') {
          return { status: 'refused', reason: 'disabled-for-session' }
        }
        const autoContinueForSession =
          sessionPrefs !== undefined && typeof sessionPrefs.autoContinue === 'boolean' ? sessionPrefs.autoContinue : autoContinue

        const choice = parseChoice(payload, proposal.details)
        if (!choice.ok) return invalidSelection()

        const recordData = { ...choice.data }
        if (choice.images !== undefined) {
          const labels = new Map(proposal.details.options.map((option) => [option.id, option.label]))
          recordData.images = choice.images.map((image) =>
            image.name === undefined
              ? {
                  target: image.target,
                  label: image.target === 'custom' ? 'custom' : labels.get(image.target) || image.target,
                  mediaType: image.mediaType,
                }
              : {
                  target: image.target,
                  label: image.target === 'custom' ? 'custom' : labels.get(image.target) || image.target,
                  name: image.name,
                  mediaType: image.mediaType,
                },
          )
        }
        const decision = { callId: proposal.callId, action: ACTION, phase: 'chosen', data: recordData }
        ctx.actionCards.record(agent, decision)
        recorded = decision

        // Every direction-card form submission records a workspace checkpoint.
        let checkpointNote = ''
        if (typeof options.onCardChosen === 'function') {
          try {
            const created = await options.onCardChosen(agent, { title: proposal.title, callId: proposal.callId })
            if (created !== null && created !== undefined && created.checkpoint !== undefined) {
              const checkpoint = created.checkpoint
              const committed = checkpoint.git !== null && checkpoint.git !== undefined && checkpoint.git.committed === true
              checkpointNote = '\ncheckpoint: ' + checkpoint.id + (committed ? ' (committed)' : '')
            }
          } catch (error) {
            warn(ctx, 'smart-direction: checkpoint for card %s failed: %s', proposal.callId, error)
          }
        }

        if (autoContinueForSession) {
          let blocks = []
          let imageNote = ''
          if (choice.images !== undefined) {
            const saved = await saveCardImages(ctx, choice.images)
            blocks = saved.blocks
            if (saved.failure !== undefined) {
              imageNote = `\nimages: ${choice.images.length} pasted image(s) could not be attached (${saved.failure})`
              warn(ctx, 'smart-direction: pasted images could not be attached for %s: %s', proposal.callId, saved.failure)
            }
          }
          const text = choiceSummary(proposal.title, proposal.details, recordData) + imageNote + checkpointNote
          try {
            agent.followup(continuationMessage(text, blocks))
          } catch (error) {
            // A route or inbox that refuses image blocks still gets the structured text record.
            if (blocks.length > 0) {
              try {
                agent.followup(continuationMessage(text))
              } catch (retryError) {
                warn(ctx, 'smart-direction: could not wake the agent after card %s: %s', proposal.callId, retryError)
              }
            } else {
              warn(ctx, 'smart-direction: could not wake the agent after card %s: %s', proposal.callId, error)
            }
          }
        }
        return settled(decision)
      } catch (error) {
        warn(ctx, 'smart-direction: card action failed for %s: %s', proposal.callId, error)
        return recorded !== undefined ? settled(recorded) : { status: 'unconfirmed', reason: 'operation-error' }
      }
    },
  }

  ctx.effect(() => ctx.actionCards.register(kind), 'smart-direction: action kind')
}
