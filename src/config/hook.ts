import { DiscoveryCache } from "../discovery/cache"
import { fetchModels } from "../discovery/client"
import { mergeDiscoveredModels } from "../discovery/injector"
import { extractCompatibleProviders } from "../discovery/scanner"
import type { ProviderEntry } from "../discovery/scanner"
import { ModelRefreshMonitor } from "../monitoring/refresh-monitor"
import { Notifier } from "../notification/notifier"
import { CACHE_TTL_MS, LOG_PREFIX } from "../constants"
import type { ConfigHook } from "../types"

/**
 * Builds the {@link ConfigHook} function that OpenCode calls on every
 * configuration load.
 *
 * ### Lifecycle per invocation
 * 1. Scans the config for `@ai-sdk/openai-compatible` providers via
 *    {@link extractCompatibleProviders}.
 * 2. Resolves all providers **concurrently** (`Promise.all`). For each:
 *    - **Cache hit** → calls {@link mergeDiscoveredModels} immediately.
 *    - **Cache miss** → fetches from `/v1/models` via {@link fetchModels}.
 *      On success: populates the cache, merges models into the config,
 *      fires a success notification, seeds and starts the
 *      {@link ModelRefreshMonitor} for that provider.
 *      On failure: logs the error and fires an error notification; the
 *      provider is skipped for this invocation and retried on the next call.
 *
 * @param notifier - {@link Notifier} used to surface success/error toasts.
 * @param monitor  - {@link ModelRefreshMonitor} started after the first
 *                   successful fetch for each provider URL.
 * @param ttlMs    - TTL for the model-list cache in milliseconds.
 *                   Defaults to {@link CACHE_TTL_MS}.
 * @returns A {@link ConfigHook} that mutates the config object in place.
 */
export function buildConfigHook(
  notifier: Notifier,
  monitor: ModelRefreshMonitor,
  ttlMs = CACHE_TTL_MS
): ConfigHook {
  const caches = new Map<string, DiscoveryCache>()

  return async (config: unknown): Promise<void> => {
    const providers = extractCompatibleProviders(config)
    if (providers.length === 0) {
      console.warn(`${LOG_PREFIX} No @ai-sdk/openai-compatible provider found in config`)
      return
    }

    // Each provider fetch is independent — resolve them concurrently.
    await Promise.all(providers.map(resolveProvider))

    async function resolveProvider({ key, baseUrl }: ProviderEntry): Promise<void> {
      if (!caches.has(baseUrl)) caches.set(baseUrl, new DiscoveryCache(ttlMs))
      const cache = caches.get(baseUrl)!

      const cached = cache.get()
      if (cached) {
        mergeDiscoveredModels(config, key, cached)
        return
      }

      try {
        const models = await fetchModels(baseUrl)
        cache.set(models)
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
      }

      function onDiscoveryError(error: unknown): void {
        const msg = error instanceof Error ? error.message : String(error)
        console.error(`${LOG_PREFIX} Discovery failed for ${baseUrl}: ${msg}`)
        notifier.error(`Model discovery failed for provider "${key}": ${msg}`).catch(() => {})
      }
    }
  }
}
