/**
 * @module plugin
 *
 * OpenCode V2 plugin definition for the opencode-local-model plugin.
 *
 * ### Lifecycle
 * 1. OpenCode calls `setup(ctx)` once per project it opens.
 * 2. `setup` registers a model transform. It is pure: it only copies the
 *    lists held by {@link ModelRefreshMonitor} into OpenCode's model registry,
 *    and OpenCode may replay it at any time. A model transform is used rather
 *    than a provider transform because providers declared in the config are
 *    not visible yet to a plugin's provider transform.
 * 3. It lists OpenCode's providers, tracks every OpenAI-compatible one
 *    declared in the config and starts polling. When a list changes the
 *    monitor reloads the registry, so the transform runs again and the model
 *    picker updates without a restart.
 * 4. On `provider.updated` and `config.updated` it re-scans the providers.
 * 5. The returned cleanup stops polling and the event subscription.
 *
 * Only types are imported from `@opencode/plugin`: the plugin is installed by
 * copying this folder, with no `node_modules`, and the default export is the
 * plain `{ id, setup }` object that `Plugin.define` would return.
 */

import type { Plugin } from "@opencode/plugin"
import { resolveToken } from "./auth/credentials"
import { OPENAI_COMPATIBLE_PACKAGE, PLUGIN_ID } from "./constants"
import { applyDiscoveredModels } from "./discovery/injector"
import { extractCompatibleProviders } from "./discovery/scanner"
import { log } from "./logger"
import { ModelRefreshMonitor } from "./monitoring/refresh-monitor"
import type { ModelEditorLike } from "./types"

async function setup(ctx: Plugin.Context): Promise<Plugin.Cleanup> {
  // Re-runs the model transform so it picks up the monitor's current lists.
  const reloadRegistry = () => ctx.model.reload()

  const monitor = new ModelRefreshMonitor(reloadRegistry)

  await ctx.model.transform((editor) => {
    // V2 types ids as branded strings, which its DeepMutable helper widens into
    // object types; at runtime they are plain strings, as ModelEditorLike says.
    const draft = editor as unknown as ModelEditorLike
    for (const [key, models] of monitor.discovered()) applyDiscoveredModels(draft, key, models)
    if (draft.default.get()) return
    const first = monitor.firstModel()
    if (first) draft.default.set(first.providerID, first.modelID)
  })

  let lastScan: string | undefined
  let scans = 0
  /** Re-reads OpenCode's providers, tracks the compatible ones, logs any change. */
  const sync = async () => {
    const scan = extractCompatibleProviders(await ctx.provider.list())
    const tracked = await Promise.all(
      scan.providers.map(async (provider) => ({
        provider,
        token: await resolveToken(ctx.integration, provider),
      }))
    )
    const result = monitor.track(tracked)

    const summary = JSON.stringify([monitor.keys(), scan.skipped])
    const scanChanged = summary !== lastScan
    if (scanChanged) {
      for (const key of scan.skipped) {
        log.info(`Provider "${key}" is discovered by OpenCode itself, skipping it`)
      }
      if (scan.providers.length > 0) {
        log.info(`Discovering models for provider(s): ${monitor.keys().join(", ")}`)
      }
    }
    // Config providers can register after setup, so the first scan may be
    // incomplete: warn about an empty result from the second scan on.
    if (scan.providers.length === 0 && (scanChanged ? scans > 0 : scans === 1)) {
      log.warning(`No '${OPENAI_COMPATIBLE_PACKAGE}' provider with a baseURL found in config`)
    }
    lastScan = summary
    scans++
    return result
  }

  await sync()
  // Discovery runs in the background so a slow server never delays startup.
  void monitor.refreshAll()
  monitor.start()

  // Config providers register after setup and the config can change later, so
  // re-scan whenever the registry changes. Reloads made by this plugin come
  // back here too, but they leave the tracked set unchanged and stop.
  const abort = new AbortController()
  void (async () => {
    try {
      for await (const event of ctx.event.subscribe({ signal: abort.signal })) {
        if (event.type === "config.updated") {
          // Reload first so the provider list reflects the new config.
          await ctx.provider.reload()
        } else if (event.type !== "provider.updated") {
          continue
        }
        const { changed, dropped } = await sync()
        if (!changed) continue
        const refreshed = await monitor.refreshAll()
        if (dropped && !refreshed) await reloadRegistry()
      }
    } catch (error) {
      if (!abort.signal.aborted) log.warning(`Provider watch stopped: ${String(error)}`)
    }
  })()

  return () => {
    abort.abort()
    monitor.cleanup()
  }
}

const LocalModelPlugin: Plugin.Plugin = { id: PLUGIN_ID, setup }

export default LocalModelPlugin
