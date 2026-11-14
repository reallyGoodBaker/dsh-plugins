# Smart Direction — implementation contract (V1)

Bundle directory: `smart-direction`
Package name (also the Client module id, must match exactly): `@local/dsh-smart-direction`

Two implementation files are owned by different writers:

| File | Owner | Contents |
|---|---|---|
| `index.js` | host-core teammate | Cordis Host plugin: skill, system-prompt section, action-card kind |
| `client.js` | client-ui teammate | Browser plugin: action-card body with per-option guidance inputs |

Nobody edits the other writer's file. The Lead owns `package.json`, `cordis.patch.yml`, `locale/*.json`, `icon.svg`, `README.md` and runs installation.

## Fixed identifiers (hardcode in both halves, never configurable)

- action name: `smart_direction`
- skill name: `smart-directions`
- client locale namespace: `smartDirection`
- host prompt section name: `smart-direction:protocol`, order `700`
- host plugin package name: `@local/dsh-smart-direction`

## How the feature is supposed to work

DSH ships a Host service `actionCards` (`@deepseek-ai/dsh-action-cards`) plus its browser
half (`@deepseek-ai/dsh-client-ui-action-cards`). A Host plugin registers a *card kind*
(action + skill + details validator + verbs + handler). The model loads the kind's skill
through the `skill` tool, then calls `propose_action` once. After the turn ends with answer
text, the browser renders the card under the answer; the kind's client body is what draws
the controls. A user action arrives at the Host as the kind's `act` handler, which records
a decision with `ctx.actionCards.record(...)`; the next model request reports it as a status
notice. The card frame itself is shipped; neither half of our plugin draws the frame.

Read these reference sources before writing (already extracted from the DSH installation):

- Card frame + body registry + exact Body props:
  `<workspace>\.dsh-tmp\extracted\dsh-client-ui-action-cards\lib\client.js`
  (frame render around lines 460-500, body registry around lines 625-676, host locale example around 678-700)
- Kind service contract, `register`, `act`, `propose` and phase rules:
  `<workspace>\.dsh-tmp\extracted\dsh-action-cards\lib\index.js`
  (lines 213-240 phases/constants, 316-360 propose_action tool, 439-488 register, 508-590 act/dismiss/perform, 595-618 propose checks)
- A complete shipped kind (Host): `<workspace>\.dsh-tmp\extracted\dsh-plugin-recommendations\lib\index.js` (skill registration ~lines 30-70, kind registration ~165-205)
- A complete shipped client body: `<workspace>\.dsh-tmp\extracted\dsh-client-ui-plugin-recommendations\lib\client.js`
  (body registration + injection ~lines 700-780, component earlier) and its package.json for the client manifest shape.
- Skill registration type: `ctx.skills.register({ name, description, whenToUse?, content, invocation, source, provider? })`.
- System prompt section: `ctx.systemPrompt.section({ name, order, text })`, used inside `ctx.effect(() => ...)` like
  `<workspace>\.dsh-tmp\extracted\dsh-persona\lib\index.js` (lines 35-47).
- Card Body props are exactly: `proposal` (`{callId, turn, action, title, brief, details}`), `decision` (`{callId, action, phase, data?}` or undefined), `sessionId`, `summary` (ReactNode), `Folded` (component), `act(verb, payload?) => Promise<ActionResult | undefined>`, and `t` (translator for our namespace, passed as a prop by the frame). Bodies own their header/controls/footer and must render `summary` at the top.

## `propose_action` arguments (model-facing contract)

The model sees only the generic `propose_action` tool. The skill text must document this
exact `details` shape so the model can call it:

```
action: "smart_direction"
title: string            card title, user's language
brief: string            one sentence: what choosing a direction lets the assistant do
details: {
  question: string                       the decision question (≤ 300 chars)
  options: Array<{                      1..8 entries, ids unique
    id: string                           slug, /^[a-z][a-z0-9-]{0,31}$/
    label: string                        ≤ 120 chars
    benefit: string                      one sentence, ≤ 300 chars
    risk: string                         one sentence, ≤ 300 chars
    hint?: string                        optional guidance placeholder, ≤ 120 chars
  }>
  allow_multiple?: boolean               default false
  allow_custom?: boolean                 default true
  context?: string                       optional framing, ≤ 600 chars
}
```

## Host `index.js` requirements

Plain ESM, **no imports at all** (bare imports do not resolve for workspace bundles; use only
`ctx` services and globals). Export:

```js
export const inject = ['skills', 'systemPrompt', 'actionCards']
export function apply(ctx, config = {}) { /* ... */ }
```

Inside `apply`:

