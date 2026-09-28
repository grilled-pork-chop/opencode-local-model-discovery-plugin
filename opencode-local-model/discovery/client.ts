import { AUTH_FAILURE_STATUS, FETCH_TIMEOUT_MS } from "../constants"

/**
 * A model as reported by `/v1/models`. Only `id` is guaranteed; the rest is
 * whatever the server chose to publish, left undefined when absent so the
 * injector can apply its defaults.
 */
export interface DiscoveredModel {
  readonly id: string
  readonly name?: string
  /** Context window in tokens. */
  readonly context?: number
  /** Maximum output tokens. */
  readonly output?: number
}

/**
 * Where servers report the context window, in precedence order.
 * `max_model_len` is vLLM, `context_length` is OpenRouter and Modal,
 * `max_context_length` is LM Studio, `meta.n_ctx_train` is llama.cpp.
 */
const CONTEXT_PATHS = [
  ["max_model_len"],
  ["context_length"],
  ["max_context_length"],
  ["context_window"],
  ["meta", "n_ctx_train"],
] as const

/**
 * Where servers report the output cap, in precedence order. Far less commonly
 * published than the context window, so the default usually wins.
 */
const OUTPUT_PATHS = [
  ["max_output_length"],
  ["max_completion_tokens"],
  ["max_output_tokens"],
  ["top_provider", "max_completion_tokens"],
] as const

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
 * Fetches the available chat models from an OpenAI-compatible `/v1/models`
 * endpoint, along with whatever metadata the server reports about each one.
 *
 * @param baseUrl - Normalized provider base URL (no `/v1` suffix).
 *                  Use {@link normalizeBaseUrl} before calling this function.
 * @param token   - Bearer token for servers that authenticate `/v1/models`.
 * @returns One {@link DiscoveredModel} per entry, ready for injection.
 * @throws {Error} If the HTTP response is not OK or the response body does
 *                 not contain a `data` array. Statuses in
 *                 {@link AUTH_FAILURE_STATUS} name `opencode auth login` as
 *                 the fix.
 */
export async function fetchModels(baseUrl: string, token?: string): Promise<DiscoveredModel[]> {
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

  return (body.data as unknown[]).flatMap((entry) => {
    const model = parseModel(entry)
    return model ? [model] : []
  })
}

/**
 * Reads one entry of the `data` array. Only `id` is required by the
 * OpenAI-compatible spec; everything else is best effort, and an entry without
 * a usable id is dropped.
 *
 * @param entry - A single element of the `/v1/models` `data` array.
 */
function parseModel(entry: unknown): DiscoveredModel | undefined {
  if (!entry || typeof entry !== "object") return undefined
  const record = entry as Record<string, unknown>
  const id = typeof record.id === "string" ? record.id.trim() : ""
  if (!id) return undefined

  const name =
    typeof record.name === "string" && record.name.trim() ? record.name.trim() : undefined
  return {
    id,
    ...(name ? { name } : {}),
    ...pickLimit("context", record, CONTEXT_PATHS),
    ...pickLimit("output", record, OUTPUT_PATHS),
  }
}

/**
 * Returns the first positive integer found at any of `paths`, as a partial
 * object so an absent value leaves the key off entirely and the injector's
 * default applies.
 */
function pickLimit(
  key: "context" | "output",
  record: Record<string, unknown>,
  paths: readonly (readonly string[])[]
): Partial<Record<"context" | "output", number>> {
  for (const path of paths) {
    const value = positiveInteger(readPath(record, path))
    if (value !== undefined) return { [key]: value }
  }
  return {}
}

/** Walks a dotted path through nested plain objects. */
function readPath(record: Record<string, unknown>, path: readonly string[]): unknown {
  let current: unknown = record
  for (const segment of path) {
    if (!current || typeof current !== "object") return undefined
    current = (current as Record<string, unknown>)[segment]
  }
  return current
}

/**
 * Coerces a reported limit to a positive integer. Numbers arrive as strings
 * from some servers, and zero or negative values are treated as "not reported"
 * rather than injected as a real limit.
 */
function positiveInteger(value: unknown): number | undefined {
  const parsed = typeof value === "string" ? Number(value) : value
  if (typeof parsed !== "number" || !Number.isFinite(parsed) || parsed <= 0) return undefined
  return Math.floor(parsed)
}
