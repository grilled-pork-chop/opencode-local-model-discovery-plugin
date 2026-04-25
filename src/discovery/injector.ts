/** Shape written into the opencode provider config for each discovered model. */
interface ModelEntry {
  id: string
  name: string
  modalities: { input: string[]; output: string[] }
}

/**
 * Merges a list of discovered model IDs into a provider's `models` map
 * inside the mutable opencode config object.
 *
 * Only model IDs **not already present** in the provider's `models` map are
 * added, so explicitly configured model entries are never overwritten.
 * Each new entry receives a minimal shape suitable for OpenCode's model picker.
 *
 * This function mutates `config` in place; OpenCode expects config-hook
 * implementations to mutate the object it passes in.
 *
 * @param config      - The raw config object passed to the {@link ConfigHook}.
 * @param providerKey - The provider key whose `models` map is updated (e.g. `"local"`).
 * @param modelIds    - The IDs returned by {@link fetchModels} for this provider.
 */
export function mergeDiscoveredModels(
  config: unknown,
  providerKey: string,
  modelIds: string[]
): void {
  const providers = (config as Record<string, unknown>)["provider"] as Record<string, unknown>
  const provider = providers[providerKey] as Record<string, unknown>
  const existing = (provider["models"] as Record<string, ModelEntry>) ?? {}

  const fresh = Object.fromEntries(
    modelIds
      .filter((id) => !existing[id])
      .map((id): [string, ModelEntry] => [
        id,
        { id, name: id, modalities: { input: ["text", "image"], output: ["text"] } },
      ])
  )

  provider["models"] = { ...existing, ...fresh }
}