1. Normalize config: `protocol = config.protocol !== false`, `autoContinue = config.autoContinue !== false`.
2. Register the skill `smart-directions` with `ctx.skills.register(...)` wrapped in
   `ctx.effect(() => ctx.skills.register({...}), 'smart-direction: skill')`:
   - `description`/`whenToUse` in English, precise enough for the skill catalog: it is the
     pre-edit value check plus the direction-card flow.
   - `content`: markdown. Must contain, in English:
     - the value check: before a non-trivial code change or when resuming a long change,
       restate the goal and current state, state what already works, estimate marginal
       benefit of the next edit vs cost/risk (complexity, regressions, review load), then
       decide keep / refactor-instead / stop / revert. If marginal value is low, do not pile
       on patches: stop and report, or refactor the affected part instead of adding more.
     - the direction-card flow: when there are 2+ viable directions, or the user's
       preference changes the outcome, write each direction's benefit and risk plus a
       recommendation in the answer, then call `skill` for `smart-directions` in this turn
       (mandatory), then call `propose_action` exactly once with `action: "smart_direction"`
       and the details schema above, then end with at most one short invitation sentence in
       the user's language and do not restate the options.
     - the binding rule: the user may select several options and type extra guidance per
       option; treat selections and guidance as binding instructions, never invent a choice
       the user did not make; if the card is dismissed, do not re-offer the same card.
     - the delegation rule: `propose_action` is refused for subagents; a subagent must put
       unresolved direction choices in its final result text instead.
   - `invocation: { modelInvocable: true, userInvocable: false }`, `source: 'runtime'`,
     `provider: 'smart-direction'`.
3. If `protocol`, register a system-prompt section inside `ctx.effect`:
   - `name: 'smart-direction:protocol'`, `order: 700`
   - Text: an always-on, compact version of the same protocol (about 700–1100 characters):
     value check before non-trivial edits and when resuming long work; if marginal value is
     low, stop or refactor instead of piling on patches; when direction choice matters,
     present benefit/risk per direction and offer the direction card by loading
     `smart-directions` and calling `propose_action` once; never claim a user choice that did
     not happen; subagents report unresolved choices in their final result.
4. Register the card kind inside `ctx.effect(() => ctx.actionCards.register(kind), 'smart-direction: action kind')`:
   - `action: 'smart_direction'`, `skill: 'smart-directions'`
   - `details`: a duck-typed validator object with `safeParse(value)` returning
     `{ success: true, data }` or `{ success: false, error: { issues: [{ path: [...], message }] } }`.
     Implement the full validation/normalization of the schema above (trim strings, reject
     non-objects, wrong types, empty/oversized strings, duplicate ids, 0 or >8 options).
     Do not import zod/schemastery; the runtime only calls `safeParse`.
   - `invitation`: "End with at most one short sentence in the user's language inviting them
     to choose a direction and type any extra guidance on the card below; do not restate the
     options."
   - `verbs: { choose: {} }`, `openPhases: []` (must be an array, the service reads
     `kind.openPhases.includes(...)`), no `global`, no `writes`.
   - `statusGuidance`: explain that phase `chosen` carries `data.selected` (option ids),
     `data.guidance` (option id -> user text) and `data.custom` (free-form direction), that
     these are binding, and that `dismissed` means do not re-offer the same card.
   - `statusFields: ['selected', 'guidance', 'custom']`
   - `act: async (agent, proposal, verb, payload) => { ... }` for `verb === 'choose'`:
     - idempotent: if a decision already exists for `proposal.callId` with phase `chosen`,
       return `{ status: 'settled', decision }` without recording again. Read it via
       `ctx.actionCards.view(agent.session).decisions` and `Object.hasOwn`.
     - validate `payload` against `proposal.details`: `selected` must be an array of known
       option ids; `guidance` a plain object whose keys are known option ids and values are
       strings (trim, max 2000 chars each); `custom` a string (trim, max 4000). Unknown/ill
       -typed fields are dropped; invalid payload returns `{ status: 'refused', reason: 'invalid-selection' }`.
     - record `{ callId: proposal.callId, action: 'smart_direction', phase: 'chosen', data: { selected, guidance, custom } }`
       via `ctx.actionCards.record(agent, decision)` (omit empty fields; only include keys
       that exist; never put non-JSON values in data).
     - if `autoContinue`, wake the user's conversation with `agent.followup(message)` where
       `message` is a plain user-role message the plugin authors:
       `{ id: crypto.randomUUID(), role: 'user', content: [{ type: 'text', text }], source: { kind: 'user' } }`.
       The text must be a compact structured summary of the binding choice, e.g.
       `Direction card submitted.` + selected ids/labels + per-option guidance lines + custom
       line + `Continue the task using these choices.` Use labels from `proposal.details`
       next to ids. If `agent.followup` throws, log via `ctx.logger?.warn` and still return
       settled (the decision is already durable).
     - return `{ status: 'settled', decision }`.
   - Any unexpected exception inside `act`: do not throw out; return
     `{ status: 'unconfirmed', reason: 'operation-error' }` if the decision was not recorded,
     otherwise the settled result. Never return a decision for a card that was not recorded.

