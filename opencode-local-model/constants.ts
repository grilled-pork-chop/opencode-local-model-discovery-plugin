/**
 * Shared constants for the opencode-local-model plugin.
 *
 * All timing values are in milliseconds.
 * @module
 */

/** npm package identifier for the OpenAI-compatible AI SDK adapter. */
export const OPENAI_COMPATIBLE_NPM = "@ai-sdk/openai-compatible"

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
 * Timeout for each notifier display by {@link Notifier}.
 */
export const NOTIFIER_TIMEOUT_MS = 1_000

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
 * OpenCode's own marker for a limit it does not know, used when a server
 * reports one half of `limit` but not the other. A zero context disables auto
 * compaction (`session/overflow.ts`), and a zero output makes OpenCode fall
 * back to its default output cap (`provider/transform.ts`), so in both cases
 * it decides rather than the plugin guessing.
 */
export const UNKNOWN_LIMIT = 0
