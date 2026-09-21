import { DEFAULT_OUTPUT_LIMIT, UNKNOWN_CONTEXT, simplifyModelId } from "../constants"
import type { DiscoveredModel } from "./client"

/**
 * Replaces a provider's `models` map with what the API reports. The API decides
 * which models exist, so models no longer served by the provider are removed,
 * but anything the user wrote for a model in `opencode.jsonc` wins over the
 * discovered value for that field.
 *
 * @param config      - The raw config object passed to the {@link ConfigHook}.
 * @param providerKey - The provider key whose `models` map is replaced.
 * @param models      - The models returned by {@link fetchModels} for this provider.
 * @param declared    - The provider's `models` map as the user wrote it, captured
 *                      before the first injection.
 */
export function applyDiscoveredModels(
  config: unknown,
  providerKey: string,
  models: DiscoveredModel[],
  declared: Record<string, unknown> = {}
): void {
  const providers = (config as Record<string, unknown>).provider as Record<string, unknown>
  const provider = providers[providerKey] as Record<string, unknown>
  provider.models = Object.fromEntries(
    models.map((model) => [model.id, applyOverrides(buildModelEntry(model), declared[model.id])])
  )
}

/**
 * Builds a model entry object for injection into a provider's `models` map.
 *
 * Limits come from the endpoint when the server publishes them, for example
 * vLLM's `max_model_len`, and fall back to {@link UNKNOWN_CONTEXT} and
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
      context: model.context ?? UNKNOWN_CONTEXT,
      output: model.output ?? DEFAULT_OUTPUT_LIMIT,
    },
  }
}

/**
 * Lets a user-declared model entry override the discovered one field by field,
 * so a hand-set `limit.output` survives discovery while everything the user did
 * not mention still tracks the server.
 *
 * `limit` is merged rather than replaced, and is filled in afterwards because
 * OpenCode's schema requires both of its fields once the object is present.
 *
 * @param discovered - The entry built from the API response.
 * @param override   - The entry the user wrote, if any.
 */
function applyOverrides(
  discovered: Record<string, unknown>,
  override: unknown
): Record<string, unknown> {
  const declared = asRecord(override)
  if (!declared) return discovered

  const limit = {
    ...(asRecord(discovered.limit) ?? {}),
    ...(asRecord(declared.limit) ?? {}),
  }
  return {
    ...discovered,
    ...declared,
    limit: {
      ...limit,
      context: limit.context ?? UNKNOWN_CONTEXT,
      output: limit.output ?? DEFAULT_OUTPUT_LIMIT,
    },
  }
}

/** Narrows a value to a plain object, or undefined when it is anything else. */
function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined
}
