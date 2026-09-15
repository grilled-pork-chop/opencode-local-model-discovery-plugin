import { loadToken } from "../auth/credentials"
import { OPENAI_COMPATIBLE_NPM, simplifyModelId } from "../constants"
import { fetchModels } from "../discovery/client"
import { applyDiscoveredModels } from "../discovery/injector"
import { extractCompatibleProviders } from "../discovery/scanner"
import type { ModelRefreshMonitor } from "../monitoring/refresh-monitor"
import type { Notifier } from "../notification/notifier"
import type { ConfigHook, OpenCodeConfig } from "../types"

/**
 * Builds the {@link ConfigHook} called by OpenCode once at startup.
 *
 * For each `@ai-sdk/openai-compatible` provider found in the config:
 * - Resolves a credential from `options.apiKey`, falling back to whatever
 *   `opencode auth login` stored under the provider's id
 * - Fetches available models from `/v1/models`, authenticated when there is one
 * - Replaces them into the provider's `models` map (existing entries preserved)
 * - Fires a success toast and starts background polling via {@link ModelRefreshMonitor}
 *
 * @param notifier - Surfaces success/error toasts to the user.
 * @param monitor  - Polls each provider for model changes after startup.
 */
export function buildConfigHook(notifier: Notifier, monitor: ModelRefreshMonitor): ConfigHook {
  return async (config: OpenCodeConfig): Promise<void> => {
    const providers = extractCompatibleProviders(config)
    if (providers.length === 0) {
      notifier.warning(`No '${OPENAI_COMPATIBLE_NPM}' provider found in config`)
      return
    }

    await Promise.all(
      providers.map(async ({ key, baseUrl }) => {
        const token = await resolveToken(config, key)

        try {
          const models = await fetchModels(baseUrl, token)
          applyDiscoveredModels(config, key, models)
          monitor.seed(baseUrl, models)

          if (models.length === 0) {
            notifier.warning(`No models found for provider "${key}"`)
            return
          }

          if (!config.model) {
            config.model = `${key}/${models[0]}`
          }
          notifier.success(
            `Discovered ${models.length} model(s) for provider "${key}":\n${formatModelList(models)}`
          )
        } catch (error) {
          monitor.seed(baseUrl, [])
          const msg = error instanceof Error ? error.message : String(error)
          notifier.error(`Model discovery failed for provider "${key}": ${msg}`)
        } finally {
          monitor.start(key, baseUrl, notifier, token)
        }
      })
    )
  }
}

/**
 * Resolves the credential for a provider.
 *
 * An explicitly configured `options.apiKey` wins. OpenCode resolves its
 * `{env:VAR}` and `{file:path}` placeholders before plugins see the config, so
 * the value is always the real key. Otherwise the credential stored by
 * `opencode auth login` under the same provider id is used.
 *
 * @param config - The config object passed to the {@link ConfigHook}.
 * @param key    - Provider key to resolve a credential for.
 */
async function resolveToken(config: OpenCodeConfig, key: string): Promise<string | undefined> {
  const apiKey = config.provider?.[key]?.options?.apiKey
  if (typeof apiKey === "string" && apiKey) return apiKey
  return loadToken(key)
}

/**
 * Formats an array of model IDs into a bullet-pointed list suitable for
 * display in a notification toast.
 *
 * @param models - Model ID strings to list.
 * @returns A newline-separated string where each model is prefixed with `•`.
 */
function formatModelList(modelsIds: string[]): string {
  return modelsIds.map((m) => `  • ${simplifyModelId(m)}`).join("\n")
}
