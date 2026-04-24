import { ModelCache } from "./cache"
import { discoverModels, normalizeUrl } from "./discover"
import type { ToastNotifier } from "./toast"

export interface PluginConfig {
  url: string
  baseURL: string
  ttl: number
}

const DEFAULT_TTL = 15_000
const PREFIX = "[opencode-local-model]"

export function parseConfig(options: Record<string, unknown> | undefined): PluginConfig {
  const opts = options ?? {}
  const rawUrl = opts["url"]
  if (typeof rawUrl !== "string" || !rawUrl) {
    throw new Error(`${PREFIX} "url" option is required (e.g. "http://localhost:4000")`)
  }
  const url = normalizeUrl(rawUrl)
  const ttl = typeof opts["ttl"] === "number" ? opts["ttl"] : DEFAULT_TTL
  return { url, baseURL: `${url}/v1`, ttl }
}

export function createConfigHook(cfg: PluginConfig, cache: ModelCache, toast: ToastNotifier) {
  let previousModels: string[] | null = null

  return async (config: unknown): Promise<void> => {
    if (!config || typeof config !== "object") return

    const cached = cache.get()
    if (cached) {
      injectModels(config, cfg.baseURL, cached)
      return
    }

    try {
      const models = await discoverModels(cfg.url)
      await notifyChanges(models, previousModels, cfg.url, toast)
      previousModels = models
      cache.set(models)
      injectModels(config, cfg.baseURL, models)
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error)
      console.error(`${PREFIX} Discovery failed: ${msg}`)
      await toast.error(`Model discovery failed: ${msg}`)
    }
  }
}

async function notifyChanges(
  models: string[],
  previous: string[] | null,
  url: string,
  toast: ToastNotifier
): Promise<void> {
  if (previous === null) {
    console.info(`${PREFIX} Discovered ${models.length} model(s) from ${url}`)
    await toast.success(`Discovered ${models.length} model(s) from ${url}`)
    return
  }

  const added = models.filter((m) => !previous.includes(m))
  const removed = previous.filter((m) => !models.includes(m))

  if (added.length > 0) {
    console.info(`${PREFIX} ${added.length} new model(s): ${added.join(", ")}`)
    await toast.info(`${added.length} new model(s) available: ${added.join(", ")}`)
  }
  if (removed.length > 0) {
    console.info(`${PREFIX} ${removed.length} model(s) removed: ${removed.join(", ")}`)
    await toast.warning(`${removed.length} model(s) removed: ${removed.join(", ")}`)
  }
}

function injectModels(config: object, baseURL: string, modelIds: string[]): void {
  const cfg = config as Record<string, unknown>
  if (!cfg["provider"]) cfg["provider"] = {}

  const providers = cfg["provider"] as Record<string, unknown>
  const provider = (providers["local"] as Record<string, unknown>) ?? {}

  provider["npm"] = "@ai-sdk/openai-compatible"
  provider["options"] = { ...(provider["options"] as object | undefined), baseURL }

  const existing = (provider["models"] as Record<string, unknown>) ?? {}
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

  provider["models"] = { ...existing, ...injected }
  providers["local"] = provider
}
