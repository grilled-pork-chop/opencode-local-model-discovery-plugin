import { UNKNOWN_LIMIT, simplifyModelId } from "../constants"
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
 * Limits are written only when the server reported at least one of them.
 * OpenCode's config schema requires both `context` and `output` once `limit`
 * is present, so the half a server did not report is written as
 * {@link UNKNOWN_LIMIT}; when it reported neither, `limit` is left out entirely
 * so OpenCode's own fallback chain applies. Inventing a number would be worse
 * than saying nothing: an invented output cap is sent straight to the model as
 * `maxOutputTokens` and silently truncates long replies.
 *
 * The display name is the server's own `name` when there is one, else the last
 * path segment of the ID (e.g. `"organization/llama3"` → `"llama3"`).
 *
 * @param model - A model returned by {@link fetchModels}.
 * @returns A model entry with a display name, and limits when known.
 */
function buildModelEntry(model: DiscoveredModel): Record<string, unknown> {
  const entry: Record<string, unknown> = {
    name: model.name ?? simplifyModelId(model.id),
  }
  if (model.context !== undefined || model.output !== undefined) {
    entry.limit = {
      context: model.context ?? UNKNOWN_LIMIT,
      output: model.output ?? UNKNOWN_LIMIT,
    }
  }
  return entry
}
