/**
 * Merges discovered model IDs into a provider's `models` map inside the
 * mutable opencode config. Existing entries are never overwritten.
 *
 * @param config      - The raw config object passed to the {@link ConfigHook}.
 * @param providerKey - The provider key whose `models` map is updated.
 * @param modelIds    - The IDs returned by {@link fetchModels} for this provider.
 */
export function mergeDiscoveredModels(
  config: unknown,
  providerKey: string,
  modelIds: string[]
): void {
  const providers = (config as Record<string, unknown>)["provider"] as Record<string, unknown>
  const provider = providers[providerKey] as Record<string, unknown>
  const existing = (provider["models"] as Record<string, unknown>) ?? {}

  const fresh = Object.fromEntries(
    modelIds.filter((id) => !existing[id]).map((id) => [id, { id, name: id }])
  )

  provider["models"] = { ...existing, ...fresh }
}
