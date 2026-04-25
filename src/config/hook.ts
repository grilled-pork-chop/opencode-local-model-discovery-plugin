import { fetchModels } from "../discovery/client"
import { mergeDiscoveredModels } from "../discovery/injector"
import { extractCompatibleProviders } from "../discovery/scanner"
import { ModelRefreshMonitor } from "../monitoring/refresh-monitor"
import { Notifier } from "../notification/notifier"
import { LOG_PREFIX } from "../constants"
import type { ConfigHook } from "../types"

/**
 * Builds the {@link ConfigHook} called by OpenCode once at startup.
 *
 * For each `@ai-sdk/openai-compatible` provider found in the config:
 * - Fetches available models from `/v1/models`
 * - Merges them into the provider's `models` map (existing entries preserved)
 * - Fires a success toast and starts background polling via {@link ModelRefreshMonitor}
 *
 * @param notifier - Surfaces success/error toasts to the user.
 * @param monitor  - Polls each provider for model changes after startup.
 */
export function buildConfigHook(notifier: Notifier, monitor: ModelRefreshMonitor): ConfigHook {
  return async (config: unknown): Promise<void> => {
    const providers = extractCompatibleProviders(config)
    if (providers.length === 0) {
      console.warn(`${LOG_PREFIX} No @ai-sdk/openai-compatible provider found in config`)
      return
    }

    await Promise.all(
      providers.map(async ({ key, baseUrl }) => {
        try {
          const models = await fetchModels(baseUrl)
          mergeDiscoveredModels(config, key, models)
          console.info(`${LOG_PREFIX} Discovered ${models.length} model(s) for provider "${key}"`)
          notifier.success(`Discovered ${models.length} model(s) for provider "${key}"`).catch(() => {})
          monitor.seed(baseUrl, models)
          monitor.start(key, baseUrl, notifier)
        } catch (error) {
          const msg = error instanceof Error ? error.message : String(error)
          console.error(`${LOG_PREFIX} Discovery failed for ${baseUrl}: ${msg}`)
          notifier.error(`Model discovery failed for provider "${key}": ${msg}`).catch(() => {})
        }
      })
    )
  }
}
