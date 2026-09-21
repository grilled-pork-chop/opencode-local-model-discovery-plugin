import {
  DERIVED_OUTPUT_SHARE,
  MAX_DERIVED_OUTPUT,
  UNKNOWN_LIMIT,
  simplifyModelId,
} from "../constants"
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
 * Lets a user-declared model entry override the discovered one field by field,
 * so a hand-set `limit.output` survives discovery while everything the user did
 * not mention still tracks the server.
 *
 * `limit` is merged rather than replaced, and is normalized afterwards because
 * OpenCode's schema requires both of its fields once the object is present.
 *
 * @param discovered - The entry built from the API response.
 * @param override   - The entry the user wrote, if any.
 */
function applyOverrides(
  discovered: Record<string, unknown>,
  override: unknown
): Record<string, unknown> {
  if (!override || typeof override !== "object") return discovered
  const declared = override as Record<string, unknown>
  const merged: Record<string, unknown> = { ...discovered, ...declared }

  const limit = {
    ...(asRecord(discovered.limit) ?? {}),
    ...(asRecord(declared.limit) ?? {}),
  }
  if (Object.keys(limit).length > 0) {
    merged.limit = {
      ...limit,
      context: limit.context ?? UNKNOWN_LIMIT,
      output: limit.output ?? UNKNOWN_LIMIT,
    }
  }
  return merged
}

/** Narrows a value to a plain object, or undefined when it is anything else. */
function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined
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
      output: model.output ?? deriveOutputLimit(model.context),
    }
  }
  return entry
}

/**
 * Derives an output cap from a reported context window.
 *
 * Used only when the server publishes a context but no output limit, which is
 * the common case. See {@link DERIVED_OUTPUT_SHARE} for why the cap scales with
 * the window instead of being a fixed number.
 *
 * @param context - The reported context window, if any.
 * @returns A cap that leaves room for the prompt, or {@link UNKNOWN_LIMIT}
 *          when there is no context to derive one from.
 */
function deriveOutputLimit(context: number | undefined): number {
  if (context === undefined) return UNKNOWN_LIMIT
  return Math.min(Math.floor(context / DERIVED_OUTPUT_SHARE), MAX_DERIVED_OUTPUT)
}
