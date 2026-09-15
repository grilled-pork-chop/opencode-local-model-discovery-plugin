import { AUTH_FAILURE_STATUS, FETCH_TIMEOUT_MS } from "../constants"

/**
 * Strips a trailing slash and an optional `/v1` path segment from a provider
 * base URL, ensuring that `/v1/models` can be appended exactly once.
 *
 * @example
 * normalizeBaseUrl("http://localhost:11434/v1/") // → "http://localhost:11434"
 * normalizeBaseUrl("http://localhost:11434/v1")  // → "http://localhost:11434"
 * normalizeBaseUrl("http://localhost:11434")     // → "http://localhost:11434"
 *
 * @param url - The raw `baseURL` string from the provider config.
 * @returns The normalized URL with no trailing slash and no `/v1` suffix.
 */
export function normalizeBaseUrl(url: string): string {
  return url.replace(/\/+$/, "").replace(/\/v1$/, "")
}

/**
 * Fetches the list of available chat models from an OpenAI-compatible
 * `/v1/models` endpoint. Embedding and reranking models are filtered out
 * automatically because OpenCode cannot use them for code generation.
 *
 * @param baseUrl - Normalized provider base URL (no `/v1` suffix).
 *                  Use {@link normalizeBaseUrl} before calling this function.
 * @param token   - Bearer token for servers that authenticate `/v1/models`.
 * @returns An array of model ID strings, ready for injection into the config.
 * @throws {Error} If the HTTP response is not OK or the response body does
 *                 not contain a `data` array. Statuses in
 *                 {@link AUTH_FAILURE_STATUS} name `opencode auth login` as
 *                 the fix.
 */
export async function fetchModels(baseUrl: string, token?: string): Promise<string[]> {
  const response = await fetch(`${baseUrl}/v1/models`, {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  })

  // Some OpenAI-compatible servers answer a missing or invalid credential with
  // 400 rather than 401, so all three point at the same fix.
  if (AUTH_FAILURE_STATUS.has(response.status)) {
    throw new Error(
      `HTTP ${response.status}, provider rejected the request. Run 'opencode auth login' to set or update its credential`
    )
  }
  if (!response.ok) throw new Error(`HTTP ${response.status}`)

  const body = (await response.json()) as Record<string, unknown>
  if (!Array.isArray(body.data)) {
    throw new Error("unexpected /v1/models response: missing data array")
  }

  return (body.data as { id?: unknown }[]).map((m) => String(m.id ?? "")).filter((id) => id)
}
