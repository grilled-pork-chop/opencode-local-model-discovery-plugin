import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { LocalModelPlugin } from "../src/index.ts"
import { createConfigHook } from "../src/config.ts"
import { ModelRefreshMonitor } from "../src/monitoring/loading-monitor.ts"
import { ToastNotifier } from "../src/toast.ts"
import { normalizeUrl } from "../src/discover.ts"

const mockFetch = vi.fn()
global.fetch = mockFetch

if (!global.AbortSignal.timeout) {
  global.AbortSignal.timeout = vi.fn(() => new AbortController().signal)
}

function makeInput(client: unknown) {
  return {
    client,
    project: { id: "test", name: "test", path: "/tmp", worktree: "", time: { created: Date.now() } },
    directory: "/tmp",
    worktree: "",
    $: vi.fn(),
    config: {},
  } as any
}

function makeConfig(providerKey: string, baseURL: string): any {
  return {
    provider: {
      [providerKey]: {
        npm: "@ai-sdk/openai-compatible",
        name: "Local",
        options: { baseURL },
      },
    },
  }
}

function modelsResponse(ids: string[]) {
  return {
    ok: true,
    json: async () => ({ data: ids.map((id) => ({ id })) }),
  }
}

describe("normalizeUrl", () => {
  it("strips trailing slash", () => {
    expect(normalizeUrl("http://localhost:4000/")).toBe("http://localhost:4000")
  })

  it("strips /v1 suffix", () => {
    expect(normalizeUrl("http://localhost:4000/v1")).toBe("http://localhost:4000")
  })

  it("strips both trailing slash and /v1", () => {
    expect(normalizeUrl("http://localhost:4000/v1/")).toBe("http://localhost:4000")
  })

  it("leaves clean URL unchanged", () => {
    expect(normalizeUrl("http://localhost:4000")).toBe("http://localhost:4000")
  })
})

describe("LocalModelPlugin", () => {
  let mockClient: { tui: { showToast: ReturnType<typeof vi.fn> } }

  beforeEach(() => {
    mockFetch.mockClear()
    mockClient = { tui: { showToast: vi.fn().mockResolvedValue(undefined) } }
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("initializes without throwing", async () => {
    await expect(LocalModelPlugin(makeInput(mockClient))).resolves.toBeDefined()
  })

  it("handles missing client gracefully", async () => {
    const hooks = await LocalModelPlugin(makeInput(null))
    await expect(hooks.config({})).resolves.toBeUndefined()
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it("warns when no compatible provider in config", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {})
    const hooks = await LocalModelPlugin(makeInput(mockClient))
    await hooks.config({})
    expect(mockFetch).not.toHaveBeenCalled()
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("No @ai-sdk/openai-compatible"))
  })

  it("ignores providers without matching npm", async () => {
    const hooks = await LocalModelPlugin(makeInput(mockClient))
    const config = {
      provider: { other: { npm: "@ai-sdk/openai", options: { baseURL: "http://localhost:4000/v1" } } },
    }
    await hooks.config(config)
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it("injects models into existing compatible provider", async () => {
    mockFetch.mockResolvedValue(modelsResponse(["llama3", "mistral-7b"]))
    const hooks = await LocalModelPlugin(makeInput(mockClient))
    const config = makeConfig("local", "http://localhost:11434/v1")
    await hooks.config(config)

    expect(config.provider.local.models["llama3"]).toBeDefined()
    expect(config.provider.local.models["mistral-7b"]).toBeDefined()
  })

  it("does not overwrite explicitly configured models", async () => {
    mockFetch.mockResolvedValue(modelsResponse(["llama3", "mistral-7b"]))
    const hooks = await LocalModelPlugin(makeInput(mockClient))
    const config: any = makeConfig("local", "http://localhost:11434/v1")
    config.provider.local.models = { "llama3": { id: "llama3", name: "Custom Llama" } }
    await hooks.config(config)

    expect(config.provider.local.models["llama3"].name).toBe("Custom Llama")
    expect(config.provider.local.models["mistral-7b"]).toBeDefined()
  })

  it("filters out embedding models", async () => {
    mockFetch.mockResolvedValue(modelsResponse(["llama3", "text-embedding-ada-002", "bge-reranker-base"]))
    const hooks = await LocalModelPlugin(makeInput(mockClient))
    const config = makeConfig("local", "http://localhost:11434/v1")
    await hooks.config(config)

    expect(config.provider.local.models["llama3"]).toBeDefined()
    expect(config.provider.local.models["text-embedding-ada-002"]).toBeUndefined()
    expect(config.provider.local.models["bge-reranker-base"]).toBeUndefined()
  })

  it("strips /v1 from baseURL so discovery URL is not doubled", async () => {
    mockFetch.mockResolvedValue(modelsResponse(["llama3"]))
    const hooks = await LocalModelPlugin(makeInput(mockClient))
    await hooks.config(makeConfig("local", "http://localhost:11434/v1"))
    expect(mockFetch).toHaveBeenCalledWith("http://localhost:11434/v1/models", expect.anything())
  })

  it("shows success toast on first discovery including provider key", async () => {
    mockFetch.mockResolvedValue(modelsResponse(["llama3"]))
    const hooks = await LocalModelPlugin(makeInput(mockClient))
    await hooks.config(makeConfig("local", "http://localhost:11434/v1"))

    expect(mockClient.tui.showToast).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.objectContaining({
          variant: "success",
          message: expect.stringContaining('"local"'),
        }),
      })
    )
  })

  it("shows error toast including provider key on fetch failure", async () => {
    mockFetch.mockRejectedValue(new Error("connection refused"))
    const hooks = await LocalModelPlugin(makeInput(mockClient))
    await expect(hooks.config(makeConfig("local", "http://localhost:11434/v1"))).resolves.toBeUndefined()

    expect(mockClient.tui.showToast).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.objectContaining({
          variant: "error",
          message: expect.stringContaining('"local"'),
        }),
      })
    )
  })

  it("does not throw when client has no tui", async () => {
    mockFetch.mockResolvedValue(modelsResponse(["llama3"]))
    const hooks = await LocalModelPlugin(makeInput({}))
    await expect(hooks.config(makeConfig("local", "http://localhost:11434/v1"))).resolves.toBeUndefined()
  })

  it("does nothing when config is not an object", async () => {
    const hooks = await LocalModelPlugin(makeInput(mockClient))
    await expect(hooks.config(null)).resolves.toBeUndefined()
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it("handles malformed API response (missing data field)", async () => {
    mockFetch.mockResolvedValue({ ok: true, json: async () => ({ models: [] }) })
    const hooks = await LocalModelPlugin(makeInput(mockClient))
    await expect(hooks.config(makeConfig("local", "http://localhost:11434/v1"))).resolves.toBeUndefined()
    expect(mockClient.tui.showToast).toHaveBeenCalledWith(
      expect.objectContaining({ body: expect.objectContaining({ variant: "error" }) })
    )
  })
})

