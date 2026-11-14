# Smart directions (`@local/dsh-smart-direction`)

A DSH profile plugin with three always-on behaviours plus a card UI:

1. **Pre-edit value check.** A system-prompt section and a `smart-directions`
   runtime skill teach the agent to re-check whether a code change still has value before
   editing: restate the goal, state what already works, weigh marginal benefit against
   cost/risk, then decide keep / refactor / stop / revert. When the marginal value is low the
   agent must stop or refactor the affected part instead of piling on patches.
2. **Structured replies.** The same prompt asks for a one-line conclusion first, short
   sections, bullet lists, labeled benefit/risk lines per option, and a fenced `yaml` block
   only for compact machine-readable key/value summaries — lists and tables instead of prose
   walls, matching what the GUI renders as real structures.
3. **Direction card with per-option guidance.** When a choice has 2+ viable directions, the
   agent writes the benefit/risk of each direction in its answer and then offers a card
   below the answer using the shipped `actionCards` seam (`propose_action`). The card lets
   the user:
   - select one option, or several when the proposal allows multiple;
   - type **extra guidance next to every option** (each option owns an input box);
   - type a custom direction and extra notes;
   - submit, or dismiss with "Not now".

   On submit the Host records a durable decision (`phase: chosen`, data: selected ids,
   per-option guidance, custom text), the card switches to a read-only receipt, and — when
   `autoContinue` is on — the agent is woken with the binding choice so it continues the task
   immediately. The next model request also carries the standard action-card status notice
   with the same data.

## Files

| File | Role |
|---|---|
| `index.js` | Host plugin: runtime skill `smart-directions`, prompt section `smart-direction:protocol` (order 700), action-card kind `smart_direction` |
| `client.js` | Browser plugin: card body with per-option guidance inputs, `en`/`zh` copy, body registration |
| `cordis.patch.yml` | Inserts the shipped `@deepseek-ai/dsh-action-cards` service + its browser half, then this plugin |
| `locale/en.json`, `locale/zh.json` | Plugin Manager title/description |
| `icon.svg` | Plugin icon |
| `CONTRACT.md` | Implementation contract used while building |

## Visual language (Material 3)

`client.js` carries its own Material 3 stylesheet (the `CARD_CSS` constant) instead of using the
host theme tokens:

- M3 baseline tonal palette (primary `#6750A4` light / `#D0BCFF` dark), M3 typography, 12–16px
  shapes, elevation, state layers and 150–200ms eased motion; checkbox/radio marks are drawn
  from M3 control specs.
- Dark scheme follows the host's `body[data-ds-dark-theme]` attribute; every other skin class
  and theme token is ignored, so the card looks the same under all skins.
- The shipped card frame's glass border/background is neutralized with
  `section[data-action-card]:has(> .sdv2-root)` so only the M3 surface is visible.
- A browser plugin may only `require('react')`, so Tailwind/shadcn or an M3 component library
  cannot be imported; the stylesheet is hand-written M3 CSS rather than a framework.

### Structured wake-up record

`autoContinue` writes a user message that wakes the agent. Instead of one plain sentence, the
Host writes a structured record (`Direction card recorded` marker + a machine-readable `card:`
JSON line), and the browser half registers a `userText` rule plus a
`conversation.user.text.node` renderer for it, so the transcript shows a compact receipt with
labeled sections (selected directions, per-option guidance, custom direction) and an
"已按你的选择自动继续" footer. Legacy plain-text records from older versions are also parsed and
rendered identically.

## Configuration

Edit the row in this bundle's `cordis.patch.yml` (or a profile override):

```yaml
- id: smart-direction
  config:
    protocol: true      # always-on pre-edit value-check prompt section
    autoContinue: true  # wake the agent after the user submits the direction card
```

## Dependency and risk notes

- The card UI is built on the shipped **experimental** packages
  `@deepseek-ai/dsh-action-cards` and `@deepseek-ai/dsh-client-ui-action-cards`. They resolve
  from the DSH installation (no npm dependency), so this bundle pins no version and may need
  adaptation after a DSH upgrade changes the action-card extension API.
- `actionCards` allows one card per turn and refuses a proposal while enough user messages are
  queued (`queuedMessageLimit`, currently 2). A proposal also requires the agent to have
  loaded the `smart-directions` skill in the same turn; the prompt and skill text teach that
  flow.
- Subagents cannot use `propose_action` (cards are offered only in the main conversation);
  the skill instructs them to put unresolved directions in their final result instead.
- `autoContinue` starts a new model turn when the user submits; that turn costs tokens.
- The prompt section is always on for this profile. Set `protocol: false` to keep only the
  card tool.

## Install / remove

Install with the Plugin Manager (bundle → install from a local package directory), or from a
session with full access call `plugin_manager` `install_bundle` with this directory as the
target. Remove with `plugin_manager` `remove_bundle` and target `@local/dsh-smart-direction`.
