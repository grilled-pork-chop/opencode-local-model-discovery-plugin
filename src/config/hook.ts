import { fetchModels } from "../discovery/client"
import { mergeDiscoveredModels } from "../discovery/injector"
import { extractCompatibleProviders } from "../discovery/scanner"
import type { ProviderEntry } from "../discovery/scanner"
import { ModelRefreshMonitor } from "../monitoring/refresh-monitor"
import { Notifier } from "../notification/notifier"
import { LOG_PREFIX } from "../constants"
import type { ConfigHook } from "../types"

/**
 * Builds the {@link ConfigHook} function that OpenCode calls on configuration load.
 *
 * ### Lifecycle per invocation
 * 1. Scans the config for `@ai-sdk/openai-compatible` providers via
 *    {@link extractCompatibleProviders}.
 * 2. Resolves all providers **concurrently** (`Promise.all`). For each:
 *    - **Already started** → skipped (idempotent for repeat hook calls).
 *    - **First call** → fetches from `/v1/models` via {@link fetchModels}.
 *      On success: merges models into the config, fires a success notification,
 *      seeds and starts the {@link ModelRefreshMonitor} for that provider.
 *      On failure: logs the error and fires an error notification.
 *
 * @param notifier - {@link Notifier} used to surface success/error toasts.
 * @param monitor  - {@link ModelRefreshMonitor} started after the first
 *                   successful fetch for each provider URL.
 * @returns A {@link ConfigHook} that mutates the config object in place.
 */
export function buildConfigHook(notifier: Notifier, monitor: ModelRefreshMonitor): ConfigHook {
  const started = new Set<string>()

  return async (config: unknown): Promise<void> => {
    const providers = extractCompatibleProviders(config)
    if (providers.length === 0) {
      console.warn(`${LOG_PREFIX} No @ai-sdk/openai-compatible provider found in config`)
      return
    }

    // Each provider fetch is independent — resolve them concurrently.
    await Promise.all(providers.map(resolveProvider))

    async function resolveProvider({ key, baseUrl }: ProviderEntry): Promise<void> {
      if (started.has(baseUrl)) return

      try {
        const models = await fetchModels(baseUrl)
        mergeDiscoveredModels(config, key, models)
        onFirstDiscovery(models)
      } catch (error) {
        onDiscoveryError(error)
      }

      function onFirstDiscovery(models: string[]): void {
        console.info(`${LOG_PREFIX} Discovered ${models.length} model(s) for provider "${key}"`)
        // Fire-and-forget: toasts must not block the config hook (OpenCode would deadlock)
        notifier.success(`Discovered ${models.length} model(s) for provider "${key}"`).catch(() => {})
        monitor.seed(baseUrl, models)
        monitor.start(key, baseUrl, notifier)
        started.add(baseUrl)
      }

      function onDiscoveryError(error: unknown): void {
        const msg = error instanceof Error ? error.message : String(error)
        console.error(`${LOG_PREFIX} Discovery failed for ${baseUrl}: ${msg}`)
        notifier.error(`Model discovery failed for provider "${key}": ${msg}`).catch(() => {})
      }
    }
  }
}
