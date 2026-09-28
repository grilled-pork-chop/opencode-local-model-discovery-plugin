import { BUILTIN_DISCOVERY_PROVIDERS, OPENAI_COMPATIBLE_PACKAGE } from "../constants"
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

/** Result of {@link extractCompatibleProviders}. */
export interface ScanResult {
  readonly providers: ProviderEntry[]
  /** Compatible providers left to OpenCode's built-in discovery. */
  readonly skipped: string[]
}

/**
 * Scans the output of `ctx.provider.list()` and returns every provider declared
 * in the user's config whose package is OpenAI-compatible and that has a
 * `settings.baseURL` string.
 *
 * V2 migrates a V1 provider's `npm` into `package` and its `options` into
 * `settings`, so a V1 config entry is picked up unchanged.
 *
 * OpenCode's own providers (its models.dev catalog, `opencode`,
 * `github-copilot`, ...) can use the same package, but they carry an
 * `integrationID` and a curated model list, so they are left alone. A provider
 * declared in the config has none.
 *
 * Never throws: a missing or malformed listing yields no providers.
 *
 * @param listed - `ctx.provider.list()` output: `{ data: [...] }` or a bare array.
 */
export function extractCompatibleProviders(listed: unknown): ScanResult {
  const providers: ProviderEntry[] = []
  const skipped: string[] = []

  for (const info of providerInfos(listed)) {
    const key = info.id
    if (typeof key !== "string" || !key) continue
    if (typeof info.package !== "string" || !info.package.includes(OPENAI_COMPATIBLE_PACKAGE)) {
      continue
    }
    const settings = isRecord(info.settings) ? info.settings : {}
    const baseURL = settings.baseURL
    if (typeof baseURL !== "string" || !baseURL) continue
    if (BUILTIN_DISCOVERY_PROVIDERS.has(key)) {
      skipped.push(key)
      continue
    }
    if (info.integrationID !== undefined) continue

    const apiKey =
      typeof settings.apiKey === "string" && settings.apiKey ? settings.apiKey : undefined
    providers.push({
      key,
      baseUrl: normalizeBaseUrl(baseURL),
      ...(apiKey ? { apiKey } : {}),
    })
  }

  return { providers, skipped }
}

/** Unwraps the provider list, accepting `{ data }` and bare-array shapes. */
function providerInfos(listed: unknown): Record<string, unknown>[] {
  const entries = Array.isArray(listed)
    ? listed
    : isRecord(listed) && Array.isArray(listed.data)
      ? listed.data
      : []
  return entries.filter(isRecord)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value)
}
