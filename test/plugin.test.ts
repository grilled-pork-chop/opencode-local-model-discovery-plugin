import { describe, it, expect, beforeEach, vi, afterEach } from "vitest"
import { LocalModelPlugin } from "../src/index.ts"
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
    delete process.env["LOCAL_MODEL_URL"]
    mockClient = {
      tui: { showToast: vi.fn().mockResolvedValue(undefined) },
    }
  })

  afterEach(() => {
    delete process.env["LOCAL_MODEL_URL"]
    vi.restoreAllMocks()
  })

  it("initializes without throwing when url is missing", async () => {
    await expect(LocalModelPlugin(makeInput(mockClient), {})).resolves.toBeDefined()
  })

  it("skips discovery and does not fetch when no url and no env var", async () => {
    const hooks = await LocalModelPlugin(makeInput(mockClient), {})
    const config: any = {}
    await hooks.config!(config)
    expect(mockFetch).not.toHaveBeenCalled()
    expect(config.provider).toBeUndefined()
  })

  it("uses LOCAL_MODEL_URL env var when url option is not provided", async () => {
    process.env["LOCAL_MODEL_URL"] = "http://localhost:11434"
    mockFetch.mockResolvedValue(modelsResponse(["llama3"]))
    const hooks = await LocalModelPlugin(makeInput(mockClient), {})
    const config: any = {}
    await hooks.config!(config)
    expect(mockFetch).toHaveBeenCalledWith("http://localhost:11434/v1/models", expect.anything())
    expect(config.provider.local.models["llama3"]).toBeDefined()
  })

  it("injects discovered models into local provider", async () => {
    mockFetch.mockResolvedValue(modelsResponse(["meta/llama3-8b", "mistral/mistral-7b"]))
    const hooks = await LocalModelPlugin(makeInput(mockClient), { url: "http://localhost:4000" })
    const config: any = {}
    await hooks.config!(config)

    expect(config.provider.local).toBeDefined()
    expect(config.provider.local.models["meta/llama3-8b"]).toBeDefined()
    expect(config.provider.local.models["mistral/mistral-7b"]).toBeDefined()
  })

  it("sets provider npm and baseURL", async () => {
    mockFetch.mockResolvedValue(modelsResponse(["llama3"]))
    const hooks = await LocalModelPlugin(makeInput(mockClient), { url: "http://localhost:4000" })
    const config: any = {}
    await hooks.config!(config)

    expect(config.provider.local.npm).toBe("@ai-sdk/openai-compatible")
    expect(config.provider.local.options.baseURL).toBe("http://localhost:4000/v1")
  })

  it("does not overwrite explicitly configured models", async () => {
    mockFetch.mockResolvedValue(modelsResponse(["llama3", "mistral-7b"]))
    const hooks = await LocalModelPlugin(makeInput(mockClient), { url: "http://localhost:4000" })
    const config: any = {
      provider: {
        local: { models: { "llama3": { id: "llama3", name: "Custom Llama" } } },
      },
    }
    await hooks.config!(config)

    expect(config.provider.local.models["llama3"].name).toBe("Custom Llama")
    expect(config.provider.local.models["mistral-7b"]).toBeDefined()
  })

  it("filters out embedding models", async () => {
    mockFetch.mockResolvedValue(modelsResponse(["llama3", "text-embedding-ada-002", "bge-reranker-base"]))
    const hooks = await LocalModelPlugin(makeInput(mockClient), { url: "http://localhost:4000" })
    const config: any = {}
    await hooks.config!(config)

    expect(config.provider.local.models["llama3"]).toBeDefined()
    expect(config.provider.local.models["text-embedding-ada-002"]).toBeUndefined()
    expect(config.provider.local.models["bge-reranker-base"]).toBeUndefined()
  })

  it("uses cache on second call and skips fetch", async () => {
    mockFetch.mockResolvedValue(modelsResponse(["llama3"]))
    const hooks = await LocalModelPlugin(makeInput(mockClient), { url: "http://localhost:4000", ttl: 60_000 })

    const config1: any = {}
    await hooks.config!(config1)
    expect(mockFetch).toHaveBeenCalledTimes(1)

    const config2: any = {}
    await hooks.config!(config2)
    expect(mockFetch).toHaveBeenCalledTimes(1) // still 1 — served from cache
    expect(config2.provider.local.models["llama3"]).toBeDefined()
  })

  it("shows success toast on first discovery", async () => {
    mockFetch.mockResolvedValue(modelsResponse(["llama3"]))
    const hooks = await LocalModelPlugin(makeInput(mockClient), { url: "http://localhost:4000" })
    await hooks.config!({})

    expect(mockClient.tui.showToast).toHaveBeenCalledWith(
      expect.objectContaining({ body: expect.objectContaining({ variant: "success" }) })
    )
  })

  it("passes directory in toast query", async () => {
    mockFetch.mockResolvedValue(modelsResponse(["llama3"]))
    const hooks = await LocalModelPlugin(makeInput(mockClient), { url: "http://localhost:4000" })
    await hooks.config!({})

    expect(mockClient.tui.showToast).toHaveBeenCalledWith(
      expect.objectContaining({ query: { directory: "/tmp" } })
    )
  })

  it("shows error toast and does not throw on fetch failure", async () => {
    mockFetch.mockRejectedValue(new Error("connection refused"))
    const hooks = await LocalModelPlugin(makeInput(mockClient), { url: "http://localhost:4000" })

    await expect(hooks.config!({})).resolves.toBeUndefined()
    expect(mockClient.tui.showToast).toHaveBeenCalledWith(
      expect.objectContaining({ body: expect.objectContaining({ variant: "error" }) })
    )
  })

  it("does nothing when config is not an object", async () => {
    const hooks = await LocalModelPlugin(makeInput(mockClient), { url: "http://localhost:4000" })
    await expect(hooks.config!(null)).resolves.toBeUndefined()
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it("normalizes url with trailing slash before fetching", async () => {
    mockFetch.mockResolvedValue(modelsResponse(["llama3"]))
    const hooks = await LocalModelPlugin(makeInput(mockClient), { url: "http://localhost:4000/" })
    const config: any = {}
    await hooks.config!(config)

    expect(mockFetch).toHaveBeenCalledWith("http://localhost:4000/v1/models", expect.anything())
    expect(config.provider.local.options.baseURL).toBe("http://localhost:4000/v1")
  })

  it("normalizes url with /v1 suffix before fetching", async () => {
    mockFetch.mockResolvedValue(modelsResponse(["llama3"]))
    const hooks = await LocalModelPlugin(makeInput(mockClient), { url: "http://localhost:4000/v1" })
    const config: any = {}
    await hooks.config!(config)

    expect(mockFetch).toHaveBeenCalledWith("http://localhost:4000/v1/models", expect.anything())
    expect(config.provider.local.options.baseURL).toBe("http://localhost:4000/v1")
  })

  it("handles malformed API response (missing data field)", async () => {
    mockFetch.mockResolvedValue({ ok: true, json: async () => ({ models: [] }) })
    const hooks = await LocalModelPlugin(makeInput(mockClient), { url: "http://localhost:4000" })

    await expect(hooks.config!({})).resolves.toBeUndefined()
    expect(mockClient.tui.showToast).toHaveBeenCalledWith(
      expect.objectContaining({ body: expect.objectContaining({ variant: "error" }) })
    )
  })

  it("shows info toast when new models appear after cache refresh", async () => {
    mockFetch
      .mockResolvedValueOnce(modelsResponse(["llama3"]))
      .mockResolvedValueOnce(modelsResponse(["llama3", "mistral-7b"]))

    const hooks = await LocalModelPlugin(makeInput(mockClient), { url: "http://localhost:4000", ttl: -1 })

    await hooks.config!({})
    mockClient.tui.showToast.mockClear()

    await hooks.config!({})
    expect(mockClient.tui.showToast).toHaveBeenCalledWith(
      expect.objectContaining({ body: expect.objectContaining({ variant: "info" }) })
    )
  })

  it("shows warning toast when models are removed after cache refresh", async () => {
    mockFetch
      .mockResolvedValueOnce(modelsResponse(["llama3", "mistral-7b"]))
      .mockResolvedValueOnce(modelsResponse(["llama3"]))

    const hooks = await LocalModelPlugin(makeInput(mockClient), { url: "http://localhost:4000", ttl: -1 })

    await hooks.config!({})
    mockClient.tui.showToast.mockClear()

    await hooks.config!({})
    expect(mockClient.tui.showToast).toHaveBeenCalledWith(
      expect.objectContaining({ body: expect.objectContaining({ variant: "warning" }) })
    )
  })

  it("shows no toast when model list is unchanged after cache refresh", async () => {
    mockFetch
      .mockResolvedValueOnce(modelsResponse(["llama3"]))
      .mockResolvedValueOnce(modelsResponse(["llama3"]))

    const hooks = await LocalModelPlugin(makeInput(mockClient), { url: "http://localhost:4000", ttl: -1 })

    await hooks.config!({})
    mockClient.tui.showToast.mockClear()

    await hooks.config!({})
    expect(mockClient.tui.showToast).not.toHaveBeenCalled()
  })

  it("does not toast when client has no tui", async () => {
    mockFetch.mockResolvedValue(modelsResponse(["llama3"]))
    const hooks = await LocalModelPlugin(makeInput({}), { url: "http://localhost:4000" })
    await expect(hooks.config!({})).resolves.toBeUndefined()
  })
})
