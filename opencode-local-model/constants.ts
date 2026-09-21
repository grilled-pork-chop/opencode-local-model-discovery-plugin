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
 * OpenCode's own marker for a limit it does not know. A zero context disables
 * auto compaction (`session/overflow.ts`), and a zero output makes OpenCode
 * fall back to its own default cap (`provider/transform.ts`).
 */
export const UNKNOWN_LIMIT = 0

/**
 * Ceiling for an output cap derived from the context window. Matches OpenCode's
 * `OUTPUT_TOKEN_MAX`, so a derived cap never exceeds what it would have applied
 * on its own.
 */
export const MAX_DERIVED_OUTPUT = 32_000

/**
 * Share of the context window used as the output cap when a server reports a
 * context but no output limit.
 *
 * Servers that enforce `prompt + max_tokens <= context`, vLLM among them,
 * reject a request outright when the cap leaves no room for the prompt, so a
 * flat default is wrong in both directions: too small truncates long replies on
 * large models, too large breaks small ones. A quarter of the window leaves
 * three quarters for the prompt and scales with whatever the server reported.
 */
export const DERIVED_OUTPUT_SHARE = 4
