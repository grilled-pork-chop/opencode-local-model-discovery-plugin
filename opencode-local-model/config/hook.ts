import { loadToken } from "../auth/credentials"
import { OPENAI_COMPATIBLE_NPM, simplifyModelId } from "../constants"
import type { DiscoveredModel } from "../discovery/client"
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
          monitor.seed(
            baseUrl,
            models.map((model) => model.id)
          )

          if (models.length === 0) {
            notifier.warning(`No models found for provider "${key}"`)
            return
          }

          if (!config.model) {
            config.model = `${key}/${models[0].id}`
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
 * Formats discovered models into a bullet-pointed list suitable for display in
 * a notification toast, annotating each with its context window when the server
 * reported one.
 *
 * @param models - The models to list.
 * @returns A newline-separated string where each model is prefixed with `•`.
 */
function formatModelList(models: DiscoveredModel[]): string {
  return models
    .map((model) => {
      const label = model.name ?? simplifyModelId(model.id)
      return model.context ? `  • ${label} (${formatTokens(model.context)} ctx)` : `  • ${label}`
    })
    .join("\n")
}

/**
 * Renders a token count compactly for toasts the way the model's own
 * documentation usually quotes it: binary windows divide by 1024, so 131072
 * reads as `128k`, and round decimal ones divide by 1000, so 200000 reads as
 * `200k` rather than `195k`.
 *
 * @param tokens - A positive token count.
 */
function formatTokens(tokens: number): string {
  if (tokens < 1000) return String(tokens)
  const divisor = tokens % 1024 === 0 ? 1024 : 1000
  return `${Math.round(tokens / divisor)}k`
}
