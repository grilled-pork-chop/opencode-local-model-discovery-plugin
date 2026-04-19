/**
 * Shared constants for the opencode-local-model plugin.
 *
 * All timing values are in milliseconds.
 * @module
 */

/** Prefix prepended to every console message emitted by this plugin. */
export const LOG_PREFIX = "[opencode-local-model]"

/**
 * Interval between background model-list polls performed by {@link ModelRefreshMonitor}.
 */
export const POLL_INTERVAL_MS = 15_000

/**
 * Hard timeout for each `/v1/models` HTTP request.
 * If the server does not respond within this window the fetch is aborted.
 */
export const FETCH_TIMEOUT_MS = 5_000
