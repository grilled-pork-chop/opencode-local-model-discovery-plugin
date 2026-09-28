/**
 * @module discovery/scanner
 *
 * Finds the providers this plugin discovers models for.
 */

import { BUILTIN_DISCOVERY_PROVIDERS, OPENAI_COMPATIBLE_PACKAGE } from "../constants"
import type { ProviderInfo } from "../types"
import { normalizeBaseUrl } from "./client"

/**
 * Represents a single OpenAI-compatible provider resolved from OpenCode's
 * provider registry.
 */
export interface ProviderEntry {
  /** The provider id as declared in the opencode config (e.g. `"local"`). */
  readonly key: string
  /**
   * Normalized base URL for this provider (no trailing slash, no `/v1` suffix).
   * Ready to be passed directly to {@link fetchModels}.
   */
  readonly baseUrl: string
  /** Key configured directly on the provider (`options.apiKey` in V1 config). */
  readonly apiKey?: string
}

/**
 * Returns every provider declared in the user's config whose package is
 * OpenAI-compatible and that has a `baseURL`.
 *
 * V2 migrates a V1 provider's `npm` into `package` and its `options` into
 * `settings`, so a V1 config entry is picked up unchanged. Skipped:
 * - OpenCode's own providers (its models.dev catalog, `opencode`,
 *   `github-copilot`, ...), which can use the same package but carry an
 *   `integrationID` and a curated model list;
 * - `ollama`, `lmstudio` and `vllm`, whose models OpenCode discovers itself.
 *
 * @param providers - The `data` of `ctx.provider.list()`.
 * @returns Zero or more {@link ProviderEntry} objects, one per compatible provider.
 */
export function extractCompatibleProviders(providers: readonly ProviderInfo[]): ProviderEntry[] {
  return providers.flatMap((provider) => {
    if (!provider.package.includes(OPENAI_COMPATIBLE_PACKAGE)) return []
    if (provider.integrationID !== undefined) return []
    if (BUILTIN_DISCOVERY_PROVIDERS.has(provider.id)) return []

    const { baseURL, apiKey } = provider.settings ?? {}
    if (typeof baseURL !== "string" || !baseURL) return []
    return [
      {
        key: provider.id,
        baseUrl: normalizeBaseUrl(baseURL),
        ...(typeof apiKey === "string" && apiKey ? { apiKey } : {}),
      },
    ]
  })
}
