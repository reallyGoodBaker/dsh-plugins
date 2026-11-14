/**
 * dsh-mcdev — NetEase Minecraft (网易我的世界) development companion.
 *
 * Host half: the self-implemented launcher/bridge (`lib/native`: writes
 * `dev_config.cppconfig`, spawns the ModPC dev client, follows the official
 * `Debug_Log*.txt`, installs an in-game bridge behavior pack and talks to it
 * over loopback TCP) and the bundled ModSDK documentation index (`lib/docs`)
 * are composed into one `/mcdev` command, one `mcdev` agent tool, a short
 * system-prompt section and a model-invocable skill. The browser half
 * (`lib/client.js`) renders the floating, draggable control panel and speaks
 * the same `/mcdev ... --json` command surface through the Commands Remote.
 */
import { applyMcdev } from './lib/host/plugin.js'

export const inject = ['commands', 'skills', 'systemPrompt', 'tools']

/**
 * Register the plugin.
 * @param {object} ctx - Cordis plugin context.
 * @param {object} [config] - bundle row config (see `cordis.patch.yml`).
 */
export function apply(ctx, config = {}) {
  applyMcdev(ctx, config)
}