describe("createConfigHook (cache behaviour)", () => {
  let mockClient: { tui: { showToast: ReturnType<typeof vi.fn> } }
  let toast: ToastNotifier
  let monitor: ModelRefreshMonitor

  beforeEach(() => {
    mockFetch.mockClear()
    mockClient = { tui: { showToast: vi.fn().mockResolvedValue(undefined) } }
    toast = new ToastNotifier(mockClient)
    monitor = new ModelRefreshMonitor()
  })

  afterEach(() => {
    monitor.cleanup()
    vi.restoreAllMocks()
  })

  it("uses cache on second call, skips fetch", async () => {
    mockFetch.mockResolvedValue(modelsResponse(["llama3"]))
    const hook = createConfigHook(toast, monitor, 60_000)
    await hook(makeConfig("local", "http://localhost:11434/v1"))
    await hook(makeConfig("local", "http://localhost:11434/v1"))
    expect(mockFetch).toHaveBeenCalledTimes(1)
  })

  it("re-fetches when TTL is expired", async () => {
    mockFetch
      .mockResolvedValueOnce(modelsResponse(["llama3"]))
      .mockResolvedValueOnce(modelsResponse(["llama3"]))
    const hook = createConfigHook(toast, monitor, -1)
    await hook(makeConfig("local", "http://localhost:11434/v1"))
    await hook(makeConfig("local", "http://localhost:11434/v1"))
    expect(mockFetch).toHaveBeenCalledTimes(2)
  })

  it("handles multiple compatible providers independently", async () => {
    mockFetch
      .mockResolvedValueOnce(modelsResponse(["llama3"]))
      .mockResolvedValueOnce(modelsResponse(["qwen2"]))
    const hook = createConfigHook(toast, monitor)
    const config: any = {
      provider: {
        local1: { npm: "@ai-sdk/openai-compatible", options: { baseURL: "http://localhost:11434/v1" } },
        local2: { npm: "@ai-sdk/openai-compatible", options: { baseURL: "http://localhost:1234/v1" } },
      },
    }
    await hook(config)
    expect(mockFetch).toHaveBeenCalledTimes(2)
    expect(config.provider.local1.models["llama3"]).toBeDefined()
    expect(config.provider.local2.models["qwen2"]).toBeDefined()
  })

  it("seeds the monitor with discovered models after first successful fetch", async () => {
    mockFetch.mockResolvedValue(modelsResponse(["llama3"]))
    const seedSpy = vi.spyOn(monitor, "seed")
    const hook = createConfigHook(toast, monitor)
    await hook(makeConfig("local", "http://localhost:11434/v1"))
    expect(seedSpy).toHaveBeenCalledWith("http://localhost:11434", ["llama3"])
  })

  it("starts the monitor after first successful fetch", async () => {
    mockFetch.mockResolvedValue(modelsResponse(["llama3"]))
    const startSpy = vi.spyOn(monitor, "start")
    const hook = createConfigHook(toast, monitor)
    await hook(makeConfig("local", "http://localhost:11434/v1"))
    expect(startSpy).toHaveBeenCalledWith("local", "http://localhost:11434", toast)
  })

  it("does not start the monitor when discovery fails", async () => {
    mockFetch.mockRejectedValue(new Error("connection refused"))
    const startSpy = vi.spyOn(monitor, "start")
    const hook = createConfigHook(toast, monitor)
    await hook(makeConfig("local", "http://localhost:11434/v1"))
    expect(startSpy).not.toHaveBeenCalled()
  })
})
