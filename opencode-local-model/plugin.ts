/**
 * @module plugin
 *
 * OpenCode V2 plugin definition for the opencode-local-model plugin.
 *
 * ### Lifecycle
 * 1. OpenCode calls `setup(ctx)` once per project it opens.
 * 2. `setup` registers a model transform that copies the lists held by the
 *    {@link ModelRefreshMonitor} into OpenCode's model registry. A model
 *    transform is used because providers declared in the config are not yet
 *    visible to a plugin's provider transform.
 * 3. It tracks every OpenAI-compatible provider declared in the config and
 *    polls them. When a list changes the monitor reloads the model registry,
 *    so the transform runs again and the model picker updates without a
 *    restart.
 * 4. It re-scans the providers whenever the registry or the config changes.
 * 5. The returned cleanup stops polling and watching.
 *
 * Only types are imported from `@opencode/plugin`: the plugin is installed by
 * copying this folder, with no `node_modules`, and the default export is the
 * plain `{ id, setup }` object that `Plugin.define` would return.
 */

import type { Plugin } from "@opencode/plugin"
import { resolveToken } from "./auth/credentials"
import { OPENAI_COMPATIBLE_NPM, PLUGIN_ID } from "./constants"
import { applyDiscoveredModels } from "./discovery/injector"
import { extractCompatibleProviders } from "./discovery/scanner"
import { log } from "./logger"
import { ModelRefreshMonitor } from "./monitoring/refresh-monitor"
import type { ModelEditorLike } from "./types"

async function setup(ctx: Plugin.Context): Promise<Plugin.Cleanup> {
  const monitor = new ModelRefreshMonitor(() => ctx.model.reload())

  await ctx.model.transform((editor) => {
    // OpenCode types ids as branded strings; at runtime they are plain strings.
    injectModels(editor as unknown as ModelEditorLike, monitor)
  })

  // Discovery runs in the background so a slow server never delays startup.
  syncProviders(ctx, monitor).catch((error) => log.error(`Discovery failed: ${error}`))
  monitor.start()

  const abort = new AbortController()
  void watchProviders(ctx, monitor, abort.signal)

  return () => {
    abort.abort()
    monitor.cleanup()
  }
}

/**
 * The model transform: writes every discovered list into the registry and,
 * when the user configured no default model, selects the first discovered one.
 *
 * OpenCode may replay it at any time, so it only reads the monitor's state.
 *
 * @param editor  - The model editor handed to the transform.
 * @param monitor - Holds the discovered lists.
 */
function injectModels(editor: ModelEditorLike, monitor: ModelRefreshMonitor): void {
  for (const [key, models] of monitor.discovered()) applyDiscoveredModels(editor, key, models)

  const first = monitor.firstModel()
  if (first && !editor.default.get()) editor.default.set(first.key, first.id)
}

/**
 * Reads OpenCode's providers, tracks the compatible ones, and fetches the
 * models of every provider that just started being tracked.
 *
 * @param ctx     - The plugin context.
 * @param monitor - Tracks and polls the providers.
 * @returns How many providers are tracked.
 */
async function syncProviders(ctx: Plugin.Context, monitor: ModelRefreshMonitor): Promise<number> {
  const providers = extractCompatibleProviders((await ctx.provider.list()).data)
  const tracked = await Promise.all(
    providers.map(async (provider) => ({
      provider,
      token: await resolveToken(ctx.integration, provider),
    }))
  )

  const { added, removed } = await monitor.track(tracked)
  for (const key of added) log.info(`Discovering models for provider "${key}"`)
  for (const key of removed) log.info(`Stopped discovering models for provider "${key}"`)

  await monitor.poll(added)
  return providers.length
}

/**
 * Re-syncs the providers whenever OpenCode's provider registry or config
 * changes, until `signal` aborts.
 *
 * Providers declared in the config register a moment after `setup`, so the
 * first sync may find none. The "no provider" warning is therefore given here,
 * once, when a registry change still leaves none.
 *
 * @param ctx     - The plugin context.
 * @param monitor - Tracks and polls the providers.
 * @param signal  - Stops watching when aborted.
 */
async function watchProviders(
  ctx: Plugin.Context,
  monitor: ModelRefreshMonitor,
  signal: AbortSignal
): Promise<void> {
  let warned = false
  try {
    for await (const event of ctx.event.subscribe({ signal })) {
      if (event.type !== "provider.updated" && event.type !== "config.updated") continue
      // Reload first so the provider list reflects the new config.
      if (event.type === "config.updated") await ctx.provider.reload()

      const count = await syncProviders(ctx, monitor)
      if (count === 0 && !warned) {
        log.warning(`No '${OPENAI_COMPATIBLE_NPM}' provider with a baseURL found in config`)
      }
      warned = count === 0
    }
  } catch (error) {
    if (!signal.aborted) log.warning(`Stopped watching providers: ${error}`)
  }
}

const LocalModelPlugin: Plugin.Plugin = { id: PLUGIN_ID, setup }

export default LocalModelPlugin
