import { PLUGIN_ID } from "./constants"

/**
 * Writes prefixed plugin messages to the OpenCode service log.
 *
 * OpenCode V2 runs plugins in its background service, whose context has no
 * TUI, so toasts are not reachable from here. Every user-facing message goes
 * through this module, which is the one place to change if toasts are added.
 */
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

export type Logger = typeof log
