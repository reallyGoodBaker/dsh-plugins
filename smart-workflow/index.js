/**
 * Smart workflow — one install for smart directions and workspace checkpoints.
 *
 * The bundle merges `@local/dsh-smart-direction` and `@local/dsh-checkpoint`:
 *  - smart directions: pre-edit value check skill, always-on protocol section, direction card kind;
 *  - checkpoints: `/checkpoint` command, `checkpoint_inspect` tool, `checkpoints` skill, policy
 *    section, per-session setup service and `/setup` command;
 *  - context compression: `/checkpoint compress` writes a checkpoint anchor, then condenses the
 *    conversation through the Host compaction service (`ctx.compaction.compactNow`).
 *
 * Both halves share one configuration object; each half reads its own keys.
 */
import { applyCheckpoint } from './lib/checkpoint.js'
import { applySmartDirection } from './lib/smart-direction.js'

export const inject = ['actionCards', 'commands', 'skills', 'systemPrompt', 'tools']

/**
 * Register both halves on the Host context.
 * @param {object} ctx - Cordis plugin context.
 * @param {object} [config] - merged row config: smart-direction keys plus checkpoint keys.
 */
export function apply(ctx, config = {}) {
  const checkpoint = applyCheckpoint(ctx, config)
  applySmartDirection(ctx, config, {
    onCardChosen: checkpoint !== undefined && checkpoint !== null ? checkpoint.createAutoCheckpoint : undefined,
  })
}
