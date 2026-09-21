import { DEFAULT_CONTEXT_LIMIT, DEFAULT_OUTPUT_LIMIT, simplifyModelId } from "../constants"
import type { DiscoveredModel } from "./client"

/**
 * Replaces a provider's `models` map with the IDs returned by the API.
 * The API is treated as the sole source of truth, so models no longer
 * served by the provider are removed from the config.
 *
 * @param config      - The raw config object passed to the {@link ConfigHook}.
 * @param providerKey - The provider key whose `models` map is replaced.
 * @param models      - The models returned by {@link fetchModels} for this provider.
 */
export function applyDiscoveredModels(
  config: unknown,
  providerKey: string,
  models: DiscoveredModel[]
): void {
  const providers = (config as Record<string, unknown>).provider as Record<string, unknown>
  const provider = providers[providerKey] as Record<string, unknown>
  provider.models = Object.fromEntries(models.map((model) => [model.id, buildModelEntry(model)]))
}

/**
 * Builds a model entry object for injection into a provider's `models` map.
 *
 * Limits come from the endpoint when the server publishes them, for example
 * vLLM's `max_model_len`, and fall back to {@link DEFAULT_CONTEXT_LIMIT} and
 * {@link DEFAULT_OUTPUT_LIMIT} otherwise. The display name is the server's own
 * `name` when there is one, else the last path segment of the ID
 * (e.g. `"organization/llama3"` → `"llama3"`).
 *
 * @param model - A model returned by {@link fetchModels}.
 * @returns A model entry with a display name and token limits.
 */
function buildModelEntry(model: DiscoveredModel): Record<string, unknown> {
  return {
    name: model.name ?? simplifyModelId(model.id),
    limit: {
      context: model.context ?? DEFAULT_CONTEXT_LIMIT,
      output: model.output ?? DEFAULT_OUTPUT_LIMIT,
    },
  }
}