## Client `client.js` requirements

Plain browser module in the DSH module-loader format, exactly like
`smart-direction\` template in the skill (see
`%USERPROFILE%\AppData\Local\Programs\DeepSeek Harness\resources\app.asar\dsh\node_modules\@deepseek-ai\dsh-agent-preset\skills\cordis-plugin-development\templates\decoration\client.js`,
read it with the file-read tool). Shape:

```js
window.__ModuleLoader__.load({
  id: '@local/dsh-smart-direction',
  factory(require) {
    const React = require('react')
    // ... component code, no JSX, no other imports ...
    return {
      inject: ['actionCards', 'locale'],
      apply(ctx) {
        ctx.effect(() => ctx.locale.register('smartDirection', { en, zh }), 'smart-direction: locale')
        ctx.effect(() => ctx.actionCards.register({
          action: 'smart_direction',
          locale: 'smartDirection',
          Body: SmartDirectionCard,
        }), 'smart-direction: card body')
      },
    }
  },
})
```

The card body (function component) receives props `{ proposal, decision, sessionId, summary, Folded, act, t }`:

- Open state (`decision` undefined): render `summary`, then `proposal.details.question`, an
  optional `context` paragraph, then one row per option:
  - selection control: checkbox when `allow_multiple`, radio otherwise; click toggles;
    show `label`; show `benefit` and `risk` as two short labelled lines (use `t('benefit')`
    and `t('risk')`);
  - below each option row, an always-visible single-line/`textarea` input bound to local
    state for that option id, placeholder `option.hint ?? t('guidancePlaceholder')`, so the
    user can type extra guidance for that option ("可选项自身也要带一个额外指引的输入框").
  - if `allow_custom !== false`, a labelled free-text `textarea` for a direction of the
    user's own.
  - footer: primary submit button (label `t('submit')`, disabled while submitting or when
    nothing is selected and custom text is empty), and a ghost button `t('dismiss')` that
    calls `act('dismiss')`. Translate `act` errors into the status line.
  - submit calls `act('choose', { selected: [...ids], guidance: {id: text, ...}, custom })`,
    trimming and dropping empty guidance entries. `undefined` result -> show
    `t('transport')`; `refused`/`unconfirmed` -> show `t('unavailable')` (or the reason when
    it is a known string); `accepted` -> show `t('saving')`; `settled` -> show the settled
    receipt.
- Settled state (`decision` present): render `summary`, then a receipt: `t('submitted')`
  when `decision.phase === 'chosen'`, `t('dismissed')` for `dismissed`, `t('replaced')` for
  `replaced`; list the recorded selected labels and the guidance text from `decision.data`
  when present. No controls.
- Style only with inline style objects and the host theme tokens (`var(--dsw-alias-*)`,
  e.g. `--dsw-alias-label-primary`, `--dsw-alias-label-secondary`, `--dsw-alias-border-l2`,
  `--dsw-alias-bg-layer-1`, `--dsw-radius-lg`). No literal colors except neutral
  transparent, no external CSS file, no `document` access, no Harness Client package
  imports. Keep the typography compact to match host cards (13-14px body, 12px secondary).
- All visible copy goes through `t`; register both `en` and `zh` dictionaries (the only
  built-in locale ids) with keys: `submit`, `dismiss`, `benefit`, `risk`, `guidancePlaceholder`,
  `customLabel`, `customPlaceholder`, `submitted`, `dismissed`, `replaced`, `saving`,
  `transport`, `unavailable`, `selectHint` (optional extra). Chinese copy must be natural
  Simplified Chinese; English sentence case.
- No side effects outside `apply`; all registrations wrapped in `ctx.effect`. The component
  must not crash when `proposal.details` is unexpectedly malformed: fall back to rendering
  `proposal.title`/`brief` and a disabled state instead of throwing.

## Acceptance checks (both owners)

- `node --check index.js` / `node --check client.js` pass (Node: `C:\nvm4w\nodejs\node.exe`, `node` on PATH).
- No bare imports in either file. No `require` in `index.js`. `client.js` only
  `require('react')`.
- The Host file registers three contributions (skill, prompt section, kind) and disposes
  all three through `ctx.effect`.
- The Client file registers locale + body and renders every option with its own input, a
  custom-direction input, select/multi-select per `allow_multiple`, submit + dismiss, and a
  settled receipt reading `decision.data`.
- Report back: files written, syntax-check output, and any contract ambiguity you found.

The Lead then writes the manifest/patch/locale/icon, installs the bundle with
`plugin_manager install_bundle` and verifies. Do not run `plugin_manager` yourself and do
not touch files outside the two files you own.
