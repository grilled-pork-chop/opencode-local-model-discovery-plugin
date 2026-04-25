import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { buildConfigHook } from "../../src/config/hook.ts"
import { ModelRefreshMonitor } from "../../src/monitoring/refresh-monitor.ts"
import { Notifier } from "../../src/notification/notifier.ts"

const mockFetch = vi.fn()
global.fetch = mockFetch

if (!global.AbortSignal.timeout) {
  global.AbortSignal.timeout = vi.fn(() => new AbortController().signal)
}

function makeConfig(providerKey: string, baseURL: string): any {
  return {
    provider: {
      [providerKey]: { npm: "@ai-sdk/openai-compatible", name: "Local", options: { baseURL } },
    },
  }
}

function modelsResponse(ids: string[]) {
  return { ok: true, json: async () => ({ data: ids.map((id) => ({ id })) }) }
}

describe("buildConfigHook", () => {
  let mockClient: { tui: { showToast: ReturnType<typeof vi.fn> } }
  let notifier: Notifier
  let monitor: ModelRefreshMonitor

  beforeEach(() => {
    mockFetch.mockClear()
    mockClient = { tui: { showToast: vi.fn().mockResolvedValue(undefined) } }
    notifier = new Notifier(mockClient)
    monitor = new ModelRefreshMonitor()
  })

  afterEach(() => {
    monitor.cleanup()
    vi.restoreAllMocks()
  })

  it("serves from cache on second call and skips fetch", async () => {
    mockFetch.mockResolvedValue(modelsResponse(["llama3"]))
    const hook = buildConfigHook(notifier, monitor, 60_000)
    await hook(makeConfig("local", "http://localhost:11434/v1"))
    await hook(makeConfig("local", "http://localhost:11434/v1"))
    expect(mockFetch).toHaveBeenCalledTimes(1)
  })

  it("re-fetches after the TTL expires", async () => {
    mockFetch
      .mockResolvedValueOnce(modelsResponse(["llama3"]))
      .mockResolvedValueOnce(modelsResponse(["llama3"]))
    const hook = buildConfigHook(notifier, monitor, -1)
    await hook(makeConfig("local", "http://localhost:11434/v1"))
    await hook(makeConfig("local", "http://localhost:11434/v1"))
    expect(mockFetch).toHaveBeenCalledTimes(2)
  })

  it("resolves multiple providers concurrently", async () => {
    mockFetch
      .mockResolvedValueOnce(modelsResponse(["llama3"]))
      .mockResolvedValueOnce(modelsResponse(["qwen2"]))
    const hook = buildConfigHook(notifier, monitor)
    const config: any = {
      provider: {
        local1: { npm: "@ai-sdk/openai-compatible", options: { baseURL: "http://localhost:11434/v1" } },
        local2: { npm: "@ai-sdk/openai-compatible", options: { baseURL: "http://localhost:1234/v1"  } },
      },
    }
    await hook(config)
    expect(mockFetch).toHaveBeenCalledTimes(2)
    expect(config.provider.local1.models["llama3"]).toBeDefined()
    expect(config.provider.local2.models["qwen2"]).toBeDefined()
  })

  it("seeds the monitor with the discovered models on first fetch", async () => {
    mockFetch.mockResolvedValue(modelsResponse(["llama3"]))
    const seedSpy = vi.spyOn(monitor, "seed")
    await buildConfigHook(notifier, monitor)(makeConfig("local", "http://localhost:11434/v1"))
    expect(seedSpy).toHaveBeenCalledWith("http://localhost:11434", ["llama3"])
  })

  it("starts the monitor for the provider on first fetch", async () => {
    mockFetch.mockResolvedValue(modelsResponse(["llama3"]))
    const startSpy = vi.spyOn(monitor, "start")
    await buildConfigHook(notifier, monitor)(makeConfig("local", "http://localhost:11434/v1"))
    expect(startSpy).toHaveBeenCalledWith("local", "http://localhost:11434", notifier)
  })

  it("does not start the monitor when discovery fails", async () => {
    mockFetch.mockRejectedValue(new Error("connection refused"))
    const startSpy = vi.spyOn(monitor, "start")
    await buildConfigHook(notifier, monitor)(makeConfig("local", "http://localhost:11434/v1"))
    expect(startSpy).not.toHaveBeenCalled()
  })
})
