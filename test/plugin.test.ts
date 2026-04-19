import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { LocalModelPlugin } from "../src/index.ts"

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
      [providerKey]: { npm: "@ai-sdk/openai-compatible", name: "Local", options: { baseURL } },
    },
  }
}

function modelsResponse(ids: string[]) {
  return { ok: true, json: async () => ({ data: ids.map((id) => ({ id })) }) }
}

describe("LocalModelPlugin", () => {
  let mockClient: { tui: { showToast: ReturnType<typeof vi.fn> } }

  beforeEach(() => {
    mockFetch.mockClear()
    mockClient = { tui: { showToast: vi.fn().mockResolvedValue(undefined) } }
  })

  afterEach(() => vi.restoreAllMocks())

  it("initializes without throwing", async () => {
    await expect(LocalModelPlugin(makeInput(mockClient))).resolves.toBeDefined()
  })

  it("handles a missing client gracefully", async () => {
    const hooks = await LocalModelPlugin(makeInput(null))
    await expect(hooks.config({})).resolves.toBeUndefined()
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it("warns when no compatible provider is found in the config", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {})
    const hooks = await LocalModelPlugin(makeInput(mockClient))
    await hooks.config({})
    expect(mockFetch).not.toHaveBeenCalled()
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("No @ai-sdk/openai-compatible"))
  })

  it("ignores providers with a non-matching npm value", async () => {
    const hooks = await LocalModelPlugin(makeInput(mockClient))
    await hooks.config({
      provider: { other: { npm: "@ai-sdk/openai", options: { baseURL: "http://localhost:4000/v1" } } },
    })
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it("injects discovered models into the compatible provider", async () => {
    mockFetch.mockResolvedValue(modelsResponse(["llama3", "mistral-7b"]))
    const hooks = await LocalModelPlugin(makeInput(mockClient))
    const config = makeConfig("local", "http://localhost:11434/v1")
    await hooks.config(config)
    expect(config.provider.local.models["llama3"]).toBeDefined()
    expect(config.provider.local.models["mistral-7b"]).toBeDefined()
  })

  it("does not overwrite explicitly configured model entries", async () => {
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

  it("strips /v1 from baseURL so the discovery URL is not doubled", async () => {
    mockFetch.mockResolvedValue(modelsResponse(["llama3"]))
    const hooks = await LocalModelPlugin(makeInput(mockClient))
    await hooks.config(makeConfig("local", "http://localhost:11434/v1"))
    expect(mockFetch).toHaveBeenCalledWith("http://localhost:11434/v1/models", expect.anything())
  })

  it("shows a success toast on first discovery that includes the provider key", async () => {
    mockFetch.mockResolvedValue(modelsResponse(["llama3"]))
    const hooks = await LocalModelPlugin(makeInput(mockClient))
    await hooks.config(makeConfig("local", "http://localhost:11434/v1"))
    expect(mockClient.tui.showToast).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.objectContaining({ variant: "success", message: expect.stringContaining('"local"') }),
      })
    )
  })

  it("shows an error toast including the provider key when discovery fails", async () => {
    mockFetch.mockRejectedValue(new Error("connection refused"))
    const hooks = await LocalModelPlugin(makeInput(mockClient))
    await expect(hooks.config(makeConfig("local", "http://localhost:11434/v1"))).resolves.toBeUndefined()
    expect(mockClient.tui.showToast).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.objectContaining({ variant: "error", message: expect.stringContaining('"local"') }),
      })
    )
  })

  it("does not throw when the client has no tui", async () => {
    mockFetch.mockResolvedValue(modelsResponse(["llama3"]))
    const hooks = await LocalModelPlugin(makeInput({}))
    await expect(hooks.config(makeConfig("local", "http://localhost:11434/v1"))).resolves.toBeUndefined()
  })

  it("does nothing when the config argument is not an object", async () => {
    const hooks = await LocalModelPlugin(makeInput(mockClient))
    await expect(hooks.config(null)).resolves.toBeUndefined()
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it("shows an error toast on a malformed API response", async () => {
    mockFetch.mockResolvedValue({ ok: true, json: async () => ({ models: [] }) })
    const hooks = await LocalModelPlugin(makeInput(mockClient))
    await expect(hooks.config(makeConfig("local", "http://localhost:11434/v1"))).resolves.toBeUndefined()
    expect(mockClient.tui.showToast).toHaveBeenCalledWith(
      expect.objectContaining({ body: expect.objectContaining({ variant: "error" }) })
    )
  })
})