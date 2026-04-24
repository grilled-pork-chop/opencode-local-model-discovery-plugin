import { ModelCache } from "./cache"
import { discoverModels, normalizeUrl } from "./discover"
import type { ToastNotifier } from "./toast"

interface ProviderTarget {
  /** The provider key in opencode config (e.g. "local") */
  key: string
  /** Normalized base URL without /v1 suffix (e.g. "http://localhost:11434") */
  url: string
}

const DEFAULT_TTL = 15_000
const PREFIX = "[opencode-local-model]"

function findCompatibleProviders(config: unknown): ProviderTarget[] {
  if (!config || typeof config !== "object") return []
  const providers = (config as Record<string, unknown>)["provider"]
  if (!providers || typeof providers !== "object") return []
  return Object.entries(providers as Record<string, unknown>).flatMap(([key, value]) => {
    if (!value || typeof value !== "object") return []
    const p = value as Record<string, unknown>
    if (p["npm"] !== "@ai-sdk/openai-compatible") return []
    const opts = p["options"] as Record<string, unknown> | undefined
    const baseURL = opts?.["baseURL"]
    if (typeof baseURL !== "string" || !baseURL) return []
    return [{ key, url: normalizeUrl(baseURL) }]
  })
}

export function createConfigHook(toast: ToastNotifier, ttl = DEFAULT_TTL) {
  const caches = new Map<string, ModelCache>()
  const previousModels = new Map<string, string[]>()

  return async (config: unknown): Promise<void> => {
    const targets = findCompatibleProviders(config)
    if (targets.length === 0) {
      console.warn(`${PREFIX} No @ai-sdk/openai-compatible provider found in config`)
      return
    }
    for (const { key, url } of targets) {
      if (!caches.has(url)) caches.set(url, new ModelCache(ttl))
      const cache = caches.get(url)!
      const cached = cache.get()
      if (cached) {
        injectModels(config, key, cached)
        continue
      }
      try {
        const models = await discoverModels(url)
        cache.set(models)
        injectModels(config, key, models)
        // Fire-and-forget: toast must not block the config hook (OpenCode would deadlock)
        notifyChanges(models, previousModels.get(url) ?? null, key, toast).catch(() => {})
        previousModels.set(url, models)
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error)
        console.error(`${PREFIX} Discovery failed for ${url}: ${msg}`)
        toast.error(`Model discovery failed for provider "${key}": ${msg}`).catch(() => {})
      }
    }
  }
}

async function notifyChanges(
  models: string[],
  previous: string[] | null,
  providerKey: string,
  toast: ToastNotifier
): Promise<void> {
  if (previous === null) {
    console.info(`${PREFIX} Discovered ${models.length} model(s) for provider "${providerKey}"`)
    await toast.success(`Discovered ${models.length} model(s) for provider "${providerKey}"`)
    return
  }
  const added = models.filter((m) => !previous.includes(m))
  const removed = previous.filter((m) => !models.includes(m))
  for (const id of added) {
    console.info(`${PREFIX} New model "${id}" for provider "${providerKey}"`)
    await toast.info(`New model "${id}" discovered for provider "${providerKey}"`)
  }
  for (const id of removed) {
    console.info(`${PREFIX} Model "${id}" removed from provider "${providerKey}"`)
    await toast.warning(`Model "${id}" removed from provider "${providerKey}"`)
  }
}

function injectModels(config: unknown, providerKey: string, modelIds: string[]): void {
  const providers = (config as Record<string, unknown>)["provider"] as Record<string, unknown>
  const provider = providers[providerKey] as Record<string, unknown>
  const existing = (provider["models"] as Record<string, unknown>) ?? {}
  const injected: Record<string, unknown> = {}
  for (const id of modelIds) {
    if (!existing[id]) {
      injected[id] = { id, name: id, modalities: { input: ["text", "image"], output: ["text"] } }
    }
  }
  provider["models"] = { ...existing, ...injected }
}
