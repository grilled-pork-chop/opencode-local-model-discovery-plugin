import type { Plugin, PluginInput, PluginOptions } from "@opencode-ai/plugin"
import { ModelCache } from "./cache"
import { createConfigHook, parseConfig } from "./config"
import { ToastNotifier } from "./toast"

export const LocalModelPlugin: Plugin = async (input: PluginInput, options?: PluginOptions) => {
  const cfg = parseConfig(options as Record<string, unknown> | undefined)
  const cache = new ModelCache(cfg.ttl)
  const toast = new ToastNotifier(input.client)

  return {
    config: createConfigHook(cfg, cache, toast),
  }
}
