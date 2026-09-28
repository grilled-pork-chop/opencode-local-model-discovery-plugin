/**
 * @module logger
 *
 * Writes the plugin's messages to the OpenCode log.
 *
 * OpenCode V2 runs plugins in its background service, which cannot show TUI
 * toasts, so discoveries, changes and errors are logged instead. Every message
 * goes through {@link log}, the one place to change if toasts are added later.
 */

import { PLUGIN_ID, simplifyModelId } from "./constants"
import type { DiscoveredModel } from "./discovery/client"

/** Prefixed log lines, one method per severity. */
export const log = {
  info(message: string): void {
    console.info(`[${PLUGIN_ID}] ${message}`)
  },
  warning(message: string): void {
    console.warn(`[${PLUGIN_ID}] ${message}`)
  },
  error(message: string): void {
    console.error(`[${PLUGIN_ID}] ${message}`)
  },
}

/**
 * Formats discovered models into a bullet-pointed list, annotating each with
 * its context window when the server reported one.
 *
 * @param models - The models to list.
 * @returns A newline-separated string where each model is prefixed with `•`.
 */
export function formatModelList(models: readonly DiscoveredModel[]): string {
  return models
    .map((model) => {
      const label = model.name ?? simplifyModelId(model.id)
      return model.context ? `  • ${label} (${formatTokens(model.context)} ctx)` : `  • ${label}`
    })
    .join("\n")
}

/**
 * Renders a token count compactly the way the model's own documentation
 * usually quotes it: binary windows divide by 1024, so 131072 reads as `128k`,
 * and round decimal ones divide by 1000, so 200000 reads as `200k` rather
 * than `195k`.
 *
 * @param tokens - A positive token count.
 */
export function formatTokens(tokens: number): string {
  if (tokens < 1000) return String(tokens)
  const divisor = tokens % 1024 === 0 ? 1024 : 1000
  return `${Math.round(tokens / divisor)}k`
}
