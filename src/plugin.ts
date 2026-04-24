import { createConfigHook } from "./config"
import { ToastNotifier } from "./toast"
import type { Plugin } from "./types"

export const LocalModelPlugin: Plugin = async ({ client }) => {
  if (!client) {
    console.error("[opencode-local-model] No client provided")
    return { config: async () => {} }
  }
  const toast = new ToastNotifier(client)
  return { config: createConfigHook(toast) }
}
