import type { Plugin, PluginInput, PluginOptions } from "@opencode-ai/plugin"
import { ModelCache } from "./cache"
import { discoverModels, normalizeUrl } from "./discover"
import { Toast } from "./toast"

const DEFAULT_TTL = 15_000
const PREFIX = "[opencode-local-model-discovery]"

export const LocalModelDiscoveryPlugin: Plugin = async (
  input: PluginInput,
  options?: PluginOptions
) => {
  const { client } = input
  const opts = (options || {}) as Record<string, unknown>

  const rawUrl = opts["url"]
  if (typeof rawUrl !== "string" || !rawUrl) {
    throw new Error(`${PREFIX} "url" option is required (e.g. "http://localhost:4000")`)
  }
  const url = normalizeUrl(rawUrl)

  const ttl = typeof opts["ttl"] === "number" ? opts["ttl"] : DEFAULT_TTL
  const cache = new ModelCache(ttl)
  const toast = new Toast(client)

  return {
    config: async (config: any) => {
      if (!config || typeof config !== "object") return

      const cached = cache.get(url)
      if (cached) {
        injectModels(config, url, cached)
        return
      }

      try {
        const models = await discoverModels(url)
        cache.set(url, models)
        injectModels(config, url, models)
        console.info(`${PREFIX} Discovered ${models.length} model(s) from ${url}`)
        await toast.success(`Discovered ${models.length} model(s) from ${url}`)
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error)
        console.error(`${PREFIX} Discovery failed: ${msg}`)
        await toast.error(`Model discovery failed: ${msg}`)
      }
    },
  }
}

function injectModels(config: any, url: string, modelIds: string[]): void {
  if (!config.provider) config.provider = {}

  const provider = config.provider["local"] ?? {}
  provider.npm = "@ai-sdk/openai-compatible"
  provider.options = {
    ...provider.options,
    baseURL: `${url}/v1`,
  }

  const existing: Record<string, unknown> = provider.models ?? {}
  const injected: Record<string, unknown> = {}

  for (const id of modelIds) {
    if (!existing[id]) {
      injected[id] = {
        id,
        name: id,
        modalities: { input: ["text", "image"], output: ["text"] },
      }
    }
  }

  provider.models = { ...existing, ...injected }
  config.provider["local"] = provider
}
