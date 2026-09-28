/**
 * Shared constants for the opencode-local-model plugin.
 *
 * All timing values are in milliseconds.
 * @module
 */

/** Plugin id registered with OpenCode, also used as the log prefix. */
export const PLUGIN_ID = "local-model-discovery"

/** npm package identifier for the OpenAI-compatible AI SDK adapter, as users write it. */
export const OPENAI_COMPATIBLE_NPM = "@ai-sdk/openai-compatible"

/**
 * Substring identifying an OpenAI-compatible provider package. V2 reports a
 * V1 `npm: "@ai-sdk/openai-compatible"` provider as
 * `aisdk:@ai-sdk/openai-compatible` and a native one as
 * `@opencode/ai/providers/openai-compatible`; both contain it.
 */
export const OPENAI_COMPATIBLE_PACKAGE = "openai-compatible"

/**
 * Provider ids whose models OpenCode V2 already discovers with its own
 * built-in plugins. Two transforms rewriting the same provider would fight,
 * so these are left to OpenCode.
 */
export const BUILTIN_DISCOVERY_PROVIDERS: ReadonlySet<string> = new Set([
  "ollama",
  "lmstudio",
  "vllm",
])

/**
 * Interval between background model-list polls performed by {@link ModelRefreshMonitor}.
 */
export const POLL_INTERVAL_MS = 15_000

/**
 * Hard timeout for each `/v1/models` HTTP request.
 * If the server does not respond within this window the fetch is aborted.
 */
export const FETCH_TIMEOUT_MS = 5_000

/**
 * HTTP statuses that mean the provider refused the credential. 401 and 403 are
 * the standard answers; some OpenAI-compatible servers use 400 for a missing or
 * malformed `Authorization` header instead.
 */
export const AUTH_FAILURE_STATUS = new Set([400, 401, 403])

/**
 * Simplifies a model ID to its last path segment for display.
 * (e.g. `"organization/llama3"` → `"llama3"`)
 *
 * @param id - The raw model ID.
 * @returns The simplified display name.
 */
export function simplifyModelId(id: string): string {
  return id.replace(/\/+$/, "").split("/").pop() ?? id
}

/**
 * Context written when a server reports none. OpenCode treats zero as an
 * unknown context and skips auto compaction rather than guessing a window.
 *
 * There is no counterpart for the output cap: when a server reports none, the
 * model keeps OpenCode's own default (32000, its `OUTPUT_TOKEN_MAX`). Zero is
 * not "unknown" there, since OpenCode takes the lower of the two.
 */
export const UNKNOWN_CONTEXT = 0
